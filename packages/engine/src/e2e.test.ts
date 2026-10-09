import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { createEngine } from "./index.js";

function page(title: string, body: string, head = ""): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>${head}</head><body>${body}</body></html>`;
}

const HEADING = '<h1 id="heading">Snapforge Fixture</h1><p>Body copy for capture.</p>';

function route(pathname: string): { status: number; body: string } {
  switch (pathname) {
    case "/":
      return { status: 200, body: page("Fixture Home", HEADING) };
    case "/tall":
      return {
        status: 200,
        body: page(
          "Tall Page",
          `${HEADING}<div style="height:3000px;background:linear-gradient(#e0f2fe,#fef9c3)"></div>`,
        ),
      };
    case "/banner":
      return {
        status: 200,
        body: page(
          "Banner Page",
          `${HEADING}<div id="onetrust-banner-sdk">Accept all cookies</div>`,
          "<style>#onetrust-banner-sdk{position:fixed;top:0;left:0;width:100%;height:300px;background:#dc2626;z-index:2147483647;padding:40px;box-sizing:border-box}</style>",
        ),
      };
    case "/challenge":
      return {
        status: 200,
        body: page(
          "Just a moment...",
          "<p>Checking your browser before accessing the site.</p>",
        ),
      };
    case "/error503":
      return {
        status: 503,
        body: page("Service Unavailable", "<p>Please try again later.</p>"),
      };
    case "/tracker":
      return {
        status: 200,
        body: page(
          "Tracker Page",
          `${HEADING}<script src="https://www.google-analytics.com/analytics.js"></script>`,
        ),
      };
    case "/delayed":
      return {
        status: 200,
        body: page(
          "Delayed Page",
          `${HEADING}<script>setTimeout(function(){var d=document.createElement('div');d.id='ready';d.textContent='ready';document.body.appendChild(d);},400)</script>`,
        ),
      };
    case "/hydrating":
      return {
        status: 200,
        body: page("Hydration Fixture", '<main id="content">Loading</main><script>setTimeout(() => { document.getElementById("content").innerHTML = "<h1>Hydrated fixture</h1><p>" + "Hydrated content. ".repeat(60) + "</p>"; }, 900);</script>'),
      };
    case "/stealth":
      return { status: 200, body: page("Stealth Page", HEADING) };
    default:
      return { status: 404, body: page("Not Found", "<p>missing</p>") };
  }
}

test("engine end-to-end capture suite", async (t) => {
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url ?? "/", "http://127.0.0.1").pathname;
    const result = route(pathname);
    res.writeHead(result.status, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    });
    res.end(result.body);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  const base = `http://127.0.0.1:${port}`;

  const engine = createEngine({
    stealth: false,
    maxConcurrentCaptures: 2,
    idlePhaseMs: 1500,
    fontWaitMs: 800,
  });
  const stealthEngine = createEngine({
    stealth: true,
    idlePhaseMs: 1500,
    fontWaitMs: 800,
  });

  t.after(async () => {
    await engine.close();
    await stealthEngine.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  await t.test("worker warmup prepares an isolated page without navigating a target", async () => {
    await Promise.all([engine.warm(), engine.warm()]);
    const health = await engine.health();
    assert.equal(health.in_flight, 0);
    assert.equal(health.browser?.contexts_served, 0);
    const outcome = await engine.capture({ url: `${base}/`, timeout: 15000 });
    assert.equal(outcome.timings?.phases_ms.browser_start, 0);
    assert.ok((outcome.timings?.phases_ms.page_setup ?? Infinity) < 100);
    assert.equal((await engine.health()).browser?.contexts_served, 1);
  });

  await t.test("defaults to a compact, high-quality webp capture", async () => {
    const { data, buffer } = await engine.capture({ url: `${base}/`, timeout: 15000 });
    assert.equal(data.format, "webp");
    assert.equal(data.width, 2560);
    assert.equal(data.height, 1440);
    assert.ok(data.bytes > 1000);
    assert.equal(data.cached, false);
    assert.ok(data.final_url.startsWith(base));
    assert.equal(data.blocked_requests, 0);
    assert.equal(buffer.subarray(0, 4).toString("ascii"), "RIFF");
    assert.equal(buffer.subarray(8, 12).toString("ascii"), "WEBP");
  });

  await t.test("short static captures skip guards with identical screenshot pixels", async () => {
    const fast = await engine.capture({ url: `${base}/`, timeout: 15000, full_page: true });
    const reference = await engine.capture({ url: `${base}/`, timeout: 15000, full_page: true, delay: 300 });
    assert.deepEqual(fast.buffer, reference.buffer);
    assert.ok((fast.timings?.phases_ms.pre_capture ?? Infinity) < 500);
    assert.ok((fast.timings?.phases_ms.growth_wait ?? Infinity) < 500);
    assert.ok((fast.timings?.phases_ms.cleanup ?? -1) >= 0);
    assert.ok((fast.timings?.total_ms ?? 0) >= (fast.timings?.phases_ms.screenshot ?? 0));
  });

  await t.test("automatic capture still waits for delayed SPA hydration", async () => {
    const outcome = await engine.capture({ url: `${base}/hydrating`, timeout: 15000 }, { inspectPage: true });
    assert.match(outcome.inspection?.markdown ?? "", /Hydrated fixture/);
    assert.match(outcome.inspection?.markdown ?? "", /Hydrated content/);
    assert.ok((outcome.timings?.phases_ms.pre_capture ?? 0) >= 200);
  });

  await t.test("explicit content thresholds still fail on short static pages", async () => {
    await assert.rejects(engine.capture({ url: `${base}/`, timeout: 1500, wait_for_content: true }), (err: unknown) => {
      const error = err as { code?: string; details?: { timings?: { phases_ms?: { cleanup?: number; pre_capture?: number } } } };
      assert.equal(error.code, "render_timeout");
      assert.ok((error.details?.timings?.phases_ms?.cleanup ?? -1) >= 0);
      assert.ok((error.details?.timings?.phases_ms?.pre_capture ?? 0) > 0);
      return true;
    });
  });

  await t.test("custom JavaScript keeps the content guard for delayed mutations", async () => {
    const outcome = await engine.capture({
      url: `${base}/`, timeout: 15000,
      custom_js: 'setTimeout(() => { document.body.innerHTML = "<h1>Custom content</h1><p>" + "Delayed mutation. ".repeat(60) + "</p>"; }, 900);',
    }, { inspectPage: true });
    assert.match(outcome.inspection?.markdown ?? "", /Custom content/);
    assert.ok((outcome.timings?.phases_ms.pre_capture ?? 0) >= 700);
  });

  await t.test("captures the full page beyond the viewport", async () => {
    const { data } = await engine.capture({
      url: `${base}/tall`,
      full_page: true,
      timeout: 20000,
    });
    assert.equal(data.width, 2560);
    assert.ok(data.height >= 2900, `height ${data.height} should cover the tall document`);
    assert.ok(data.height <= 48000);
  });

  await t.test("captures jpeg output", async () => {
    const { data, buffer } = await engine.capture({
      url: `${base}/`,
      format: "jpeg",
      quality: 60,
      timeout: 15000,
    });
    assert.equal(data.format, "jpeg");
    assert.equal(buffer[0], 0xff);
    assert.equal(buffer[1], 0xd8);
    assert.ok(data.bytes > 1000);
  });

  await t.test("captures webp output", async () => {
    const { data, buffer } = await engine.capture({
      url: `${base}/`,
      format: "webp",
      timeout: 15000,
    });
    assert.equal(data.format, "webp");
    assert.equal(buffer.subarray(0, 4).toString("ascii"), "RIFF");
    assert.equal(buffer.subarray(8, 12).toString("ascii"), "WEBP");
  });

  await t.test("captures pdf output", async () => {
    const { data, buffer } = await engine.capture({
      url: `${base}/`,
      format: "pdf",
      timeout: 15000,
    });
    assert.equal(data.format, "pdf");
    assert.equal(buffer.subarray(0, 4).toString("ascii"), "%PDF");
    assert.ok(data.bytes > 500);
  });

  await t.test("captures a targeted element", async () => {
    const { data } = await engine.capture({
      url: `${base}/`,
      selector: "#heading",
      timeout: 15000,
    });
    assert.ok(data.width > 10, `width ${data.width}`);
    assert.ok(data.height > 5, `height ${data.height}`);
    assert.ok(data.bytes > 300);
  });

  await t.test("annihilates cookie banners", async () => {
    await assert.rejects(
      engine.capture({ url: `${base}/banner`, selector: "#onetrust-banner-sdk", timeout: 15000 }),
      (err: unknown) => {
        const error = err as { code?: string; message?: string };
        assert.equal(error.code, "invalid_request");
        assert.ok(error.message?.includes("matched no visible element"));
        return true;
      },
    );
  });

  await t.test("keeps banners when annihilation is disabled", async () => {
    const { data } = await engine.capture({
      url: `${base}/banner`,
      block_cookie_banners: false,
      selector: "#onetrust-banner-sdk",
      timeout: 15000,
    });
    assert.ok(data.width >= 1000, `banner width ${data.width}`);
    assert.ok(data.height >= 250, `banner height ${data.height}`);
  });

  await t.test("hides elements via hide_selectors", async () => {
    await assert.rejects(
      engine.capture({
        url: `${base}/`,
        hide_selectors: ["#heading"],
        selector: "#heading",
        timeout: 15000,
      }),
      (err: unknown) => {
        const error = err as { code?: string };
        assert.equal(error.code, "invalid_request");
        return true;
      },
    );
  });

  await t.test("removes elements via remove_selectors", async () => {
    await assert.rejects(
      engine.capture({
        url: `${base}/`,
        remove_selectors: ["#heading"],
        selector: "#heading",
        timeout: 15000,
      }),
      (err: unknown) => {
        const error = err as { code?: string };
        assert.equal(error.code, "invalid_request");
        return true;
      },
    );
  });

  await t.test("rejects invalid hide selectors", async () => {
    await assert.rejects(
      engine.capture({
        url: `${base}/`,
        hide_selectors: ["[broken"],
        timeout: 15000,
      }),
      (err: unknown) => {
        const error = err as { code?: string; message?: string };
        assert.equal(error.code, "invalid_request");
        assert.ok(error.message?.includes("[broken"));
        return true;
      },
    );
  });

  await t.test("accepts comma separated hide selectors", async () => {
    const { data } = await engine.capture({
      url: `${base}/`,
      hide_selectors: ["div, #heading", "p"],
      timeout: 15000,
    });
    assert.equal(data.format, "webp");
  });

  await t.test("waits for a delayed selector", async () => {
    const { data } = await engine.capture({
      url: `${base}/delayed`,
      wait_for_selector: "#ready",
      timeout: 10000,
    });
    assert.equal(data.format, "webp");
  });

  await t.test("times out on a missing selector", async () => {
    await assert.rejects(
      engine.capture({
        url: `${base}/`,
        wait_for_selector: "#missing",
        timeout: 1500,
      }),
      (err: unknown) => {
        const error = err as { code?: string };
        assert.equal(error.code, "render_timeout");
        return true;
      },
    );
  });

  await t.test("blocks tracker requests and reports the count", async () => {
    const { data } = await engine.capture({ url: `${base}/tracker`, timeout: 15000 });
    assert.ok(data.blocked_requests >= 1, `blocked ${data.blocked_requests}`);
  });

  await t.test("classifies anti-bot challenges as blocked_by_target", async () => {
    await assert.rejects(
      engine.capture({ url: `${base}/challenge`, timeout: 15000 }),
      (err: unknown) => {
        const error = err as { code?: string; details?: { reason?: string } };
        assert.equal(error.code, "blocked_by_target");
        assert.equal(error.details?.reason, "challenge_detected");
        return true;
      },
    );
  });

  await t.test("classifies http 503 as target_error", async () => {
    await assert.rejects(
      engine.capture({ url: `${base}/error503`, timeout: 15000 }),
      (err: unknown) => {
        const error = err as { code?: string; details?: { status?: number } };
        assert.equal(error.code, "target_error");
        assert.equal(error.details?.status, 503);
        return true;
      },
    );
  });

  await t.test("classifies unreachable hosts as navigation_failed", async () => {
    await assert.rejects(
      engine.capture({ url: "http://127.0.0.1:1/", timeout: 8000 }),
      (err: unknown) => {
        const error = err as { code?: string };
        assert.equal(error.code, "navigation_failed");
        return true;
      },
    );
  });

  await t.test("applies the stealth fingerprint", async () => {
    const { data } = await stealthEngine.capture({
      url: `${base}/stealth`,
      custom_js:
        "if (navigator.webdriver === undefined) { var d = document.createElement('div'); d.id = 'stealth-ok'; d.textContent = 'ok'; document.body.appendChild(d); }",
      wait_for_selector: "#stealth-ok",
      timeout: 12000,
    });
    assert.equal(data.format, "webp");
  });

  await t.test("runs concurrent captures within the concurrency limit", async () => {
    const results = await Promise.all([
      engine.capture({ url: `${base}/`, timeout: 15000 }),
      engine.capture({ url: `${base}/`, timeout: 15000 }),
      engine.capture({ url: `${base}/`, timeout: 15000 }),
    ]);
    assert.equal(results.length, 3);
    for (const { data } of results) {
      assert.ok(data.bytes > 1000);
    }
    const health = await engine.health();
    assert.equal(health.in_flight, 0);
    assert.ok(health.browser);
    assert.equal(health.browser?.connected, true);
  });

  await engine.close();
  await stealthEngine.close();

  await t.test("standby pages preserve cookie, storage, viewport, and locale isolation", async () => {
    const isolated = createEngine({ stealth: false, maxConcurrentCaptures: 1, autoConcurrency: false });
    try {
      await isolated.capture({
        url: `${base}/`, timeout: 15000,
        custom_js: 'document.cookie = "private=first"; localStorage.setItem("private", "first");',
        selector: "#heading",
      });
      const clean = await isolated.capture({
        url: `${base}/`, timeout: 15000,
        custom_js: 'if (document.cookie || localStorage.getItem("private")) throw new Error("Capture state leaked");',
        selector: "#heading",
      });
      assert.ok(clean.buffer.length > 300);
      const changed = await isolated.capture({
        url: `${base}/`, timeout: 15000,
        viewport: { width: 640, height: 480 },
        locale: "fr-FR",
        user_agent: "Snapforge-quality-fixture",
        block_cookie_banners: false,
        custom_js: 'if (window.innerWidth !== 640 || navigator.language !== "fr-FR" || navigator.userAgent !== "Snapforge-quality-fixture") throw new Error("Capture options leaked");',
        selector: "#heading",
      });
      assert.ok(changed.buffer.length > 300);
    } finally {
      await isolated.close();
    }
  });

  await t.test("browser recycling discards standby pages and counts served contexts", async () => {
    const recycling = createEngine({ maxConcurrentCaptures: 1, autoConcurrency: false, recycleAfterContexts: 2 });
    try {
      for (let i = 0; i < 2; i++) {
        await recycling.capture({ url: `${base}/`, timeout: 15000, selector: "#heading" });
      }
      assert.equal((await recycling.health()).browser?.contexts_served, 2);
      await recycling.capture({ url: `${base}/`, timeout: 15000, selector: "#heading" });
      const health = await recycling.health();
      assert.equal(health.browser?.contexts_served, 1);
      assert.equal(health.pool.restarts, 1);
    } finally {
      await recycling.close();
    }
  });
});
