import type { JobProgress, JobsOptions } from "bullmq";
import type { QueueConfig } from "./config.js";
import {
  CAPTURE_JOB_NAME,
  captureJobPayloadSchema,
  type CaptureJobPayload,
  type CaptureJobResult,
  type JobSnapshot,
  type JobState,
  type QueueDepth,
} from "./types.js";

/**
 * The fields this package reads off a BullMQ job. A real `Job` satisfies this
 * structurally, while tests can supply a plain object instead of instantiating
 * BullMQ's 50-field class.
 */
export interface CaptureJobView {
  id?: string;
  data: CaptureJobPayload;
  opts: JobsOptions;
  attemptsMade: number;
  timestamp: number;
  progress: JobProgress;
  returnvalue: CaptureJobResult | undefined;
  finishedOn?: number;
  updateData?(data: CaptureJobPayload): Promise<void>;
  getState(): Promise<string>;
  updateProgress(progress: JobProgress): Promise<void>;
}

/**
 * The narrow slice of BullMQ's `Queue` this package uses. Depending on the
 * interface rather than the class keeps the retry, snapshot, and dual-mode
 * dispatch logic unit-testable without a running Redis.
 */
export interface CaptureQueueHost {
  add(name: string, data: CaptureJobPayload, opts: JobsOptions): Promise<CaptureJobView>;
  getJob(jobId: string): Promise<CaptureJobView | undefined>;
  getJobCounts(...types: string[]): Promise<Record<string, number>>;
  isPaused(): Promise<boolean>;
  remove(jobId: string, options?: { removeChildren?: boolean }): Promise<unknown>;
  close(): Promise<void>;
}

export interface EnqueueInput {
  payload: CaptureJobPayload;
  jobId?: string;
  delayMs?: number;
}

export function captureJobOptions(config: QueueConfig, input: { delayMs?: number; jobId?: string } = {}): JobsOptions {
  const options: JobsOptions = {
    attempts: config.attempts,
    backoff: { type: "exponential", delay: config.backoffDelayMs },
    removeOnComplete: false,
    removeOnFail: false,
  };

  if (input.delayMs !== undefined) {
    options.delay = input.delayMs;
  }
  if (input.jobId !== undefined) {
    options.jobId = input.jobId;
  }

  return options;
}

export function normalizeState(state: string | undefined): JobState {
  switch (state) {
    case "waiting":
    case "prioritized":
    case "active":
    case "completed":
    case "failed":
    case "delayed":
    case "paused":
      return state;
    default:
      return "unknown";
  }
}

export class CaptureQueue {
  constructor(
    private readonly host: CaptureQueueHost,
    private readonly config: QueueConfig,
  ) {}

  jobOptions(input: { delayMs?: number; jobId?: string } = {}): JobsOptions {
    return captureJobOptions(this.config, input);
  }

  async enqueue(input: EnqueueInput): Promise<CaptureJobView> {
    const payload = captureJobPayloadSchema.parse(input.payload);
    const options = this.jobOptions(input);
    return this.host.add(CAPTURE_JOB_NAME, payload, options);
  }

  async getJob(jobId: string): Promise<CaptureJobView | undefined> {
    return this.host.getJob(jobId);
  }

  /**
   * Backs `GET /v1/jobs/:id`. The stored payload is re-validated on read so a
   * schema drift between deployments surfaces as `mode: "async"` metadata rather
   * than a worker crashing on a partially-shaped job.
   */
  async snapshot(jobId: string, existing?: CaptureJobView): Promise<JobSnapshot | null> {
    const job = existing ?? await this.getJob(jobId);
    if (!job) {
      return null;
    }

    const state = await job.getState();
    const payload = captureJobPayloadSchema.safeParse(job.data);
    const id = job.id ?? (payload.success ? payload.data.request_id : "unknown");

    return {
      id,
      state: normalizeState(state),
      mode: payload.success ? payload.data.mode : "async",
      request_id: payload.success ? payload.data.request_id : id,
      progress: typeof job.progress === "number" ? job.progress : null,
      attempts_made: job.attemptsMade,
      attempt_budget: job.opts.attempts ?? this.config.attempts,
      enqueued_at: job.timestamp,
      result: job.returnvalue ?? (state === "failed" && payload.success ? {
        request_id: payload.data.request_id,
        mode: payload.data.mode,
        ok: false,
        error: payload.data.last_error ?? { code: "internal_error", message: "Capture worker failed", retriable: true, request_id: payload.data.request_id },
        duration_ms: Math.max(0, (job.finishedOn ?? Date.now()) - job.timestamp),
        attempts_made: job.attemptsMade,
        enqueued_at: payload.data.enqueued_at,
        completed_at: job.finishedOn ?? Date.now(),
      } : undefined),
      webhook: payload.success ? payload.data.webhook ?? null : null,
    };
  }

  async depth(): Promise<QueueDepth> {
    const counts = await this.host.getJobCounts(
      "waiting",
      "active",
      "prioritized",
      "delayed",
      "completed",
      "failed",
    );
    const paused = await this.host.isPaused();
    const waiting = counts.waiting ?? 0;
    const active = counts.active ?? 0;
    const prioritized = counts.prioritized ?? 0;
    const delayed = counts.delayed ?? 0;

    return {
      waiting,
      active,
      prioritized,
      delayed,
      completed: counts.completed ?? 0,
      failed: counts.failed ?? 0,
      paused,
      total_pending: waiting + active + prioritized + delayed,
    };
  }

  async remove(jobId: string): Promise<void> {
    await this.host.remove(jobId);
  }

  async close(): Promise<void> {
    await this.host.close();
  }
}
