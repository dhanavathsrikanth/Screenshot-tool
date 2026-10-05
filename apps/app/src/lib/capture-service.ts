import { Redis } from "ioredis";
import { captureSubmissionCodecFromEnv, CaptureDispatcher, CaptureQueue, CaptureService, RedisCaptureAdmission, createQueue, readyWorkerCount, resolveQueueConfig } from "@snapforge/queue";
import { captureLifecycle, captureSubmissions, linkReservationToJob, recordCapture, reservationForJob, reserveCapture, settleCapture } from "@snapforge/database";

export function localCaptureEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV !== "production" && env.SNAPFORGE_LOCAL_CAPTURE === "1";
}

async function createRuntime() {
  const submissionCodec = captureSubmissionCodecFromEnv();
  if (!(process.env.REDIS_URL?.trim() || process.env.UPSTASH_REDIS_URL?.trim())) throw new Error("Capture queue requires Redis TCP configuration");
  const config = resolveQueueConfig();
  const redis = new Redis(config.redisUrl, {
    lazyConnect: true, maxRetriesPerRequest: null, enableOfflineQueue: false,
    connectTimeout: 1000, commandTimeout: 1000, retryStrategy: (attempt) => Math.min(attempt * 100, 1000),
    connectionName: "snapforge:dashboard-queue",
  });
  redis.on("error", () => {});
  try { await redis.connect(); } catch { redis.disconnect(); throw new Error("Capture queue connection unavailable"); }
  const host = createQueue(config, redis);
  const queue = new CaptureQueue(host, config);
  const service = new CaptureService({
    queue, dispatcher: new CaptureDispatcher(queue, config),
    admission: new RedisCaptureAdmission(redis, { leaseMs: 7_200_000 }),
    billing: { reserveCapture, settleCapture, linkReservationToJob, reservationForJob, recordCapture, lifecycle: captureLifecycle, submissions: captureSubmissions },
    submissionCodec,
    logger: (message, fields) => { console.warn(message, fields); },
  });
  return {
    service,
    async health() {
      const [depth, workers] = await Promise.all([queue.depth(), readyWorkerCount(redis, config)]);
      return { ok: workers > 0 && !depth.paused, in_flight: depth.active, concurrency: workers * config.concurrency,
        concurrency_target: workers * config.concurrency, browser: null, pool: null, cache: null, ready_workers: workers };
    },
  };
}

const globalRef = globalThis as typeof globalThis & { __snapforgeCaptureRuntime?: ReturnType<typeof createRuntime> };

export function getCaptureRuntime() {
  globalRef.__snapforgeCaptureRuntime ??= createRuntime().catch((error) => {
    globalRef.__snapforgeCaptureRuntime = undefined;
    throw error;
  });
  return globalRef.__snapforgeCaptureRuntime;
}
