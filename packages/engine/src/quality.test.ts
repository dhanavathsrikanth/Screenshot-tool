import test from "node:test";
import assert from "node:assert/strict";
import type { Page } from "playwright";
import { captureOptionsSchema, SnapforgeError } from "@snapforge/contracts";
import { ensureCaptureQuality, ensureOutputQuality, qualityFailures } from "./quality.js";
import { SettlementBudget } from "./settlement.js";

const options = (patch: Record<string, unknown> = {}) => captureOptionsSchema.parse({ url: "https://example.com", ...patch });

test("quality assertions detect missing and forbidden content without case sensitivity", () => {
  assert.deepEqual(qualityFailures({ text: "Example: temporarily unavailable", loadingShell: false }, options({
    fail_if_content_missing: ["EXAMPLE", "Ready report"], fail_if_content_contains: ["UNAVAILABLE"],
  })), ["missing_content: Ready report", "forbidden_content: UNAVAILABLE"]);
});

test("loading-shell rejection has an explicit opt-out", () => {
  const state = { text: "Loading", loadingShell: true };
  assert.deepEqual(qualityFailures(state, options({ fail_if_incomplete: true })), ["loading_shell"]);
  assert.deepEqual(qualityFailures(state, options({ fail_if_incomplete: false })), []);
});

test("ready pages do not spend the quality waiting budget", async () => {
  let reads = 0;
  const page = { evaluate: async () => { reads++; return { text: "Complete report", loadingShell: false }; } } as unknown as Page;
  await ensureCaptureQuality(page, options({ fail_if_incomplete: true }), new SettlementBudget(10_000), 5000, "quality");
  assert.equal(reads, 1);
});

test("quality wait recovers a loading shell that finishes rendering", async () => {
  let reads = 0;
  const page = { evaluate: async () => ({ text: "Report", loadingShell: ++reads === 1 }) } as unknown as Page;
  await ensureCaptureQuality(page, options({ fail_if_incomplete: true }), new SettlementBudget(1000), 600, "quality");
  assert.equal(reads, 2);
});

test("exhausted budget rejects incomplete content with a retriable error", async () => {
  const page = { evaluate: async () => ({ text: "Loading", loadingShell: true }), url: () => "https://example.com" } as unknown as Page;
  await assert.rejects(ensureCaptureQuality(page, options({ fail_if_incomplete: true }), new SettlementBudget(0), 5000, "quality"), (error: unknown) => {
    assert.ok(error instanceof SnapforgeError);
    assert.equal(error.code, "render_incomplete");
    assert.equal(error.retriable, true);
    assert.deepEqual(error.details?.failures, ["loading_shell"]);
    return true;
  });
});

test("minimum output dimensions and size are enforced before delivery", () => {
  assert.throws(() => ensureOutputQuality({ height: 720, buffer: Buffer.alloc(20) }, options({ min_capture_height: 4000, min_capture_bytes: 40 }), "quality"), (error: unknown) => {
    assert.ok(error instanceof SnapforgeError);
    assert.deepEqual(error.details?.failures, ["min_capture_height", "min_capture_bytes"]);
    return true;
  });
});
