import { randomUUID } from "node:crypto";
import type { Page, Response as PwResponse } from "playwright";
import {
  captureOptionsSchema,
  SnapforgeError,
  type CaptureOptions,
  type CaptureSuccessData,
} from "@snapforge/contracts";
import type {
  CaptureOutcome,
  EngineConfig,
  EngineHealth,
  ResolvedEngineConfig,
} from "./types.js";
import { resolveConfig } from "./types.js";
import { BrowserPool } from "./pool.js";
import { looksLikeChallenge, toSnapforgeError } from "./errors.js";
import { contextOptionsFor, createSession, resolveViewport, type EngineSession } from "./context.js";
import { buildUserAgent } from "./stealth.js";
import {
  SettlementBudget,
  settleAfterScroll,
  settleLoad,
  settlePreCapture,
  type SettleDeps,
  type SettleStats,
} from "./settlement.js";
import { prepareFullPageCapture, waitForScrollGrowth } from "./fullpage.js";
import { captureOutput, planCapture, readPngSize, type PageMetrics } from "./formats.js";
import { resolveRegion, type ResolvedRegion } from "./region.js";
import { verifyEgress } from "./egress.js";
import { nullCaptureCache, type CaptureCachePort } from "./cache.js";
import { CaptureTimer } from "./timings.js";
import { ensureCaptureQuality, ensureOutputQuality } from "./quality.js";
import { assertPublicProxyUrl, assertPublicUrl } from "./network.js";

async function safeTitle(page: Page): Promise<string> {
  try {
    return await page.title();
  } catch {
    return "";
  }
}

async function safeBodySample(page: Page): Promise<string> {
  try {
    return await page.evaluate(() => (document.body?.innerText ?? "").slice(0, 4000));
  } catch {
    return "";
  }
}

async function detectChallenge(
  page: Page,
  status: number,
): Promise<{ challenged: boolean; title: string }> {
  const [title, body] = await Promise.all([safeTitle(page), safeBodySample(page)]);
  return { challenged: looksLikeChallenge(status, title, body), title };
}

async function applyDomTweaks(
  page: Page,
  options: CaptureOptions,
  requestId: string,
): Promise<void> {
  if (options.hide_selectors.length > 0 || options.remove_selectors.length > 0) {
    const invalid = await page.evaluate(
      ({ hide, remove }) => {
        const splitTopLevel = (selector: string): string[] => {
          const parts: string[] = [];
          let depth = 0;
          let quote: string | null = null;
          let current = "";
          for (const ch of selector) {
            if (quote) {
              current += ch;
              if (ch === quote) quote = null;
              continue;
            }
            if (ch === '"' || ch === "'") {
              quote = ch;
              current += ch;
              continue;
            }
            if (ch === "(" || ch === "[") depth += 1;
            if (ch === ")" || ch === "]") depth = Math.max(0, depth - 1);
            if (ch === "," && depth === 0) {
              parts.push(current.trim());
              current = "";
              continue;
            }
            current += ch;
          }
          parts.push(current.trim());
          return parts.filter((part) => part.length > 0);
        };

        const isValid = (selector: string): boolean => {
          if (!selector.trim()) return false;
          try {
            document.querySelector(selector);
          } catch {
            return false;
          }
          const parts = splitTopLevel(selector);
          if (parts.length === 0) return false;
          for (const part of parts) {
            try {
              if (!CSS.supports("selector(" + part + ")")) return false;
            } catch {
              return false;
            }
          }
          return true;
        };

        const bad: string[] = [];
        for (const selector of [...hide, ...remove]) {
          if (!isValid(selector)) bad.push(selector);
        }
        if (bad.length > 0) return bad;
        for (const selector of hide) {
          for (const el of Array.from(document.querySelectorAll(selector))) {
            (el as HTMLElement).style.setProperty("visibility", "hidden", "important");
          }
        }
        for (const selector of remove) {
          for (const el of Array.from(document.querySelectorAll(selector))) {
            el.remove();
          }
        }
        return [];
      },
      { hide: options.hide_selectors, remove: options.remove_selectors },
    );
    if (invalid.length > 0) {
      throw new SnapforgeError({
        code: "invalid_request",
        message: `Invalid selector(s): ${invalid.join(", ")}`,
        requestId,
        details: { selectors: invalid },
      });
    }
  }

  if (options.custom_css) {
    await page.addStyleTag({ content: options.custom_css }).catch((err: unknown) => {
      throw new SnapforgeError({
        code: "invalid_request",
        message: `custom_css could not be applied: ${err instanceof Error ? err.message : String(err)}`,
        requestId,
      });
    });
  }

  if (options.custom_js) {
    try {
      await page.evaluate(options.custom_js);
    } catch (err) {
      throw new SnapforgeError({
        code: "invalid_request",
        message: `custom_js failed: ${err instanceof Error ? err.message : String(err)}`,
        requestId,
      });
    }
  }
}

