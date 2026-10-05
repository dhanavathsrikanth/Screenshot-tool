import test from "node:test";
import assert from "node:assert/strict";
import { captureOptionsSchema, type CaptureSuccessData } from "@snapforge/contracts";
import { createEngine } from "@snapforge/engine";
import { CaptureCache, CaptureStore, MemoryCacheBackend, type StorageClient } from "@snapforge/storage";
import { createWorkerCache } from "../src/cache.js";

const options = captureOptionsSchema.parse({ url: "https://example.com", cache_ttl: 60 });
const data: CaptureSuccessData = {
  url: options.url,
  final_url: options.url,
  format: "png",
  width: 1280,
  height: 720,
  duration_ms: 100,
  bytes: 3,
  blocked_requests: 0,
  cached: false,
};

test("worker cache reuses stored bytes, honors zero and shortened TTLs, and requires revalidation", async () => {
  let now = 1000;
  const objects = new Map<string, Buffer>();
  const advertisedTtls: Array<number | undefined> = [];
  const storage: StorageClient = {
    bucket: "fixture",
    async put(key, buffer, contentType, ttl) {
      advertisedTtls.push(ttl);
      objects.set(key, buffer);
      return { objectKey: key, bytes: buffer.length, contentType };
    },
    async get(key) { return objects.get(key) ?? null; },
    async head() { return null; },
    async exists(key) { return objects.has(key); },
    async delete(key) { objects.delete(key); },
    async urlFor(key) { return `https://cdn.example.com/${key}`; },
  };
  const store = new CaptureStore({
    cache: new CaptureCache(new MemoryCacheBackend(), () => now),
    storage,
    now: () => now,
  });
  const port = createWorkerCache(store);
  await store.save(options, data, Buffer.from("png"));
  const hit = await port.lookup(options);
  assert.equal(hit?.data.cached, true);
  assert.equal(hit?.buffer.toString(), "png");
  const engine = createEngine({ executablePath: "__cache_hit_must_not_launch_a_browser__" }, port);
  try {
    const capture = await engine.capture(options);
    assert.equal(capture.data.cached, true);
    assert.equal(capture.buffer.toString(), "png");
    assert.equal((await engine.health()).browser, null);
  } finally {
    await engine.close();
  }
  assert.deepEqual(advertisedTtls, [0]);
  assert.equal(await port.lookup({ ...options, cache_ttl: 0 }), null);
  now += 2000;
  assert.equal(await port.lookup({ ...options, cache_ttl: 1 }), null);
});

test("worker cache falls back to rendering when lookup is unavailable", async () => {
  const port = createWorkerCache({ lookup: async () => { throw new Error("Storage unavailable"); } });
  assert.equal(await port.lookup(options), null);
  assert.equal(await port.save(options, data, Buffer.from("png")), data);
});
