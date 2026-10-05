import type { Browser, BrowserContext, BrowserContextOptions, Page } from "playwright";
import {
  DEVICE_PRESETS,
  REGION_PRESETS,
  SnapforgeError,
  type CaptureOptions,
  type ViewportOptions,
} from "@snapforge/contracts";
import type { ResolvedEngineConfig } from "./types.js";
import type { ResolvedRegion } from "./region.js";
import { CaptureTimer } from "./timings.js";
import { RequestIdleTracker } from "./settlement.js";
import { buildBannerRemovalScript, buildBannerStyleCss } from "./banners.js";
import {
  buildFingerprintScripts,
  buildUserAgent,
  defaultFingerprint,
  derivePlatform,
} from "./stealth.js";
import { installRequestFilters } from "./blockers.js";
import { truncateText } from "./util.js";
import type { FreshPageStandby } from "./standby.js";
import { installNetworkGuard } from "./network.js";

const DEFAULT_VIEWPORT: ViewportOptions = {
  width: 1280,
  height: 720,
  deviceScaleFactor: 1,
  isMobile: false,
  hasTouch: false,
};

export function resolveViewport(
  options: CaptureOptions,
  requestId: string,
): ViewportOptions {
  if (options.device) {
    const preset = DEVICE_PRESETS[options.device];
    if (!preset) {
      throw new SnapforgeError({
        code: "unsupported_option",
        message: `Unknown device preset "${options.device}". Valid presets: ${Object.keys(DEVICE_PRESETS).join(", ")}`,
        requestId,
      });
    }
    return {
      width: preset.viewport.width,
      height: preset.viewport.height,
      deviceScaleFactor: preset.viewport.deviceScaleFactor ?? 1,
      isMobile: preset.viewport.isMobile ?? false,
      hasTouch: preset.viewport.hasTouch ?? false,
    };
  }
  if (options.viewport) {
    return { ...DEFAULT_VIEWPORT, ...options.viewport };
  }
  return { ...DEFAULT_VIEWPORT };
}

function hashSeed(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export interface ArtifactRecord {
  console_errors: string[];
  page_errors: string[];
  failed_requests: string[];
  title?: string;
  final_url?: string;
  dom?: string;
}

export interface ArtifactsHandle {
  snapshot(): ArtifactRecord;
  collectDom(): Promise<void>;
  notePage(url: string): void;
}

function attachArtifacts(page: Page, maxBytes: number): ArtifactsHandle {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];
  const record: ArtifactRecord = {
    console_errors: consoleErrors,
    page_errors: pageErrors,
    failed_requests: failedRequests,
  };

  page.on("console", (message) => {
    if (message.type() !== "error") return;
    if (consoleErrors.length >= 20) return;
    consoleErrors.push(truncateText(message.text(), 500));
  });
  page.on("pageerror", (error) => {
    if (pageErrors.length >= 20) return;
    pageErrors.push(truncateText(error.message, 500));
  });
  page.on("requestfailed", (request) => {
    if (failedRequests.length >= 30) return;
    const reason = request.failure()?.errorText ?? "unknown";
    failedRequests.push(truncateText(`${reason} ${request.url()}`, 500));
  });

  return {
    snapshot: () => record,
    notePage: (url: string) => {
      record.final_url = url;
    },
    collectDom: async () => {
      try {
        const title = await page.title();
        record.title = truncateText(title, 300);
      } catch {
        // page may already be gone
      }
      try {
        const html = await page.evaluate(
          () => document.documentElement?.outerHTML ?? "",
        );
        record.dom = html ? truncateText(html, maxBytes) : undefined;
      } catch {
        record.dom = undefined;
      }
    },
  };
}

export interface EngineSession {
  context: BrowserContext;
  page: Page;
  region: ResolvedRegion | null;
  tracker: RequestIdleTracker;
  getBlockedRequests: () => number;
  artifacts: ArtifactsHandle;
  bannerSweepCount: () => Promise<number>;
  runBannerSweep: () => Promise<void>;
  egressCountry?: string;
  close(): Promise<void>;
}

