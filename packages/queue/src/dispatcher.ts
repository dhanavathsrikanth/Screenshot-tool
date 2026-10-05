import { QueueEvents } from "bullmq";
import type { Job } from "bullmq";
import type { Redis } from "ioredis";
import { SnapforgeError } from "@snapforge/contracts";
import type { QueueConfig } from "./config.js";
import type { CaptureJobView, CaptureQueue } from "./queue.js";
import { normalizeState } from "./queue.js";
import {
  captureJobPayloadSchema,
  type CaptureJobPayload,
  type CaptureJobResult,
  type CaptureMode,
  type DispatchResult,
  type WebhookTarget,
} from "./types.js";

export interface DispatchRequest {
  requestId: string;
  mode: CaptureMode;
  options: CaptureJobPayload["options"];
  webhook?: WebhookTarget;
  apiKeyId?: string;
  accountId?: string;
  reservationId?: string;
  jobId?: string;
  delayMs?: number;
  enqueuedAt?: number;
  waitForCompletion?: boolean;
}

/**
 * Adapts BullMQ's `Job.waitUntilFinished(queueEvents, ttl)` to a narrow port so
 * the sync fast path can be tested without a live Redis + QueueEvents pair.
 */
export interface SyncWaiter {
  waitUntilFinished(job: CaptureJobView, ttl?: number): Promise<unknown>;
}

export class CaptureDispatcher {
  constructor(
    private readonly queue: CaptureQueue,
    private readonly config: QueueConfig,
    private readonly waiter?: SyncWaiter,
  ) {}

  async dispatch(request: DispatchRequest): Promise<DispatchResult> {
    const payload = captureJobPayloadSchema.parse({
      request_id: request.requestId,
      mode: request.mode,
      options: request.options,
      webhook: request.webhook,
      enqueued_at: request.enqueuedAt ?? Date.now(),
      attempt_budget: this.config.attempts,
      api_key_id: request.apiKeyId,
      billing_account_id: request.accountId,
      reservation_id: request.reservationId,
    });

    const job = await this.queue.enqueue({
      payload,
      jobId: request.jobId,
      delayMs: request.delayMs,
    });
    // A queue host is free to hand back a job whose id is not yet materialised;
    // falling back to the request id keeps the handle non-empty and stable.
    const jobId = job.id ?? request.requestId;

    if (request.mode === "async" || request.waitForCompletion === false) {
      return { job_id: jobId, mode: request.mode, settled: false, state: "waiting" };
    }

    return this.waitForResult(jobId, request.requestId);
  }

  /**
   * Sync requests wait on the job for at most `syncTimeoutMs`. A render that
   * misses the budget is left running on the worker and the caller gets the job
   * id instead, so a slow target degrades to polling rather than failing or
   * holding the HTTP connection open past the advertised latency ceiling.
   */
  async waitForResult(jobId: string, requestId: string): Promise<DispatchResult> {
    if (!this.waiter) {
      throw new SnapforgeError({
        code: "internal_error",
        message: "sync dispatch requires a queue events waiter",
        requestId,
      });
    }

    const job = await this.queue.getJob(jobId);
    if (!job) {
      throw new SnapforgeError({
        code: "internal_error",
        message: `job ${jobId} vanished immediately after enqueue`,
        requestId,
      });
    }

    try {
      const result = (await this.waiter.waitUntilFinished(job, this.config.syncTimeoutMs)) as CaptureJobResult;
      return {
        job_id: jobId,
        mode: "sync",
        settled: true,
        state: result.ok ? "completed" : "failed",
        result,
      };
    } catch (error) {
      if (isTimeout(error)) {
        // The waiter only stops waiting; the worker keeps rendering. Re-read the
        // real state so a still-queued job is not mislabelled as active.
        const current = await this.queue.getJob(jobId);
        return {
          job_id: jobId,
          mode: "sync",
          settled: false,
          state: current ? normalizeState(await current.getState()) : "unknown",
        };
      }
      return {
        job_id: jobId,
        mode: "sync",
        settled: true,
        state: "failed",
        result: {
          request_id: requestId,
          mode: "sync",
          ok: false,
          error: toEnvelope(error, requestId),
          duration_ms: Math.max(0, Date.now() - job.timestamp),
          attempts_made: job.attemptsMade,
          enqueued_at: job.timestamp,
          completed_at: Date.now(),
        },
      };
    }
  }
}

/**
 * BullMQ signals an expired `waitUntilFinished` ttl with a plain `Error` whose
 * message names the job and the limit, so the message is the only signal
 * available to tell "still rendering, degrade to async" from "job failed".
 */
export function isTimeout(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  if (error.name === "AbortError" || error.name === "TimeoutError") {
    return true;
  }
  return /timed out before finishing/i.test(error.message);
}

export function toEnvelope(error: unknown, jobId: string) {
  if (error instanceof SnapforgeError) {
    return error.toEnvelope();
  }
  const message = error instanceof Error ? error.message : String(error);
  return {
    code: "internal_error" as const,
    message,
    retriable: true,
    request_id: jobId,
    docs_url: "https://snapforge.dev/docs/errors#internal_error",
  };
}

export async function createQueueEvents(config: QueueConfig, client?: Redis): Promise<QueueEvents> {
  const events = new QueueEvents(config.queueName, {
    connection: client ? { ...client.options, maxRetriesPerRequest: null, commandTimeout: undefined, enableOfflineQueue: true } : { url: config.redisUrl },
    prefix: config.prefix,
  });
  await events.waitUntilReady();
  return events;
}

/**
 * Binds a live `QueueEvents` to the narrow `SyncWaiter` port. `Job` needs its
 * originating queue to resolve the event stream, so the real job is recovered
 * through the queue host rather than trusting the structural view alone.
 */
export function createQueueEventsWaiter(events: QueueEvents, queue: CaptureQueue): SyncWaiter {
  return {
    async waitUntilFinished(view, ttl) {
      const id = view.id;
      if (id === undefined) {
        throw new SnapforgeError({
          code: "internal_error",
          message: "cannot wait on a job without an id",
          requestId: view.data.request_id,
        });
      }
      const job = await queue.getJob(id);
      if (!job || typeof (job as { waitUntilFinished?: unknown }).waitUntilFinished !== "function") {
        throw new SnapforgeError({
          code: "internal_error",
          message: `job ${id} cannot be awaited without a queue events subscription`,
          requestId: view.data.request_id,
        });
      }
      return (job as unknown as Job).waitUntilFinished(events, ttl);
    },
  };
}
