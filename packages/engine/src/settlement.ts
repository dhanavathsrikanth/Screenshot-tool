import type { Page } from "playwright";
import type { CaptureOptions } from "@snapforge/contracts";
import { sleep } from "./util.js";
import { readContentState } from "./readiness.js";

export class SettlementBudget {
  private readonly deadline: number;

  constructor(totalMs: number) {
    this.deadline = Date.now() + Math.max(0, totalMs);
  }

  remaining(): number {
    return Math.max(0, this.deadline - Date.now());
  }

  expired(): boolean {
    return this.remaining() <= 0;
  }
}

export class RequestIdleTracker {
  private inflight = 0;
  private lastActivity = Date.now();

  get activeRequests(): number {
    return this.inflight;
  }

  idleFor(now = Date.now()): number {
    return Math.max(0, now - this.lastActivity);
  }

  noteRequest(): void {
    this.inflight += 1;
    this.lastActivity = Date.now();
  }

  noteDone(): void {
    this.inflight = Math.max(0, this.inflight - 1);
    this.lastActivity = Date.now();
  }

  reset(): void {
    this.inflight = 0;
    this.lastActivity = Date.now();
  }

  attach(page: Page): () => void {
    const onStart = () => this.noteRequest();
    const onDone = () => this.noteDone();
    page.on("request", onStart);
    page.on("requestfinished", onDone);
    page.on("requestfailed", onDone);
    return () => {
      page.off("request", onStart);
      page.off("requestfinished", onDone);
      page.off("requestfailed", onDone);
    };
  }
}

export interface NetworkIdleOptions {
  idleMs: number;
  maxMs: number;
  pollMs: number;
}

export type NetworkIdleResult = "idle" | "budget" | "expired";

export async function waitForNetworkIdle(
  tracker: RequestIdleTracker,
  options: NetworkIdleOptions,
): Promise<NetworkIdleResult> {
  if (options.maxMs <= 0) return "expired";
  const deadline = Date.now() + options.maxMs;
  const settled = () =>
    tracker.activeRequests === 0 && tracker.idleFor() >= options.idleMs;
  while (Date.now() < deadline) {
    if (settled()) return "idle";
    const left = deadline - Date.now();
    if (left <= 0) break;
    await sleep(Math.min(options.pollMs, left));
  }
  return settled() ? "idle" : "budget";
}

export async function waitForFonts(page: Page, maxMs: number): Promise<boolean> {
  if (maxMs <= 0) return false;
  try {
    const ready = await page.evaluate((timeout) => {
      const fontsReady = document.fonts ? document.fonts.ready : Promise.resolve();
      const guard = new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => resolve(false), timeout);
        if (typeof timer === "object" && timer !== null && "unref" in timer) {
          (timer as unknown as { unref: () => void }).unref();
        }
      });
      return Promise.race([
        fontsReady.then(() => true),
        guard,
      ]);
    }, maxMs);
    return ready === true;
  } catch {
    return false;
  }
}

export interface SettleStats {
  selector_wait_ms: number;
  font_wait_ms: number;
  idle_wait_ms: number;
  idle_status: NetworkIdleResult | "skipped";
  delay_ms: number;
  content_wait_ms: number;
}

export interface SettleDeps {
  fontWaitMs: number;
  idlePhaseMs: number;
  idleIntervalMs: number;
  idleWindowMs: number;
}

export async function settleLoad(
  page: Page,
  options: CaptureOptions,
  budget: SettlementBudget,
  deps: SettleDeps,
  tracker: RequestIdleTracker,
): Promise<SettleStats> {
  const stats: SettleStats = {
    selector_wait_ms: 0,
    font_wait_ms: 0,
    idle_wait_ms: 0,
    idle_status: "skipped",
    delay_ms: 0,
    content_wait_ms: 0,
  };

  const shouldWaitIdle = options.wait_for_idle || options.wait_until === "networkidle";
  await Promise.all([
    (async () => {
      const fontStart = Date.now();
      await waitForFonts(page, Math.min(deps.fontWaitMs, budget.remaining()));
      stats.font_wait_ms = Date.now() - fontStart;
    })(),
    (async () => {
      if (!shouldWaitIdle || budget.expired()) return;
      const idleStart = Date.now();
      stats.idle_status = await waitForNetworkIdle(tracker, {
        idleMs: deps.idleWindowMs,
        maxMs: Math.min(deps.idlePhaseMs, budget.remaining()),
        pollMs: deps.idleIntervalMs,
      });
      stats.idle_wait_ms = Date.now() - idleStart;
    })(),
  ]);
  if (stats.idle_status === "idle" && (tracker.activeRequests > 0 || tracker.idleFor() < deps.idleWindowMs)) {
    const idleStart = Date.now();
    stats.idle_status = await waitForNetworkIdle(tracker, {
      idleMs: deps.idleWindowMs,
      maxMs: Math.min(deps.idlePhaseMs, budget.remaining()),
      pollMs: deps.idleIntervalMs,
    });
    stats.idle_wait_ms += Date.now() - idleStart;
  }

  return stats;
}

