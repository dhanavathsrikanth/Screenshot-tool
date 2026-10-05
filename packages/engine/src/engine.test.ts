import test from "node:test";
import assert from "node:assert/strict";
import { captureOptionsSchema } from "@snapforge/contracts";
import { createEngine, resolveViewport, SnapforgeEngine } from "./index.js";
import { resolveConfig } from "./types.js";

function options(input: Record<string, unknown>) {
  return captureOptionsSchema.parse({ url: "https://example.com", ...input });
}

test("resolveConfig applies production defaults", () => {
  const config = resolveConfig();
  assert.equal(config.headless, true);
  assert.equal(config.stealth, true);
  assert.equal(config.prewarmPages, true);
  assert.equal(config.retries, 1);
  assert.equal(config.maxPageHeight, 24000);
  assert.equal(config.idlePhaseMs, 3000);
  // Concurrency is derived from the host by default; the config value is only a ceiling.
  assert.equal(config.autoConcurrency, true);
  assert.equal(config.maxConcurrentCaptures, 12);
  assert.equal(config.concurrencyPolicy.max, 12);
});

test("resolveConfig keeps explicit overrides", () => {
  const config = resolveConfig({
    headless: false,
    stealth: false,
    maxConcurrentCaptures: 8,
    retries: 3,
  });
  assert.equal(config.headless, false);
  assert.equal(config.stealth, false);
  assert.equal(config.maxConcurrentCaptures, 8);
  assert.equal(config.concurrencyPolicy.max, 8);
  assert.equal(config.retries, 3);
});

test("resolveViewport defaults to desktop standard", () => {
  const viewport = resolveViewport(options({}), "req");
  assert.deepEqual(viewport, {
    width: 1280,
    height: 720,
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
  });
});

test("resolveViewport applies device presets", () => {
  const pixel = resolveViewport(options({ device: "pixel_8" }), "req");
  assert.equal(pixel.width, 412);
  assert.equal(pixel.height, 915);
  assert.equal(pixel.deviceScaleFactor, 2.625);
  assert.equal(pixel.isMobile, true);
  assert.equal(pixel.hasTouch, true);

  const iphone = resolveViewport(options({ device: "iphone_15_pro" }), "req");
  assert.equal(iphone.width, 393);
  assert.equal(iphone.deviceScaleFactor, 3);
});

test("resolveViewport prefers explicit viewport over preset defaults", () => {
  const viewport = resolveViewport(
    options({ viewport: { width: 1024, height: 600 } }),
    "req",
  );
  assert.equal(viewport.width, 1024);
  assert.equal(viewport.height, 600);
  assert.equal(viewport.deviceScaleFactor, 1);
});

test("resolveViewport rejects unknown device presets", () => {
  assert.throws(
    () => resolveViewport(options({ device: "toaster_9000" }), "req_x"),
    (err: unknown) => {
      const error = err as { code?: string; message?: string; requestId?: string };
      assert.equal(error.code, "unsupported_option");
      assert.ok(error.message?.includes("toaster_9000"));
      assert.equal(error.requestId, "req_x");
      return true;
    },
  );
});

test("capture rejects invalid urls without launching a browser", async () => {
  const engine = createEngine({ stealth: false });
  try {
    await assert.rejects(
      engine.capture({ url: "definitely-not-a-url" }),
      (err: unknown) => {
        const error = err as { code?: string };
        assert.equal(error.code, "invalid_request");
        return true;
      },
    );
    const health = await engine.health();
    assert.equal(health.browser, null);
    assert.equal(health.in_flight, 0);
  } finally {
    await engine.close();
  }
});

test("capture rejects completely malformed payloads", async () => {
  const engine: SnapforgeEngine = createEngine({ stealth: false });
  try {
    await assert.rejects(engine.capture(null), (err: unknown) => {
      const error = err as { code?: string };
      assert.equal(error.code, "invalid_request");
      return true;
    });
    await assert.rejects(engine.capture({ viewport: "huge" }), (err: unknown) => {
      const error = err as { code?: string };
      assert.equal(error.code, "invalid_request");
      return true;
    });
  } finally {
    await engine.close();
  }
});

test("engine derives concurrency from the host, capped by config", async () => {
  const engine = createEngine({ maxConcurrentCaptures: 3 });
  try {
    // The ceiling is config, but the live number is whatever the host can sustain.
    assert.equal(engine.concurrencyTarget, engine.concurrency);
    assert.ok(engine.concurrency >= 1);
    assert.ok(engine.concurrency <= 3, "never exceed the configured ceiling");

    const health = await engine.health();
    assert.equal(health.ok, true);
    assert.equal(health.in_flight, 0);
    assert.equal(health.browser, null);
    assert.equal(health.pool.size, engine.concurrency);
    assert.equal(health.pool.busy, 0);
    assert.equal(health.pool.budget.ceiling, 3);
    assert.ok(health.pool.budget.allowed >= 1);
  } finally {
    await engine.close();
  }
});

test("a pinned policy makes concurrency exactly predictable", async () => {
  const engine = createEngine({
    maxConcurrentCaptures: 4,
    concurrencyPolicy: {
      min: 1,
      max: 4,
      reservedCores: 0,
      coresPerCapture: 0.25,
      memoryPerCaptureMb: 1,
      memoryHeadroomMb: 0,
      throttleRatio: 1,
    },
  });
  try {
    assert.equal(engine.concurrency, 4);
    assert.equal(engine.concurrencyTarget, 4);
    const health = await engine.health();
    assert.equal(health.pool.size, 4);
  } finally {
    await engine.close();
  }
});

test("invalid urls never consume a browser slot", async () => {
  const engine = createEngine({ maxConcurrentCaptures: 2 });
  try {
    await assert.rejects(engine.capture({ url: "definitely-not-a-url" }));
    const health = await engine.health();
    assert.equal(health.in_flight, 0);
    assert.equal(health.pool.busy, 0, "a rejected request must not leak a lease");
  } finally {
    await engine.close();
  }
});
