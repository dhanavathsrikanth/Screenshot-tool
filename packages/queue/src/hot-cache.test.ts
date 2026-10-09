import test from "node:test";
import assert from "node:assert/strict";
import { captureOptionsSchema } from "@snapforge/contracts";
import { HotCache } from "./hot-cache.js";

const withTtl = (ttl: number) => captureOptionsSchema.parse({ url: "https://example.com/a", cache_ttl: ttl });

const DATA = {
  url: "https://example.com/a",
  final_url: "https://example.com/a",
  format: "png",
  width: 1280,
  height: 720,
  duration_ms: 100,
  bytes: 2048,
  blocked_requests: 0,
  cached: false,
  cdn_url: "https://cdn.example.com/capture.png",
} as const;

test("set + get returns the data and counts a hit", () => {
  const cache = new HotCache();
  cache.set(withTtl(60), DATA);
  const hit = cache.get(withTtl(60));
  assert.ok(hit);
  assert.equal(hit.cdn_url, DATA.cdn_url);
  assert.equal(cache.stats.hits, 1);
  assert.equal(cache.stats.misses, 0);
});

test("a zero ttl never reads or writes", () => {
  const cache = new HotCache();
  cache.set(withTtl(0), DATA);
  assert.equal(cache.get(withTtl(0)), undefined);
  assert.equal(cache.size, 0);
});

test("two requests that differ only in cache_ttl share a key", () => {
  const cache = new HotCache();
  cache.set(withTtl(60), DATA);
  assert.ok(cache.get(withTtl(120)), "rendering-only key is the same");
  assert.equal(cache.stats.hits, 1);
});

test("expired entry is reported as a miss", () => {
  const now = { value: 1_000 };
  const cache = new HotCache({ now: () => now.value });
  cache.set(withTtl(60), DATA);
  now.value += 60_001;
  assert.equal(cache.get(withTtl(60)), undefined);
  assert.equal(cache.stats.misses, 1);
  assert.equal(cache.stats.expirations, 1);
});

test("defaultTtlMs caps the request TTL", () => {
  const now = { value: 1_000 };
  const tcache = new HotCache({ defaultTtlMs: 5_000, now: () => now.value });
  tcache.set(withTtl(60), DATA);
  now.value += 5_001;
  assert.equal(tcache.get(withTtl(60)), undefined, "TTL should be capped at 5s");
  const uncapped = new HotCache();
  uncapped.set(withTtl(60), DATA);
  assert.ok(uncapped.get(withTtl(60)), "uncapped cache should still have it");
});

test("clear empties the cache", () => {
  const cache = new HotCache();
  cache.set(withTtl(60), DATA);
  cache.clear();
  assert.equal(cache.size, 0);
  assert.equal(cache.get(withTtl(60)), undefined);
});