export class SnapforgeEngine {
  private readonly config: ResolvedEngineConfig;
  private readonly pool: BrowserPool;
  private readonly settleDeps: SettleDeps;
  private readonly cache: CaptureCachePort;
  private warmChain: Promise<void> | null = null;

  constructor(config: EngineConfig = {}, cache: CaptureCachePort = nullCaptureCache) {
    this.config = resolveConfig(config);
    this.pool = new BrowserPool(this.config, this.config.concurrencyPolicy);
    this.cache = cache;
    this.settleDeps = {
      fontWaitMs: this.config.fontWaitMs,
      idlePhaseMs: this.config.idlePhaseMs,
      idleIntervalMs: this.config.idleIntervalMs,
      idleWindowMs: this.config.idleWindowMs,
    };
  }

  /** Effective concurrency right now — CPU-derived, and lower under load. */
  get concurrency(): number {
    return this.pool.budgetSnapshot.allowed;
  }

  /** Ceiling the host could sustain at rest, ignoring current load. */
  get concurrencyTarget(): number {
    return this.pool.budgetSnapshot.target;
  }

  async warm(): Promise<void> {
    if (this.warmChain) return this.warmChain;
    const options = captureOptionsSchema.parse({ url: "https://snapforge.invalid/" });
    const viewport = resolveViewport(options, "warmup");
    const chain = this.pool.warm(async (slot) => {
      const browser = await slot.ensureBrowser(false);
      if (this.config.prewarmPages) {
        await slot.manager.standby.prime(browser, contextOptionsFor(options, viewport, buildUserAgent(browser.version()), null));
      }
    });
    this.warmChain = chain;
    try {
      await chain;
    } finally {
      if (this.warmChain === chain) this.warmChain = null;
    }
  }

  async capture(input: unknown, mode: { inspectPage?: boolean; includeSelectorBox?: boolean } = {}): Promise<CaptureOutcome> {
    const requestId = `req_${randomUUID()}`;
    const timer = new CaptureTimer();
    try {
      const outcome = await this.captureInternal(input, mode, requestId, timer);
      const timings = timer.snapshot();
      this.config.logger("debug", "capture timings", { request_id: requestId, ...timings });
      return { ...outcome, timings };
    } catch (err) {
      throw toSnapforgeError(err, requestId, { timings: timer.snapshot() });
    }
  }

  private async captureInternal(
    input: unknown,
    mode: { inspectPage?: boolean; includeSelectorBox?: boolean },
    requestId: string,
    timer: CaptureTimer,
  ): Promise<CaptureOutcome> {
    const parsed = captureOptionsSchema.safeParse(input);
    if (!parsed.success) {
      throw toSnapforgeError(parsed.error, requestId);
    }
    const options = parsed.data;
    if (!this.config.allowPrivateNetwork) {
      await timer.measure("network_policy", async () => {
        await assertPublicUrl(options.url, requestId);
        if (options.proxy) await assertPublicProxyUrl(options.proxy.server, requestId);
      });
    }

    // Cache lookup happens before any slot is leased, so a warm capture costs no
    // browser at all. A miss falls through to the normal render path unchanged.
    const cached = mode.inspectPage ? null : await timer.measure("cache_lookup", () => this.cache.lookup(options));
    if (cached) {
      this.config.logger("debug", "capture served from cache", {
        request_id: requestId,
        url: options.url,
        cache_ttl: options.cache_ttl,
      });
      return { data: cached.data, buffer: cached.buffer };
    }

    // Lease a slot for the whole retry loop. Recycling restarts this slot's browser
    // only, so a crash here never disturbs captures running on sibling slots.
    const slot = await timer.measure("pool_wait", () => this.pool.acquire(requestId));
    try {
      let lastError: SnapforgeError | null = null;
      for (let attempt = 0; attempt <= this.config.retries; attempt++) {
        try {
          const outcome = await this.runAttempt(options, requestId, slot.id, mode, timer);
          if (mode.inspectPage) return outcome;
          return { data: await timer.measure("cache_save", () => this.cache.save(options, outcome.data, outcome.buffer)), buffer: outcome.buffer };
        } catch (err) {
          const error = toSnapforgeError(err, requestId);
          lastError = error;
          const canRetry =
            attempt < this.config.retries && error.code === "render_crashed";
          this.config.logger("warn", "capture attempt failed", {
            request_id: requestId,
            slot: slot.id,
            attempt,
            code: error.code,
            message: error.message,
          });
          if (!canRetry) throw error;
          await timer.measure("browser_recycle", () => this.pool.recycle(slot, error.message));
        }
      }
      throw (
        lastError ??
        new SnapforgeError({
          code: "internal_error",
          message: "Capture failed without a recorded error",
          requestId,
        })
      );
    } finally {
      this.pool.release(slot);
    }
  }

