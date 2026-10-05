import test from "node:test";
import assert from "node:assert/strict";
import { CaptureTimer } from "./timings.js";

test("capture timings accumulate repeated phases and include unmeasured overhead", async () => {
  let now = 100;
  const timer = new CaptureTimer(() => now);
  await timer.measure("navigation", async () => { now += 25; });
  await timer.measure("navigation", async () => { now += 15; });
  now += 10;
  assert.deepEqual(timer.snapshot(), { total_ms: 50, phases_ms: { navigation: 40 } });
});

test("failed phases and cleanup are measured without swallowing the original error", async () => {
  let now = 0;
  const timer = new CaptureTimer(() => now);
  const error = new Error("navigation failed");
  await assert.rejects(timer.measure("navigation", async () => {
    now += 30;
    throw error;
  }), (received) => received === error);
  await timer.measure("cleanup", async () => { now += 5; });
  assert.deepEqual(timer.snapshot(), { total_ms: 35, phases_ms: { navigation: 30, cleanup: 5 } });
});
