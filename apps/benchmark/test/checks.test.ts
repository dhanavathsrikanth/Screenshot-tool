import test from "node:test";
import assert from "node:assert/strict";
import { evaluateCapture } from "../src/checks.js";
import type { BenchmarkSite } from "../src/sites.js";
import { makeData, makePng } from "./helpers.js";

function site(overrides: Partial<BenchmarkSite["checks"]> = {}): BenchmarkSite {
  return {
    id: "fixture",
    tier: "easy",
    url: "https://example.com",
    note: "fixture",
    checks: { expectText: ["Example Domain"], ...overrides },
  };
}

test("a healthy capture passes every check", () => {
  const buffer = makePng(1280, 720, 50_000);
  const data = makeData({ bytes: buffer.length });
  const failures = evaluateCapture(site(), data, buffer, "Welcome to Example Domain");
  assert.deepEqual(failures, []);
});

test("a wrong format signature fails", () => {
  const buffer = makePng(1280, 720, 50_000);
  const data = makeData({ format: "jpeg", bytes: buffer.length });
  const failures = evaluateCapture(site(), data, buffer, "Example Domain");
  assert.ok(failures.some((failure) => failure.check === "format_signature"));
});

test("a truncated buffer fails min_bytes and blankness", () => {
  const buffer = makePng(1280, 720, 400);
  const data = makeData({ bytes: buffer.length });
  const failures = evaluateCapture(site(), data, buffer, "Example Domain");
  const checks = failures.map((failure) => failure.check);
  assert.ok(checks.includes("min_bytes"));
  assert.ok(checks.includes("bits_per_pixel"));
});

test("a blank full-page capture fails the bits-per-pixel floor", () => {
  const buffer = makePng(1280, 10_000, 30_000);
  const data = makeData({ height: 10_000, bytes: buffer.length });
  const failures = evaluateCapture(site({ maxHeight: 24_000 }), data, buffer, "Example Domain");
  assert.ok(failures.some((failure) => failure.check === "bits_per_pixel"));
});

test("png header dimensions must agree with the envelope", () => {
  const buffer = makePng(1000, 500, 50_000);
  const data = makeData({ width: 1280, height: 720, bytes: buffer.length });
  const failures = evaluateCapture(site(), data, buffer, "Example Domain");
  assert.ok(failures.some((failure) => failure.check === "dimension_consistency"));
});

test("expected text is matched case-insensitively", () => {
  const buffer = makePng(1280, 720, 50_000);
  const data = makeData({ bytes: buffer.length });
  const ok = evaluateCapture(site({ expectText: ["example domain"] }), data, buffer, "EXAMPLE DOMAIN");
  assert.deepEqual(ok, []);

  const missing = evaluateCapture(site({ expectText: ["absent phrase"] }), data, buffer, "Example Domain");
  assert.ok(missing.some((failure) => failure.check === "expect_text"));
});

test("forbidden text flags leftover cookie banners", () => {
  const buffer = makePng(1280, 720, 50_000);
  const data = makeData({ bytes: buffer.length });
  const failures = evaluateCapture(
    site({ forbidText: ["Accept cookies"] }),
    data,
    buffer,
    "Example Domain — Accept cookies",
  );
  assert.ok(failures.some((failure) => failure.check === "forbid_text"));
});

test("text checks are skipped when markdown is undefined", () => {
  const buffer = makePng(1280, 720, 50_000);
  const data = makeData({ bytes: buffer.length });
  const failures = evaluateCapture(
    site({ expectText: ["absent"], forbidText: ["Accept cookies"] }),
    data,
    buffer,
    undefined,
  );
  assert.deepEqual(failures, []);
});

test("challenge redirects in final_url fail", () => {
  const buffer = makePng(1280, 720, 50_000);
  const data = makeData({ bytes: buffer.length, final_url: "https://example.com/login?next=%2F" });
  const failures = evaluateCapture(
    site({ forbidFinalUrl: ["/login"] }),
    data,
    buffer,
    "Example Domain",
  );
  assert.ok(failures.some((failure) => failure.check === "final_url"));
});

test("runaway full-page height hits the ceiling", () => {
  const buffer = makePng(1280, 900, 50_000);
  const data = makeData({ height: 720, bytes: buffer.length });
  const failures = evaluateCapture(site({ maxHeight: 400 }), data, buffer, "Example Domain");
  assert.ok(failures.some((failure) => failure.check === "max_height"));
});

test("undersized width fails", () => {
  const buffer = makePng(800, 720, 50_000);
  const data = makeData({ width: 800, bytes: buffer.length });
  const failures = evaluateCapture(site(), data, buffer, "Example Domain");
  assert.ok(failures.some((failure) => failure.check === "min_width"));
});

test("pdf output skips raster checks", () => {
  const buffer = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(20_000, 0x20)]);
  const data = makeData({ format: "pdf", width: 1280, height: 720, bytes: buffer.length });
  const failures = evaluateCapture(site(), data, buffer, undefined);
  assert.ok(!failures.some((failure) => failure.check === "bits_per_pixel"));
  assert.ok(!failures.some((failure) => failure.check === "format_signature"));
});
