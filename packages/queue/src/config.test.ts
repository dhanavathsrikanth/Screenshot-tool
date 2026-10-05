import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_SYNC_TIMEOUT_MS, QUEUE_DEFAULTS, resolveQueueConfig } from "./config.js";

describe("resolveQueueConfig", () => {
  it("falls back to a local Redis when REDIS_URL is absent", () => {
    const previous = process.env.REDIS_URL;
    delete process.env.REDIS_URL;
    try {
      assert.equal(resolveQueueConfig().redisUrl, "redis://127.0.0.1:6379");
    } finally {
      if (previous !== undefined) {
        process.env.REDIS_URL = previous;
      }
    }
  });

  it("reads redisUrl from the environment", () => {
    const previous = process.env.REDIS_URL;
    process.env.REDIS_URL = "redis://queue.internal:6380/3";
    try {
      assert.equal(resolveQueueConfig().redisUrl, "redis://queue.internal:6380/3");
    } finally {
      if (previous === undefined) {
        delete process.env.REDIS_URL;
      } else {
        process.env.REDIS_URL = previous;
      }
    }
  });

  it("prefers explicit input over defaults", () => {
    const config = resolveQueueConfig({
      redisUrl: "redis://example:6379",
      queueName: "custom",
      concurrency: 12,
      attempts: 5,
    });

    assert.equal(config.queueName, "custom");
    assert.equal(config.concurrency, 12);
    assert.equal(config.attempts, 5);
    assert.equal(config.prefix, QUEUE_DEFAULTS.prefix);
  });

  it("defaults the sync fast-path budget to 2s", () => {
    const config = resolveQueueConfig({ redisUrl: "redis://example:6379" });
    assert.equal(config.syncTimeoutMs, DEFAULT_SYNC_TIMEOUT_MS);
  });

  it("clamps the sync budget to the advertised 2s ceiling", () => {
    const config = resolveQueueConfig({
      redisUrl: "redis://example:6379",
      syncTimeoutMs: 30_000,
    });
    assert.equal(config.syncTimeoutMs, DEFAULT_SYNC_TIMEOUT_MS);
  });

  it("honours a shorter sync budget", () => {
    const config = resolveQueueConfig({
      redisUrl: "redis://example:6379",
      syncTimeoutMs: 750,
    });
    assert.equal(config.syncTimeoutMs, 750);
  });

  it("rejects a non-positive sync budget", () => {
    assert.throws(
      () => resolveQueueConfig({ redisUrl: "redis://example:6379", syncTimeoutMs: 0 }),
      RangeError,
    );
  });

  it("rejects a blank redisUrl", () => {
    assert.throws(() => resolveQueueConfig({ redisUrl: "   " }), TypeError);
  });

  it("rejects a non-integer concurrency", () => {
    assert.throws(
      () => resolveQueueConfig({ redisUrl: "redis://example:6379", concurrency: 2.5 }),
      RangeError,
    );
    assert.throws(
      () => resolveQueueConfig({ redisUrl: "redis://example:6379", concurrency: 0 }),
      RangeError,
    );
  });

  it("rejects a zero attempt budget", () => {
    assert.throws(
      () => resolveQueueConfig({ redisUrl: "redis://example:6379", attempts: 0 }),
      RangeError,
    );
  });

  it("blocks private webhook hosts by default", () => {
    assert.equal(resolveQueueConfig({ redisUrl: "redis://example:6379" }).webhookAllowPrivateHosts, false);
  });

  it("allows opting into private webhook hosts", () => {
    const config = resolveQueueConfig({
      redisUrl: "redis://example:6379",
      webhookAllowPrivateHosts: true,
    });
    assert.equal(config.webhookAllowPrivateHosts, true);
  });
});