export function contextOptionsFor(
  options: CaptureOptions,
  viewport: ViewportOptions,
  userAgent: string,
  region: ResolvedRegion | null,
): BrowserContextOptions {
  return {
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.deviceScaleFactor,
    isMobile: viewport.isMobile,
    hasTouch: viewport.hasTouch,
    userAgent,
    ...(options.proxy ?? region?.proxy ? { proxy: options.proxy ?? region?.proxy } : {}),
    ...(region ? { locale: region.locale, timezoneId: region.timezone } : {}),
    ...(region
      ? {
          geolocation: REGION_PRESETS[region.id].coordinates,
          permissions: ["geolocation" as const],
        }
      : {}),
    ...(options.locale ? { locale: options.locale } : {}),
    ...(options.timezone ? { timezoneId: options.timezone } : {}),
    colorScheme: options.color_scheme ?? (options.dark_mode ? "dark" : "light"),
    serviceWorkers: "block",
    ...(options.headers ? { extraHTTPHeaders: options.headers } : {}),
  };
}

export async function createSession(
  browser: Browser,
  options: CaptureOptions,
  viewport: ViewportOptions,
  userAgent: string,
  config: ResolvedEngineConfig,
  region: ResolvedRegion | null,
  timer: CaptureTimer = new CaptureTimer(),
  standby?: FreshPageStandby,
): Promise<EngineSession> {
  const contextOptions = contextOptionsFor(options, viewport, userAgent, region);
  const prepared = standby ? await standby.take(browser, contextOptions, timer) : undefined;
  const context = prepared?.context ?? await timer.measure("context_setup", () => browser.newContext(contextOptions));

  context.setDefaultTimeout(options.timeout);
  context.setDefaultNavigationTimeout(options.timeout);

  await timer.measure("init_scripts", async () => {
    if (config.stealth) {
      const locale = options.locale ?? region?.locale;
      const profile = {
        ...defaultFingerprint(derivePlatform(userAgent)),
        canvasSeed: hashSeed(options.url),
        ...(locale ? { languages: [...new Set([locale, locale.split("-")[0]])] } : {}),
      };
      for (const script of buildFingerprintScripts(profile)) {
        await context.addInitScript(script);
      }
    }
    if (options.block_cookie_banners) {
      await context.addInitScript(buildBannerRemovalScript());
    }
  });

  const getBlockedRequests = await timer.measure("request_filters", () => installRequestFilters(context, {
    blockAds: options.block_ads,
    blockTrackers: options.block_trackers,
  }));

  const page = prepared?.page ?? await timer.measure("page_setup", () => context.newPage());
  if (!config.allowPrivateNetwork) {
    try {
      await timer.measure("network_policy", () => installNetworkGuard(context, page, "network-guard"));
    } catch (error) {
      let cleanupTimer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        context.close().catch(() => {}),
        new Promise<void>((resolve) => { cleanupTimer = setTimeout(resolve, config.closeTimeoutMs); }),
      ]);
      if (cleanupTimer) clearTimeout(cleanupTimer);
      throw error;
    }
  }
  const tracker = new RequestIdleTracker();
  tracker.attach(page);
  const artifacts = attachArtifacts(page, config.artifactsMaxBytes);
  standby?.prepare(browser, contextOptions);

  const runBannerSweep = async () => {
    if (!options.block_cookie_banners) return;
    try {
      await page.evaluate(() => {
        const bridge = (
          window as unknown as {
            __snapforgeBannerSweep?: { run: () => number };
          }
        ).__snapforgeBannerSweep;
        if (bridge) bridge.run();
      });
      await page.addStyleTag({ content: buildBannerStyleCss() });
    } catch {
      // best effort
    }
  };

  const bannerSweepCount = async () => {
    try {
      return await page.evaluate(() => {
        const bridge = (
          window as unknown as {
            __snapforgeBannerSweep?: { count: () => number };
          }
        ).__snapforgeBannerSweep;
        return bridge ? bridge.count() : 0;
      });
    } catch {
      return 0;
    }
  };

  return {
    context,
    page,
    region,
    tracker,
    getBlockedRequests,
    artifacts,
    bannerSweepCount,
    runBannerSweep,
    close: async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      let closed = false;
      const closing = context
        .close()
        .then(() => {
          closed = true;
        })
        .catch(() => {});
      await Promise.race([
        closing,
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, config.closeTimeoutMs);
        }),
      ]);
      if (timer) clearTimeout(timer);
      if (!closed) {
        config.logger("warn", "context close timed out", {
          url: options.url,
        });
      }
    },
  };
}
