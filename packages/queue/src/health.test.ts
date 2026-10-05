import test from "node:test";
import assert from "node:assert/strict";
import type { Redis } from "ioredis";
import { readyWorkerCount, WorkerHeartbeat, WORKER_STALE_MS } from "./health.js";

test("readiness counts only live heartbeats and excludes stopped or unhealthy workers", async () => {
  const scores = new Map<string, number>();
  let now = 100_000;
  let healthy = true;
  const redis = {
    zadd: async (_key: string, score: number, member: string) => { scores.set(member, score); return 1; },
    zrem: async (_key: string, member: string) => Number(scores.delete(member)),
    zremrangebyscore: async () => 0,
    expire: async () => 1,
    zcount: async (_key: string, min: number) => [...scores.values()].filter((score) => score >= min).length,
  } as unknown as Redis;
  const config = { prefix: "fixture", queueName: "captures" };
  const heartbeat = new WorkerHeartbeat(redis, config, "worker-1", async () => healthy, () => now);
  assert.equal(await readyWorkerCount(redis, config, now), 0);
  await heartbeat.refresh();
  assert.equal(await readyWorkerCount(redis, config, now), 1);
  now += WORKER_STALE_MS + 1;
  assert.equal(await readyWorkerCount(redis, config, now), 0);
  await heartbeat.refresh();
  assert.equal(await readyWorkerCount(redis, config, now), 1);
  healthy = false;
  await heartbeat.refresh();
  assert.equal(await readyWorkerCount(redis, config, now), 0);
  healthy = true;
  await heartbeat.refresh();
  await heartbeat.close();
  await heartbeat.refresh();
  assert.equal(await readyWorkerCount(redis, config, now), 0);
});

test("shutdown during a heartbeat cannot recreate a ready worker", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let writes = 0;
  const redis = { zadd: async () => { writes++; return 1; }, zrem: async () => 1, expire: async () => 1, zremrangebyscore: async () => 0 } as unknown as Redis;
  const heartbeat = new WorkerHeartbeat(redis, { prefix: "fixture", queueName: "captures" }, "worker", async () => { await gate; return true; });
  const refreshing = heartbeat.refresh();
  const closing = heartbeat.close();
  release();
  await Promise.all([refreshing, closing]);
  assert.equal(writes, 0);
});
