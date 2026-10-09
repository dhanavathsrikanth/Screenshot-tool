import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { chromium } from "playwright";
import { createEngine } from "./engine.js";
import { installNetworkGuard } from "./network.js";
import { readQualityState } from "./quality.js";
import { SnapforgeError } from "@snapforge/contracts";
import { InProcessCaptureCache } from "./cache.js";

test("runtime quality and standalone proxy integration", { timeout: 120_000 }, async (t) => {
  const ready = "<main><h1>Ready report</h1><p>Complete capture content for the quality fixture.</p></main>";
  const footer = `<footer>${"Navigation links. ".repeat(50)}</footer>`;
  let proxyRequests = 0;
  const server = http.createServer((request, response) => {
    response.writeHead(200, { "content-type": "text/html", "cache-control": "no-store" });
    let body = ready;
    if (request.url === "/shell") body = `<main><div role="status">Loading...</div>${footer}</main>`;
    if (request.url === "/delayed") body = `<main><div role="status">Loading...</div>${footer}</main><script>setTimeout(() => document.querySelector('main').outerHTML = ${JSON.stringify(ready)}, 900)</script>`;
    if (request.url === "/legitimate") body = '<main><h1>Report ready</h1><p>Loading data is described here as part of the documentation.</p><div role="progressbar" style="display:none">Loading</div></main>';
    if (request.url?.startsWith("http://proxy-fixture.invalid")) proxyRequests++;
    response.end(`<!doctype html><html><head><title>Quality fixture</title></head><body>${body}</body></html>`);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const cache = new InProcessCaptureCache();
  const engine = createEngine({ stealth: false, maxConcurrentCaptures: 1, autoConcurrency: false, contentWaitMs: 1200 }, cache);
  t.after(async () => { await engine.close(); await new Promise<void>((resolve) => server.close(() => resolve())); });

  await t.test("navigation/footer text cannot make a loading shell successful or cached", async () => {
    await assert.rejects(engine.capture({ url: `${base}/shell`, timeout: 10_000, fail_if_incomplete: true }), (error: unknown) => {
      assert.ok(error instanceof SnapforgeError);
      assert.equal(error.code, "render_incomplete");
      assert.deepEqual(error.details?.failures, ["loading_shell"]);
      return true;
    });
    assert.equal(cache.size, 0);
  });
  await t.test("late hydration is recovered before delivery", async () => {
    const outcome = await engine.capture({ url: `${base}/delayed`, timeout: 10_000, fail_if_content_missing: ["Ready report"] }, { inspectPage: true });
    assert.match(outcome.inspection?.markdown ?? "", /Ready report/);
  });
  await t.test("completed pages with loading-related prose remain valid", async () => {
    const outcome = await engine.capture({ url: `${base}/legitimate`, timeout: 10_000 });
    assert.ok(outcome.data.bytes > 1000);
  });
  await t.test("explicit output requirements fail before cache saving", async () => {
    const before = cache.size;
    await assert.rejects(engine.capture({ url: `${base}/`, timeout: 10_000, min_capture_height: 4000 }), (error: unknown) => error instanceof SnapforgeError && error.code === "render_incomplete");
    assert.equal(cache.size, before);
  });
  await t.test("standalone proxy carries actual browser traffic without a region", async () => {
    const outcome = await engine.capture({ url: "http://proxy-fixture.invalid/", timeout: 10_000, proxy: { server: base }, cache_ttl: 0 });
    assert.ok(outcome.data.bytes > 1000);
    assert.ok(proxyRequests > 0);
  });
  await t.test("caller can explicitly capture a loading state", async () => {
    const outcome = await engine.capture({ url: `${base}/shell`, timeout: 10_000, fail_if_incomplete: false });
    assert.ok(outcome.data.bytes > 1000);
  });
});

test("public worker network policy checks redirect destinations", { timeout: 60_000 }, async (t) => {
  let privateHits = 0;
  const server = http.createServer((request, response) => {
    if (request.url === "/private-redirect") {
      response.writeHead(302, { location: `http://127.0.0.1:${(server.address() as AddressInfo).port}/private` });
      response.end();
    } else if (request.url === "/public-redirect") {
      response.writeHead(302, { location: "/ready" });
      response.end();
    } else {
      if (request.url === "/private") privateHits++;
      response.end("<h1>Complete public report</h1>");
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ headless: true, args: ["--host-resolver-rules=MAP public.example 127.0.0.1", "--no-proxy-server"] });
  t.after(async () => { await browser.close(); await new Promise<void>((resolve) => server.close(() => resolve())); });
  const context = await browser.newContext({ serviceWorkers: "block" });
  const page = await context.newPage();
  await installNetworkGuard(context, page, "redirect", async () => [{ address: "8.8.8.8" }]);
  const base = `http://public.example:${(server.address() as AddressInfo).port}`;
  await assert.rejects(page.goto(`${base}/private-redirect`));
  assert.equal(privateHits, 0);
  const publicContext = await browser.newContext({ serviceWorkers: "block" });
  const publicPage = await publicContext.newPage();
  await installNetworkGuard(publicContext, publicPage, "public-redirect", async () => [{ address: "8.8.8.8" }]);
  await publicPage.goto(`${base}/public-redirect`);
  assert.match(publicPage.url(), /\/ready$/);
  assert.equal((await publicPage.evaluate(readQualityState, undefined)).loadingShell, false);
});
