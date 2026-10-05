import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { Redis } from "ioredis";
import { setTimeout as delay } from "node:timers/promises";
import { CaptureAdmissionError, MemoryCaptureAdmission, RedisCaptureAdmission, createCaptureAdmission } from "./capture-admission.js";

test("production requires shared admission; only development can use in-process limits", async () => {
  await assert.rejects(createCaptureAdmission({ NODE_ENV: "production" }), /Redis is required/);
  assert.ok(await createCaptureAdmission({ NODE_ENV: "development" }) instanceof MemoryCaptureAdmission);
});

test("account concurrency is isolated and release is idempotent", async () => {
  const admission = new MemoryCaptureAdmission({ concurrency: 1 });
  const first = await admission.acquire("a", "first");
  await assert.rejects(admission.acquire("a", "second"), (error: unknown) => error instanceof CaptureAdmissionError && error.httpStatus === 429);
  const other = await admission.acquire("b", "other");
  await first.release();
  await first.release();
  const next = await admission.acquire("a", "next");
  await next.release();
  await other.release();
});

test("rolling rate limits survive release, expire, and report retry delay", async () => {
  let now = 0;
  const admission = new MemoryCaptureAdmission({ requests: 2, windowMs: 2000 }, () => now);
  for (const id of ["first", "second"]) await (await admission.acquire("a", id)).release();
  await assert.rejects(admission.acquire("a", "third"), (error: unknown) => error instanceof CaptureAdmissionError && error.retryAfterSeconds === 2);
  now = 2000;
  await (await admission.acquire("a", "fourth")).release();
});

test("memory admission bounds account state and reclaims expired accounts", async () => {
  let now = 0;
  const admission = new MemoryCaptureAdmission({ windowMs: 1000 }, () => now);
  for (let index = 0; index < 2048; index++) await (await admission.acquire(`account-${index}`, String(index))).release();
  await assert.rejects(admission.acquire("new-account", "new"), (error: unknown) => error instanceof CaptureAdmissionError && error.httpStatus === 503);
  now = 1000;
  await (await admission.acquire("new-account", "retry")).release();
});

test("Redis admission fails closed on outage or malformed replies", async () => {
  const offline = new RedisCaptureAdmission({ eval: async () => { throw new Error("secret credentials"); }, zrem: async () => 0 });
  await assert.rejects(offline.acquire("a", "request"), (error: unknown) => error instanceof CaptureAdmissionError && error.httpStatus === 503 && !error.message.includes("secret"));
  for (const result of [null, [], [2, 0], [1, "bad"], [1, null], [null, 0], [1, -1]]) {
    const invalid = new RedisCaptureAdmission({ eval: async () => result, zrem: async () => 0 });
    await assert.rejects(invalid.acquire("a", "request"), (error: unknown) => error instanceof CaptureAdmissionError && error.httpStatus === 503);
  }
});

