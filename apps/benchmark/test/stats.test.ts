import test from "node:test";
import assert from "node:assert/strict";
import { percentile, round } from "../src/stats.js";

test("percentile returns 0 for an empty sample", () => {
  assert.equal(percentile([], 50), 0);
  assert.equal(percentile([], 95), 0);
});

test("percentile uses nearest rank on a 10-value sample", () => {
  const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  assert.equal(percentile(values, 50), 50);
  assert.equal(percentile(values, 95), 100);
  assert.equal(percentile(values, 100), 100);
  assert.equal(percentile(values, 0), 10);
});

test("percentile ignores input order", () => {
  const shuffled = [70, 10, 100, 40, 20, 90, 30, 60, 50, 80];
  assert.equal(percentile(shuffled, 50), 50);
  assert.equal(percentile(shuffled, 95), 100);
});

test("percentile on a single value returns that value", () => {
  assert.equal(percentile([42], 50), 42);
  assert.equal(percentile([42], 95), 42);
});

test("percentile on two values picks the upper for p50", () => {
  assert.equal(percentile([10, 20], 50), 10);
  assert.equal(percentile([10, 20], 95), 20);
});

test("round trims to the requested precision", () => {
  assert.equal(round(96.666666), 96.67);
  assert.equal(round(96.666666, 1), 96.7);
  assert.equal(round(100, 2), 100);
});
