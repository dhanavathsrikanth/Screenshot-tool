import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import type { ConnectionOptions, Processor, WorkerOptions } from "bullmq";
import type { QueueConfig } from "./config.js";
import type { CaptureQueueHost } from "./queue.js";
import type { CaptureJobName, CaptureJobPayload, CaptureJobResult } from "./types.js";

/**
 * BullMQ needs `maxRetriesPerRequest: null` on any connection it uses for
 * blocking reads, otherwise a transient Redis blip surfaces as a job failure
 * instead of a reconnect. Setting it explicitly here keeps that invariant
 * visible rather than depending on BullMQ's internal defaults.
 */
export function createRedisClient(url: string, name: string): Redis {
  return new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    connectionName: name,
  });
}

export interface QueueConnection {
  /** Used for producer commands and health probes. */
  producer: Redis;
  /** Reserved for the worker's blocking `BRPOPLPUSH` loop. */
  worker: Redis;
  close(): Promise<void>;
}

export function createQueueConnection(config: QueueConfig): QueueConnection {
  const producer = new Redis(config.redisUrl, {
    maxRetriesPerRequest: 1, enableReadyCheck: true, enableOfflineQueue: false,
    connectTimeout: 1000, commandTimeout: 2000, connectionName: `${config.prefix}:queue`,
  });
  const worker = createRedisClient(config.redisUrl, `${config.prefix}:worker`);

  return {
    producer,
    worker,
    async close() {
      await Promise.allSettled([producer.quit(), worker.quit()]);
    },
  };
}

export function toBullConnection(client: Redis): ConnectionOptions {
  return client;
}

export function createQueue(
  config: QueueConfig,
  client: Redis,
): Queue<CaptureJobPayload, CaptureJobResult, CaptureJobName> {
  return new Queue<CaptureJobPayload, CaptureJobResult, CaptureJobName>(config.queueName, {
    connection: toBullConnection(client),
    prefix: config.prefix,
  });
}

export function createQueueHost(config: QueueConfig, client: Redis): CaptureQueueHost {
  return createQueue(config, client);
}

export function workerOptions(config: QueueConfig, client: Redis, workerId: string): WorkerOptions {
  return {
    connection: toBullConnection(client),
    prefix: config.prefix,
    concurrency: config.concurrency,
    lockDuration: config.lockDurationMs,
    lockRenewTime: config.lockRenewTimeMs,
    stalledInterval: config.stalledIntervalMs,
    maxStalledCount: config.maxStalledCount,
    name: workerId,
    // The fleet wires health checks and dependencies before it starts draining
    // Redis; autorun would let the first job arrive before that wiring is done.
    autorun: false,
  };
}

/**
 * BullMQ requires the processor at construction time, so `CaptureWorker` binds
 * `process` and hands it here. This factory only translates config into
 * `WorkerOptions`.
 */
export function createWorker(
  config: QueueConfig,
  client: Redis,
  workerId: string,
  processor: Processor<CaptureJobPayload, CaptureJobResult, CaptureJobName>,
): Worker<CaptureJobPayload, CaptureJobResult, CaptureJobName> {
  return new Worker<CaptureJobPayload, CaptureJobResult, CaptureJobName>(
    config.queueName,
    processor,
    workerOptions(config, client, workerId),
  );
}
