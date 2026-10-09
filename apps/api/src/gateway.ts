import { createHash, randomUUID } from "node:crypto";
import { Hono } from "hono";
import { SnapforgeError, type ErrorCode } from "@snapforge/contracts";
import { CaptureService, CaptureAdmissionError, HotCache, RedisCaptureAdmission, createRedisCaptureBilling, readCaptureRequest } from "@snapforge/queue";
import type { CaptureBilling, CaptureDispatcher, CaptureQueue, CaptureSubmissionCodec, WebhookOutboxRepository } from "@snapforge/queue";
import type { Redis } from "ioredis";

export interface ApiKeyRecord {
  id: string;
  scopes: string[];
  active: boolean;
  billing_account_id?: string;
}

export interface GatewayDependencies {
  redis: Redis;
  queue: CaptureQueue;
  dispatcher: CaptureDispatcher;
  submissionCodec?: CaptureSubmissionCodec;
  webhooks?: WebhookOutboxRepository;
  hotCache?: HotCache;
  keyCacheTtlMs?: number;
  rateLimit?: { requests: number; windowMs: number };
  concurrencyLimit?: number;
  logger?: (message: string, fields: Record<string, unknown>) => void;
  readyWorkers?: () => Promise<number>;
  settlementStats?: () => Record<string, number>;
  webhookStats?: () => { delivered: number; failed: number; errors: number; active: boolean };
  database?: CaptureBilling & {
    ping(): Promise<void>;
    findApiKeyByHash(keyHash: string): Promise<ApiKeyRecord | null>;
  };
}

type Variables = { requestId: string; apiKey: ApiKeyRecord };
const rateScript = "redis.call('ZREMRANGEBYSCORE', KEYS[1], 0, ARGV[1]-ARGV[2]); local n=redis.call('ZCARD', KEYS[1]); if n>=tonumber(ARGV[3]) then local first=redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES'); return {0, first[2] or ARGV[1]} end; redis.call('ZADD', KEYS[1], ARGV[1], ARGV[4]); redis.call('PEXPIRE', KEYS[1], ARGV[2]); return {1, 0}";

function fail(code: ErrorCode, message: string, requestId: string): never {
  throw new SnapforgeError({ code, message, requestId });
}

