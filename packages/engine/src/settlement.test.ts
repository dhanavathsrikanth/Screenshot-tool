import test from "node:test";
import assert from "node:assert/strict";
import type { Page } from "playwright";
import type { CaptureOptions } from "@snapforge/contracts";
import {
  RequestIdleTracker,
  SettlementBudget,
  settlePreCapture,
  settleLoad,
  settleAfterScroll,
  waitForContent,
  waitForImages,
  waitForNetworkIdle,
  type SettleStats,
} from "./settlement.js";

test("SettlementBudget tracks remaining time and expiry", () => {
  const budget = new SettlementBudget(50);
  assert.ok(budget.remaining() > 40);
  assert.equal(budget.expired(), false);
});

test("SettlementBudget with zero budget is immediately expired", () => {
  const budget = new SettlementBudget(0);
  assert.equal(budget.remaining(), 0);
  assert.equal(budget.expired(), true);
});

test("RequestIdleTracker tracks inflight requests and idle time", async () => {
  const tracker = new RequestIdleTracker();
  assert.equal(tracker.activeRequests, 0);
  assert.ok(tracker.idleFor() >= 0);

  tracker.noteRequest();
  assert.equal(tracker.activeRequests, 1);
  tracker.noteDone();
  assert.equal(tracker.activeRequests, 0);

  tracker.noteRequest();
  tracker.noteRequest();
  assert.equal(tracker.activeRequests, 2);
  tracker.reset();
  assert.equal(tracker.activeRequests, 0);
});

test("waitForNetworkIdle returns idle when no requests are active", async () => {
  const tracker = new RequestIdleTracker();
  await sleepTiny(15);
  const result = await waitForNetworkIdle(tracker, {
    idleMs: 10,
    maxMs: 200,
    pollMs: 5,
  });
  assert.equal(result, "idle");
});

test("waitForNetworkIdle returns budget when requests never settle", async () => {
  const tracker = new RequestIdleTracker();
  tracker.noteRequest();
  const result = await waitForNetworkIdle(tracker, {
    idleMs: 20,
    maxMs: 70,
    pollMs: 5,
  });
  assert.equal(result, "budget");
  assert.equal(tracker.activeRequests, 1);
});

test("waitForNetworkIdle returns expired for a zero budget", async () => {
  const tracker = new RequestIdleTracker();
  const result = await waitForNetworkIdle(tracker, {
    idleMs: 10,
    maxMs: 0,
    pollMs: 5,
  });
  assert.equal(result, "expired");
});

test("waitForNetworkIdle notices completion within budget", async () => {
  const tracker = new RequestIdleTracker();
  tracker.noteRequest();
  setTimeout(() => tracker.noteDone(), 30);
  const result = await waitForNetworkIdle(tracker, {
    idleMs: 10,
    maxMs: 500,
    pollMs: 5,
  });
  assert.equal(result, "idle");
  assert.equal(tracker.activeRequests, 0);
});

