import { randomUUID } from "node:crypto";
import { captureOptionsSchema, captureRequestSchema, idempotencyKeySchema, SnapforgeError, type CaptureOptions, type CaptureSuccessData, type CaptureWebhook } from "@snapforge/contracts";
import { captureRequestFingerprint, CaptureRequestConflictError, idempotentJobId } from "./idempotency.js";
import { deliverCaptureSubmission, type CaptureSubmissionCodec, type CaptureSubmissionRepository } from "./submission.js";
import { CaptureFinalizer, type CaptureLifecycleRepository } from "./settlement.js";
export { artifactData } from "./outcome.js";
import type { CaptureDispatcher } from "./dispatcher.js";
import type { CaptureQueue } from "./queue.js";
import type { CaptureMode, JobSnapshot } from "./types.js";
import type { HotCache } from "./hot-cache.js";
import type { HttpRateLimit } from "./admission.js";

export interface CaptureHistoryEntry {
  id: string; at: number; ok: boolean; cached?: boolean; url: string; format: string;
  width: number | null; height: number | null; bytes: number; duration_ms: number;
  blocked_requests: number; code: string | null; message: string | null; request_id: string;
}

export interface CaptureBilling {
  lifecycle?: CaptureLifecycleRepository;
  submissions?: CaptureSubmissionRepository;
  reserveCapture(accountId: string, reservationId: string): Promise<boolean>;
  settleCapture(reservationId: string, succeeded: boolean): Promise<void>;
  linkReservationToJob(accountId: string, reservationId: string, jobId: string): Promise<void>;
  reservationForJob(accountId: string, jobId: string): Promise<string | null>;
  recordCapture(accountId: string, entry: CaptureHistoryEntry): Promise<void>;
}

export interface CaptureIdentity {
  accountId: string;
  apiKeyId?: string;
}

export interface CaptureServiceDependencies {
  queue: Pick<CaptureQueue, "getJob" | "snapshot">;
  dispatcher: Pick<CaptureDispatcher, "dispatch"> & Partial<Pick<CaptureDispatcher, "waitForResult">>;
  submissionCodec?: CaptureSubmissionCodec;
  admission: {
    acquireJob(accountId: string, jobId: string, httpRate?: HttpRateLimit): Promise<void>;
    releaseJob(accountId: string, jobId: string): Promise<void>;
    recoverJob?(accountId: string, jobId: string): Promise<void>;
  };
  billing: CaptureBilling;
  /**
   * Optional synchronous LRU of completed results. When provided, submits for
   * non-webhook captures hit the cache before admission/reservation/dispatch.
   */
  hotCache?: HotCache;
  newId?: () => string;
  logger?: (message: string, fields: Record<string, unknown>) => void;
}

export class CaptureService {
  constructor(private readonly deps: CaptureServiceDependencies) {}

  async submit(identity: CaptureIdentity, input: unknown, requestId: string, mode?: CaptureMode, idempotencyKey?: string, httpRate?: HttpRateLimit): Promise<JobSnapshot> {
    if (idempotencyKey !== undefined) return this.submitIdempotent(identity, input, requestId, mode, idempotencyKey);
    const jobId = (this.deps.newId ?? randomUUID)();
    let attemptedEnqueue = false;
    let reservationAttempted = false;
    let admitted = false;
    try {
      const body = typeof input === "function" ? await (input as () => Promise<unknown>)() : input;
      const parsed = captureRequestSchema.safeParse(body);
      if (!parsed.success) throw new SnapforgeError({ code: "invalid_request", message: "Capture options are invalid", requestId });
      const options = captureOptionsSchema.parse(parsed.data);

      // Synchronous hot-cache fast path. Webhook-bearing and durable-submission
      // requests skip this so they always reach the queue/webhook pipeline.
      if (!parsed.data.webhook && !this.deps.billing.submissions && this.deps.hotCache) {
        const hit = this.deps.hotCache.get(options);
        if (hit) return this.snapshotFromHotCache(jobId, requestId, hit);
      }

      await this.deps.admission.acquireJob(identity.accountId, jobId, httpRate);
      admitted = true;

      if (this.deps.billing.submissions) return this.submitDurable(identity, jobId, options, requestId, mode ?? (options.sync ? "sync" : "async"), undefined, parsed.data.webhook);
      if (parsed.data.webhook) throw new SnapforgeError({ code: "unsupported_option", message: "Durable webhook delivery is not configured", requestId });
      reservationAttempted = true;
      if (!await this.deps.billing.reserveCapture(identity.accountId, jobId)) {
        throw new SnapforgeError({ code: "quota_exceeded", message: "No captures or credits are available", requestId });
      }
      await this.deps.billing.linkReservationToJob(identity.accountId, jobId, jobId);
      attemptedEnqueue = true;
      await this.deps.dispatcher.dispatch({
        jobId, requestId: jobId, options: parsed.data, mode: mode ?? (parsed.data.sync ? "sync" : "async"),
        apiKeyId: identity.apiKeyId, accountId: identity.accountId, reservationId: jobId,
      });
    } catch (error) {
      if (attemptedEnqueue) {
        let found;
        try {
          found = await this.deps.queue.getJob(jobId);
        } catch {
          throw new SnapforgeError({
            code: "egress_unavailable", message: "Capture submission is being recovered. Check its job before retrying.",
            requestId, details: { job_id: jobId },
          });
        }
        if (found) return this.acknowledge(identity, jobId, requestId);
      }
      if (reservationAttempted) await this.deps.billing.settleCapture(jobId, false).catch(() => this.warn("Capture reservation release failed", jobId));
      if (admitted) await this.deps.admission.releaseJob(identity.accountId, jobId).catch(() => this.warn("Capture admission release failed", jobId));
      throw error;
    }
    return this.acknowledge(identity, jobId, requestId);
  }

