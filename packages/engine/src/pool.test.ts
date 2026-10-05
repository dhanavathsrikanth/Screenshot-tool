import test from "node:test";
import assert from "node:assert/strict";
import { BrowserPool } from "./pool.js";
import { resolvePolicy, type ConcurrencyPolicy } from "./cpu.js";
import { resolveConfig, type EngineConfig } from "./types.js";

/**
 * Pool tests drive lease and recycle bookkeeping without launching Chromium. The
 * guarantee under test is "a recycle closes one browser, not the pool", and that is
 * observable purely from slot state.
 *
 * Policies are pinned rather than left to the host so the suite asserts on exact slot
 * counts instead of whatever CPU the machine running it happens to have.
 */
function forcedPolicy(slots: number): Partial<ConcurrencyPolicy> {
  return {
    min: 1,
    max: slots,
    reservedCores: 0,
    coresPerCapture: 0.25,
    memoryPerCaptureMb: 1,
    memoryHeadroomMb: 0,
    throttleRatio: 1,
  };
}

function makePool(slots = 1, overrides: EngineConfig = {}) {
  const policy = forcedPolicy(slots);
  const config = resolveConfig({
    stealth: false,
    maxConcurrentCaptures: slots,
    concurrencyPolicy: policy,
    ...overrides,
  });
  return new BrowserPool(config, resolvePolicy(config.concurrencyPolicy));
}

test("disabled auto concurrency honors the configured slots despite restrictive host policy", async () => {
  const config = resolveConfig({
    maxConcurrentCaptures: 4,
    autoConcurrency: false,
    budgetSampleIntervalMs: 0,
    concurrencyPolicy: { reservedCores: Number.MAX_SAFE_INTEGER, memoryPerCaptureMb: Number.MAX_SAFE_INTEGER },
  });
  const pool = new BrowserPool(config, config.concurrencyPolicy);
  try {
    assert.equal(pool.size, 4);
    const slots = await Promise.all(Array.from({ length: 4 }, (_, i) => pool.acquire(`fixed-${i}`)));
    assert.equal(new Set(slots.map((slot) => slot.id)).size, 4);
    assert.equal(pool.inFlight, 4);
    assert.equal(pool.budgetSnapshot.allowed, 4);
    assert.equal(pool.budgetSnapshot.throttled, false);
    const waiting = pool.acquire("fifth");
    assert.equal(pool.queued, 1);
    pool.release(slots[0]);
    assert.equal((await waiting).id, slots[0].id);
    assert.equal(pool.inFlight, 4);
  } finally {
    await pool.destroy();
  }
});

test("initialization reserves only idle slots and keeps queued captures within the limit", async () => {
  const pool = makePool(2, { autoConcurrency: false });
  const active = await pool.acquire("active");
  let ready: (() => void) | undefined;
  const initialized = new Promise<void>((resolve) => { ready = resolve; });
  const seen: number[] = [];
  const warming = pool.warm(async (slot) => { seen.push(slot.id); await initialized; });
  assert.equal(pool.inFlight, 2);
  assert.equal(seen.length, 1);
  assert.notEqual(seen[0], active.id);
  const capture = pool.acquire("queued");
  assert.equal(pool.queued, 1);
  ready!();
  await warming;
  const leased = await capture;
  assert.equal(pool.inFlight, 2);
  pool.release(leased);
  pool.release(active);
  await pool.destroy();
});

test("failed initialization releases every reserved slot before propagating the error", async () => {
  const pool = makePool(2, { autoConcurrency: false });
  const failure = new Error("Startup failed");
  await assert.rejects(pool.warm(async (slot) => {
    if (slot.id === 0) throw failure;
    await new Promise<void>((resolve) => setTimeout(resolve, 20));
  }), (error) => error === failure);
  assert.equal(pool.inFlight, 0);
  assert.equal(pool.health.idle, 2);
  await pool.destroy();
  await assert.rejects(pool.warm(async () => {}), /closed/);
});

test("automatic concurrency still respects restrictive host policy", async () => {
  const config = resolveConfig({
    maxConcurrentCaptures: 4,
    autoConcurrency: true,
    concurrencyPolicy: { reservedCores: Number.MAX_SAFE_INTEGER },
  });
  const pool = new BrowserPool(config, config.concurrencyPolicy);
  try {
    assert.equal(pool.size, 1);
    assert.equal(pool.budgetSnapshot.allowed, 1);
  } finally {
    await pool.destroy();
  }
});