export async function waitForImages(page: Page, maxMs: number): Promise<boolean> {
  if (maxMs <= 0) return false;
  try {
    return await page.evaluate((timeout) => {
      const images = Array.from(document.images);
      if (images.length === 0) return true;
      if (images.every((image) => image.complete)) return true;
      return new Promise<boolean>((resolve) => {
        let pending = images.filter((image) => !image.complete).length;
        const finish = () => resolve(images.every((image) => image.complete));
        const timer = setTimeout(finish, timeout);
        for (const image of images) {
          if (image.complete) continue;
          const hit = () => {
            pending -= 1;
            if (pending <= 0) {
              clearTimeout(timer);
              finish();
            }
          };
          image.addEventListener("load", hit, { once: true });
          image.addEventListener("error", hit, { once: true });
        }
      });
    }, maxMs);
  } catch {
    return false;
  }
}

/**
 * Settle the page after a full-page scroll pass: wait for network idle so
 * requests triggered by scrolling finish, then for images to finish decoding.
 * Captures proceed either way — a not-ready result only means the screenshot
 * may contain placeholders.
 */
export async function settleAfterScroll(
  page: Page,
  budget: SettlementBudget,
  deps: SettleDeps,
  tracker: RequestIdleTracker,
): Promise<{ idle: NetworkIdleResult | "skipped"; images_ready: boolean }> {
  let [idle, images_ready] = await Promise.all([
    budget.expired() ? Promise.resolve("skipped" as const) : waitForNetworkIdle(tracker, {
      idleMs: deps.idleWindowMs,
      maxMs: Math.min(deps.idlePhaseMs, budget.remaining()),
      pollMs: deps.idleIntervalMs,
    }),
    waitForImages(page, Math.min(2_000, budget.remaining())),
  ]);
  if (idle === "idle" && (tracker.activeRequests > 0 || tracker.idleFor() < deps.idleWindowMs)) {
    idle = await waitForNetworkIdle(tracker, {
      idleMs: deps.idleWindowMs,
      maxMs: Math.min(deps.idlePhaseMs, budget.remaining()),
      pollMs: deps.idleIntervalMs,
    });
  }
  images_ready = await waitForImages(page, Math.min(2_000, budget.remaining()));
  return { idle, images_ready };
}

export interface ContentWaitOptions {
  timeoutMs: number;
  minChars: number;
  pollMs: number;
  allowImages?: boolean;
  allowStatic?: boolean;
}

/**
 * Wait until the page body carries at least `minChars` of text — a generic
 * "the SPA finished hydrating" signal for pages whose readiness cannot be
 * expressed as a selector. With `allowImages`, a fully-loaded image set also
 * counts as ready (textless image pages never wait). Returns false when the
 * budget runs out first.
 */
export async function waitForContent(
  page: Page,
  options: ContentWaitOptions,
): Promise<boolean> {
  if (options.timeoutMs <= 0) return false;
  const deadline = Date.now() + options.timeoutMs;
  const check = async (): Promise<boolean> => {
    const state = await page
      .evaluate(readContentState)
      .catch(() => null);
    if (!state) return false;
    if (state.text >= options.minChars) return true;
    if (options.allowStatic && state.staticReady) return true;
    return Boolean(options.allowImages) && state.imagesComplete;
  };
  while (Date.now() < deadline) {
    if (await check()) return true;
    await sleep(Math.min(options.pollMs, deadline - Date.now()));
  }
  return check();
}

export async function settlePreCapture(
  page: Page,
  options: CaptureOptions,
  budget: SettlementBudget,
  stats: SettleStats,
  contentWaitMs: number,
): Promise<void> {
  if (options.wait_for_selector) {
    const selectorStart = Date.now();
    const timeout = Math.max(250, budget.remaining());
    try {
      await page.waitForSelector(options.wait_for_selector, {
        timeout,
        state: "visible",
      });
    } catch {
      throw new Error(
        `Timeout ${timeout}ms exceeded. waiting for selector "${options.wait_for_selector}"`,
      );
    }
    stats.selector_wait_ms = Date.now() - selectorStart;
  }

  if (options.wait_for_content) {
    const timeout = Math.min(contentWaitMs, Math.max(250, budget.remaining()));
    const contentStart = Date.now();
    const ready = await waitForContent(page, {
      timeoutMs: timeout,
      minChars: 400,
      pollMs: 250,
    });
    stats.content_wait_ms = Date.now() - contentStart;
    if (!ready) {
      throw new Error(
        `Timeout ${timeout}ms exceeded. waiting for content (at least 400 characters)`,
      );
    }
  } else if (!options.selector) {
    const timeout = Math.min(contentWaitMs, Math.max(250, budget.remaining()));
    const contentStart = Date.now();
    await waitForContent(page, {
      timeoutMs: timeout,
      minChars: 400,
      pollMs: 250,
      allowImages: true,
      allowStatic: !options.custom_js,
    });
    stats.content_wait_ms = Date.now() - contentStart;
  }

  if (options.delay > 0) {
    const delay = Math.min(options.delay, budget.remaining());
    if (delay > 0) {
      const delayStart = Date.now();
      await sleep(delay);
      stats.delay_ms = Date.now() - delayStart;
    }
  }
}
