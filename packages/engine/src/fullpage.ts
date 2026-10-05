import type { Page } from "playwright";
import { sleep } from "./util.js";
import { readContentState } from "./readiness.js";

export function computeScrollStep(viewportHeight: number, stepFactor = 0.85): number {
  const factor = Math.min(1, Math.max(0.2, stepFactor));
  return Math.max(120, Math.floor(viewportHeight * factor));
}

export function nextScrollTarget(
  currentY: number,
  step: number,
  pageHeight: number,
  viewportHeight: number,
  maxHeight: number,
): number | null {
  const bottomLimit = Math.min(pageHeight, maxHeight) - viewportHeight;
  if (bottomLimit <= 0) return null;
  const target = Math.min(currentY + step, bottomLimit);
  if (target <= currentY + 1) return null;
  return target;
}

export function isConverged(
  heightHistory: number[],
  stableRuns = 3,
  tolerance = 4,
): boolean {
  if (heightHistory.length < stableRuns + 1) return false;
  const recent = heightHistory.slice(-(stableRuns + 1));
  for (let i = 1; i < recent.length; i++) {
    if (Math.abs(recent[i] - recent[i - 1]) > tolerance) return false;
  }
  return true;
}

export interface PinRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function pinFixedProperties(
  rect: PinRect,
  scrollX: number,
  scrollY: number,
): Record<string, string> {
  return {
    position: "absolute",
    top: `${Math.round(rect.top + scrollY)}px`,
    left: `${Math.round(rect.left + scrollX)}px`,
    width: `${Math.round(rect.width)}px`,
    height: `${Math.round(rect.height)}px`,
    margin: "0px",
    right: "auto",
    bottom: "auto",
    "box-sizing": "border-box",
  };
}

export function buildPinFixedSource(maxCount: number): string {
  return `(() => {
  const MAX = ${maxCount};
  const out = [];
  const seen = new Set();
  const queue = [document];
  let qi = 0;
  while (qi < queue.length) {
    const node = queue[qi++];
    if (!node || typeof node.querySelectorAll !== "function") continue;
    const kids = node.querySelectorAll("*");
    for (const k of kids) {
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(k);
      if (k.shadowRoot) queue.push(k.shadowRoot);
      if (out.length >= 12000) { qi = queue.length; break; }
    }
  }
  let pinned = 0;
  const sx = window.scrollX;
  const sy = window.scrollY;
  for (const el of out) {
    if (pinned >= MAX) break;
    if (!el.isConnected) continue;
    if (el.getAttribute("data-sf-pinned") !== null) continue;
    let pos = "";
    try { pos = window.getComputedStyle(el).position; } catch (e) { continue; }
    if (pos !== "fixed") continue;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;
    el.setAttribute("data-sf-pinned", el.style.cssText || "");
    const props = {
      position: "absolute",
      top: Math.round(r.top + sy) + "px",
      left: Math.round(r.left + sx) + "px",
      width: Math.round(r.width) + "px",
      height: Math.round(r.height) + "px",
      margin: "0px",
      right: "auto",
      bottom: "auto",
      "box-sizing": "border-box",
    };
    for (const key of Object.keys(props)) {
      el.style.setProperty(key, props[key], "important");
    }
    pinned++;
  }
  return pinned;
})()`;
}

/**
 * Wait until the document grows beyond the viewport. Layouts that hydrate
 * late (lazy grids) report a viewport-sized document until their content
 * arrives; scrolling before that produces a one-screen "full page".
 * Returns true once the document is scrollable.
 */
export async function waitForScrollGrowth(
  page: Page,
  timeoutMs: number,
  pollMs = 250,
  allowStatic = true,
): Promise<boolean> {
  if (timeoutMs <= 0) return false;
  const deadline = Date.now() + timeoutMs;
  const state = () => page.evaluate(readContentState).catch(() => null);
  while (Date.now() < deadline) {
    const current = await state();
    if (current?.scrollable) return true;
    if (allowStatic && current?.staticReady) return false;
    await sleep(Math.min(pollMs, deadline - Date.now()));
  }
  return Boolean((await state())?.scrollable);
}

export interface ScrollConfig {
  maxPageHeight: number;
  maxScrollSteps: number;
  scrollSettleMs: number;
  timeoutMs: number;
  allowStatic?: boolean;
}

export type ScrollStopReason = "bottom" | "max_height" | "max_steps" | "no_scroll";

export interface ScrollStats {
  steps: number;
  final_height: number;
  stopped_reason: ScrollStopReason;
}

