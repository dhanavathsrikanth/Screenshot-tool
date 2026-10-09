import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
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
  assert.equal(config.idlePhaseMs, 1500);
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
    deviceScaleFactor: 2,
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

  const iphone17 = resolveViewport(options({ device: "iphone_17_pro_max" }), "req");
  assert.equal(iphone17.width, 440);
  assert.equal(iphone17.height, 956);
  assert.equal(iphone17.deviceScaleFactor, 3);
  assert.equal(iphone17.isMobile, true);
  assert.equal(iphone17.hasTouch, true);
});

test("resolveViewport prefers explicit viewport over preset defaults", () => {
  const viewport = resolveViewport(
    options({ viewport: { width: 1024, height: 600 } }),
    "req",
  );
  assert.equal(viewport.width, 1024);
  assert.equal(viewport.height, 600);
  assert.equal(viewport.deviceScaleFactor, 2);
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

test("capture applies responsive device emulation and returns preset-sized output", { timeout: 120_000 }, async (t) => {
  const requests: string[] = [];
  const server = http.createServer((request, response) => {
    requests.push(request.headers["user-agent"] ?? "");
    response.writeHead(200, { "content-type": "text/html" });
    response.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">
      <style>body{margin:0}#mobile{display:block}#desktop{display:none}@media(min-width:900px){#mobile{display:none}#desktop{display:block}}</style></head>
      <body><main><h1 id="mobile">Mobile responsive layout</h1><h1 id="desktop">Desktop responsive layout</h1></main></body></html>`);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());

  const engine = createEngine({ stealth: false, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH, allowPrivateNetwork: true, retries: 0 });
  t.after(() => engine.close());
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const presets = [
    { device: "iphone_15_pro", width: 393, height: 852, scale: 3, expectedLayout: "Mobile responsive layout", expectedUa: /iPhone/ },
    { device: "iphone_15_pro_max", width: 430, height: 932, scale: 3, expectedLayout: "Mobile responsive layout", expectedUa: /iPhone/ },
    { device: "iphone_17_pro_max", width: 440, height: 956, scale: 3, expectedLayout: "Mobile responsive layout", expectedUa: /iPhone OS 18_7/ },
    { device: "pixel_8", width: 412, height: 915, scale: 2.625, expectedLayout: "Mobile responsive layout", expectedUa: /Android.*Pixel 8/ },
    { device: "ipad_pro_11", width: 834, height: 1194, scale: 2, expectedLayout: "Mobile responsive layout", expectedUa: /iPad/ },
    { device: "desktop_standard", width: 1280, height: 720, scale: 2, expectedLayout: "Desktop responsive layout", expectedUa: /Chrome/ },
  ];

  for (const preset of presets) {
    const result = await engine.capture({ url, device: preset.device, format: "png", cache_ttl: 0 }, { inspectPage: true });
    assert.equal(result.data.width, Math.round(preset.width * preset.scale), `${preset.device} output width`);
    assert.equal(result.data.height, Math.round(preset.height * preset.scale), `${preset.device} output height`);
    assert.ok(result.inspection?.markdown?.includes(preset.expectedLayout), `${preset.device} responsive breakpoint`);
    assert.match(requests.at(-1) ?? "", preset.expectedUa, `${preset.device} user-agent`);
  }
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
