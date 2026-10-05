import type { CaptureJobView, CaptureQueue } from "./queue.js";
import type { CaptureBilling, CaptureHistoryEntry } from "./service.js";
import type { JobSnapshot } from "./types.js";
import { terminalOutcome } from "./outcome.js";
import type { CaptureDispatcher } from "./dispatcher.js";
import { deliverCaptureSubmission, type CaptureSubmissionCodec } from "./submission.js";

export interface CaptureLifecycleJob { accountId: string; jobId: string }

export interface CaptureFinalization extends CaptureLifecycleJob {
  reservationId?: string;
  apiKeyId?: string;
  snapshot: JobSnapshot;
  entry: CaptureHistoryEntry;
}

export interface CaptureLifecycleRepository {
  commitCapture(input: CaptureFinalization): Promise<JobSnapshot>;
  storedCapture(accountId: string, jobId: string, apiKeyId?: string): Promise<JobSnapshot | null>;
  claimPendingCaptures(limit: number): Promise<CaptureLifecycleJob[]>;
  claimPendingCleanup(limit: number): Promise<CaptureLifecycleJob[]>;
  completeCleanup(jobId: string): Promise<void>;
  expiredCaptures(before: Date, limit: number): Promise<CaptureLifecycleJob[]>;
  completePruning(jobId: string): Promise<void>;
}

export interface SettlementAdmission {
  releaseJob(accountId: string, jobId: string): Promise<void>;
  renewJob?(accountId: string, jobId: string): Promise<void>;
  recoverJob?(accountId: string, jobId: string): Promise<void>;
}

export class CaptureFinalizer {
  constructor(private readonly billing: CaptureBilling, private readonly admission: SettlementAdmission,
    private readonly logger?: (message: string, fields: Record<string, unknown>) => void) {}

  async finalize(job: CaptureJobView, snapshot: JobSnapshot, verifiedAccountId?: string): Promise<JobSnapshot> {
    const outcome = terminalOutcome(snapshot);
    if (!outcome?.result) return snapshot;
    if (verifiedAccountId && job.data.billing_account_id && job.data.billing_account_id !== verifiedAccountId) {
      throw new Error("Capture account does not match");
    }
    const accountId = verifiedAccountId ?? job.data.billing_account_id ?? job.data.api_key_id;
    if (!accountId) throw new Error("Capture has no billing identity");
    const data = outcome.result.data;
    const entry: CaptureHistoryEntry = {
      id: snapshot.id, at: outcome.result.completed_at, ok: outcome.result.ok, cached: data?.cached ?? false,
      url: data?.url ?? job.data.options.url, format: data?.format ?? job.data.options.format,
      width: data?.width ?? null, height: data?.height ?? null, bytes: data?.bytes ?? 0,
      duration_ms: Math.round(outcome.result.duration_ms), blocked_requests: data?.blocked_requests ?? 0,
      code: outcome.result.error?.code ?? null, message: outcome.result.error?.message ?? null, request_id: snapshot.request_id,
    };
    let persisted = outcome;
    if (this.billing.lifecycle) {
      persisted = await this.billing.lifecycle.commitCapture({ accountId, jobId: snapshot.id,
        reservationId: job.data.reservation_id, apiKeyId: job.data.api_key_id, snapshot: outcome, entry });
    } else {
      const reservation = await this.billing.reservationForJob(accountId, snapshot.id);
      if (reservation) await this.billing.settleCapture(reservation, outcome.result.ok);
      await this.billing.recordCapture(accountId, entry).catch(() => this.logger?.("Capture history write failed", { job_id: snapshot.id }));
    }
    await this.cleanup({ accountId, jobId: snapshot.id });
    return persisted;
  }

  async cleanup(job: CaptureLifecycleJob): Promise<boolean> {
    try {
      await this.admission.releaseJob(job.accountId, job.jobId);
      await this.billing.lifecycle?.completeCleanup(job.jobId);
      return true;
    } catch {
      this.logger?.("Capture admission release failed", { job_id: job.jobId });
      return false;
    }
  }
}

export interface CaptureTerminalEvents {
  on(event: "completed" | "failed", listener: (event: { jobId: string }) => void): unknown;
  off(event: "completed" | "failed", listener: (event: { jobId: string }) => void): unknown;
}

export class CaptureCompletionConsumer {
  private timer?: ReturnType<typeof setTimeout>;
  private running = false;
  private pending = new Set<string>();
  private active = new Set<Promise<void>>();
  private processingIds = new Set<string>();
  private scan?: Promise<void>;
  private readonly finalizer: CaptureFinalizer;
  private readonly counters = { finalized: 0, errors: 0, missing_jobs: 0, cleanup_failures: 0, settlement_lag_ms: 0, enqueue_recovered: 0, enqueue_errors: 0 };
  private readonly listener = ({ jobId }: { jobId: string }) => {
    if (!this.running || this.processingIds.has(jobId) || this.pending.size >= 256) return;
    this.pending.add(jobId);
    this.drain();
  };

