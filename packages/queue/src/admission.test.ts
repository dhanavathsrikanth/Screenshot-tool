import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { CaptureAdmissionError, RedisCaptureAdmission } from "./admission.js";

test("recovery admission fails closed on exhausted capacity, malformed replies, and outages", async () => {
  for (const reply of [0, null, "1", new Error("Redis outage")]) {
    const admission = new RedisCaptureAdmission({ eval: async () => { if (reply instanceof Error) throw reply; return reply; }, zrem: async () => 0 });
    await assert.rejects(admission.recoverJob("account", "job"), (error: unknown) =>
      error instanceof CaptureAdmissionError && error.httpStatus === (reply === 0 ? 429 : 503));
  }
});

test("acquireJob with httpRate issues a single Redis round-trip combining rate and admission", async () => {
  const calls: Array<{ keys: number; args: unknown[] }> = [];
  const redis = {
    eval: async (_script: string, keyCount: number, ...args: Array<string | number>) => {
      calls.push({ keys: keyCount, args });
      return [1, 0];
    },
    zrem: async () => 0,
  };
  const admission = new RedisCaptureAdmission(redis);
  await admission.acquireJob("account", "job-1", { httpKey: "key-abc", windowMs: 60_000, max: 100 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].keys, 2);
  assert.ok(String(calls[0].args[0]).includes("http-rate:{key-abc}"), "rate key is the http-rate shard for this apiKey");
  assert.ok(String(calls[0].args[1]).includes("capture-admission"), "active key is the per-account admission shard");
  assert.equal(calls[0].args[3], 60_000, "windowMs");
  assert.equal(calls[0].args[4], 100, "max");
  assert.ok(String(calls[0].args[5]).startsWith(String(Date.now()).slice(0, 4)), "rate member is the now-ms prefix");
  assert.equal(calls[0].args[8], "job-1", "requestId is the lease key");
});

test("acquireJob with httpRate returns 429 on rate-limited", async () => {
  const redis = {
    eval: async () => [0, 17],
    zrem: async () => 0,
  };
  const admission = new RedisCaptureAdmission(redis);
  await assert.rejects(
    admission.acquireJob("account", "job", { httpKey: "key", windowMs: 60_000, max: 100 }),
    (error: unknown) => error instanceof CaptureAdmissionError && error.httpStatus === 429 && error.retryAfterSeconds === 17,
  );
});

test("acquireJob with httpRate returns 429 on admission-full", async () => {
  const redis = {
    eval: async () => [2, 1],
    zrem: async () => 0,
  };
  const admission = new RedisCaptureAdmission(redis);
  await assert.rejects(
    admission.acquireJob("account", "job", { httpKey: "key", windowMs: 60_000, max: 100 }),
    (error: unknown) => error instanceof CaptureAdmissionError && error.httpStatus === 429 && error.retryAfterSeconds === 1,
  );
});

test("acquireJob without httpRate still uses the original CLAIM Lua", async () => {
  const calls: Array<{ keys: number; args: unknown[] }> = [];
  const redis = {
    eval: async (_script: string, keyCount: number, ...args: Array<string | number>) => {
      calls.push({ keys: keyCount, args });
      return [1, 0];
    },
    zrem: async () => 0,
  };
  const admission = new RedisCaptureAdmission(redis, { requests: 50, concurrency: 4, leaseMs: 30_000 });
  await admission.acquireJob("account", "job");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].keys, 2);
  assert.ok(String(calls[0].args[0]).includes("capture-admission"), "rate key is the per-account rate shard");
  assert.equal(calls[0].args[2], 50, "per-account requests");
  assert.equal(calls[0].args[4], 4, "concurrency");
  assert.equal(calls[0].args[5], 30_000, "leaseMs");
});

test("live Redis recovery restores expired leases without bypassing concurrency or repeating request rate charges", {
  skip: process.env.SNAPFORGE_ADMISSION_REST_TEST !== "1" || !process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN,
}, async () => {
  const prefix = `snapforge:test:enqueue:${randomUUID()}`;
  const command = async (...args: Array<string | number>): Promise<unknown> => {
    const response = await fetch(process.env.UPSTASH_REDIS_REST_URL!, { method: "POST",
      headers: { authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN!}`, "content-type": "application/json" },
      body: JSON.stringify(args), signal: AbortSignal.timeout(10000) });
    const body = await response.json() as { result?: unknown; error?: string };
    if (!response.ok || body.error) throw new Error("Redis admission test command failed");
    return body.result;
  };
  const redis = { eval: (script: string, count: number, ...args: Array<string | number>) => command("EVAL", script, count, ...args),
    zrem: async (key: string, member: string) => Number(await command("ZREM", key, member)) };
  const admission = new RedisCaptureAdmission(redis, { prefix, requests: 1, concurrency: 1, leaseMs: 60000 });
  const key = (account: string) => `${prefix}:{${createHash("sha256").update(account).digest("hex")}}`;
  try {
    await admission.acquireJob("account", "original");
    await admission.acquireJob("account", "original");
    await admission.acquireJob("account", "original");
    await admission.recoverJob("account", "original");
    await admission.recoverJob("account", "original");
    assert.equal(await command("ZCARD", `${key("account")}:rate`), 1);
    assert.equal(await command("ZCARD", `${key("account")}:active`), 1);
    await assert.rejects(admission.recoverJob("account", "second"), CaptureAdmissionError);
    await command("ZADD", `${key("account")}:active`, 0, "original");
    await admission.recoverJob("account", "second");
    await assert.rejects(admission.recoverJob("account", "original"), CaptureAdmissionError);
    await admission.recoverJob("other", "isolated");
    assert.equal(await command("ZCARD", `${key("account")}:active`), 1);
    assert.equal(await command("ZCARD", `${key("account")}:rate`), 1);
    await admission.releaseJob("account", "second");
    await admission.recoverJob("account", "original");
  } finally {
    for (const account of ["account", "other"]) await command("DEL", `${key(account)}:active`, `${key(account)}:rate`);
  }
});
