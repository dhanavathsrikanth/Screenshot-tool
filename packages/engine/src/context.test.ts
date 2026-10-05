import test from "node:test";
import assert from "node:assert/strict";
import type { Browser } from "playwright";
import { captureOptionsSchema } from "@snapforge/contracts";
import { contextOptionsFor, createSession, resolveViewport } from "./context.js";
import { resolveRegion } from "./region.js";
import { resolveConfig } from "./types.js";

test("a standalone authenticated proxy is applied without requesting a region", () => {
  const options = captureOptionsSchema.parse({ url: "https://example.com", proxy: {
    server: "http://proxy.example.com:8080", username: "fixture", password: "fixture-password", bypass: "*.example.org",
  } });
  const context = contextOptionsFor(options, resolveViewport(options, "proxy"), "fixture", resolveRegion(options, "proxy"));
  assert.deepEqual(context.proxy, options.proxy);
  assert.equal(context.locale, undefined);
});

test("proxy and region emulation can be configured together", () => {
  const options = captureOptionsSchema.parse({ url: "https://example.com", region: "jp", proxy: { server: "http://proxy.example.com:8080" } });
  const context = contextOptionsFor(options, resolveViewport(options, "proxy"), "fixture", resolveRegion(options, "proxy"));
  assert.deepEqual(context.proxy, options.proxy);
  assert.equal(context.locale, "ja-JP");
});

test("failed network-guard initialization closes its context with a bounded wait", async (t) => {
  for (const stuck of [false, true]) {
    await t.test(stuck ? "context closure times out" : "context closure succeeds", async () => {
      let closed = 0;
      const failure = new Error("Network guard unavailable");
      const context = {
        setDefaultTimeout() {},
        setDefaultNavigationTimeout() {},
        async newPage() { return {}; },
        async route() { throw failure; },
        async close() {
          closed++;
          if (stuck) await new Promise<void>(() => {});
        },
      };
      const browser = { newContext: async () => context } as unknown as Browser;
      const options = captureOptionsSchema.parse({ url: "https://example.com", block_ads: false, block_trackers: false, block_cookie_banners: false });
      await assert.rejects(createSession(browser, options, resolveViewport(options, "guard"), "fixture", resolveConfig({
        stealth: false, allowPrivateNetwork: false, closeTimeoutMs: 20,
      }), null), (error: unknown) => error === failure);
      assert.equal(closed, 1);
    });
  }
});
