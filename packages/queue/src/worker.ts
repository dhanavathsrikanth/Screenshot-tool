import { UnrecoverableError } from "bullmq";
import type { Worker as BullWorker } from "bullmq";
import type { Redis } from "ioredis";
import { createWorker as createBullWorker } from "./connection.js";
import type { CaptureJobName } from "./types.js";
import {
  ERROR_RETRIABILITY,
  SnapforgeError,
  type CaptureOptions,
  type CaptureSuccessData,
  type ErrorCode,
  type ErrorEnvelope,
} from "@snapforge/contracts";
import type { QueueConfig } from "./config.js";
import type { CaptureJobView } from "./queue.js";
import type { CaptureJobPayload, CaptureJobResult } from "./types.js";

export const RENDER_PROGRESS = 10;
export const DELIVERED_PROGRESS = 90;
export const COMPLETED_PROGRESS = 100;

export interface CaptureContext {
  workerId: string;
  attempt: number;
  signal: AbortSignal;
  updateProgress(value: number): Promise<void>;
}

export interface CaptureOutcome {
  data: CaptureSuccessData;
}

export type CaptureExecutor = (options: CaptureOptions, context: CaptureContext) => Promise<CaptureOutcome>;

export interface CaptureWorkerOptions {
  workerId?: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

export interface CaptureWorkerStats {
  workerId: string;
  completed: number;
  failed: number;
  webhookDelivered: number;
  webhookFailed: number;
}

export function errorEnvelopeFor(error: unknown, payload: CaptureJobPayload): ErrorEnvelope {
  if (error instanceof SnapforgeError) {
    return error.toEnvelope();
  }

  const message = error instanceof Error ? error.message : String(error);
  return {
    code: "internal_error",
    message,
    retriable: true,
    request_id: payload.request_id,
    docs_url: "https://snapforge.dev/docs/errors#internal_error",
  };
}

/**
 * BullMQ retries every thrown error until the attempt budget is spent. Requests
 * that can never succeed (invalid options, unauthorized, blocked target) must
 * not consume that budget, so `UnrecoverableError` is used to fail the job
 * immediately while retriable codes stay on the normal exponential backoff.
 */
export function isRetriableCode(code: string): boolean {
  return ERROR_RETRIABILITY[code as ErrorCode] ?? true;
}

export function classifyFailure(envelope: ErrorEnvelope): Error {
  if (isRetriableCode(envelope.code) && envelope.retriable) {
    return new SnapforgeError({
      code: envelope.code,
      message: envelope.message,
      requestId: envelope.request_id,
      retriable: true,
      details: envelope.details,
    });
  }
  return new UnrecoverableError(`${envelope.code}: ${envelope.message}`);
}

export function isTerminalFailure(job: CaptureJobView, envelope: ErrorEnvelope): boolean {
  if (!isRetriableCode(envelope.code) || !envelope.retriable) {
    return true;
  }
  return job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
}

/**
 * The narrow slice of BullMQ's `Worker` this class drives, so lifecycle tests do
 * not need a live Redis connection.
 */
export interface WorkerHost {
  run(): Promise<void>;
  close(force?: boolean): Promise<void>;
}

/**
 * Composes a BullMQ `Worker` with the `CaptureWorker` behaviour layer. BullMQ
 * needs the processor at construction time, and the processor is
 * `CaptureWorker.process`, so the host is a thin indirection that is filled in
 * after the behaviour instance exists. `WorkerOptions.autorun` is false, so no
 * job can arrive before that assignment completes.
 */
export function createCaptureWorker(
  config: QueueConfig,
  executor: CaptureExecutor,
  options: { client: Redis; workerId?: string; fetchImpl?: typeof fetch; now?: () => number },
): CaptureWorker {
  const workerId = options.workerId ?? `worker-${process.pid}`;
  let bull: BullWorker<CaptureJobPayload, CaptureJobResult, CaptureJobName> | undefined;

  const host: WorkerHost = {
    run: () => {
      if (!bull) {
        throw new Error("worker host was used before it was initialised");
      }
      return bull.run();
    },
    close: (force?: boolean) => {
      if (!bull) {
        return Promise.resolve();
      }
      return bull.close(force);
    },
  };

  const behaviour = new CaptureWorker(host, config, executor, {
    workerId,
    fetchImpl: options.fetchImpl,
    now: options.now,
  });

  bull = createBullWorker(config, options.client, workerId, (job, token, signal) =>
    behaviour.process(job, token, signal),
  );

  return behaviour;
}

export class CaptureWorker {
  private readonly workerId: string;
  private readonly stats: CaptureWorkerStats;
  private readonly now?: () => number;

  constructor(
    private readonly worker: WorkerHost,
    private readonly config: QueueConfig,
    private readonly executor: CaptureExecutor,
    options: CaptureWorkerOptions = {},
  ) {
    this.workerId = options.workerId ?? `worker-${process.pid}`;
    this.now = options.now;
    this.stats = {
      workerId: this.workerId,
      completed: 0,
      failed: 0,
      webhookDelivered: 0,
      webhookFailed: 0,
    };
  }

  /**
   * Declared with three parameters on purpose: BullMQ only passes an
   * `AbortSignal` to processors whose arity is at least three, which is what
   * lets a worker shutdown cancel in-flight renders instead of waiting them out.
   */
  process = async (
    job: CaptureJobView,
    _token?: string,
    signal?: AbortSignal,
  ): Promise<CaptureJobResult> => {
    job.opts.removeOnComplete = false;
    job.opts.removeOnFail = false;
    const payload = job.data;
    const attempt = job.attemptsMade + 1;
    const jobId = job.id ?? payload.request_id;

    try {
      await job.updateProgress(RENDER_PROGRESS);

      const { data } = await this.executor(payload.options, {
        workerId: this.workerId,
        attempt,
        signal: signal ?? new AbortController().signal,
        updateProgress: (value: number) => job.updateProgress(value),
      });

      const result: CaptureJobResult = {
        request_id: payload.request_id,
        mode: payload.mode,
        ok: true,
        data,
        duration_ms: data.duration_ms,
        attempts_made: attempt,
        enqueued_at: payload.enqueued_at,
        completed_at: this.currentTime(),
        worker_id: this.workerId,
      };

      await job.updateProgress(DELIVERED_PROGRESS);
      this.stats.completed += 1;
      await job.updateProgress(COMPLETED_PROGRESS);

      return result;
    } catch (error) {
      const envelope = errorEnvelopeFor(error, payload);
      await job.updateData?.({ ...payload, last_error: envelope });
      const terminal = isTerminalFailure(job, envelope);

      if (terminal) {
        this.stats.failed += 1;
      }

      throw classifyFailure(envelope);
    }
  };

  private currentTime(): number {
    return this.now?.() ?? Date.now();
  }

  async start(): Promise<void> {
    await this.worker.run();
  }

  /**
   * Graceful by default: BullMQ waits for the in-flight renders to settle before
   * releasing the connection. `force` cancels them via the abort signal instead,
   * which is what a SIGKILL-style shutdown or a crash-restart path wants.
   */
  async close(force = false): Promise<void> {
    await this.worker.close(force);
  }

  getStats(): CaptureWorkerStats {
    return { ...this.stats };
  }
}
