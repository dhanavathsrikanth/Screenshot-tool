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
  scrollBy?: number;
  onViewport?: (metrics: ScrollMetrics) => Promise<void>;
}

export interface ScrollMetrics {
  y: number;
  height: number;
  viewportHeight: number;
  viewportWidth: number;
}

export type ScrollStopReason = "bottom" | "max_height" | "max_steps" | "no_scroll" | "timeout" | "scroll_blocked";

export interface ScrollStats {
  steps: number;
  final_height: number;
  stopped_reason: ScrollStopReason;
}

export async function hydrateViewportMedia(page: Page, perImageTimeoutMs: number): Promise<void> {
  try {
    await page.evaluate(async (timeout) => {
      const targets: Element[] = [];
      const nodes = document.querySelectorAll(
        'img, picture source, iframe[loading="lazy"]',
      );
      for (const el of Array.from(nodes)) {
        const r = (el.closest("picture") ?? el).getBoundingClientRect();
        if (r.bottom < -300 || r.top > window.innerHeight + 300) continue;
        targets.push(el);
      }
      for (const el of targets) {
        const anyEl = el as HTMLImageElement & { loading?: string; dataset?: DOMStringMap };
        if ("loading" in anyEl) anyEl.loading = "eager";
        const data = anyEl.dataset;
        if (data) {
          const src = data.lazySrc ?? data.src;
          const srcset = data.lazySrcset ?? data.srcset;
          if (src && el.getAttribute("src") !== src) el.setAttribute("src", src);
          if (srcset && el.getAttribute("srcset") !== srcset) el.setAttribute("srcset", srcset);
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
              const done = () => {
                clearTimeout(timer);
                img.removeEventListener("load", done);
                img.removeEventListener("error", done);
                resolve();
              };
              const timer = setTimeout(done, timeout);
              img.addEventListener("load", done, { once: true });
              img.addEventListener("error", done, { once: true });
              if (img.complete) done();
            }),
        );
      await Promise.all(pending);
      await Promise.all(targets.filter((el) => el instanceof HTMLImageElement).map(async (el) => {
        const img = el as HTMLImageElement;
        if (!img.complete || !img.naturalWidth) return;
        let timer: ReturnType<typeof setTimeout> | undefined;
        await Promise.race([
          img.decode().catch(() => {}),
          new Promise<void>((resolve) => { timer = setTimeout(resolve, timeout); }),
        ]);
        clearTimeout(timer);
      }));
    }, perImageTimeoutMs);
  } catch {
    return;
  }
}

export async function scrollThrough(page: Page, config: ScrollConfig): Promise<ScrollStats> {
  const deadline = Date.now() + Math.max(0, config.timeoutMs);
  const staticReady = config.allowStatic && await page.evaluate(readContentState).then((state) => state.staticReady).catch(() => false);
  const settleMs = staticReady ? 0 : config.scrollSettleMs;

  const metrics = () =>
    page.evaluate(() => ({
      y: window.scrollY,
      height: document.documentElement.scrollHeight,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
    }));

  const control = await page.evaluateHandle(() => {
    const originals: { element: HTMLElement; key: string; value: string; priority: string }[] = [];
    for (const element of [document.documentElement, document.body]) {
      if (!element) continue;
      for (const [key, value] of Object.entries({ "scroll-behavior": "auto", "scroll-snap-type": "none", "overflow-anchor": "none" })) {
        originals.push({ element, key, value: element.style.getPropertyValue(key), priority: element.style.getPropertyPriority(key) });
        element.style.setProperty(key, value, "important");
      }
    }
    return originals;
  });
  let steps = 0;
  let current = await metrics();
  let stopped: ScrollStopReason = "timeout";
  const paint = () => page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  );
  const settleViewport = async () => {
    await paint();
    if (settleMs > 0) await sleep(Math.min(settleMs, Math.max(0, deadline - Date.now())));
    await hydrateViewportMedia(page, Math.min(1200, Math.max(0, deadline - Date.now())));
    current = await metrics();
    if (!staticReady && current.height < config.maxPageHeight && current.y + current.viewportHeight >= current.height - 1) {
      let stableSince = Date.now();
      while (Date.now() < deadline && Date.now() - stableSince < Math.max(600, settleMs * 3)) {
        await sleep(Math.min(100, Math.max(0, deadline - Date.now())));
        const next = await metrics();
        if (next.height !== current.height) stableSince = Date.now();
        current = next;
        if (current.height >= config.maxPageHeight || current.y + current.viewportHeight < current.height - 1) break;
      }
      await hydrateViewportMedia(page, Math.min(1200, Math.max(0, deadline - Date.now())));
      current = await metrics();
    }
    if (Date.now() < deadline) await config.onViewport?.(current);
  };
  try {
    await page.evaluate(() => window.scrollTo(0, 0));
    await settleViewport();
    while (Date.now() < deadline) {
      if (current.height > config.maxPageHeight && current.y >= config.maxPageHeight - current.viewportHeight) {
        stopped = "max_height";
        break;
      }
      const target = nextScrollTarget(current.y, Math.min(current.viewportHeight, config.scrollBy ?? computeScrollStep(current.viewportHeight)), current.height, current.viewportHeight, config.maxPageHeight);
      if (target === null) {
        stopped = steps === 0 ? "no_scroll" : "bottom";
        break;
      }
      if (steps >= config.maxScrollSteps) {
        stopped = "max_steps";
        break;
      }
      const previousY = current.y;
      await page.evaluate((t) => window.scrollTo(0, t), target);
      await settleViewport();
      steps++;
      if (current.y <= previousY + 1) {
        stopped = "scroll_blocked";
        break;
      }
    }
    current = await metrics();
    return {
      steps,
      final_height: Math.min(current.height, config.maxPageHeight),
      stopped_reason: stopped,
    };
  } finally {
    await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
    await paint().catch(() => {});
    await control.evaluate((originals) => {
      for (const { element, key, value, priority } of originals) {
        if (value) element.style.setProperty(key, value, priority);
        else element.style.removeProperty(key);
      }
    }).catch(() => {});
    await control.dispose();
  }
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