  private async runAttempt(
    options: CaptureOptions,
    requestId: string,
    slotId: number,
    mode: { inspectPage?: boolean; includeSelectorBox?: boolean },
    timer: CaptureTimer,
  ): Promise<CaptureOutcome> {
    const started = Date.now();
    const viewport = resolveViewport(options, requestId);
    const region = resolveRegion(options, requestId);
    const slot = this.pool.slot(slotId);
    const browser = await timer.measure("browser_start", () => slot.ensureBrowser());
    const userAgent = options.user_agent ?? buildUserAgent(browser.version());
    const session = await createSession(
      browser,
      options,
      viewport,
      userAgent,
      this.config,
      region,
      timer,
      this.config.prewarmPages ? slot.manager.standby : undefined,
    );

    try {
      session.egressCountry = await timer.measure("egress", () => this.verifySessionEgress(
        session,
        region,
        requestId,
        options.url,
      ));
      return await this.pipeline(session, options, requestId, viewport, started, slotId, mode, timer);
    } catch (err) {
      try {
        session.artifacts.notePage(session.page.url());
      } catch {
        // page may already be unreachable
      }
      await timer.measure("failure_artifacts", () => session.artifacts.collectDom());
      throw toSnapforgeError(err, requestId, {
        slot: slotId,
        artifacts: session.artifacts.snapshot(),
      });
    } finally {
      await timer.measure("cleanup", () => session.close());
    }
  }

  /**
   * Verification runs before any navigation so a wrong-region request fails before it
   * spends a capture, and only when the caller asked for a region to be honoured.
   */
  private async verifySessionEgress(
    session: EngineSession,
    region: ResolvedRegion | null,
    requestId: string,
    url: string,
  ): Promise<string | undefined> {
    if (!region) return undefined;
    this.config.logger("debug", "verifying egress", {
      region: region.id,
      expected_country: region.country,
    });
    const result = await verifyEgress(
      session.context,
      region,
      requestId,
      url,
      this.config.egressLookupUrl,
    );
    return result.country ?? undefined;
  }

