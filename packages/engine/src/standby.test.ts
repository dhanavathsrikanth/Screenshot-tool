import test from "node:test";
import assert from "node:assert/strict";
import type { Browser, BrowserContext, Page } from "playwright";
import { FreshPageStandby } from "./standby.js";
import { CaptureTimer } from "./timings.js";

function fixture() {
  const contexts: { closed: boolean; pageClosed: boolean; options: unknown }[] = [];
  let failPage = false;
  const browser = {
    isConnected: () => true,
    newContext: async (options: unknown) => {
      const record = { closed: false, pageClosed: false, options };
      contexts.push(record);
      return {
        newPage: async () => {
          if (failPage) {
            failPage = false;
            throw new Error("Renderer crashed");
          }
          return { isClosed: () => record.pageClosed } as Page;
        },
        close: async () => { record.closed = true; record.pageClosed = true; },
      } as unknown as BrowserContext;
    },
  } as unknown as Browser;
  return { browser, contexts, failNextPage: () => { failPage = true; } };
}

test("standby provides fresh contexts and keeps only one prepared page", async () => {
  const { browser, contexts } = fixture();
  const standby = new FreshPageStandby();
  const first = await standby.take(browser, {}, new CaptureTimer());
  standby.prepare(browser, {});
  standby.prepare(browser, {});
  const second = await standby.take(browser, {}, new CaptureTimer());
  assert.notEqual(second.context, first.context);
  assert.notEqual(second.page, first.page);
  assert.equal(contexts.length, 2);
  await first.context.close();
  assert.equal(second.page.isClosed(), false);
  await second.context.close();
  await standby.close();
});

test("changed capture settings discard the unused context", async () => {
  const { browser, contexts } = fixture();
  const standby = new FreshPageStandby();
  standby.prepare(browser, { locale: "en-US", extraHTTPHeaders: { Authorization: "first" } });
  const next = await standby.take(browser, { locale: "fr-FR", extraHTTPHeaders: { Authorization: "second" } }, new CaptureTimer());
  assert.equal(contexts[0].closed, true);
  assert.deepEqual(contexts[1].options, { locale: "fr-FR", extraHTTPHeaders: { Authorization: "second" } });
  await next.context.close();
  await standby.close();
});

test("a recycled browser never receives a page from its predecessor", async () => {
  const first = fixture();
  const second = fixture();
  const standby = new FreshPageStandby();
  standby.prepare(first.browser, {});
  const next = await standby.take(second.browser, {}, new CaptureTimer());
  assert.equal(first.contexts[0].closed, true);
  assert.equal(second.contexts.length, 1);
  await next.context.close();
  await standby.close();
});

test("failed background preparation closes its context and falls back safely", async () => {
  const { browser, contexts, failNextPage } = fixture();
  const standby = new FreshPageStandby();
  failNextPage();
  standby.prepare(browser, {});
  const next = await standby.take(browser, {}, new CaptureTimer());
  assert.equal(contexts[0].closed, true);
  assert.equal(contexts.length, 2);
  await next.context.close();
  await standby.close();
});

test("shutdown waits for preparation and prevents creating more pages", async () => {
  const { browser, contexts } = fixture();
  const standby = new FreshPageStandby();
  standby.prepare(browser, {});
  await standby.close();
  assert.equal(contexts[0].closed, true);
  standby.prepare(browser, {});
  assert.equal(contexts.length, 1);
  await assert.rejects(standby.take(browser, {}, new CaptureTimer()), /closed/);
});

test("closed prepared pages are discarded instead of being handed to callers", async () => {
  const { browser, contexts } = fixture();
  const standby = new FreshPageStandby();
  standby.prepare(browser, {});
  await Promise.resolve();
  contexts[0].pageClosed = true;
  const next = await standby.take(browser, {}, new CaptureTimer());
  assert.equal(contexts[0].closed, true);
  assert.equal(next.page.isClosed(), false);
  await next.context.close();
  await standby.close();
});

test("memory pressure disables speculation while fresh capture pages remain available", async () => {
  const { browser, contexts } = fixture();
  let enoughMemory = false;
  const standby = new FreshPageStandby(() => enoughMemory);
  standby.prepare(browser, {});
  assert.equal(contexts.length, 0);
  const fresh = await standby.take(browser, {}, new CaptureTimer());
  assert.equal(contexts.length, 1);
  enoughMemory = true;
  standby.prepare(browser, {});
  await Promise.resolve();
  assert.equal(contexts.length, 2);
  await fresh.context.close();
  await standby.close();
  assert.equal(contexts[1].closed, true);
});

test("startup reserves its first page even when spare memory disables background preparation", async () => {
  const { browser, contexts } = fixture();
  const standby = new FreshPageStandby(() => false);
  await standby.prime(browser, {});
  const fresh = await standby.take(browser, {}, new CaptureTimer());
  assert.equal(contexts.length, 1);
  standby.prepare(browser, {});
  assert.equal(contexts.length, 1);
  await fresh.context.close();
  await standby.close();
});

test("changed options cancel page creation without waiting for its startup", async () => {
  let release: (() => void) | undefined;
  let closed = false;
  const blocked = new Promise<void>((resolve) => { release = resolve; });
  const context = {
    newPage: async () => {
      await blocked;
      throw new Error("Context closed during startup");
    },
    close: async () => { closed = true; release!(); },
  } as unknown as BrowserContext;
  const next = fixture();
  let calls = 0;
  const browser = {
    isConnected: () => true,
    newContext: async (options: unknown) => {
      calls += 1;
      return calls === 1 ? context : next.browser.newContext(options as never);
    },
  } as unknown as Browser;
  const standby = new FreshPageStandby();
  standby.prepare(browser, { locale: "en-US" });
  await Promise.resolve();
  const fresh = await standby.take(browser, { locale: "fr-FR" }, new CaptureTimer());
  assert.equal(closed, true);
  assert.equal(fresh.page.isClosed(), false);
  await fresh.context.close();
  await standby.close();
});

test("unresponsive renderer startup times out and attempts context cleanup", async () => {
  let closed = false;
  const browser = {
    newContext: async () => ({
      newPage: async () => new Promise<never>(() => {}),
      close: async () => { closed = true; },
    }),
  } as unknown as Browser;
  const standby = new FreshPageStandby(() => true, 20, 10);
  await assert.rejects(standby.take(browser, {}, new CaptureTimer()), /Timeout 20ms/);
  assert.equal(closed, true);
  await standby.close();
});

test("shutdown cancels pending startup even when the renderer and close never respond", async () => {
  const browser = {
    isConnected: () => true,
    newContext: async () => ({
      newPage: async () => new Promise<never>(() => {}),
      close: async () => new Promise<never>(() => {}),
    }),
  } as unknown as Browser;
  const standby = new FreshPageStandby(() => true, 60_000, 10);
  standby.prepare(browser, {});
  await Promise.resolve();
  await standby.close();
  await assert.rejects(standby.take(browser, {}, new CaptureTimer()), /closed/);
});

test("a context arriving after a startup timeout is closed rather than leaked", async () => {
  let resolveContext: ((context: BrowserContext) => void) | undefined;
  let closed = false;
  const opening = new Promise<BrowserContext>((resolve) => { resolveContext = resolve; });
  const browser = { newContext: async () => opening } as unknown as Browser;
  const standby = new FreshPageStandby(() => true, 10, 10);
  await assert.rejects(standby.take(browser, {}, new CaptureTimer()), /Timeout 10ms/);
  resolveContext!({ close: async () => { closed = true; } } as unknown as BrowserContext);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(closed, true);
  await standby.close();
});
