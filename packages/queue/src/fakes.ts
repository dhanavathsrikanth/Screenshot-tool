import type { JobsOptions } from "bullmq";
import type { CaptureJobView, CaptureQueueHost } from "./queue.js";
import { CAPTURE_JOB_NAME, type CaptureJobPayload, type CaptureJobResult, type JobState } from "./types.js";

/**
 * In-memory doubles for the BullMQ surfaces this package touches. They keep the
 * retry, snapshot, and dual-mode dispatch tests runnable without a Redis
 * instance; `integration.test.ts` covers the same paths against real Redis.
 */

export class FakeJob implements CaptureJobView {
  readonly name = CAPTURE_JOB_NAME;
  readonly timestamp = 1_700_000_000_000;
  attemptsMade = 0;
  progress: number | object = 0;
  returnvalue: CaptureJobResult | undefined = undefined;
  readonly progressLog: number[] = [];

  constructor(
    readonly id: string,
    public data: CaptureJobPayload,
    public opts: JobsOptions,
    private state: JobState = "waiting",
  ) {}

  async getState(): Promise<JobState | "unknown"> {
    return this.state;
  }

  async updateData(data: CaptureJobPayload): Promise<void> {
    this.data = data;
  }

  setState(state: JobState): void {
    this.state = state;
  }

  async updateProgress(value: number): Promise<void> {
    this.progress = value;
    this.progressLog.push(value);
  }
}

export interface FakeQueueHostOptions {
  paused?: boolean;
  counts?: Record<string, number>;
  /** Initial state for every job the host creates. Defaults to `"waiting"`. */
  jobState?: JobState;
}

export class FakeQueueHost implements CaptureQueueHost {
  readonly jobs = new Map<string, FakeJob>();
  readonly added: Array<{ name: string; data: CaptureJobPayload; opts: JobsOptions }> = [];
  private counter = 0;
  private readonly counts: Record<string, number>;
  private readonly paused: boolean;
  private readonly jobState: JobState;
  removed: string[] = [];
  closed = false;

  constructor(options: FakeQueueHostOptions = {}) {
    this.counts = options.counts ?? {};
    this.paused = options.paused ?? false;
    this.jobState = options.jobState ?? "waiting";
  }

  async add(name: string, data: CaptureJobPayload, opts: JobsOptions): Promise<FakeJob> {
    this.counter += 1;
    const jobId = opts.jobId ?? `job_${this.counter}`;
    const job = new FakeJob(jobId, data, opts, this.jobState);
    this.jobs.set(jobId, job);
    this.added.push({ name, data, opts });
    return job;
  }

  async getJob(jobId: string): Promise<FakeJob | undefined> {
    return this.jobs.get(jobId);
  }

  async getJobCounts(...types: string[]): Promise<Record<string, number>> {
    const result: Record<string, number> = {};
    for (const type of types) {
      result[type] = this.counts[type] ?? 0;
    }
    return result;
  }

  async isPaused(): Promise<boolean> {
    return this.paused;
  }

  async remove(jobId: string): Promise<unknown> {
    this.removed.push(jobId);
    this.jobs.delete(jobId);
    return 1;
  }

  async close(): Promise<void> {
    this.closed = true;
  }
}

export type WaiterBehaviour =
  | { kind: "resolve"; result: CaptureJobResult }
  | { kind: "reject"; error: Error }
  | { kind: "timeout" }
  | { kind: "pending" };

export class FakeWaiter {
  readonly ttls: Array<number | undefined> = [];
  private readonly settle: (job: FakeJob, ttl?: number) => Promise<unknown>;

  constructor(private readonly behaviour: WaiterBehaviour) {
    this.settle = async (job: FakeJob, ttl?: number) => {
      switch (this.behaviour.kind) {
        case "resolve":
          return this.behaviour.result;
        case "reject":
          throw this.behaviour.error;
        case "timeout":
          throw new Error(
            `Job wait ${job.name} timed out before finishing, no finish notification arrived after ${ttl ?? 0}ms (id=${job.id})`,
          );
        case "pending":
          return new Promise<never>(() => undefined);
      }
    };
  }

  readonly waitUntilFinished = async (job: FakeJob, ttl?: number): Promise<unknown> => {
    this.ttls.push(ttl);
    return this.settle(job, ttl);
  };
}

export class FakeWorkerHost {
  runCount = 0;
  closeCount = 0;

  async run(): Promise<void> {
    this.runCount += 1;
  }

  async close(): Promise<void> {
    this.closeCount += 1;
  }
}
