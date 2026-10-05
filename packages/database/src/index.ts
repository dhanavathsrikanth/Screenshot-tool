import { and, count, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import type { CaptureFinalization, CaptureLifecycleRepository, CaptureSubmissionRepository, JobSnapshot, SealedCaptureSubmission } from "@snapforge/queue";
import { CaptureRequestConflictError, type WebhookOutboxRepository, type WebhookClaim } from "@snapforge/queue";
import { accounts, apiKeys, captureLogs, captureReservations, webhookOutbox, dodoWebhookEvents, monthlyUsage, schema, subscriptions } from "./schema.js";

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(moduleDirectory, "../../../.env") });

const globalDatabase = globalThis as typeof globalThis & { __snapforgePool?: Pool; __snapforgeDb?: ReturnType<typeof drizzle<typeof schema>> };
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL must be configured for @snapforge/database");

export const pool = globalDatabase.__snapforgePool ??= new Pool({
  connectionString,
  max: Number(process.env.DATABASE_POOL_MAX ?? 5),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  allowExitOnIdle: process.env.NODE_ENV !== "production",
});
export const db = globalDatabase.__snapforgeDb ??= drizzle(pool, { schema });

export interface ApiKeyRow {
  id: string;
  userId: string;
  keyHash: string;
  scopes: string[];
  label: string;
  prefix: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
}

export interface ApiKeySummary {
  id: string;
  label: string;
  prefix: string;
  scopes: string[];
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
}

export class ApiKeyLimitError extends Error {
  constructor() {
    super("The Free plan supports up to 3 API keys. Upgrade to Pro for more keys.");
    this.name = "ApiKeyLimitError";
  }
}

export async function ensureAccount(userId: string, profile: { email?: string | null; displayName?: string | null } = {}) {
  await db.insert(accounts).values({ userId, email: profile.email ?? null, displayName: profile.displayName ?? null })
    .onConflictDoUpdate({ target: accounts.userId, set: {
      ...(profile.email === undefined ? {} : { email: profile.email }),
      ...(profile.displayName === undefined ? {} : { displayName: profile.displayName }),
      updatedAt: new Date(),
    } });
}

export async function createApiKey(input: { id: string; userId: string; label: string; prefix: string; keyHash: string; scopes: string[] }) {
  return db.transaction(async (tx) => {
    await tx.insert(accounts).values({ userId: input.userId }).onConflictDoNothing();
    const [account] = await tx.select({ plan: accounts.plan }).from(accounts).where(eq(accounts.userId, input.userId)).for("update");
    if (account.plan === "free") {
      const [active] = await tx.select({ value: count() }).from(apiKeys)
        .where(and(eq(apiKeys.userId, input.userId), isNull(apiKeys.revokedAt)));
      if (Number(active.value) >= 3) throw new ApiKeyLimitError();
    }
    const [row] = await tx.insert(apiKeys).values(input).returning();
    return row;
  });
}

export async function rotateApiKey(userId: string, previousId: string, input: { id: string; label: string; prefix: string; keyHash: string; scopes: string[] }) {
  return db.transaction(async (tx) => {
    const [previous] = await tx.select({ id: apiKeys.id }).from(apiKeys)
      .where(and(eq(apiKeys.id, previousId), eq(apiKeys.userId, userId), isNull(apiKeys.revokedAt))).for("update");
    if (!previous) return null;
    const [replacement] = await tx.insert(apiKeys).values({ ...input, userId }).returning();
    await tx.update(apiKeys).set({ revokedAt: new Date() })
      .where(and(eq(apiKeys.id, previousId), eq(apiKeys.userId, userId), isNull(apiKeys.revokedAt)));
    return replacement;
  });
}

export async function listApiKeys(userId: string): Promise<ApiKeySummary[]> {
  return db.select({ id: apiKeys.id, label: apiKeys.label, prefix: apiKeys.prefix, scopes: apiKeys.scopes,
    createdAt: apiKeys.createdAt, lastUsedAt: apiKeys.lastUsedAt, revokedAt: apiKeys.revokedAt })
    .from(apiKeys).where(eq(apiKeys.userId, userId)).orderBy(desc(apiKeys.createdAt));
}

