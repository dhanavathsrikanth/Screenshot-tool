import type { Redis } from "ioredis";
import type { QueueConfig } from "./config.js";

export const WORKER_HEARTBEAT_MS = 5_000;
export const WORKER_STALE_MS = 20_000;

export function workerHealthKey(config: Pick<QueueConfig, "prefix" | "queueName">): string {
  return `${config.prefix}:${config.queueName}:ready-workers`;
}

export async function readyWorkerCount(
  redis: Pick<Redis, "zcount">,
  config: Pick<QueueConfig, "prefix" | "queueName">,
  now = Date.now(),
): Promise<number> {
  return redis.zcount(workerHealthKey(config), now - WORKER_STALE_MS, "+inf");
}

export class WorkerHeartbeat {
  private timer?: ReturnType<typeof setInterval>;
  private pending?: Promise<void>;
  private closed = false;

  constructor(
    private readonly redis: Pick<Redis, "zadd" | "zrem" | "zremrangebyscore" | "expire">,
    private readonly config: Pick<QueueConfig, "prefix" | "queueName">,
    private readonly workerId: string,
    private readonly healthy: () => Promise<boolean>,
    private readonly now: () => number = Date.now,
  ) {}

  async refresh(): Promise<void> {
    if (this.closed) return;
    if (this.pending) return this.pending;
    const operation = (async () => {
      const key = workerHealthKey(this.config);
      if (!await this.healthy() || this.closed) {
        await this.redis.zrem(key, this.workerId);
        return;
      }
      const now = this.now();
      await this.redis.zremrangebyscore(key, "-inf", now - WORKER_STALE_MS);
      await this.redis.zadd(key, now, this.workerId);
      await this.redis.expire(key, 60);
    })();
    this.pending = operation;
    try {
      await operation;
    } finally {
      if (this.pending === operation) this.pending = undefined;
    }
  }

  async start(): Promise<void> {
    if (this.closed) throw new Error("Worker heartbeat is closed");
    if (this.timer) return;
    await this.refresh();
    if (this.closed) return;
    this.timer = setInterval(() => { void this.refresh().catch(() => {}); }, WORKER_HEARTBEAT_MS);
    this.timer.unref();
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    if (this.timer) clearInterval(this.timer);
    await this.pending?.catch(() => {});
    await this.redis.zrem(workerHealthKey(this.config), this.workerId);
  }
}