  private async pipeline(
    session: EngineSession,
    options: CaptureOptions,
    requestId: string,
    viewport: { width: number; height: number; deviceScaleFactor: number },
    started: number,
    slotId: number,
    mode: { inspectPage?: boolean; includeSelectorBox?: boolean },
    timer: CaptureTimer,
  ): Promise<CaptureOutcome> {
    const { page, tracker } = session;

    let lastStatus = 0;
    const onNavResponse = (response: PwResponse) => {
      if (!response.request().isNavigationRequest()) return;
      if (response.frame() !== page.mainFrame()) return;
      lastStatus = response.status();
    };
    page.on("response", onNavResponse);

    const budget = new SettlementBudget(options.timeout);
    const waitUntil =
      options.wait_until === "networkidle" ? "domcontentloaded" : options.wait_until;

    const response = await timer.measure("navigation", () => page.goto(options.url, {
      waitUntil,
      timeout: options.timeout,
    }));
    if (response) lastStatus = response.status();

    const settleStats: SettleStats = await timer.measure("load_settle", () => settleLoad(
      page,
      options,
      budget,
      this.settleDeps,
      tracker,
    ));

    const check1 = await timer.measure("challenge_check", () => detectChallenge(page, lastStatus));
    if (check1.challenged) {
      await timer.measure("challenge_check", () => new Promise<void>((resolve) =>
        setTimeout(resolve, Math.min(2500, budget.remaining())),
      ));
      const check2 = await timer.measure("challenge_check", () => detectChallenge(page, lastStatus));
      if (check2.challenged) {
        throw new SnapforgeError({
          code: "blocked_by_target",
          message: `Target blocked the capture (status ${lastStatus || "n/a"}): ${check2.title || "anti-bot challenge"}`,
          requestId,
          details: {
            status: lastStatus,
            title: check2.title,
            final_url: session.page.url(),
            reason: "challenge_detected",
          },
        });
      }
    }

    if (lastStatus >= 500) {
      throw new SnapforgeError({
        code: "target_error",
        message: `Target returned HTTP ${lastStatus}`,
        requestId,
        details: { status: lastStatus, final_url: session.page.url() },
      });
    }

    const bannersRemoved = await timer.measure("dom_tweaks", async () => {
      await session.runBannerSweep();
      await applyDomTweaks(page, options, requestId);
      return session.bannerSweepCount();
    });
    await timer.measure("pre_capture", () => settlePreCapture(page, options, budget, settleStats, this.config.contentWaitMs));

    const finalTitle = await timer.measure("challenge_check", () => safeTitle(page));
    if (looksLikeChallenge(0, finalTitle, "")) {
      throw new SnapforgeError({
        code: "blocked_by_target",
        message: `Target blocked the capture: ${finalTitle}`,
        requestId,
        details: {
          status: lastStatus,
          title: finalTitle,
          final_url: session.page.url(),
          reason: "challenge_detected",
        },
      });
    }

    let output: { buffer: Buffer; width: number; height: number };
    let selectorBox: { x: number; y: number; width: number; height: number } | undefined;

    if (options.selector) {
      if (options.format === "pdf") {
        throw new SnapforgeError({
          code: "unsupported_option",
          message: "pdf format cannot be combined with selector element targeting",
          requestId,
        });
      }
      const locator = page.locator(options.selector).first();
      const visible = await locator.isVisible().catch(() => false);
      const box = visible ? await locator.boundingBox().catch(() => null) : null;
      if (!box) {
        throw new SnapforgeError({
          code: "invalid_request",
          message: `Selector "${options.selector}" matched no visible element`,
          requestId,
        });
      }
      selectorBox = { x: box.x, y: box.y, width: box.width, height: box.height };
      await timer.measure("quality_check", () => ensureCaptureQuality(page, options, budget, this.config.contentWaitMs, requestId));
      const type: "png" | "jpeg" | "webp" =
        options.format === "jpeg" ? "jpeg" : options.format === "webp" ? "webp" : "png";
      const shotOptions = {
        type,
        quality: type === "png" ? undefined : options.quality,
        animations: "disabled" as const,
        caret: "hide" as const,
      };
      const buffer = (await timer.measure("screenshot", () => locator.screenshot(shotOptions))) as unknown as Buffer;
      let width = Math.round(box.width * viewport.deviceScaleFactor);
      let height = Math.round(box.height * viewport.deviceScaleFactor);
      if (type === "png") {
        const dims = readPngSize(buffer);
        if (dims) {
          width = dims.width;
          height = dims.height;
        }
      }
      output = { buffer, width, height };
    } else {
      if (options.full_page && options.format !== "pdf") {
        await timer.measure("growth_wait", () => waitForScrollGrowth(
          page,
          Math.min(this.config.contentWaitMs, budget.remaining()),
          250,
          !options.custom_js,
        ));
        await timer.measure("scroll", () => prepareFullPageCapture(page, {
          maxPageHeight: this.config.maxPageHeight,
          maxScrollSteps: this.config.maxScrollSteps,
          scrollSettleMs: this.config.scrollSettleMs,
          timeoutMs: options.timeout,
          maxPinnedElements: this.config.maxPinnedElements,
          allowStatic: !options.custom_js,
        }));
        await timer.measure("post_scroll", () => settleAfterScroll(page, budget, this.settleDeps, tracker));
      }

      await timer.measure("quality_check", () => ensureCaptureQuality(page, options, budget, this.config.contentWaitMs, requestId));
      const raw = await timer.measure("page_metrics", () => page.evaluate(() => ({
        vw: window.innerWidth,
        vh: window.innerHeight,
        dw: document.documentElement.scrollWidth,
        dh: document.documentElement.scrollHeight,
      })));
      const metrics: PageMetrics = {
        viewportWidth: raw.vw,
        viewportHeight: raw.vh,
        deviceScaleFactor: viewport.deviceScaleFactor,
        docWidth: raw.dw,
        docHeight: raw.dh,
      };
      const plan = planCapture(options, metrics, this.config.maxPageHeight);
      output = await timer.measure("screenshot", () => captureOutput(page, plan, options, metrics));
    }

    ensureOutputQuality(output, options, requestId);
    const inspection = mode.inspectPage ? await timer.measure("inspection", () => this.inspectPage(page)) : undefined;

    const data: CaptureSuccessData = {
      url: options.url,
      final_url: session.page.url(),
      format: options.format,
      width: output.width,
      height: output.height,
      bytes: output.buffer.length,
      duration_ms: Date.now() - started,
      cached: false,
      blocked_requests: session.getBlockedRequests(),
      ...(session.region ? { region: session.region.id } : {}),
      ...(session.egressCountry ? { egress_country: session.egressCountry } : {}),
    };

    this.config.logger("debug", "capture completed", {
      request_id: requestId,
      slot: slotId,
      final_url: data.final_url,
      bytes: data.bytes,
      duration_ms: data.duration_ms,
      blocked_requests: data.blocked_requests,
      banners_removed: bannersRemoved,
      ...settleStats,
    });

    return {
      data,
      buffer: output.buffer,
      ...(inspection || (mode.includeSelectorBox && selectorBox)
        ? { inspection: { ...inspection, ...(mode.includeSelectorBox && selectorBox ? { selectorBox } : {}) } }
        : {}),
    };
  }

