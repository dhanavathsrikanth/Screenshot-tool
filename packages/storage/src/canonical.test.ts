import test from "node:test";
import assert from "node:assert/strict";
import { captureOptionsSchema } from "@snapforge/contracts";
import {
  cacheKey,
  canonicalize,
  normalizeTargetUrl,
  objectKeyFor,
  renderFingerprint,
  sha256,
} from "./canonical.js";

const base = captureOptionsSchema.parse({ url: "https://example.com/a" });

test("canonicalize is order-independent for object keys", () => {
  assert.equal(
    canonicalize({ b: 1, a: 2, nested: { z: true, y: null } }),
    canonicalize({ nested: { y: null, z: true }, a: 2, b: 1 }),
  );
});

test("canonicalize preserves array order", () => {
  assert.notEqual(canonicalize([1, 2]), canonicalize([2, 1]));
});

test("canonicalize drops undefined but keeps empty structures distinct", () => {
  assert.equal(canonicalize({ a: undefined, b: 1 }), canonicalize({ b: 1 }));
  assert.notEqual(canonicalize({ a: {} }), canonicalize({ a: [] }));
});

test("delivery-only options are excluded from the fingerprint", () => {
  const a = captureOptionsSchema.parse({ url: "https://example.com/a", cache_ttl: 60 });
  const b = captureOptionsSchema.parse({
    url: "https://example.com/a",
    cache_ttl: 900,
    sync: false,
  });
  assert.deepEqual(renderFingerprint(a), renderFingerprint(b));
  assert.equal(cacheKey(a), cacheKey(b));
});

test("render-affecting options change the key", () => {
  const a = captureOptionsSchema.parse({ url: "https://example.com/a" });
  const b = captureOptionsSchema.parse({ url: "https://example.com/a", full_page: true });
  assert.notEqual(cacheKey(a), cacheKey(b));
});

test("header order does not fragment the cache", () => {
  const a = captureOptionsSchema.parse({
    url: "https://example.com/a",
    headers: { "X-One": "1", "X-Two": "2" },
  });
  const b = captureOptionsSchema.parse({
    url: "https://example.com/a",
    headers: { "X-Two": "2", "X-One": "1" },
  });
  assert.equal(cacheKey(a), cacheKey(b));
});

test("different auth headers produce different keys", () => {
  const a = captureOptionsSchema.parse({
    url: "https://example.com/a",
    headers: { authorization: "Bearer alpha" },
  });
  const b = captureOptionsSchema.parse({
    url: "https://example.com/a",
    headers: { authorization: "Bearer bravo" },
  });
  assert.notEqual(cacheKey(a), cacheKey(b), "a cached page must not cross auth boundaries");
});

test("normalizeTargetUrl folds host case and default ports only", () => {
  assert.equal(normalizeTargetUrl("https://EXAMPLE.com:443/a"), "https://example.com/a");
  assert.equal(normalizeTargetUrl("http://example.com:80/a"), "http://example.com/a");
  // Fragments never reach the server but do change client-side rendering.
  assert.notEqual(normalizeTargetUrl("https://example.com/#/a"), normalizeTargetUrl("https://example.com/#/b"));
  assert.notEqual(normalizeTargetUrl("https://example.com:8443/a"), "https://example.com/a");
});

test("cacheKey is a stable sha256 hex digest", () => {
  const key = cacheKey(base);
  assert.match(key, /^[0-9a-f]{64}$/);
  assert.equal(key, cacheKey(base));
});

test("renderer changes cannot reuse an artifact from the previous cache namespace", () => {
  const previousKey = sha256(`${canonicalize(renderFingerprint(base))}|${normalizeTargetUrl(base.url)}`);
  assert.notEqual(cacheKey(base), previousKey);
});

test("objectKeyFor shards by digest prefix and keeps the format", () => {
  const digest = cacheKey(base);
  assert.equal(objectKeyFor(digest, "PNG"), `captures/${digest.slice(0, 2)}/${digest.slice(2, 4)}/${digest}.png`);
  assert.notEqual(objectKeyFor(digest, "png"), objectKeyFor(digest, "webp"));
});
