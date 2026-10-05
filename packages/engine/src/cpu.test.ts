import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_CONCURRENCY_POLICY,
  deriveConcurrency,
  resolvePolicy,
  sampleCpu,
  type CpuSample,
} from "./cpu.js";

function sample(overrides: Partial<CpuSample> = {}): CpuSample {
  return {
    parallelism: 8,
    load1: 0,
    freeMemoryMb: 8192,
    totalMemoryMb: 16384,
    sampledAt: 1_700_000_000_000,
    ...overrides,
  };
}

const POLICY = resolvePolicy();

test("sampleCpu reports a usable host snapshot", () => {
  const observed = sampleCpu();
  assert.ok(observed.parallelism >= 1);
  assert.ok(Number.isInteger(observed.parallelism));
  assert.ok(observed.freeMemoryMb > 0);
  assert.ok(observed.totalMemoryMb >= observed.freeMemoryMb);
  assert.ok(observed.load1 >= 0);
});

test("concurrency scales up with available cores", () => {
  const small = deriveConcurrency(POLICY, sample({ parallelism: 4, freeMemoryMb: 32768 }));
  const large = deriveConcurrency(POLICY, sample({ parallelism: 32, freeMemoryMb: 65536 }));
  assert.ok(small.target >= 1);
  assert.ok(large.target > small.target);
});

test("concurrency never exceeds the configured ceiling", () => {
  const budget = deriveConcurrency(POLICY, sample({ parallelism: 256, freeMemoryMb: 999_999 }));
  assert.equal(budget.target, POLICY.max);
  assert.equal(budget.ceiling, POLICY.max);
  assert.equal(budget.constraint, "ceiling");
  assert.equal(budget.allowed <= POLICY.max, true);
});

test("memory pressure caps concurrency and is reported as the constraint", () => {
  // Plenty of cores, tight memory: the memory ceiling must win over the CPU ceiling.
  const budget = deriveConcurrency(
    POLICY,
    sample({ parallelism: 64, freeMemoryMb: 1200, totalMemoryMb: 65_536 }),
  );
  assert.equal(budget.constraint, "memory");
  assert.equal(budget.target, 2);
  assert.equal(budget.allowed, 2);
});

test("exhausted memory clamps to the floor and says so", () => {
  // Less memory than a single capture wants: the floor wins, and reporting "floor"
  // is more useful than claiming a memory cap we never actually calculated.
  const budget = deriveConcurrency(
    POLICY,
    sample({ parallelism: 64, freeMemoryMb: 600, totalMemoryMb: 65_536 }),
  );
  assert.equal(budget.constraint, "floor");
  assert.equal(budget.target, POLICY.min);
  assert.equal(budget.allowed, POLICY.min);
});

test("reserved cores prevent oversubscribing a tiny host", () => {
  const budget = deriveConcurrency(POLICY, sample({ parallelism: 2, freeMemoryMb: 32_768 }));
  assert.equal(budget.target, POLICY.min);
  assert.equal(budget.constraint, "floor");
});

test("sustained load collapses the ceiling to the floor", () => {
  const busy = deriveConcurrency(
    POLICY,
    sample({ parallelism: 8, load1: 8 * POLICY.throttleRatio + 2, freeMemoryMb: 32_768 }),
  );
  assert.equal(busy.throttled, true);
  assert.equal(busy.allowed, POLICY.min);
  // The pre-degradation target is preserved so health can explain the collapse.
  assert.ok(busy.target > POLICY.min);
});

test("load at the threshold does not throttle", () => {
  const edge = deriveConcurrency(
    POLICY,
    sample({ parallelism: 8, load1: 8 * POLICY.throttleRatio, freeMemoryMb: 32_768 }),
  );
  assert.equal(edge.throttled, false);
  assert.equal(edge.allowed, edge.target);
});

test("a fully saturated host never throttles below the floor", () => {
  const saturated = deriveConcurrency(
    resolvePolicy({ min: 2, throttleRatio: 0.85 }),
    sample({ parallelism: 2, load1: 64, freeMemoryMb: 32_768 }),
  );
  assert.equal(saturated.allowed, 2);
});

test("policy overrides layer over the defaults", () => {
  const policy = resolvePolicy({ max: 3, reservedCores: 0 });
  assert.equal(policy.max, 3);
  assert.equal(policy.reservedCores, 0);
  assert.equal(policy.coresPerCapture, DEFAULT_CONCURRENCY_POLICY.coresPerCapture);
});

test("policy tolerates degenerate cores-per-capture values", () => {
  const budget = deriveConcurrency(
    resolvePolicy({ coresPerCapture: 0, memoryPerCaptureMb: 0, reservedCores: 99 }),
    sample({ parallelism: 8, freeMemoryMb: 32_768 }),
  );
  assert.equal(Number.isInteger(budget.target), true);
  assert.ok(budget.target >= 1);
  assert.ok(budget.target <= POLICY.max);
});
