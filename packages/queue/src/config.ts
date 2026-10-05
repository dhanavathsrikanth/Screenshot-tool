export interface QueueConfig {
  redisUrl: string;
  queueName: string;
  prefix: string;
  concurrency: number;
  lockDurationMs: number;
  lockRenewTimeMs: number;
  stalledIntervalMs: number;
  maxStalledCount: number;
  attempts: number;
  backoffDelayMs: number;
  syncTimeoutMs: number;
  resultTtlSeconds: number;
  failedTtlSeconds: number;
  webhookTimeoutMs: number;
  webhookAttempts: number;
  webhookBackoffMs: number;
  webhookAllowPrivateHosts: boolean;
}

export type QueueConfigInput = Partial<QueueConfig>;

export const DEFAULT_QUEUE_NAME = "snapforge:capture";
export const DEFAULT_QUEUE_PREFIX = "snapforge";
export const DEFAULT_SYNC_TIMEOUT_MS = 2_000;

const envNumber = (name: string): number | undefined => {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") {
    return undefined;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const envBoolean = (name: string): boolean | undefined => {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") {
    return undefined;
  }
  return ["1", "true", "yes", "on"].includes(raw.trim().toLowerCase());
};

export const QUEUE_DEFAULTS = {
  queueName: DEFAULT_QUEUE_NAME,
  prefix: DEFAULT_QUEUE_PREFIX,
  concurrency: 4,
  lockDurationMs: 120_000,
  lockRenewTimeMs: 30_000,
  stalledIntervalMs: 30_000,
  maxStalledCount: 1,
  attempts: 3,
  backoffDelayMs: 2_000,
  syncTimeoutMs: DEFAULT_SYNC_TIMEOUT_MS,
  resultTtlSeconds: 86_400,
  failedTtlSeconds: 86_400,
  webhookTimeoutMs: 5_000,
  webhookAttempts: 4,
  webhookBackoffMs: 1_000,
  webhookAllowPrivateHosts: false,
} as const satisfies Omit<QueueConfig, "redisUrl">;

/**
 * The sync fast-path budget is capped at 2s because that is the latency ceiling
 * advertised for synchronous captures; anything slower degrades to async so the
 * gateway never holds an HTTP connection open past its own SLO.
 */
const resolveSyncTimeoutMs = (input: QueueConfigInput): number => {
  const requested = input.syncTimeoutMs ?? envNumber("SNAPFORGE_SYNC_TIMEOUT_MS");
  if (requested === undefined) {
    return QUEUE_DEFAULTS.syncTimeoutMs;
  }
  if (requested <= 0) {
    throw new RangeError(`syncTimeoutMs must be positive, received ${requested}`);
  }
  return Math.min(requested, DEFAULT_SYNC_TIMEOUT_MS);
};

export function resolveQueueConfig(input: QueueConfigInput = {}): QueueConfig {
  const envRedisUrl = process.env.REDIS_URL?.trim() || process.env.UPSTASH_REDIS_URL?.trim();
  const redisUrl = input.redisUrl ?? envRedisUrl ?? "redis://127.0.0.1:6379";

  if (typeof redisUrl !== "string" || redisUrl.trim() === "") {
    throw new TypeError("redisUrl must be a non-empty connection string");
  }

  const concurrency = input.concurrency ?? envNumber("SNAPFORGE_QUEUE_CONCURRENCY") ?? QUEUE_DEFAULTS.concurrency;
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new RangeError(`concurrency must be an integer >= 1, received ${concurrency}`);
  }

  const attempts = input.attempts ?? envNumber("SNAPFORGE_QUEUE_ATTEMPTS") ?? QUEUE_DEFAULTS.attempts;
  if (!Number.isInteger(attempts) || attempts < 1) {
    throw new RangeError(`attempts must be an integer >= 1, received ${attempts}`);
  }

  return {
    redisUrl,
    queueName: input.queueName ?? QUEUE_DEFAULTS.queueName,
    prefix: input.prefix ?? QUEUE_DEFAULTS.prefix,
    concurrency,
    lockDurationMs: input.lockDurationMs ?? QUEUE_DEFAULTS.lockDurationMs,
    lockRenewTimeMs: input.lockRenewTimeMs ?? QUEUE_DEFAULTS.lockRenewTimeMs,
    stalledIntervalMs: input.stalledIntervalMs ?? QUEUE_DEFAULTS.stalledIntervalMs,
    maxStalledCount: input.maxStalledCount ?? QUEUE_DEFAULTS.maxStalledCount,
    attempts,
    backoffDelayMs: input.backoffDelayMs ?? QUEUE_DEFAULTS.backoffDelayMs,
    syncTimeoutMs: resolveSyncTimeoutMs(input),
    resultTtlSeconds: input.resultTtlSeconds ?? QUEUE_DEFAULTS.resultTtlSeconds,
    failedTtlSeconds: input.failedTtlSeconds ?? QUEUE_DEFAULTS.failedTtlSeconds,
    webhookTimeoutMs: input.webhookTimeoutMs ?? QUEUE_DEFAULTS.webhookTimeoutMs,
    webhookAttempts: input.webhookAttempts ?? QUEUE_DEFAULTS.webhookAttempts,
    webhookBackoffMs: input.webhookBackoffMs ?? QUEUE_DEFAULTS.webhookBackoffMs,
    webhookAllowPrivateHosts:
      input.webhookAllowPrivateHosts ??
      envBoolean("SNAPFORGE_WEBHOOK_ALLOW_PRIVATE_HOSTS") ??
      QUEUE_DEFAULTS.webhookAllowPrivateHosts,
  };
}