  private async inspectPage(page: Page): Promise<{ markdown: string; accessibleTree: string }> {
    const [markdown, accessibleTree] = await Promise.all([
      page.evaluate(() => {
        const root = document.querySelector("main, [role=main], article") ?? document.body;
        if (!root) return "";
        const blocks = Array.from(root.querySelectorAll("h1,h2,h3,h4,h5,h6,p,li,blockquote,pre,figcaption,summary"));
        const lines = blocks.map((node) => {
          const text = (node as HTMLElement).innerText.replace(/\s+/g, " ").trim();
          if (!text) return "";
          const tag = node.tagName.toLowerCase();
          if (/^h[1-6]$/.test(tag)) return `${"#".repeat(Number(tag[1]))} ${text}`;
          if (tag === "li") return `- ${text}`;
          if (tag === "blockquote") return `> ${text}`;
          if (tag === "pre") return "```\n" + (node as HTMLElement).innerText.trim() + "\n```";
          return text;
        }).filter(Boolean);
        if (lines.length === 0) return (root as HTMLElement).innerText.replace(/\n{3,}/g, "\n\n").trim().slice(0, 12_000);
        return lines.join("\n\n").slice(0, 12_000);
      }),
      page.locator("body").ariaSnapshot().catch(() => ""),
    ]);
    return { markdown, accessibleTree: accessibleTree.slice(0, 12_000) };
  }

  async health(): Promise<EngineHealth> {
    const pool = this.pool.health;
    const budget = this.pool.budgetSnapshot;
    // A slot that has not launched yet (connected === null) is healthy — the pool is
    // lazy and starts cold. Only a slot that launched and then dropped is a fault.
    const disconnected = pool.slots.filter((slot) => slot.connected === false).length;
    const primary = pool.slots.find((slot) => slot.connected !== null) ?? null;

    return {
      ok: disconnected === 0,
      in_flight: this.pool.inFlight,
      browser: primary
        ? {
            connected: primary.connected === true,
            age_ms: primary.age_ms ?? 0,
            contexts_served: primary.contexts_served,
            restarts: pool.restarts,
          }
        : null,
      pool: { ...pool, budget },
    };
  }

  async close(): Promise<void> {
    if (this.warmChain) await this.warmChain.catch(() => {});
    await this.pool.destroy();
  }
}

export function createEngine(config: EngineConfig = {}, cache: CaptureCachePort = nullCaptureCache): SnapforgeEngine {
  return new SnapforgeEngine(config, cache);
}
