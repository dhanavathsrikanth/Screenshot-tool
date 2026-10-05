import { createHash } from "node:crypto";
import { Redis } from "ioredis";
import { SnapforgeError } from "@snapforge/contracts";

export const CAPTURE_ADMISSION_DEFAULTS = {
  requests: 60,
  windowMs: 60_000,
  concurrency: 5,
  leaseMs: 300_000,
  prefix: "snapforge:capture-admission",
} as const;

export interface CaptureLease {
  release(): Promise<void>;
}

export interface CaptureAdmission {
  acquire(accountId: string, requestId: string): Promise<CaptureLease>;
}

export interface AdmissionRedis {
  eval(script: string, keyCount: number, ...args: Array<string | number>): Promise<unknown>;
  zrem(key: string, member: string): Promise<number>;
}

type AdmissionOptions = { [K in keyof typeof CAPTURE_ADMISSION_DEFAULTS]: K extends "prefix" ? string : number };

export class CaptureAdmissionError extends SnapforgeError {
  readonly httpStatus: number;
  readonly retryAfterSeconds: number;

  constructor(requestId: string, limited: boolean, retryAfterSeconds = 1) {
    super({
      code: limited ? "rate_limited" : "internal_error",
      message: limited ? "Capture limit reached. Please retry shortly." : "Capture admission is temporarily unavailable. Please retry shortly.",
      requestId,
      details: { retry_after_seconds: retryAfterSeconds },
    });
    this.httpStatus = limited ? 429 : 503;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function limits(input: Partial<AdmissionOptions>): AdmissionOptions {
  const result = { ...CAPTURE_ADMISSION_DEFAULTS, ...input };
  for (const key of ["requests", "windowMs", "concurrency", "leaseMs"] as const) {
    if (!Number.isSafeInteger(result[key]) || result[key] < 1) throw new RangeError(`Invalid capture admission ${key}`);
  }
  return result;
}

function lease(release: () => Promise<void>, renew: () => Promise<void>, intervalMs: number): CaptureLease {
  let closed = false;
  let pending: Promise<void> | undefined;
  const timer = setInterval(() => {
    if (closed || pending) return;
    pending = renew().catch(() => {
      console.warn("Capture admission lease renewal failed");
    }).finally(() => { pending = undefined; });
  }, Math.max(1, intervalMs));
  timer.unref();
  return {
    async release() {
      if (closed) return;
      closed = true;
      clearInterval(timer);
      await pending;
      await release();
    },
  };
}

const CLAIM = `
local clock = redis.call('TIME')
local now = tonumber(clock[1]) * 1000 + math.floor(tonumber(clock[2]) / 1000)
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now - tonumber(ARGV[2]))
redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', now)
if redis.call('ZSCORE', KEYS[2], ARGV[5]) then return {1, 0} end
if redis.call('ZCARD', KEYS[1]) >= tonumber(ARGV[1]) then
  local oldest = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
  return {0, math.max(1, math.ceil((tonumber(oldest[2]) + tonumber(ARGV[2]) - now) / 1000))}
end
redis.call('ZADD', KEYS[1], now, ARGV[5])
redis.call('PEXPIRE', KEYS[1], ARGV[2])
if redis.call('ZCARD', KEYS[2]) >= tonumber(ARGV[3]) then return {0, 1} end
redis.call('ZADD', KEYS[2], now + tonumber(ARGV[4]), ARGV[5])
redis.call('PEXPIRE', KEYS[2], ARGV[4])
return {1, 0}
`;

const RENEW = `
if not redis.call('ZSCORE', KEYS[1], ARGV[1]) then return 0 end
local clock = redis.call('TIME')
local now = tonumber(clock[1]) * 1000 + math.floor(tonumber(clock[2]) / 1000)
redis.call('ZADD', KEYS[1], now + tonumber(ARGV[2]), ARGV[1])
redis.call('PEXPIRE', KEYS[1], ARGV[2])
return 1
`;

const RECOVER = `
local clock = redis.call('TIME')
local now = tonumber(clock[1]) * 1000 + math.floor(tonumber(clock[2]) / 1000)
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now)
if not redis.call('ZSCORE', KEYS[1], ARGV[1]) and redis.call('ZCARD', KEYS[1]) >= tonumber(ARGV[3]) then return 0 end
redis.call('ZADD', KEYS[1], now + tonumber(ARGV[2]), ARGV[1])
redis.call('PEXPIRE', KEYS[1], ARGV[2])
return 1
`;

export class RedisCaptureAdmission implements CaptureAdmission {
  private readonly options: AdmissionOptions;

  constructor(private readonly redis: AdmissionRedis, input: Partial<AdmissionOptions> = {}) {
    this.options = limits(input);
  }

  async acquire(accountId: string, requestId: string): Promise<CaptureLease> {
    await this.acquireJob(accountId, requestId);
    const key = this.accountKey(accountId);
    return lease(
      () => this.releaseJob(accountId, requestId),
      async () => {
        if (Number(await this.redis.eval(RENEW, 1, `${key}:active`, requestId, this.options.leaseMs)) !== 1) {
          throw new Error("Capture admission lease expired");
        }
      },
      this.options.leaseMs / 3,
    );
  }

  private accountKey(accountId: string): string {
    const account = createHash("sha256").update(accountId).digest("hex");
    return `${this.options.prefix}:{${account}}`;
  }

  async acquireJob(accountId: string, requestId: string): Promise<void> {
    const key = this.accountKey(accountId);
    let result: unknown;
    try {
      result = await this.redis.eval(CLAIM, 2, `${key}:rate`, `${key}:active`,
        this.options.requests, this.options.windowMs, this.options.concurrency, this.options.leaseMs, requestId);
    } catch {
      throw new CaptureAdmissionError(requestId, false);
    }
    if (!Array.isArray(result) || result.length !== 2 || ![0, 1].includes(result[0]) ||
      !Number.isSafeInteger(result[1]) || result[1] < 0) {
      throw new CaptureAdmissionError(requestId, false);
    }
    if (Number(result[0]) !== 1) throw new CaptureAdmissionError(requestId, true, Math.max(1, Number(result[1])));
  }

  async releaseJob(accountId: string, requestId: string): Promise<void> {
    await this.redis.zrem(`${this.accountKey(accountId)}:active`, requestId);
  }

  async renewJob(accountId: string, requestId: string): Promise<void> {
    if (Number(await this.redis.eval(RENEW, 1, `${this.accountKey(accountId)}:active`, requestId, this.options.leaseMs)) !== 1) {
      throw new Error("Capture admission lease expired");
    }
  }

  async recoverJob(accountId: string, requestId: string): Promise<void> {
    let result: unknown;
    try {
      result = await this.redis.eval(RECOVER, 1, `${this.accountKey(accountId)}:active`, requestId, this.options.leaseMs, this.options.concurrency);
    } catch { throw new CaptureAdmissionError(requestId, false); }
    if (result === 0) throw new CaptureAdmissionError(requestId, true);
    if (result !== 1) throw new CaptureAdmissionError(requestId, false);
  }
}

export class MemoryCaptureAdmission implements CaptureAdmission {
  private readonly options: AdmissionOptions;
  private readonly accounts = new Map<string, { requests: number[]; active: Map<string, number> }>();

  constructor(input: Partial<AdmissionOptions> = {}, private readonly now = Date.now) {
    this.options = limits(input);
  }

  async acquire(accountId: string, requestId: string): Promise<CaptureLease> {
    const now = this.now();
    let state = this.accounts.get(accountId);
    if (!state) {
      if (this.accounts.size >= 2048) {
        for (const [id, candidate] of this.accounts) {
          if (candidate.requests.every((at) => at <= now - this.options.windowMs) &&
            [...candidate.active.values()].every((expiry) => expiry <= now)) this.accounts.delete(id);
        }
        if (this.accounts.size >= 2048) throw new CaptureAdmissionError(requestId, false);
      }
      state = { requests: [], active: new Map() };
      this.accounts.set(accountId, state);
    }
    state.requests = state.requests.filter((at) => at > now - this.options.windowMs);
    for (const [id, expiry] of state.active) if (expiry <= now) state.active.delete(id);
    if (state.requests.length >= this.options.requests) {
      throw new CaptureAdmissionError(requestId, true, Math.max(1, Math.ceil((state.requests[0] + this.options.windowMs - now) / 1000)));
    }
    state.requests.push(now);
    if (state.active.size >= this.options.concurrency) throw new CaptureAdmissionError(requestId, true);
    state.active.set(requestId, now + this.options.leaseMs);
    return lease(
      async () => { state.active.delete(requestId); },
      async () => { if (state.active.has(requestId)) state.active.set(requestId, this.now() + this.options.leaseMs); },
      this.options.leaseMs / 3,
    );
  }
}

export async function createCaptureAdmission(env: NodeJS.ProcessEnv = process.env): Promise<CaptureAdmission> {
  const url = env.REDIS_URL?.trim() || env.UPSTASH_REDIS_URL?.trim();
  if (!url) {
    if (env.NODE_ENV === "production") throw new Error("Redis is required for hosted capture admission");
    return new MemoryCaptureAdmission();
  }
  const redis = new Redis(url, {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 0,
    connectTimeout: 1000,
    commandTimeout: 1000,
    retryStrategy: (attempt) => Math.min(100 * attempt, 1000),
    connectionName: "snapforge:dashboard-admission",
  });
  redis.on("error", () => {});
  try {
    await redis.connect();
  } catch {
    redis.disconnect();
    throw new Error("Capture admission connection unavailable");
  }
  return new RedisCaptureAdmission(redis);
}

const globalRef = globalThis as unknown as { __snapforgeAdmission?: Promise<CaptureAdmission> };

export async function acquireCaptureAdmission(accountId: string, requestId: string): Promise<CaptureLease> {
  globalRef.__snapforgeAdmission ??= createCaptureAdmission().catch((error) => {
    globalRef.__snapforgeAdmission = undefined;
    throw error;
  });
  try {
    return await (await globalRef.__snapforgeAdmission).acquire(accountId, requestId);
  } catch (error) {
    if (error instanceof CaptureAdmissionError) throw error;
    throw new CaptureAdmissionError(requestId, false);
  }
}
