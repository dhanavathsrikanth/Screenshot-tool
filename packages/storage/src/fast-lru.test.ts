import test from "node:test";
import assert from "node:assert/strict";
import { FastLRU } from "./fast-lru.js";

test("set + get returns the value and records a hit", () => {
  const lru = new FastLRU<number>();
  lru.set("k", 1, 60_000);
  assert.equal(lru.get("k"), 1);
  assert.equal(lru.stats.hits, 1);
  assert.equal(lru.stats.misses, 0);
});

test("miss records and returns undefined", () => {
  const lru = new FastLRU<number>();
  assert.equal(lru.get("nope"), undefined);
  assert.equal(lru.stats.misses, 1);
});

test("expired entries are not returned and are evicted", () => {
  const now = { value: 1_000 };
  const lru = new FastLRU<number>({ now: () => now.value });
  lru.set("k", 42, 60_000);
  now.value += 60_001;
  assert.equal(lru.get("k"), undefined);
  assert.equal(lru.stats.misses, 1);
  assert.equal(lru.stats.expirations, 1);
  assert.equal(lru.size, 0);
});

test("zero or negative ttl removes the entry instead of writing it", () => {
  const lru = new FastLRU<number>();
  lru.set("k", 1, 0);
  assert.equal(lru.get("k"), undefined);
  assert.equal(lru.size, 0);
  lru.set("k", 1, -5);
  assert.equal(lru.get("k"), undefined);
});

test("read order promotes the accessed entry (LRU semantics)", () => {
  const lru = new FastLRU<number>({ maxEntries: 2 });
  lru.set("a", 1, 60_000);
  lru.set("b", 2, 60_000);
  assert.equal(lru.get("a"), 1);
  lru.set("c", 3, 60_000);
  assert.equal(lru.get("b"), undefined, "b should have been evicted as the least-recently used");
  assert.equal(lru.get("a"), 1);
  assert.equal(lru.get("c"), 3);
  assert.equal(lru.stats.evictions, 1);
});

test("overwriting an existing key does not count as eviction", () => {
  const lru = new FastLRU<number>({ maxEntries: 2 });
  lru.set("a", 1, 60_000);
  lru.set("a", 2, 60_000);
  assert.equal(lru.get("a"), 2);
  assert.equal(lru.stats.evictions, 0);
  assert.equal(lru.size, 1);
});

test("delete removes the entry without touching stats", () => {
  const lru = new FastLRU<number>();
  lru.set("k", 1, 60_000);
  lru.delete("k");
  assert.equal(lru.get("k"), undefined);
  assert.equal(lru.size, 0);
});

test("clear empties the cache but preserves counters", () => {
  const lru = new FastLRU<number>();
  lru.set("a", 1, 60_000);
  lru.set("b", 2, 60_000);
  lru.get("a");
  lru.clear();
  assert.equal(lru.size, 0);
  assert.equal(lru.stats.hits, 1);
});

test("bounded eviction kicks in at the maxEntries ceiling", () => {
  const lru = new FastLRU<number>({ maxEntries: 3 });
  for (let i = 0; i < 5; i += 1) lru.set(`k${i}`, i, 60_000);
  assert.equal(lru.size, 3);
  assert.equal(lru.stats.evictions, 2);
  assert.equal(lru.get("k0"), undefined, "oldest should be gone");
  assert.equal(lru.get("k4"), 4);
});