function sleepTiny(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("waitForContent resolves once the body has enough text", async () => {
  let calls = 0;
  const page = {
    evaluate: async () => {
      calls += 1;
      return { text: calls >= 3 ? 500 : 10, imagesComplete: false };
    },
  } as unknown as Page;
  const ready = await waitForContent(page, { timeoutMs: 1_000, minChars: 400, pollMs: 5 });
  assert.equal(ready, true);
  assert.ok(calls >= 3);
});

test("waitForContent times out on empty pages", async () => {
  const page = { evaluate: async () => ({ text: 5, imagesComplete: false }) } as unknown as Page;
  const ready = await waitForContent(page, { timeoutMs: 60, minChars: 400, pollMs: 10 });
  assert.equal(ready, false);
});

test("waitForContent with a zero budget returns false immediately", async () => {
  const page = { evaluate: async () => ({ text: 10_000, imagesComplete: false }) } as unknown as Page;
  const ready = await waitForContent(page, { timeoutMs: 0, minChars: 400, pollMs: 10 });
  assert.equal(ready, false);
});

test("waitForContent accepts loaded images when allowImages is set", async () => {
  const imagePage = {
    evaluate: async () => ({ text: 5, imagesComplete: true }),
  } as unknown as Page;
  assert.equal(
    await waitForContent(imagePage, { timeoutMs: 100, minChars: 400, pollMs: 5, allowImages: true }),
    true,
  );
  assert.equal(
    await waitForContent(imagePage, { timeoutMs: 100, minChars: 400, pollMs: 5 }),
    false,
  );
});

test("automatic content guards accept short static pages but explicit content waits keep their threshold", async () => {
  let calls = 0;
  const page = { evaluate: async () => {
    calls += 1;
    return { text: 100, imagesComplete: false, staticReady: true };
  } } as unknown as Page;
  assert.equal(await waitForContent(page, { timeoutMs: 60, minChars: 400, pollMs: 5, allowStatic: true }), true);
  assert.equal(calls, 1);
  assert.equal(await waitForContent(page, { timeoutMs: 30, minChars: 400, pollMs: 5 }), false);
});

test("automatic content guards continue waiting for script-driven hydration", async () => {
  let calls = 0;
  const page = { evaluate: async () => {
    calls += 1;
    return { text: calls >= 3 ? 500 : 100, imagesComplete: false, staticReady: false };
  } } as unknown as Page;
  assert.equal(await waitForContent(page, { timeoutMs: 100, minChars: 400, pollMs: 5, allowStatic: true }), true);
  assert.equal(calls, 3);
});

test("waitForImages reports ready when there are no images", async () => {
  const page = { evaluate: async () => true } as unknown as Page;
  assert.equal(await waitForImages(page, 100), true);
});

test("waitForImages fails open when the page cannot be evaluated", async () => {
  const page = {
    evaluate: async () => {
      throw new Error("page destroyed");
    },
  } as unknown as Page;
  assert.equal(await waitForImages(page, 100), false);
});

function emptyStats(): SettleStats {
  return {
    selector_wait_ms: 0,
    font_wait_ms: 0,
    idle_wait_ms: 0,
    idle_status: "skipped",
    delay_ms: 0,
    content_wait_ms: 0,
  };
}

test("settlePreCapture resolves when content arrives", async () => {
  const page = { evaluate: async () => ({ text: 4_000, imagesComplete: false }) } as unknown as Page;
  const options = {
    wait_for_content: true,
    delay: 0,
  } as unknown as CaptureOptions;
  const stats = emptyStats();
  await settlePreCapture(page, options, new SettlementBudget(1_000), stats, 500);
  assert.ok(stats.content_wait_ms >= 0);
});

test("settlePreCapture throws a classified timeout when content never arrives", async () => {
  const page = { evaluate: async () => ({ text: 12, imagesComplete: false }) } as unknown as Page;
  const options = {
    wait_for_content: true,
    delay: 0,
  } as unknown as CaptureOptions;
  await assert.rejects(
    () => settlePreCapture(page, options, new SettlementBudget(1_000), emptyStats(), 60),
    /Timeout \d+ms exceeded\. waiting for content/,
  );
});

test("settlePreCapture auto-guards empty pages without throwing", async () => {
  const page = { evaluate: async () => ({ text: 0, imagesComplete: false }) } as unknown as Page;
  const options = { delay: 0 } as unknown as CaptureOptions;
  const stats = emptyStats();
  await settlePreCapture(page, options, new SettlementBudget(1_000), stats, 60);
  assert.ok(stats.content_wait_ms >= 0);
});

test("settlePreCapture skips the auto-guard for selector captures", async () => {
  const page = { evaluate: async () => ({ text: 0, imagesComplete: false }) } as unknown as Page;
  const options = { selector: "#widget", delay: 0 } as unknown as CaptureOptions;
  const stats = emptyStats();
  await settlePreCapture(page, options, new SettlementBudget(1_000), stats, 60);
  assert.equal(stats.content_wait_ms, 0);
});

test("font and network waits overlap without lowering their budgets", async () => {
  const tracker = new RequestIdleTracker();
  tracker.noteRequest();
  let fontsPending = false;
  let observedOverlap = false;
  const page = { evaluate: async () => {
    fontsPending = true;
    await sleepTiny(35);
    fontsPending = false;
    return true;
  } } as unknown as Page;
  const active = Object.getOwnPropertyDescriptor(RequestIdleTracker.prototype, "activeRequests")!.get!;
  Object.defineProperty(tracker, "activeRequests", { get: () => {
    if (fontsPending) observedOverlap = true;
    return active.call(tracker);
  } });
  const stats = await settleLoad(page, { wait_for_idle: true } as CaptureOptions, new SettlementBudget(500), {
    fontWaitMs: 100, idlePhaseMs: 60, idleIntervalMs: 5, idleWindowMs: 10,
  }, tracker);
  assert.equal(observedOverlap, true);
  assert.equal(stats.idle_status, "budget");
  assert.ok(stats.font_wait_ms >= 30);
  assert.ok(stats.idle_wait_ms >= 55);
});

test("network activity that begins after idle while fonts load is settled again", async () => {
  const tracker = new RequestIdleTracker();
  const page = { evaluate: async () => {
    await sleepTiny(30);
    tracker.noteRequest();
    setTimeout(() => tracker.noteDone(), 30);
    return true;
  } } as unknown as Page;
  const stats = await settleLoad(page, { wait_for_idle: true } as CaptureOptions, new SettlementBudget(500), {
    fontWaitMs: 100, idlePhaseMs: 100, idleIntervalMs: 5, idleWindowMs: 10,
  }, tracker);
  assert.equal(stats.idle_status, "idle");
  assert.equal(tracker.activeRequests, 0);
  assert.ok(tracker.idleFor() >= 10);
});

test("post-scroll settlement rechecks images added during the network wait", async () => {
  const tracker = new RequestIdleTracker();
  tracker.noteRequest();
  setTimeout(() => tracker.noteDone(), 25);
  let checks = 0;
  const page = { evaluate: async () => {
    checks += 1;
    return checks > 1;
  } } as unknown as Page;
  const result = await settleAfterScroll(page, new SettlementBudget(500), {
    fontWaitMs: 100, idlePhaseMs: 100, idleIntervalMs: 5, idleWindowMs: 10,
  }, tracker);
  assert.equal(result.idle, "idle");
  assert.equal(result.images_ready, true);
  assert.equal(checks, 2);
});
