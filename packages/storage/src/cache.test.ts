import test from "node:test";
import assert from "node:assert/strict";
import { captureOptionsSchema } from "@snapforge/contracts";
import { CaptureCache, MemoryCacheBackend } from "./cache.js";

const withTtl = (ttl: number) => captureOptionsSchema.parse({ url: "https://example.com/a", cache_ttl: ttl });

const DATA = {
  url: "https://example.com/a",
  final_url: "https://example.com/a",
  format: "png",
  width: 1280,
  height: 720,
  duration_ms: 120,
  bytes: 2048,
  blocked_requests: 0,
  cached: false,
};

function harness(now = { value: 1_000_000 }) {
  const cache = new CaptureCache(new MemoryCacheBackend({ maxEntries: 8 }), () => now.value);
  return { cache, now };
}

test("a zero ttl never reads or writes", async () => {
  const { cache } = harness();
  assert.equal(await cache.put(withTtl(0), DATA), null);
  assert.equal(await cache.get(withTtl(0)), null);
  assert.equal(cache.stats.writes, 0);
});

test("a negative ttl is clamped rather than trusted", async () => {
  assert.equal(CaptureCache.resolveTtl({ cache_ttl: -50 } as never), 0);
  assert.equal(CaptureCache.resolveTtl({ cache_ttl: 90.9 } as never), 90);
});

test("a written entry reads back as a hit", async () => {
  const { cache } = harness();
  await cache.put(withTtl(60), DATA);
  const hit = await cache.get(withTtl(60));
  assert.ok(hit);
  assert.equal(hit.data.bytes, 2048);
  assert.equal(hit.expiresAt - hit.storedAt, 60_000);
  assert.equal(cache.stats.hits, 1);
  assert.equal(cache.stats.misses, 0);
});

test("an expired entry is dropped and counted as a miss", async () => {
  const { cache, now } = harness();
  await cache.put(withTtl(60), DATA);
  now.value += 60_001;
  assert.equal(await cache.get(withTtl(60)), null);
  assert.equal(cache.stats.misses, 1);
  assert.equal(cache.stats.evictions, 1);
  assert.deepEqual(await new MemoryCacheBackend().keys(), []);
});

test("an entry is still live one millisecond before expiry", async () => {
  const { cache, now } = harness();
  await cache.put(withTtl(60), DATA);
  now.value += 59_999;
  assert.ok(await cache.get(withTtl(60)));
});

test("a stored buffer is returned so small payloads avoid a second fetch", async () => {
  const { cache } = harness();
  const buffer = Buffer.from("png-bytes");
  await cache.put(withTtl(60), DATA, buffer);
  const hit = await cache.get(withTtl(60));
  assert.equal(hit?.buffer?.toString(), "png-bytes");
});

test("changing options misses the entry", async () => {
  const { cache } = harness();
  await cache.put(withTtl(60), DATA);
  assert.equal(await cache.get(captureOptionsSchema.parse({ url: "https://example.com/b", cache_ttl: 60 })), null);
});

test("the bounded backend evicts the least recently used key", async () => {
  const backend = new MemoryCacheBackend({ maxEntries: 2 });
  await backend.set("a", { data: DATA, storedAt: 0, expiresAt: 9, hits: 0 });
  await backend.set("b", { data: DATA, storedAt: 0, expiresAt: 9, hits: 0 });
  await backend.get("a");
  await backend.set("c", { data: DATA, storedAt: 0, expiresAt: 9, hits: 0 });
  const keys = await backend.keys();
  assert.equal(keys.length, 2);
  assert.ok(keys.includes("a"), "the recently used key survives");
  assert.ok(!keys.includes("b"), "the stale key is dropped");
});

test("the backend bound holds past its ceiling", async () => {
  const backend = new MemoryCacheBackend({ maxEntries: 3 });
  for (let i = 0; i < 25; i += 1) {
    await backend.set(`k${i}`, { data: DATA, storedAt: 0, expiresAt: 9, hits: 0 });
  }
  assert.equal((await backend.keys()).length, 3);
});

test("asHit marks the response cached while preserving the render duration", async () => {
  const { cache } = harness();
  await cache.put(withTtl(60), DATA);
  const hit = CaptureCache.asHit((await cache.get(withTtl(60)))!);
  assert.equal(hit.cached, true);
  assert.equal(hit.duration_ms, 120);
});

test("locationFor is derived, not stored, and stays consistent", async () => {
  const options = withTtl(60);
  const first = CaptureCache.locationFor(options);
  const second = CaptureCache.locationFor(options);
  assert.deepEqual(first, second);
  assert.equal(first.key, first.digest);
  assert.ok(first.objectKey.endsWith(".png"));
  assert.equal(first.targetUrl, "https://example.com/a");
});

test("clear empties the cache", async () => {
  const { cache } = harness();
  await cache.put(withTtl(60), DATA);
  await cache.put(withTtl(60), { ...DATA, format: "webp" });
  await cache.clear();
  assert.equal(await cache.get(withTtl(60)), null);
});

test("hit rate is zero before any lookups", () => {
  const { cache } = harness();
  assert.equal(cache.stats.hitRate, 0);
});

test("a caller can shorten the lifetime of an existing cached capture", async () => {
  let now = 1000;
  const cache = new CaptureCache(new MemoryCacheBackend(), () => now);
  await cache.put(withTtl(60), DATA);
  now += 2000;
  assert.equal(await cache.get(withTtl(1)), null);
});