test("live Redis enforces atomic limits across instances, renews leases, and recovers orphan slots", {
  skip: !(process.env.TEST_REDIS_URL || process.env.REDIS_URL || process.env.UPSTASH_REDIS_URL || (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)),
  timeout: 60_000,
}, async () => {
  const tcpUrl = process.env.TEST_REDIS_URL || process.env.REDIS_URL || process.env.UPSTASH_REDIS_URL;
  const tcp = tcpUrl ? new Redis(tcpUrl, {
    lazyConnect: true, connectTimeout: 3000, commandTimeout: 3000, maxRetriesPerRequest: 0, retryStrategy: () => null,
  }) : null;
  tcp?.on("error", () => {});
  const command = async (...args: Array<string | number>): Promise<unknown> => {
    const response = await fetch(process.env.UPSTASH_REDIS_REST_URL!, {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify(args), signal: AbortSignal.timeout(3000), redirect: "error",
    });
    if (!response.ok) throw new Error("Test Redis command failed");
    const body = await response.json() as { result?: unknown; error?: string };
    if (body.error) throw new Error("Test Redis command rejected");
    return body.result;
  };
  const redis = tcp ?? {
    eval: (script: string, count: number, ...args: Array<string | number>) => command("EVAL", script, count, ...args),
    zrem: async (key: string, member: string) => Number(await command("ZREM", key, member)),
    zcard: async (key: string) => Number(await command("ZCARD", key)),
    zadd: (key: string, score: number, member: string) => command("ZADD", key, score, member),
    pexpire: (key: string, ttl: number) => command("PEXPIRE", key, ttl),
    time: async () => await command("TIME") as [string, string],
    del: (...keys: string[]) => command("DEL", ...keys),
  };
  const prefix = `snapforge:test:dashboard:${randomUUID()}`;
  const accounts = ["parallel", "other", "rate", "renew", "orphan", "latency"];
  const key = (account: string, type: string) => `${prefix}:{${createHash("sha256").update(account).digest("hex")}}:${type}`;
  const held: Array<{ release(): Promise<void> }> = [];
  try {
    try { if (tcp) await tcp.connect(); else await command("PING"); } catch { throw new Error("Configured Redis unavailable for admission integration test"); }
    const first = new RedisCaptureAdmission(redis, { prefix, concurrency: 2 });
    const second = new RedisCaptureAdmission(redis, { prefix, concurrency: 2 });
    const burst = await Promise.allSettled(Array.from({ length: 10 }, (_, index) => (index % 2 ? first : second).acquire("parallel", `burst-${index}`)));
    for (const result of burst) {
      if (result.status === "fulfilled") held.push(result.value);
      else assert.ok(result.reason instanceof CaptureAdmissionError && result.reason.httpStatus === 429);
    }
    assert.equal(held.length, 2);
    const other = await first.acquire("other", "other");
    held.push(other);
    await held[0].release();
    held.push(await second.acquire("parallel", "after-release"));

    const rate = new RedisCaptureAdmission(redis, { prefix, requests: 2 });
    await (await rate.acquire("rate", "one")).release();
    await (await rate.acquire("rate", "two")).release();
    await assert.rejects(rate.acquire("rate", "three"), (error: unknown) => error instanceof CaptureAdmissionError && error.httpStatus === 429 && error.retryAfterSeconds > 0);
    assert.equal(await redis.zcard(key("rate", "active")), 0);

    const renewing = new RedisCaptureAdmission(redis, { prefix, concurrency: 1, leaseMs: 3000 });
    const renewal = await renewing.acquire("renew", "held");
    held.push(renewal);
    await delay(4500);
    await assert.rejects(renewing.acquire("renew", "blocked"), (error: unknown) => error instanceof CaptureAdmissionError && error.httpStatus === 429);
    await renewal.release();
    await delay(1100);
    assert.equal(await redis.zcard(key("renew", "active")), 0);
    held.push(await renewing.acquire("renew", "recovered"));

    const clock = await redis.time();
    const now = Number(clock[0]) * 1000 + Math.floor(Number(clock[1]) / 1000);
    await redis.zadd(key("orphan", "active"), now - 1, "crashed-process");
    await redis.pexpire(key("orphan", "active"), 10_000);
    held.push(await new RedisCaptureAdmission(redis, { prefix, concurrency: 1 }).acquire("orphan", "replacement"));
    assert.equal(await redis.zcard(key("orphan", "active")), 1);

    const latencies: number[] = [];
    for (let index = 0; index < 30; index++) {
      const start = performance.now();
      const admitted = await first.acquire("latency", `measurement-${index}`);
      latencies.push(performance.now() - start);
      await admitted.release();
    }
    latencies.sort((a, b) => a - b);
    console.info(JSON.stringify({ admission_transport: tcp ? "tcp" : "rest-test-adapter", admission_samples: latencies.length, p50_ms: Number(latencies[14].toFixed(2)), p95_ms: Number(latencies[28].toFixed(2)) }));
  } finally {
    await Promise.allSettled(held.map((entry) => entry.release()));
    try {
      if (!tcp || tcp.status === "ready") await redis.del(...accounts.flatMap((account) => [key(account, "rate"), key(account, "active")]));
    } finally {
      tcp?.disconnect();
    }
  }
});
