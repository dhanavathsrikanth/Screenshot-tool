import type { Page } from "playwright";
import sharp from "sharp";
import { PDFDocument, PDFName, PDFNumber } from "pdf-lib";
import { CAPTURE_RENDER_VERSION, SnapforgeError, type CaptureOptions } from "@snapforge/contracts";
import { scrollThrough, type FullPageConfig, type ScrollStats } from "./fullpage.js";
import type { CaptureOutput } from "./formats.js";
import { freezeViewportMotion, waitForViewportStability } from "./motion.js";
import { drawLosslessStrip } from "./pdf-strip.js";

export function assertCompleteScroll(stats: ScrollStats, requestId: string): void {
  if (!["timeout", "max_steps", "scroll_blocked"].includes(stats.stopped_reason)) return;
  throw new SnapforgeError({
    code: stats.stopped_reason === "timeout" ? "render_timeout" : "render_incomplete",
    message: `Full-page scrolling stopped before reaching the bottom (${stats.stopped_reason})`,
    requestId,
    details: { scroll: stats },
  });
}

export async function captureTiles(
  page: Page,
  options: CaptureOptions,
  config: FullPageConfig,
  deviceScaleFactor: number,
  requestId: string,
): Promise<CaptureOutput> {
  const deadline = Date.now() + config.timeoutMs;
  const checkDeadline = () => {
    if (Date.now() >= deadline) throw new SnapforgeError({ code: "render_timeout", message: "Full-page capture exhausted its rendering budget", requestId });
  };
  const tiles: { y: number; viewportHeight: number; buffer: Buffer }[] = [];
  const pinned = await page.evaluateHandle(() => ({
    seen: new Map<HTMLElement, number>(),
    layout: new Map<HTMLElement, { key: string; value: string; priority: string }[]>(),
    candidates: (() => {
      const candidates: HTMLElement[] = [];
      const roots: (Document | ShadowRoot)[] = [document];
      let scanned = 0;
      for (const root of roots) for (const element of Array.from(root.querySelectorAll<HTMLElement>("*"))) {
        if (++scanned > 12_000) return candidates;
        if (element.shadowRoot) roots.push(element.shadowRoot);
        const position = getComputedStyle(element).position;
        if (position === "fixed" || position === "sticky") candidates.push(element);
      }
      return candidates;
    })(),
    hidden: new Map<HTMLElement, { value: string; priority: string }>(),
  }));
  let stats: ScrollStats;
  try {
    await pinned.evaluate((state) => {
      for (const element of state.candidates) {
        if (getComputedStyle(element).position !== "sticky") continue;
        const keys = ["position", "top", "right", "bottom", "left"];
        state.layout.set(element, keys.map((key) => ({ key, value: element.style.getPropertyValue(key), priority: element.style.getPropertyPriority(key) })));
        element.style.setProperty("position", "relative", "important");
        for (const key of keys.slice(1)) element.style.setProperty(key, "auto", "important");
      }
    });
    stats = await scrollThrough(page, {
      ...config,
      onViewport: async ({ y, height, viewportHeight }) => {
        if (Date.now() >= deadline) return;
        await pinned.evaluate((state, { maxCount, y, coverage, finalViewport }) => {
          for (const [el, original] of state.hidden) {
            if (original.value) el.style.setProperty("visibility", original.value, original.priority);
            else el.style.removeProperty("visibility");
          }
          state.hidden.clear();
          const hide = (el: HTMLElement) => {
            state.hidden.set(el, { value: el.style.getPropertyValue("visibility"), priority: el.style.getPropertyPriority("visibility") });
            el.style.setProperty("visibility", "hidden", "important");
          };
          for (const [el, firstY] of state.seen) {
            const position = getComputedStyle(el).position;
            if (firstY !== y && (position === "fixed" || position === "sticky")) hide(el);
          }
          const candidates = new Set([...state.candidates, ...document.querySelectorAll<HTMLElement>('header, nav, [style*="fixed"], [style*="sticky"], [class*="sticky"], [class*="fixed"]')]);
          for (const node of candidates) {
            if (state.seen.size >= maxCount) return;
            if (!node.isConnected || state.seen.has(node)) continue;
            const position = getComputedStyle(node).position;
            const rect = node.getBoundingClientRect();
            if (position !== "fixed" && position !== "sticky") {
              if (y === 0 && node.matches("header, nav") && rect.top >= 0 && rect.bottom <= coverage && rect.height >= 4) state.seen.set(node, y);
              continue;
            }
            if (rect.height < 4 || rect.height > innerHeight / 2 || rect.width < 4 || rect.top < 0 || rect.top >= innerHeight) continue;
            if (position === "fixed" && rect.bottom > coverage && !finalViewport) { hide(node); continue; }
            if (rect.bottom <= coverage || finalViewport) state.seen.set(node, y);
          }
        }, { maxCount: config.maxPinnedElements, y, coverage: Math.min(viewportHeight, config.scrollBy ?? Math.floor(viewportHeight * 0.85)), finalViewport: y + viewportHeight >= Math.min(height, config.maxPageHeight) - 1 });
        const motion = options.reduce_motion ? await freezeViewportMotion(page) : null;
        let buffer: Buffer;
        try {
          if (!config.allowStatic) await waitForViewportStability(page, Math.min(600, Math.max(0, deadline - Date.now())));
          buffer = await page.screenshot({
            type: "png",
            fullPage: false,
            scale: "device",
            animations: "allow",
            caret: "hide",
            timeout: Math.max(1, deadline - Date.now()),
          });
        } finally {
          if (motion) {
            await motion.evaluate((state) => {
              for (const animation of state.paused) { try { animation.play(); } catch {} }
              for (const media of state.media) void media.play().catch(() => {});
              if (state.resumeTimeline) state.timeline?.resume();
            }).catch(() => {});
            await motion.dispose();
          }
        }
        const tile = { y, viewportHeight, buffer };
        if (tiles.at(-1)?.y === y) tiles[tiles.length - 1] = tile;
        else tiles.push(tile);
      },
    });
  } finally {
    await pinned.evaluate((state) => {
      for (const [element, originals] of state.layout) {
        for (const { key, value, priority } of originals) {
          if (value) element.style.setProperty(key, value, priority);
          else element.style.removeProperty(key);
        }
      }
      for (const [el, original] of state.hidden) {
        if (original.value) el.style.setProperty("visibility", original.value, original.priority);
        else el.style.removeProperty("visibility");
      }
    }).catch(() => {});
    await pinned.dispose();
  }
  assertCompleteScroll(stats, requestId);
  if (!tiles.length) {
    throw new SnapforgeError({ code: "render_timeout", message: "No viewport could be captured within the full-page budget", requestId });
  }
  const first = await sharp(tiles[0].buffer).metadata();
  const width = first.width!;
  const renderScale = first.height! / tiles[0].viewportHeight;
  const height = Math.round(stats.final_height * renderScale);
  const diagnostics = {
    version: CAPTURE_RENDER_VERSION,
    algorithm: "by_sections" as const,
    sections: tiles.length,
    device_scale_factor: deviceScaleFactor,
    scroll_height: stats.final_height,
    stopped_reason: stats.stopped_reason,
    truncated: stats.stopped_reason === "max_height",
  };
  const strips: { top: number; buffer: Buffer; height: number }[] = [];
  for (let i = 0; i < tiles.length; i++) {
    checkDeadline();
    const top = Math.round(tiles[i].y * renderScale);
    const nextTop = i + 1 < tiles.length ? Math.round(tiles[i + 1].y * renderScale) : height;
    const tileHeight = (await sharp(tiles[i].buffer).metadata()).height!;
    const stripHeight = Math.min(nextTop, height, top + tileHeight) - top;
    if (stripHeight <= 0) continue;
    const image = sharp(tiles[i].buffer).extract({ left: 0, top: 0, width, height: stripHeight });
    const buffer = await (options.format === "pdf" ? image.removeAlpha() : image).png().toBuffer();
    strips.push({ top, buffer, height: stripHeight });
  }
  if (options.format === "pdf") {
    const document = await PDFDocument.create();
    const cssWidth = width / deviceScaleFactor;
    const cssHeight = height / deviceScaleFactor;
    const userUnit = Math.max(1, Math.ceil(cssHeight * 0.75 / 14_400));
    const pdfScale = 0.75 / deviceScaleFactor / userUnit;
    const pdfPage = document.addPage([width * pdfScale, height * pdfScale]);
    if (userUnit > 1) pdfPage.node.set(PDFName.of("UserUnit"), PDFNumber.of(userUnit));
    for (const strip of strips) {
      checkDeadline();
      drawLosslessStrip(document, pdfPage, strip.buffer, {
        x: 0,
        y: (height - strip.top - strip.height) * pdfScale,
        width: width * pdfScale,
        height: strip.height * pdfScale,
      });
    }
    const buffer = Buffer.from(await document.save());
    checkDeadline();
    return { buffer, width: Math.round(cssWidth), height: Math.round(cssHeight), diagnostics };
  }
  if (width * height > 268_402_689) {
    throw new SnapforgeError({
      code: "unsupported_option",
      message: "Full-page image exceeds the pixel limit; reduce viewport width, deviceScaleFactor, or maximum page height",
      requestId,
    });
  }
  const image = sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(strips.map((strip) => ({ input: strip.buffer, left: 0, top: strip.top })));
  const buffer = options.format === "jpeg"
    ? await image.jpeg({ quality: options.quality }).toBuffer()
    : options.format === "webp"
      ? await image.webp({ quality: options.quality }).toBuffer()
      : await image.png().toBuffer();
  checkDeadline();
  return { buffer, width, height, diagnostics };
}