  private snapshotFromHotCache(jobId: string, requestId: string, hit: CaptureSuccessData): JobSnapshot {
    const now = Date.now();
    const data: CaptureSuccessData = { ...hit, cached: true };
    return {
      id: jobId,
      state: "completed",
      mode: "sync",
      request_id: requestId,
      progress: null,
      attempts_made: 0,
      attempt_budget: 1,
      enqueued_at: now,
      result: {
        request_id: requestId,
        mode: "sync",
        ok: true,
        data,
        duration_ms: hit.duration_ms,
        attempts_made: 0,
        enqueued_at: now,
        completed_at: now,
        worker_id: "hot-cache",
      },
      webhook: null,
    };
  }

  private async submitIdempotent(identity: CaptureIdentity, input: unknown, requestId: string, mode: CaptureMode | undefined, key: string): Promise<JobSnapshot> {
    if (!idempotencyKeySchema.safeParse(key).success) throw new SnapforgeError({ code: "invalid_request", message: "Idempotency-Key must contain 1–128 letters, digits, dots, underscores or hyphens", requestId });
    const submissions = this.deps.billing.submissions;
    if (!submissions?.existingRequest) throw new SnapforgeError({ code: "unsupported_option", message: "Durable request idempotency is not configured", requestId });
    const body = typeof input === "function" ? await (input as () => Promise<unknown>)() : input;
    const parsed = captureRequestSchema.safeParse(body);
    if (!parsed.success) throw new SnapforgeError({ code: "invalid_request", message: "Capture options are invalid", requestId });
    const options = captureOptionsSchema.parse(parsed.data);
    const resolvedMode = mode ?? (options.sync ? "sync" : "async");
    const fingerprint = captureRequestFingerprint({ options, mode: resolvedMode, webhook: parsed.data.webhook });
    const jobId = idempotentJobId(identity.accountId, key);
    const existing = await submissions.existingRequest(identity.accountId, jobId);
    if (existing) {
      if (existing.fingerprint !== fingerprint || existing.apiKeyId !== identity.apiKeyId) throw new CaptureRequestConflictError(requestId);
      return this.acknowledge(identity, jobId, requestId);
    }
    await this.deps.admission.acquireJob(identity.accountId, jobId);
    return this.submitDurable(identity, jobId, options, requestId, resolvedMode, fingerprint, parsed.data.webhook);
  }

  async lookupRequest(identity: CaptureIdentity, key: string, requestId: string): Promise<JobSnapshot> {
    if (!idempotencyKeySchema.safeParse(key).success) throw new SnapforgeError({ code: "invalid_request", message: "Invalid Idempotency-Key", requestId });
    return this.lookup(identity, idempotentJobId(identity.accountId, key), requestId);
  }