async function hydrateViewportMedia(page: Page, perImageTimeoutMs: number): Promise<void> {
  try {
    await page.evaluate(async (timeout) => {
      const targets: Element[] = [];
      const nodes = document.querySelectorAll(
        'img[loading="lazy"], iframe[loading="lazy"], source[loading="lazy"]',
      );
      for (const el of Array.from(nodes)) {
        const r = el.getBoundingClientRect();
        if (r.bottom < -300 || r.top > window.innerHeight + 300) continue;
        targets.push(el);
      }
      for (const el of targets) {
        const anyEl = el as HTMLImageElement & { loading?: string; dataset?: DOMStringMap };
        if ("loading" in anyEl) anyEl.loading = "eager";
        const data = anyEl.dataset;
        if (data) {
          if (data.src && !el.getAttribute("src")) el.setAttribute("src", data.src);
          if (data.srcset && !el.getAttribute("srcset")) el.setAttribute("srcset", data.srcset);
          if (data.lazySrc) el.setAttribute("src", data.lazySrc);
          if (data.lazySrcset) el.setAttribute("srcset", data.lazySrcset);
        }
      }
      const pending = targets
        .filter((el) => {
          const img = el as HTMLImageElement;
          return img.complete === false && Boolean(img.currentSrc || img.src);
        })
        .map(
          (el) =>
            new Promise<void>((resolve) => {
              const img = el as HTMLImageElement;
              const done = () => resolve();
              img.addEventListener("load", done, { once: true });
              img.addEventListener("error", done, { once: true });
              setTimeout(done, timeout);
            }),
        );
      await Promise.all(pending);
    }, perImageTimeoutMs);
  } catch {
    return;
  }
}

export async function scrollThrough(page: Page, config: ScrollConfig): Promise<ScrollStats> {
  const deadline = Date.now() + Math.max(1000, config.timeoutMs);
  const staticReady = config.allowStatic && await page.evaluate(readContentState).then((state) => state.staticReady).catch(() => false);
  const settleMs = staticReady ? 0 : config.scrollSettleMs;

  const metrics = () =>
    page.evaluate(() => ({
      y: window.scrollY,
      height: document.documentElement.scrollHeight,
      viewportHeight: window.innerHeight,
    }));

  let current = await metrics();
  const history: number[] = [current.height];
  let steps = 0;
  let stopped: ScrollStopReason | null = null;

  const bottomLimit = Math.min(current.height, config.maxPageHeight) - current.viewportHeight;
  if (bottomLimit <= 0) {
    return { steps: 0, final_height: current.height, stopped_reason: "no_scroll" };
  }

  const step = computeScrollStep(current.viewportHeight);

  while (steps < config.maxScrollSteps && Date.now() < deadline) {
    const target = nextScrollTarget(
      current.y,
      step,
      current.height,
      current.viewportHeight,
      config.maxPageHeight,
    );
    if (target === null) {
      stopped = current.height > config.maxPageHeight ? "max_height" : "bottom";
      break;
    }

    await page.evaluate((t) => window.scrollTo(0, t), target);
    await page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
    );
    if (settleMs > 0) await sleep(settleMs);
    await hydrateViewportMedia(page, 1200);

    current = await metrics();
    history.push(current.height);
    steps += 1;

    if (current.height > config.maxPageHeight && current.y >= config.maxPageHeight - current.viewportHeight) {
      stopped = "max_height";
      break;
    }
    if (target >= Math.min(current.height, config.maxPageHeight) - current.viewportHeight - 1) {
      stopped = current.height > config.maxPageHeight ? "max_height" : "bottom";
      break;
    }
    if (isConverged(history) && current.y >= current.height - current.viewportHeight - 4) {
      stopped = "bottom";
      break;
    }
  }

  if (stopped === null) stopped = steps >= config.maxScrollSteps ? "max_steps" : "bottom";

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  );
  if (settleMs > 0) await sleep(Math.min(80, settleMs));

  return {
    steps,
    final_height: Math.min(current.height, config.maxPageHeight),
    stopped_reason: stopped,
  };
}

export interface FullPageConfig extends ScrollConfig {
  maxPinnedElements: number;
}

export async function prepareFullPageCapture(
  page: Page,
  config: FullPageConfig,
): Promise<{ scroll: ScrollStats; pinned: number }> {
  const scroll = await scrollThrough(page, config);
  let pinned = 0;
  try {
    pinned = await page.evaluate(buildPinFixedSource(config.maxPinnedElements));
  } catch {
    pinned = 0;
  }
  return { scroll, pinned };
}