export function createGateway(deps: GatewayDependencies) {
  const app = new Hono<{ Variables: Variables }>();
  const authCache = new Map<string, { record: ApiKeyRecord; expiresAt: number }>();
  const rate = deps.rateLimit ?? { requests: 60, windowMs: 60_000 };
  const admission = new RedisCaptureAdmission(deps.redis, { ...rate, concurrency: deps.concurrencyLimit ?? 5, leaseMs: 7_200_000 });
  const service = new CaptureService({ queue: deps.queue, dispatcher: deps.dispatcher, admission,
    billing: deps.database ?? createRedisCaptureBilling(deps.redis), submissionCodec: deps.submissionCodec, logger: deps.logger,
    hotCache: deps.hotCache });

  app.use("*", async (c, next) => {
    const supplied = c.req.header("x-request-id");
    const requestId = supplied && /^[\w.-]{1,100}$/.test(supplied) ? supplied : randomUUID();
    c.set("requestId", requestId);
    c.header("x-request-id", requestId);
    c.header("cache-control", "no-store");
    await next();
  });

  app.onError((error, c) => {
    const requestId = c.get("requestId") ?? randomUUID();
    const known = error instanceof SnapforgeError;
    if (error instanceof CaptureAdmissionError) c.header("retry-after", String(error.retryAfterSeconds));
    deps.logger?.("request failed", { request_id: requestId, code: known ? error.code : "internal_error" });
    return c.json({ ok: false, request_id: requestId, error: known ? { ...error.toEnvelope(), request_id: requestId }
      : { code: "internal_error", message: "Capture service temporarily unavailable", retriable: true, request_id: requestId } },
      (error instanceof CaptureAdmissionError ? error.httpStatus : known ? error.statusCode : 503) as 400);
  });

  app.get("/v1/health", async (c) => {
    try {
      const [redis, depth, workers] = await Promise.all([deps.redis.ping(), deps.queue.depth(), deps.readyWorkers?.() ?? Promise.resolve(0)]);
      const databaseReady = deps.database ? await deps.database.ping().then(() => true).catch(() => false) : true;
      const workerReady = !depth.paused && workers > 0;
      const ready = redis === "PONG" && workerReady && databaseReady;
      return c.json({ ok: ready, data: { redis: redis === "PONG" ? "ready" : "unavailable", database: databaseReady ? "ready" : "unavailable", worker_ready: workerReady, ready_workers: workers, queue: depth, settlement: deps.settlementStats?.(), webhooks: deps.webhookStats?.() } }, ready ? 200 : 503);
    } catch {
      return c.json({ ok: false, data: { redis: "unavailable", worker_ready: false } }, 503);
    }
  });

  app.use("/v1/*", async (c, next) => {
    const requestId = c.get("requestId");
    const match = /^Bearer (sf_live_[A-Za-z0-9_-]{20,})$/.exec(c.req.header("authorization") ?? "");
    if (!match) fail("unauthorized", "A valid Bearer API key is required", requestId);
    const digest = createHash("sha256").update(match[1]).digest("hex");
    let cached = authCache.get(digest);
    if (!cached || cached.expiresAt <= Date.now()) {
      let record: ApiKeyRecord | null = null;
      if (deps.database) record = await deps.database.findApiKeyByHash(digest);
      else {
        const raw = await deps.redis.get(`snapforge:api-key:${digest}`);
        try { record = raw ? JSON.parse(raw) as ApiKeyRecord : null; } catch {}
      }
      if (!record || typeof record.id !== "string" || !record.id || !Array.isArray(record.scopes) || !record.scopes.every((scope) => typeof scope === "string") ||
        (record.billing_account_id !== undefined && (typeof record.billing_account_id !== "string" || !record.billing_account_id)) || record.active !== true) {
        authCache.delete(digest);
        fail("unauthorized", "The API key is invalid or revoked", requestId);
      }
      if (authCache.size >= 2048) authCache.clear();
      cached = { record, expiresAt: Date.now() + (deps.keyCacheTtlMs ?? 5000) };
      authCache.set(digest, cached);
    }
    c.set("apiKey", cached.record);
    await next();
  });

  app.use("/v1/*", async (c, next) => {
    if (c.req.method === "POST" && c.req.path === "/v1/screenshot") return next();
    const now = Date.now();
    const result = await deps.redis.eval(rateScript, 1, `snapforge:rate:${c.var.apiKey.id}`, now, rate.windowMs, rate.requests, `${now}:${randomUUID()}`) as [number, number | string];
    if (Number(result[0]) !== 1) {
      c.header("retry-after", String(Math.max(1, Math.ceil((Number(result[1]) + rate.windowMs - now) / 1000))));
      return c.json({ ok: false, request_id: c.var.requestId, error: { code: "rate_limited", message: "Request rate limit exceeded", retriable: true, request_id: c.var.requestId } }, 429);
    }
    await next();
  });

  const identity = (key: ApiKeyRecord) => ({ accountId: key.billing_account_id ?? key.id, apiKeyId: key.id });
  const scope = (key: ApiKeyRecord, name: string, id: string) => {
    if (!key.scopes.includes(name)) fail("forbidden", `API key requires ${name} scope`, id);
  };

  app.post("/v1/screenshot", async (c) => {
    const { requestId, apiKey } = c.var;
    scope(apiKey, "screenshot:write", requestId);
    const snapshot = await service.submit(identity(apiKey), () => readCaptureRequest(c.req.raw, requestId), requestId,
      c.req.query("mode") === "async" ? "async" : undefined, c.req.header("idempotency-key"),
      { httpKey: apiKey.id, windowMs: rate.windowMs, max: rate.requests });
    if (snapshot.result && (snapshot.state === "completed" || snapshot.state === "failed")) {
      if (snapshot.result.ok) return c.json({ ok: true, request_id: requestId, data: snapshot.result.data }, 200);
      throw new SnapforgeError({ ...snapshot.result.error!, requestId });
    }
    return c.json({ ok: true, request_id: requestId, data: { job_id: snapshot.id, state: snapshot.state,
      poll_url: `/v1/jobs/${encodeURIComponent(snapshot.id)}` } }, 202);
  });

  app.get("/v1/jobs/:id", async (c) => {
    const { requestId, apiKey } = c.var;
    scope(apiKey, "jobs:read", requestId);
    const snapshot = await service.lookup(identity(apiKey), c.req.param("id"), requestId);
    return c.json({ ok: true, request_id: requestId, data: snapshot }, 200);
  });

  app.get("/v1/requests/:key", async (c) => {
    scope(c.var.apiKey, "jobs:read", c.var.requestId);
    const snapshot = await service.lookupRequest(identity(c.var.apiKey), c.req.param("key"), c.var.requestId);
    return c.json({ ok: true, request_id: c.var.requestId, data: snapshot });
  });
  app.get("/v1/jobs/:id/webhook", async (c) => {
    scope(c.var.apiKey, "jobs:read", c.var.requestId);
    const owner = identity(c.var.apiKey);
    const status = await deps.webhooks?.status(owner.accountId, c.req.param("id"), owner.apiKeyId);
    if (!status) fail("invalid_request", "Webhook delivery not found", c.var.requestId);
    c.header("etag", `"${status.generation}"`);
    return c.json({ ok: true, data: status });
  });
  app.post("/v1/jobs/:id/webhook/redeliver", async (c) => {
    scope(c.var.apiKey, "screenshot:write", c.var.requestId);
    const match = /^"(\d{1,3})"$/.exec(c.req.header("if-match") ?? "");
    if (!match) fail("invalid_request", "Supply the delivery status ETag in If-Match", c.var.requestId);
    const owner = identity(c.var.apiKey);
    if (!await deps.webhooks?.redeliver(owner.accountId, c.req.param("id"), Number(match[1]), owner.apiKeyId)) {
      fail("idempotency_conflict", "Delivery is unavailable, already pending, or its generation changed", c.var.requestId);
    }
    return c.json({ ok: true, data: { job_id: c.req.param("id"), state: "pending" } }, 202);
  });

  return app;
}
