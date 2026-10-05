import test from "node:test";
import assert from "node:assert/strict";
import type { Page } from "playwright";
import {
  computeScrollStep,
  isConverged,
  nextScrollTarget,
  pinFixedProperties,
  waitForScrollGrowth,
} from "./fullpage.js";

test("computeScrollStep scales with viewport height", () => {
  assert.equal(computeScrollStep(720), 612);
  assert.equal(computeScrollStep(1000), 850);
});

test("computeScrollStep enforces a floor and ceiling", () => {
  assert.equal(computeScrollStep(100), 120);
  assert.equal(computeScrollStep(500, 0.01), 120);
  assert.equal(computeScrollStep(720, 0.01), 144);
  assert.equal(computeScrollStep(720, 5), 720);
});

test("nextScrollTarget advances by step toward the bottom", () => {
  assert.equal(nextScrollTarget(0, 612, 3000, 720, 24000), 612);
  assert.equal(nextScrollTarget(1224, 612, 3000, 720, 24000), 1836);
});

test("nextScrollTarget clamps at the document bottom", () => {
  assert.equal(nextScrollTarget(2000, 612, 3000, 720, 24000), 2280);
  assert.equal(nextScrollTarget(2280, 612, 3000, 720, 24000), null);
});

test("nextScrollTarget respects the max page height cap", () => {
  const target = nextScrollTarget(23000, 612, 100000, 720, 24000);
  assert.equal(target, 23280);
  assert.equal(nextScrollTarget(23280, 612, 100000, 720, 24000), null);
});

test("nextScrollTarget returns null when the page fits the viewport", () => {
  assert.equal(nextScrollTarget(0, 612, 500, 720, 24000), null);
});

test("isConverged detects a stable height history", () => {
  assert.equal(isConverged([1000, 1000, 1000, 1000]), true);
  assert.equal(isConverged([1000, 1000, 1002, 1001]), true);
  assert.equal(isConverged([1000, 1050, 1000, 1050]), false);
  assert.equal(isConverged([1000, 1000]), false);
});

test("pinFixedProperties pins an element in document coordinates", () => {
  const props = pinFixedProperties(
    { top: 10, left: 20, width: 300, height: 80 },
    5,
    700,
  );
  assert.equal(props.position, "absolute");
  assert.equal(props.top, "710px");
  assert.equal(props.left, "25px");
  assert.equal(props.width, "300px");
  assert.equal(props.height, "80px");
  assert.equal(props.right, "auto");
  assert.equal(props.bottom, "auto");
});

test("waitForScrollGrowth resolves once the document outgrows the viewport", async () => {
  let calls = 0;
  const page = {
    evaluate: async () => {
      calls += 1;
      return { scrollable: calls >= 2, staticReady: false };
    },
  } as unknown as Page;
  assert.equal(await waitForScrollGrowth(page, 500, 5), true);
  assert.ok(calls >= 2);
});

test("waitForScrollGrowth times out while the document stays viewport-sized", async () => {
  const page = { evaluate: async () => ({ scrollable: false, staticReady: false }) } as unknown as Page;
  assert.equal(await waitForScrollGrowth(page, 60, 10), false);
});

test("waitForScrollGrowth with a zero budget returns false", async () => {
  const page = { evaluate: async () => ({ scrollable: true, staticReady: true }) } as unknown as Page;
  assert.equal(await waitForScrollGrowth(page, 0, 10), false);
});

test("waitForScrollGrowth skips waiting for a complete static page that fits the viewport", async () => {
  let calls = 0;
  const page = { evaluate: async () => {
    calls += 1;
    return { scrollable: false, staticReady: true };
  } } as unknown as Page;
  assert.equal(await waitForScrollGrowth(page, 500, 5), false);
  assert.equal(calls, 1);
});

test("waitForScrollGrowth can retain the guard for custom script mutations", async () => {
  let calls = 0;
  const page = { evaluate: async () => {
    calls += 1;
    return { scrollable: calls >= 3, staticReady: true };
  } } as unknown as Page;
  assert.equal(await waitForScrollGrowth(page, 100, 5, false), true);
  assert.equal(calls, 3);
});