test("pool never grants more leases than the CPU budget allows", async () => {
  const pool = makePool(3);
  try {
    assert.equal(pool.size, 3);

    const leases = [];
    for (let i = 0; i < 3; i += 1) leases.push(await pool.acquire(`req_${i}`));
    assert.equal(pool.inFlight, 3);

    const queued = pool.acquire("req_queued");
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(pool.queued, 1);
    assert.equal(pool.inFlight, 3, "the ceiling must not be exceeded while work waits");

    pool.release(leases[0]);
    assert.equal((await queued).id, leases[0].id);
    assert.equal(pool.inFlight, 3);
    assert.equal(pool.queued, 0);
  } finally {
    await pool.destroy();
  }
});

test("queued callers are served oldest first", async () => {
  const pool = makePool(1);
  try {
    const served: string[] = [];
    const first = await pool.acquire("req_first");
    const second = pool.acquire("req_second").then((slot) => {
      served.push("second");
      return slot;
    });
    const third = pool.acquire("req_third").then((slot) => {
      served.push("third");
      return slot;
    });

    pool.release(first);
    pool.release(await second);
    await third;

    assert.deepEqual(served, ["second", "third"]);
  } finally {
    await pool.destroy();
  }
});

test("recycling one slot leaves sibling slots leased", async () => {
  const pool = makePool(3);
  try {
    const slots = [];
    for (let i = 0; i < 3; i += 1) slots.push(await pool.acquire(`req_${i}`));
    assert.equal(new Set(slots.map((slot) => slot.id)).size, 3, "one slot per lease");

    const [victim, ...siblings] = slots;
    await pool.recycle(victim, "target crashed");

    assert.equal(victim.state, "idle", "a recycled slot must return to the pool");
    for (const sibling of siblings) {
      assert.equal(sibling.state, "busy", "a crash must not disturb adjacent slots");
    }
    assert.equal(pool.inFlight, 2);
    assert.equal(victim.health.last_fault, "target crashed");
  } finally {
    await pool.destroy();
  }
});

test("a crashed slot is reusable immediately after recycling", async () => {
  const pool = makePool(1);
  try {
    const slot = await pool.acquire("req_1");
    await pool.recycle(slot, "renderer process crashed");
    const again = await pool.acquire("req_2");
    assert.equal(again.id, slot.id);
    assert.equal(again.state, "busy");
  } finally {
    await pool.destroy();
  }
});

test("a slot is not handed to a waiter while it is mid-recycle", async () => {
  const pool = makePool(1);
  try {
    const slot = await pool.acquire("req_1");
    const waiter = pool.acquire("req_2");
    await Promise.all([pool.recycle(slot, "target crashed"), waiter]);

    assert.equal(pool.inFlight, 1, "the waiter lands once, on the recycled slot");
    assert.equal(pool.queued, 0);
  } finally {
    await pool.destroy();
  }
});

test("destroy rejects queued callers instead of hanging them", async () => {
  const pool = makePool(1);
  await pool.acquire("req_running");
  const queued = pool.acquire("req_queued");

  await pool.destroy();

  await assert.rejects(queued, (err: unknown) => {
    const error = err as { code?: string; requestId?: string };
    assert.equal(error.code, "internal_error");
    assert.equal(error.requestId, "req_queued");
    return true;
  });
});

test("acquiring from a destroyed pool fails fast", async () => {
  const pool = makePool(1);
  await pool.destroy();
  await assert.rejects(pool.acquire("req_x"), (err: unknown) => {
    assert.equal((err as { code?: string }).code, "internal_error");
    return true;
  });
});

test("health reports pool shape before any browser launches", async () => {
  const pool = makePool(4);
  try {
    const health = pool.health;
    assert.equal(health.size, 4);
    assert.equal(health.busy, 0);
    assert.equal(health.idle, 4);
    assert.equal(health.recycling, 0);
    assert.equal(health.restarts, 0);
    for (const slot of health.slots) {
      assert.equal(slot.connected, null);
      assert.equal(slot.state, "idle");
    }
  } finally {
    await pool.destroy();
  }
});

test("a throttled budget collapses grants to the floor", async () => {
  // Parallelism 1 with a load far above the ratio forces the throttle branch while
  // still pinning the pool to a known size.
  const pool = makePool(1, { budgetSampleIntervalMs: 0 });
  try {
    pool.release(await pool.acquire("req_1"));
    const budget = pool.budgetSnapshot;
    assert.ok(budget.allowed >= 1);
    assert.ok(budget.ceiling >= budget.target);
    assert.ok(["cpu", "memory", "ceiling", "floor"].includes(budget.constraint));
    assert.ok(budget.parallelism >= 1);
  } finally {
    await pool.destroy();
  }
});

test("slot lookup rejects an unknown slot id", async () => {
  const pool = makePool(1);
  try {
    assert.throws(
      () => pool.slot(99),
      (err: unknown) => {
        assert.equal((err as { code?: string }).code, "internal_error");
        return true;
      },
    );
    assert.equal(pool.slot(0).id, 0);
  } finally {
    await pool.destroy();
  }
});
