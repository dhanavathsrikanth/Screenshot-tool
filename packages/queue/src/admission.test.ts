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