  private async submitDurable(identity: CaptureIdentity, jobId: string, options: CaptureOptions, requestId: string, mode: CaptureMode,
    requestFingerprint?: string, webhook?: CaptureWebhook): Promise<JobSnapshot> {
    const submissions = this.deps.billing.submissions!;
    let reservationAttempted = false;
    try {
      const codec = this.deps.submissionCodec;
      if (!codec) throw new Error("Capture submission encryption is not configured");
      const intent = { ...identity, jobId, mode, enqueuedAt: Date.now(), options, webhook };
      const ciphertext = codec.seal(intent);
      const webhookCiphertext = webhook ? codec.sealWebhook(webhook, { accountId: identity.accountId, jobId }) : undefined;
      reservationAttempted = true;
      const reserved = await submissions.reserveSubmission({ ...identity, jobId, mode, enqueuedAt: intent.enqueuedAt, ciphertext, requestFingerprint,
        webhookCiphertext });
      if (!reserved) {
        reservationAttempted = false;
        throw new SnapforgeError({ code: "quota_exceeded", message: "No captures or credits are available", requestId });
      }
      try {
        await deliverCaptureSubmission(jobId, { submissions, codec, queue: this.deps.queue, dispatcher: this.deps.dispatcher, admission: this.deps.admission });
      } catch { this.warn("Capture submission awaits recovery", jobId); }
      if (mode === "sync" && this.deps.dispatcher.waitForResult) {
        await this.deps.dispatcher.waitForResult(jobId, jobId).catch(() => undefined);
      }
      return this.acknowledge(identity, jobId, requestId);
    } catch (error) {
      if (error instanceof CaptureRequestConflictError) throw error;
      if (reservationAttempted) {
        throw new SnapforgeError({ code: "egress_unavailable", message: "Capture submission outcome is being recovered. Check its job before retrying.",
          requestId, details: { job_id: jobId } });
      }
      await this.deps.admission.releaseJob(identity.accountId, jobId).catch(() => this.warn("Capture admission release failed", jobId));
      throw error;
    }
  }

  private async acknowledge(identity: CaptureIdentity, jobId: string, requestId: string): Promise<JobSnapshot> {
    try { return await this.lookup(identity, jobId, requestId); }
    catch {
      throw new SnapforgeError({ code: "egress_unavailable", message: "Capture is accepted. Check its job before retrying.", requestId, details: { job_id: jobId } });
    }
  }

  async lookup(identity: CaptureIdentity, jobId: string, requestId: string): Promise<JobSnapshot> {
    let queueUnavailable = false;
    const owned = await this.deps.queue.getJob(jobId).catch((error: unknown) => {
      if (!this.deps.billing.submissions) throw error;
      queueUnavailable = true;
      return null;
    });
    if (!owned && this.deps.billing.lifecycle) {
      const stored = await this.deps.billing.lifecycle.storedCapture(identity.accountId, jobId, identity.apiKeyId);
      if (stored) return stored;
    }
    if (!owned && this.deps.billing.submissions) {
      const pending = await this.deps.billing.submissions.pendingSubmission(identity.accountId, jobId, identity.apiKeyId);
      if (pending) return { id: jobId, request_id: jobId, mode: pending.mode,
        state: queueUnavailable || pending.acknowledged ? "unknown" : "waiting", progress: null,
        attempts_made: 0, attempt_budget: 0, enqueued_at: pending.enqueuedAt, webhook: null };
    }
    const accountMatches = owned?.data.billing_account_id === identity.accountId;
    const legacyKeyMatches = !owned?.data.billing_account_id && identity.apiKeyId && owned?.data.api_key_id === identity.apiKeyId;
    if (!owned || (!accountMatches && !legacyKeyMatches) || (identity.apiKeyId && owned.data.api_key_id !== identity.apiKeyId)) {
      throw new SnapforgeError({ code: "invalid_request", message: "Job not found", requestId });
    }
    const snapshot = await this.deps.queue.snapshot(jobId, owned);
    if (!snapshot) throw new SnapforgeError({ code: "invalid_request", message: "Job not found", requestId });
    const result = { ...snapshot, webhook: snapshot.webhook ? { url: snapshot.webhook.url, event: snapshot.webhook.event } : null };
    if (snapshot.state !== "completed" && snapshot.state !== "failed") return result;
    const finalized = await new CaptureFinalizer(this.deps.billing, this.deps.admission, this.deps.logger).finalize(owned, snapshot, identity.accountId);
    this.populateHotCache(owned.data.options, finalized);
    return finalized;
  }

  private populateHotCache(options: CaptureOptions, snapshot: JobSnapshot): void {
    if (!this.deps.hotCache) return;
    const data = snapshot.result?.data;
    if (!snapshot.result?.ok || !data || !data.cdn_url) return;
    this.deps.hotCache.set(options, data);
  }

  private warn(message: string, jobId: string): void {
    this.deps.logger?.(message, { job_id: jobId });
  }
}
