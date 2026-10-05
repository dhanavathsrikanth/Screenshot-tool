import test from "node:test";
import assert from "node:assert/strict";
import { captureOptionsSchema, type CaptureSuccessData } from "@snapforge/contracts";
import { InProcessCaptureCache, nullCaptureCache, type CaptureCachePort } from "./cache.js";

const options = (patch: Record<string, unknown> = {}) =>
  captureOptionsSchema.parse({ url: "https://example.com/a", cache_ttl: 60, ...patch });

const DATA: CaptureSuccessData = {
  url: "https://example.com/a",
  final_url: "https://example.com/a",
  format: "png",
  width: 1280,
  height: 720,
  duration_ms: 120,
  bytes: 3,
  blocked_requests: 0,
  cached: false,
};

const bytes = () => Buffer.from("png-bytes");

test("a miss returns null and no entry is created on read", async () => {
  const cache = new InProcessCaptureCache();
  assert.equal(await cache.lookup(options()), null);
  assert.equal(cache.size, 0);
});

test("a saved capture reads back marked cached with the same bytes", async () => {
  const cache = new InProcessCaptureCache();
  await cache.save(options(), DATA, bytes());

  const hit = await cache.lookup(options());
  assert.ok(hit);
  assert.equal(hit.data.cached, true);
  assert.equal(hit.data.duration_ms, 120, "a hit reports the original render time");
  assert.equal(hit.buffer.toString(), "png-bytes");
});

test("a zero ttl never caches", async () => {
  const cache = new InProcessCaptureCache();
  const opt = options({ cache_ttl: 0 });
  await cache.save(opt, DATA, bytes());
  assert.equal(cache.size, 0);
  assert.equal(await cache.lookup(opt), null);
});

test("changing a render option misses the cache", async () => {
  const cache = new InProcessCaptureCache();
  await cache.save(options(), DATA, bytes());
  assert.equal(await cache.lookup(options({ full_page: true })), null);
});

test("delivery-only option changes do not miss the cache", async () => {
  const cache = new InProcessCaptureCache();
  await cache.save(options(), DATA, bytes());
  assert.ok(await cache.lookup(options({ sync: false, store: false })));
});

test("option property order does not miss the cache", async () => {
  const cache = new InProcessCaptureCache();
  await cache.save(captureOptionsSchema.parse({ cache_ttl: 60, url: "https://example.com/a" }), DATA, bytes());
  assert.ok(await cache.lookup(options()));
});

test("header order does not miss the cache", async () => {
  const cache = new InProcessCaptureCache();
  await cache.save(options({ headers: { "X-One": "1", "X-Two": "2" } }), DATA, bytes());
  assert.ok(await cache.lookup(options({ headers: { "X-Two": "2", "X-One": "1" } })));
});

test("an expired entry is dropped", async () => {
  const now = { value: 1_000_000 };
  const cache = new InProcessCaptureCache(() => now.value);
  await cache.save(options(), DATA, bytes());
  now.value += 60_001;
  assert.equal(await cache.lookup(options()), null);
  assert.equal(cache.size, 0, "the expired entry is evicted, not just ignored");
});

test("the entry bound is enforced with LRU eviction", async () => {
  const cache = new InProcessCaptureCache(() => 0, 2);
  const a = options({ url: "https://example.com/a" });
  const b = options({ url: "https://example.com/b" });
  const c = options({ url: "https://example.com/c" });

  await cache.save(a, DATA, bytes());
  await cache.save(b, DATA, bytes());
  await cache.lookup(a);
  await cache.save(c, DATA, bytes());

  assert.equal(cache.size, 2);
  assert.ok(await cache.lookup(a), "the recently read entry survives");
  assert.equal(await cache.lookup(b), null);
  assert.ok(await cache.lookup(c));
});

test("a shorter requested TTL rejects a capture saved with a longer TTL", async () => {
  let now = 1000;
  const cache = new InProcessCaptureCache(() => now);
  await cache.save(options(), DATA, bytes());
  now += 2000;
  assert.equal(await cache.lookup(options({ cache_ttl: 1 })), null);
});

test("save returns the data unchanged so a hit is the only place cached flips", async () => {
  const cache = new InProcessCaptureCache();
  const saved = await cache.save(options(), DATA, bytes());
  assert.equal(saved.cached, false);
});

test("the null port is a no-op that always misses", async () => {
  assert.equal(await nullCaptureCache.lookup(options()), null);
  const out = await nullCaptureCache.save(options(), DATA, bytes());
  assert.equal(out, DATA);
});

test("the engine cache port is satisfied by the storage cache shape", async () => {
  // Guards the seam: a real store only has to implement these two methods.
  const calls: string[] = [];
  const port: CaptureCachePort = {
    async lookup() {
      calls.push("lookup");
      return null;
    },
    async save(_options, data) {
      calls.push("save");
      return data;
    },
  };
  assert.equal(await port.lookup(options()), null);
  assert.equal((await port.save(options(), DATA, bytes())).cached, false);
  assert.deepEqual(calls, ["lookup", "save"]);
});