  constructor(private readonly deps: {
    queue: Pick<CaptureQueue, "getJob" | "snapshot" | "remove">;
    events: CaptureTerminalEvents;
    billing: CaptureBilling & { lifecycle: CaptureLifecycleRepository };
    admission: SettlementAdmission;
    dispatcher?: Pick<CaptureDispatcher, "dispatch">;
    submissionCodec?: CaptureSubmissionCodec;
    intervalMs?: number;
    batchSize?: number;
    retentionSeconds?: number;
    logger?: (message: string, fields: Record<string, unknown>) => void;
  }) {
    if (deps.billing.submissions && (!deps.dispatcher || !deps.submissionCodec)) throw new Error("Capture submission recovery must be configured");
    this.finalizer = new CaptureFinalizer(deps.billing, deps.admission, (message, fields) => {
      this.counters.cleanup_failures++;
      deps.logger?.(message, fields);
    });
  }

  stats() { return { ...this.counters, pending_events: this.pending.size, active: this.active.size }; }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.deps.events.on("completed", this.listener);
    this.deps.events.on("failed", this.listener);
    try {
      await this.reconcile();
      this.schedule();
    } catch (error) {
      await this.close();
      throw error;
    }
  }

  private schedule(): void {
    if (!this.running) return;
    this.timer = setTimeout(() => {
      void this.reconcile().catch(() => this.error()).finally(() => this.schedule());
    }, this.deps.intervalMs ?? 2000);
    this.timer.unref();
  }

  private error(): void {
    this.counters.errors++;
    this.deps.logger?.("Capture settlement recovery failed", this.stats());
  }

  private drain(): void {
    while (this.running && this.active.size < 4 && this.pending.size) {
      const jobId = this.pending.values().next().value!;
      this.pending.delete(jobId);
      this.processingIds.add(jobId);
      const task = this.settle(jobId).catch(() => this.error()).finally(() => {
        this.active.delete(task);
        this.processingIds.delete(jobId);
        this.drain();
      });
      this.active.add(task);
    }
  }

  private async settle(jobId: string, expected?: CaptureLifecycleJob): Promise<void> {
    const job = await this.deps.queue.getJob(jobId);
    if (!job) { this.counters.missing_jobs++; return; }
    const accountId = job.data.billing_account_id ?? expected?.accountId;
    if (!accountId || (expected && accountId !== expected.accountId)) return;
    const snapshot = await this.deps.queue.snapshot(jobId, job);
    if (!snapshot) return;
    if (snapshot.state !== "completed" && snapshot.state !== "failed") {
      await this.deps.admission.renewJob?.(accountId, jobId);
      return;
    }
    const outcome = await this.finalizer.finalize(job, snapshot, accountId);
    this.counters.finalized++;
    this.counters.settlement_lag_ms = Math.max(0, Date.now() - outcome.result!.completed_at);
  }

  reconcile(): Promise<void> {
    if (this.scan) return this.scan;
    this.scan = this.scanBatch().finally(() => { this.scan = undefined; });
    return this.scan;
  }

  private async scanBatch(): Promise<void> {
    const repository = this.deps.billing.lifecycle;
    const limit = Math.min(Math.max(this.deps.batchSize ?? 32, 1), 100);
    const submissions = this.deps.billing.submissions;
    if (submissions) {
      const pending = await submissions.claimPendingSubmissions(limit);
      for (let offset = 0; offset < pending.length; offset += 4) {
        await Promise.all(pending.slice(offset, offset + 4).map(async (job) => {
          try {
            if (await deliverCaptureSubmission(job.jobId, { submissions, codec: this.deps.submissionCodec!, queue: this.deps.queue, dispatcher: this.deps.dispatcher!, admission: this.deps.admission })) {
              this.counters.enqueue_recovered++;
            }
          } catch {
            this.counters.enqueue_errors++;
            this.deps.logger?.("Capture enqueue recovery failed", { job_id: job.jobId });
          }
        }));
      }
    }
    const captures = await repository.claimPendingCaptures(limit);
    for (let offset = 0; offset < captures.length; offset += 4) {
      await Promise.all(captures.slice(offset, offset + 4).map((job) => this.settle(job.jobId, job).catch(() => this.error())));
    }
    const cleanup = await repository.claimPendingCleanup(limit);
    for (let offset = 0; offset < cleanup.length; offset += 4) {
      await Promise.all(cleanup.slice(offset, offset + 4).map((job) => this.finalizer.cleanup(job)));
    }
    const expired = await repository.expiredCaptures(new Date(Date.now() - (this.deps.retentionSeconds ?? 86400) * 1000), limit);
    for (const job of expired) {
      try {
        await this.deps.queue.remove(job.jobId);
        await repository.completePruning(job.jobId);
      } catch { this.error(); }
    }
    this.deps.logger?.("Capture settlement recovery", this.stats());
  }

  async close(): Promise<void> {
    this.running = false;
    clearTimeout(this.timer);
    this.deps.events.off("completed", this.listener);
    this.deps.events.off("failed", this.listener);
    this.pending.clear();
    await Promise.allSettled([...this.active, ...(this.scan ? [this.scan] : [])]);
  }
}