export async function revokeApiKey(userId: string, id: string) {
  const [row] = await db.update(apiKeys).set({ revokedAt: new Date() })
    .where(and(eq(apiKeys.id, id), eq(apiKeys.userId, userId), isNull(apiKeys.revokedAt))).returning({ id: apiKeys.id });
  return row ?? null;
}

export async function findApiKeyByHash(keyHash: string) {
  const [key] = await db.select({ id: apiKeys.id, userId: apiKeys.userId, scopes: apiKeys.scopes,
    lastUsedAt: apiKeys.lastUsedAt, revokedAt: apiKeys.revokedAt })
    .from(apiKeys).where(and(eq(apiKeys.keyHash, keyHash), isNull(apiKeys.revokedAt))).limit(1);
  if (!key) return null;
  if (!key.lastUsedAt || Date.now() - key.lastUsedAt.getTime() > 5 * 60_000) {
    void db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, key.id)).catch(() => undefined);
  }
  return { id: key.id, billing_account_id: key.userId, scopes: key.scopes, active: true };
}

const PLAN_LIMITS = { free: 250, pro: 10_000, scale: 100_000 } as const;
export type PlanName = keyof typeof PLAN_LIMITS;

function currentPeriodStart(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export async function reserveCapture(userId: string, requestId: string, submission?: SealedCaptureSubmission): Promise<boolean> {
  if (submission && (submission.accountId !== userId || submission.jobId !== requestId || !submission.ciphertext ||
    submission.ciphertext.length > 512 * 1024 + 128 || !["sync", "async"].includes(submission.mode) || !Number.isSafeInteger(submission.enqueuedAt))) {
    throw new Error("Invalid capture submission reservation");
  }
  return db.transaction(async (tx) => {
    await tx.insert(accounts).values({ userId }).onConflictDoNothing();
    const [account] = await tx.select().from(accounts).where(eq(accounts.userId, userId)).for("update");
    if (submission) {
      const [existing] = await tx.select().from(captureReservations).where(eq(captureReservations.requestId, requestId));
      if (existing) {
        if (submission.requestFingerprint) {
          if (existing.userId !== userId || existing.jobId !== requestId || existing.apiKeyId !== (submission.apiKeyId ?? null) ||
            existing.requestFingerprint !== submission.requestFingerprint) throw new CaptureRequestConflictError(requestId);
          return true;
        }
        if (existing.userId !== userId || existing.jobId !== requestId || existing.apiKeyId !== (submission.apiKeyId ?? null) ||
          existing.submissionMode !== submission.mode || existing.submittedAt?.getTime() !== submission.enqueuedAt ||
          (existing.submissionCiphertext && existing.submissionCiphertext !== submission.ciphertext)) throw new Error("Capture submission identity conflict");
        return true;
      }
    }
    const intentValues = submission ? { jobId: requestId, apiKeyId: submission.apiKeyId ?? null,
      submissionCiphertext: submission.ciphertext, submissionMode: submission.mode, submittedAt: new Date(submission.enqueuedAt),
      requestFingerprint: submission.requestFingerprint ?? null, webhookCiphertext: submission.webhookCiphertext ?? null } : {};
    const periodStart = currentPeriodStart();
    const planLimit = PLAN_LIMITS[account.plan];
    await tx.insert(monthlyUsage).values({ userId, periodStart, limit: planLimit }).onConflictDoUpdate({
      target: [monthlyUsage.userId, monthlyUsage.periodStart], set: { limit: planLimit },
    });
    const [usage] = await tx.select().from(monthlyUsage).where(and(eq(monthlyUsage.userId, userId), eq(monthlyUsage.periodStart, periodStart))).for("update");
    if (usage.consumed + usage.reserved < usage.limit) {
      await tx.update(monthlyUsage).set({ reserved: sql`${monthlyUsage.reserved} + 1` })
        .where(and(eq(monthlyUsage.userId, userId), eq(monthlyUsage.periodStart, periodStart)));
      await tx.insert(captureReservations).values({ requestId, userId, periodStart, source: "monthly", ...intentValues });
      return true;
    }
    if (account.prepaidCredits < 1) return false;
    await tx.update(accounts).set({ prepaidCredits: sql`${accounts.prepaidCredits} - 1`, updatedAt: new Date() }).where(eq(accounts.userId, userId));
    await tx.insert(captureReservations).values({ requestId, userId, periodStart, source: "prepaid", ...intentValues });
    return true;
  });
}

export async function linkReservationToJob(userId: string, requestId: string, jobId: string) {
  await db.update(captureReservations).set({ jobId })
    .where(and(eq(captureReservations.requestId, requestId), eq(captureReservations.userId, userId), eq(captureReservations.status, "held")));
}

export async function settleCapture(requestId: string, succeeded: boolean) {
  await db.transaction(async (tx) => {
    const [reservation] = await tx.update(captureReservations).set({
      status: succeeded ? "consumed" : "released",
      settledAt: new Date(),
      submissionCiphertext: null,
      webhookCiphertext: null,
    }).where(and(eq(captureReservations.requestId, requestId), eq(captureReservations.status, "held"))).returning();
    if (!reservation) return;
    if (reservation.source === "monthly") {
      await tx.update(monthlyUsage).set({
        reserved: sql`GREATEST(${monthlyUsage.reserved} - 1, 0)`,
        ...(succeeded ? { consumed: sql`${monthlyUsage.consumed} + 1` } : {}),
      }).where(and(eq(monthlyUsage.userId, reservation.userId), eq(monthlyUsage.periodStart, reservation.periodStart)));
    } else if (!succeeded) {
      await tx.update(accounts).set({ prepaidCredits: sql`${accounts.prepaidCredits} + 1`, updatedAt: new Date() })
        .where(eq(accounts.userId, reservation.userId));
    }
  });
}

export async function reservationForJob(userId: string, jobId: string) {
  const [reservation] = await db.select({ requestId: captureReservations.requestId })
    .from(captureReservations).where(and(eq(captureReservations.userId, userId), eq(captureReservations.jobId, jobId), eq(captureReservations.status, "held"))).limit(1);
  return reservation?.requestId ?? null;
}

export interface CaptureEntry {
  id: string;
  at: number;
  ok: boolean;
  cached?: boolean;
  url: string;
  format: string;
  width: number | null;
  height: number | null;
  bytes: number;
  duration_ms: number;
  blocked_requests: number;
  code: string | null;
  message: string | null;
  request_id: string;
}

export async function recordCapture(userId: string, entry: CaptureEntry) {
  await ensureAccount(userId);
  await db.insert(captureLogs).values({
    id: entry.id, userId, requestId: entry.request_id, capturedAt: new Date(entry.at), ok: entry.ok, cached: entry.cached ?? false,
    url: entry.url, format: entry.format, width: entry.width, height: entry.height, bytes: entry.bytes,
    durationMs: entry.duration_ms, blockedRequests: entry.blocked_requests, code: entry.code, message: entry.message,
  }).onConflictDoNothing();
}

export async function commitCapture(input: CaptureFinalization): Promise<JobSnapshot> {
  if (!["completed", "failed"].includes(input.snapshot.state) || !input.snapshot.result ||
    input.snapshot.id !== input.jobId || input.entry.id !== input.jobId || input.entry.ok !== input.snapshot.result.ok) {
    throw new Error("Invalid capture finalization");
  }
  return db.transaction(async (tx) => {
    const [reservation] = await tx.select().from(captureReservations).where(and(
      ...(input.reservationId ? [eq(captureReservations.requestId, input.reservationId)] : []), eq(captureReservations.jobId, input.jobId),
      eq(captureReservations.userId, input.accountId),
    )).for("update");
    if (!reservation) throw new Error("Capture reservation link does not match");
    if (reservation.result) return reservation.result;
    const succeeded = input.snapshot.result!.ok;
    if (reservation.status === "held") {
      if (reservation.source === "monthly") {
        await tx.update(monthlyUsage).set({ reserved: sql`${monthlyUsage.reserved} - 1`,
          ...(succeeded ? { consumed: sql`${monthlyUsage.consumed} + 1` } : {}),
        }).where(and(eq(monthlyUsage.userId, reservation.userId), eq(monthlyUsage.periodStart, reservation.periodStart)));
      } else if (!succeeded) {
        await tx.update(accounts).set({ prepaidCredits: sql`${accounts.prepaidCredits} + 1`, updatedAt: new Date() })
          .where(eq(accounts.userId, reservation.userId));
      }
    }
    await tx.update(captureReservations).set({
      status: reservation.status === "held" ? (succeeded ? "consumed" : "released") : reservation.status,
      settledAt: reservation.settledAt ?? new Date(), result: input.snapshot, apiKeyId: input.apiKeyId ?? null,
      cleanupPending: true, nextCleanupAt: new Date(),
      submissionCiphertext: null, enqueueAcknowledged: true,
      webhookCiphertext: null,
    }).where(eq(captureReservations.requestId, reservation.requestId));
    const entry = input.entry;
    await tx.insert(captureLogs).values({
      id: input.jobId, userId: input.accountId, requestId: entry.request_id, capturedAt: new Date(entry.at), ok: entry.ok,
      cached: entry.cached ?? false, url: entry.url, format: entry.format, width: entry.width, height: entry.height,
      bytes: entry.bytes, durationMs: entry.duration_ms, blockedRequests: entry.blocked_requests, code: entry.code, message: entry.message,
    }).onConflictDoNothing();
    if (reservation.webhookCiphertext) await tx.insert(webhookOutbox).values({
      id: `wh-${input.jobId}`, jobId: input.jobId, userId: input.accountId, apiKeyId: reservation.apiKeyId,
      targetCiphertext: reservation.webhookCiphertext, result: input.snapshot.result!,
    }).onConflictDoNothing();
    return input.snapshot;
  });
}

export const captureSubmissions: CaptureSubmissionRepository = {
  reserveSubmission: (input) => reserveCapture(input.accountId, input.jobId, input),
  async existingRequest(accountId, jobId) {
    const [row] = await db.select({ fingerprint: captureReservations.requestFingerprint, apiKeyId: captureReservations.apiKeyId })
      .from(captureReservations).where(and(eq(captureReservations.userId, accountId), eq(captureReservations.jobId, jobId))).limit(1);
    return row?.fingerprint ? { fingerprint: row.fingerprint, apiKeyId: row.apiKeyId ?? undefined } : null;
  },
  async pendingSubmission(accountId, jobId, apiKeyId) {
    const [row] = await db.select({ accountId: captureReservations.userId, jobId: captureReservations.jobId,
      apiKeyId: captureReservations.apiKeyId, mode: captureReservations.submissionMode,
      submittedAt: captureReservations.submittedAt, acknowledged: captureReservations.enqueueAcknowledged,
    }).from(captureReservations).where(and(eq(captureReservations.userId, accountId), eq(captureReservations.jobId, jobId),
      eq(captureReservations.status, "held"), sql`${captureReservations.submittedAt} IS NOT NULL`,
      ...(apiKeyId ? [eq(captureReservations.apiKeyId, apiKeyId)] : []),
    )).limit(1);
    if (!row?.jobId || !row.mode || !row.submittedAt) return null;
    return { accountId: row.accountId, jobId: row.jobId, apiKeyId: row.apiKeyId ?? undefined,
      mode: row.mode, enqueuedAt: row.submittedAt.getTime(), acknowledged: row.acknowledged };
  },
  async claimPendingSubmissions(limit) {
    const result = await db.execute<{ accountId: string; jobId: string }>(sql`
      WITH candidates AS (
        SELECT request_id FROM capture_reservations
        WHERE status = 'held' AND submission_ciphertext IS NOT NULL AND next_enqueue_at <= now()
        ORDER BY next_enqueue_at, request_id LIMIT ${Math.min(Math.max(limit, 1), 100)} FOR UPDATE SKIP LOCKED
      )
      UPDATE capture_reservations r SET next_enqueue_at = now() + interval '15 seconds'
      FROM candidates c WHERE r.request_id = c.request_id
      RETURNING r.user_id AS "accountId", r.job_id AS "jobId"
    `);
    return result.rows;
  },
  async dispatchSubmission(jobId, deliver) {
    return db.transaction(async (tx) => {
      const [row] = await tx.select().from(captureReservations).where(eq(captureReservations.jobId, jobId)).for("update");
      if (!row || row.status !== "held" || row.result || !row.submissionCiphertext || !row.submissionMode || !row.submittedAt) return false;
      await deliver({ accountId: row.userId, jobId, apiKeyId: row.apiKeyId ?? undefined,
        mode: row.submissionMode, enqueuedAt: row.submittedAt.getTime(), ciphertext: row.submissionCiphertext });
      await tx.update(captureReservations).set({ submissionCiphertext: null, enqueueAcknowledged: true })
        .where(eq(captureReservations.requestId, row.requestId));
      return true;
    });
  },
};

export const webhookDeliveries: WebhookOutboxRepository = {
  async claim(limit, maxAttempts, leaseSeconds) {
    await db.execute(sql`
      WITH exhausted AS (
        SELECT id FROM webhook_outbox WHERE state = 'pending' AND attempts >= ${maxAttempts}
        AND (lease_until IS NULL OR lease_until <= now())
        ORDER BY next_attempt_at, id LIMIT ${Math.min(Math.max(limit, 1), 100)} FOR UPDATE SKIP LOCKED
      )
      UPDATE webhook_outbox w SET state = 'failed', lease_token = NULL, lease_until = NULL, completed_at = now()
      FROM exhausted e WHERE w.id = e.id
    `);
    const result = await db.execute<WebhookClaim & Record<string, unknown>>(sql`
      WITH candidates AS (
        SELECT id FROM webhook_outbox WHERE state = 'pending' AND attempts < ${maxAttempts} AND next_attempt_at <= now()
        AND (lease_until IS NULL OR lease_until <= now())
        ORDER BY next_attempt_at, id LIMIT ${Math.min(Math.max(limit, 1), 100)} FOR UPDATE SKIP LOCKED
      )
      UPDATE webhook_outbox w SET lease_token = gen_random_uuid()::text,
        lease_until = now() + ${leaseSeconds} * interval '1 second', attempts = attempts + 1
      FROM candidates c WHERE w.id = c.id
      RETURNING w.id, w.job_id AS "jobId", w.user_id AS "accountId", w.target_ciphertext AS ciphertext,
        w.result, w.lease_token AS token, w.attempts AS attempt, w.generation
    `);
    return result.rows;
  },
  async complete(claim, outcome, nextAttemptAt) {
    await db.update(webhookOutbox).set({ state: outcome.delivered ? "delivered" : outcome.retry ? "pending" : "failed",
      leaseToken: null, leaseUntil: null, statusCode: outcome.statusCode ?? null,
      completedAt: outcome.delivered || !outcome.retry ? new Date() : null, nextAttemptAt,
    }).where(and(eq(webhookOutbox.id, claim.id), eq(webhookOutbox.leaseToken, claim.token), eq(webhookOutbox.generation, claim.generation)));
  },
  async status(accountId, jobId, apiKeyId) {
    const [row] = await db.select({ id: webhookOutbox.id, state: webhookOutbox.state, attempts: webhookOutbox.attempts,
      generation: webhookOutbox.generation, statusCode: webhookOutbox.statusCode }).from(webhookOutbox).where(and(
      eq(webhookOutbox.userId, accountId), eq(webhookOutbox.jobId, jobId), ...(apiKeyId ? [eq(webhookOutbox.apiKeyId, apiKeyId)] : []),
    )).limit(1);
    return row ?? null;
  },
  async redeliver(accountId, jobId, generation, apiKeyId) {
    const [row] = await db.update(webhookOutbox).set({ state: "pending", attempts: 0,
      generation: sql`${webhookOutbox.generation} + 1`, nextAttemptAt: new Date(), completedAt: null, leaseToken: null, leaseUntil: null,
    }).where(and(eq(webhookOutbox.userId, accountId), eq(webhookOutbox.jobId, jobId), eq(webhookOutbox.generation, generation),
      sql`${webhookOutbox.state} IN ('delivered', 'failed')`, sql`${webhookOutbox.generation} < 3`,
      ...(apiKeyId ? [eq(webhookOutbox.apiKeyId, apiKeyId)] : []),
    )).returning({ id: webhookOutbox.id });
    return Boolean(row);
  },
};

export const captureLifecycle: CaptureLifecycleRepository = {
  commitCapture,
  async storedCapture(accountId, jobId, apiKeyId) {
    const [row] = await db.select({ result: captureReservations.result }).from(captureReservations).where(and(
      eq(captureReservations.userId, accountId), eq(captureReservations.jobId, jobId),
      ...(apiKeyId ? [eq(captureReservations.apiKeyId, apiKeyId)] : []),
    )).limit(1);
    return row?.result ?? null;
  },
  async claimPendingCaptures(limit) {
    const result = await db.execute<{ accountId: string; jobId: string }>(sql`
      WITH candidates AS (
        SELECT request_id FROM capture_reservations
        WHERE status = 'held' AND job_id IS NOT NULL AND next_check_at <= now()
        ORDER BY next_check_at, request_id LIMIT ${Math.min(Math.max(limit, 1), 100)} FOR UPDATE SKIP LOCKED
      )
      UPDATE capture_reservations r SET next_check_at = now() + interval '30 seconds'
      FROM candidates c WHERE r.request_id = c.request_id
      RETURNING r.user_id AS "accountId", r.job_id AS "jobId"
    `);
    return result.rows;
  },
  async claimPendingCleanup(limit) {
    const result = await db.execute<{ accountId: string; jobId: string }>(sql`
      WITH candidates AS (
        SELECT request_id FROM capture_reservations
        WHERE cleanup_pending AND job_id IS NOT NULL AND next_cleanup_at <= now()
        ORDER BY next_cleanup_at, request_id LIMIT ${Math.min(Math.max(limit, 1), 100)} FOR UPDATE SKIP LOCKED
      )
      UPDATE capture_reservations r SET next_cleanup_at = now() + interval '5 seconds'
      FROM candidates c WHERE r.request_id = c.request_id
      RETURNING r.user_id AS "accountId", r.job_id AS "jobId"
    `);
    return result.rows;
  },
  async completeCleanup(jobId) {
    await db.update(captureReservations).set({ cleanupPending: false }).where(and(
      eq(captureReservations.jobId, jobId), sql`${captureReservations.result} IS NOT NULL`,
    ));
  },
  async expiredCaptures(before, limit) {
    return db.select({ accountId: captureReservations.userId, jobId: sql<string>`${captureReservations.jobId}` })
      .from(captureReservations).where(and(eq(captureReservations.cleanupPending, false), eq(captureReservations.pruned, false),
        sql`${captureReservations.result} IS NOT NULL`, sql`${captureReservations.settledAt} < ${before}`,
      )).orderBy(captureReservations.settledAt).limit(Math.min(Math.max(limit, 1), 100));
  },
  async completePruning(jobId) {
    await db.update(captureReservations).set({ pruned: true }).where(and(
      eq(captureReservations.jobId, jobId), eq(captureReservations.cleanupPending, false), sql`${captureReservations.result} IS NOT NULL`,
    ));
  },
};

export async function listCaptures(userId: string, limit = 60): Promise<CaptureEntry[]> {
  const rows = await db.select().from(captureLogs).where(eq(captureLogs.userId, userId))
    .orderBy(desc(captureLogs.capturedAt)).limit(Math.min(Math.max(limit, 1), 200));
  return rows.map((row) => ({ id: row.id, at: row.capturedAt.getTime(), ok: row.ok, cached: row.cached, url: row.url,
    format: row.format, width: row.width, height: row.height, bytes: row.bytes, duration_ms: row.durationMs,
    blocked_requests: row.blockedRequests, code: row.code, message: row.message, request_id: row.requestId }));
}

export async function clearCaptures(userId: string) {
  await db.delete(captureLogs).where(eq(captureLogs.userId, userId));
}

export async function captureStats(userId: string) {
  const periodStart = currentPeriodStart();
  const [aggregate] = await db.select({ total: count(), succeeded: sql<number>`count(*) filter (where ${captureLogs.ok})`,
    failed: sql<number>`count(*) filter (where not ${captureLogs.ok})`,
    cacheHits: sql<number>`count(*) filter (where ${captureLogs.cached})`,
    bytes: sql<number>`coalesce(sum(${captureLogs.bytes}) filter (where ${captureLogs.ok}), 0)`,
    blocked: sql<number>`coalesce(sum(${captureLogs.blockedRequests}), 0)`,
    durations: sql<number[]>`coalesce(array_agg(${captureLogs.durationMs}) filter (where ${captureLogs.ok}), ARRAY[]::integer[])` })
    .from(captureLogs).where(and(eq(captureLogs.userId, userId), gte(captureLogs.capturedAt, periodStart)));
  const formats = await db.select({ format: captureLogs.format, value: count() }).from(captureLogs)
    .where(and(eq(captureLogs.userId, userId), gte(captureLogs.capturedAt, periodStart))).groupBy(captureLogs.format);
  const outcomes = await db.select({ code: sql<string>`case when ${captureLogs.ok} then 'success' else coalesce(${captureLogs.code}, 'unknown') end`, value: count() })
    .from(captureLogs).where(and(eq(captureLogs.userId, userId), gte(captureLogs.capturedAt, periodStart)))
    .groupBy(sql`case when ${captureLogs.ok} then 'success' else coalesce(${captureLogs.code}, 'unknown') end`);
  const durations = (aggregate.durations ?? []).map(Number).sort((a, b) => a - b);
  const percentile = (p: number) => durations.length ? durations[Math.min(durations.length - 1, Math.floor(durations.length * p))] : 0;
  const total = Number(aggregate.total);
  const succeeded = Number(aggregate.succeeded);
  return { total, succeeded, failed: Number(aggregate.failed), cache_hits: Number(aggregate.cacheHits), success_rate: total ? succeeded / total : 1,
    bytes: Number(aggregate.bytes), blocked_requests: Number(aggregate.blocked), p50_ms: percentile(.5), p95_ms: percentile(.95),
    avg_ms: succeeded ? Math.round(durations.reduce((sum, value) => sum + value, 0) / succeeded) : 0,
    by_format: Object.fromEntries(formats.map((row) => [row.format, Number(row.value)])),
    by_code: Object.fromEntries(outcomes.map((row) => [row.code, Number(row.value)])) };
}

export async function getBillingState(userId: string) {
  await db.insert(accounts).values({ userId }).onConflictDoNothing();
  const [account] = await db.select().from(accounts).where(eq(accounts.userId, userId));
  const periodStart = currentPeriodStart();
  const [usage] = await db.select().from(monthlyUsage)
    .where(and(eq(monthlyUsage.userId, userId), eq(monthlyUsage.periodStart, periodStart))).limit(1);
  const limit = PLAN_LIMITS[account.plan];
  const subscription = await getSubscription(userId);
  return { plan: account.plan, prepaidCredits: account.prepaidCredits, included: limit, used: usage?.consumed ?? 0,
    reserved: usage?.reserved ?? 0, customerId: account.dodoCustomerId, subscription };
}

export interface PaidProduct { id: string; credits: number; kind: "subscription" | "credits"; plan?: PlanName }

export async function recordDodoEvent(input: { eventId: string; eventType: string; userId: string; customerId?: string; subscriptionId?: string; productId?: string; product?: PaidProduct; subscriptionStatus?: string; cancelAtPeriodEnd?: boolean; currentPeriodEnd?: Date | null }) {
  return db.transaction(async (tx) => {
    await tx.insert(accounts).values({ userId: input.userId }).onConflictDoNothing();
    const [event] = await tx.insert(dodoWebhookEvents).values({ eventId: input.eventId, eventType: input.eventType }).onConflictDoNothing().returning();
    if (!event) return false;
    const accountUpdate: Partial<typeof accounts.$inferInsert> = { updatedAt: new Date() };
    if (input.customerId) accountUpdate.dodoCustomerId = input.customerId;
    if (input.product?.kind === "credits") accountUpdate.prepaidCredits = sql`${accounts.prepaidCredits} + ${input.product.credits}` as unknown as number;
    if (input.product?.kind === "subscription" && input.product.plan &&
      (input.subscriptionStatus === "active" || input.subscriptionStatus === "past_due")) accountUpdate.plan = input.product.plan;
    await tx.update(accounts).set(accountUpdate).where(eq(accounts.userId, input.userId));
    if (input.subscriptionId && input.product?.kind === "subscription" && input.product.plan && input.subscriptionStatus) {
      await tx.insert(subscriptions).values({ id: input.subscriptionId, userId: input.userId, productId: input.product.id,
        plan: input.product.plan, status: input.subscriptionStatus, cancelAtPeriodEnd: input.cancelAtPeriodEnd ?? false,
        currentPeriodEnd: input.currentPeriodEnd ?? null, updatedAt: new Date() }).onConflictDoUpdate({ target: subscriptions.id,
        set: { status: input.subscriptionStatus, productId: input.product.id, plan: input.product.plan,
          cancelAtPeriodEnd: input.cancelAtPeriodEnd ?? false, currentPeriodEnd: input.currentPeriodEnd ?? null, updatedAt: new Date() } });
    } else if (input.subscriptionId && input.subscriptionStatus) {
      const [current] = await tx.select().from(subscriptions).where(eq(subscriptions.id, input.subscriptionId)).for("update");
      if (current) {
        await tx.update(subscriptions).set({ status: input.subscriptionStatus,
          cancelAtPeriodEnd: input.cancelAtPeriodEnd ?? current.cancelAtPeriodEnd,
          currentPeriodEnd: input.currentPeriodEnd === undefined ? current.currentPeriodEnd : input.currentPeriodEnd,
          updatedAt: new Date() }).where(eq(subscriptions.id, input.subscriptionId));
      }
    }
    if (input.subscriptionId && input.subscriptionStatus && input.subscriptionStatus !== "active" && input.subscriptionStatus !== "past_due") {
      const [active] = await tx.select({ plan: subscriptions.plan }).from(subscriptions)
        .where(and(eq(subscriptions.userId, input.userId), sql`${subscriptions.status} IN ('active', 'past_due')`))
        .orderBy(desc(subscriptions.updatedAt)).limit(1);
      await tx.update(accounts).set({ plan: active?.plan ?? "free", updatedAt: new Date() }).where(eq(accounts.userId, input.userId));
    }
    return true;
  });
}

export async function getSubscription(userId: string) {
  const [subscription] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId))
    .orderBy(desc(sql`case when ${subscriptions.status} in ('active', 'past_due') then 1 else 0 end`), desc(subscriptions.updatedAt)).limit(1);
  return subscription ?? null;
}

export async function findSubscriptionOwner(subscriptionId: string) {
  const [subscription] = await db.select({ userId: subscriptions.userId }).from(subscriptions)
    .where(eq(subscriptions.id, subscriptionId)).limit(1);
  return subscription?.userId ?? null;
}

export async function findAccountByCustomerId(customerId: string) {
  const [account] = await db.select({ userId: accounts.userId }).from(accounts)
    .where(eq(accounts.dodoCustomerId, customerId)).limit(1);
  return account?.userId ?? null;
}

export { schema };
