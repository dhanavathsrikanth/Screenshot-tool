import { z } from "zod";
import { REGION_IDS } from "./regions.js";

export const CAPTURE_FORMATS = ["png", "jpeg", "webp", "pdf"] as const;
export type CaptureFormat = (typeof CAPTURE_FORMATS)[number];
export const CAPTURE_RENDER_VERSION = 7;

export const CAPTURE_MIME_TYPES = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
  pdf: "application/pdf",
} as const satisfies Record<CaptureFormat, string>;

export const WAIT_UNTIL_EVENTS = ["load", "domcontentloaded", "networkidle"] as const;
export type WaitUntilEvent = (typeof WAIT_UNTIL_EVENTS)[number];

export const COLOR_SCHEMES = ["light", "dark", "no-preference"] as const;
export type ColorScheme = (typeof COLOR_SCHEMES)[number];

export const viewportSchema = z.object({
  width: z.number().int().min(320).max(3840).default(1280),
  height: z.number().int().min(240).max(2160).default(720),
  deviceScaleFactor: z.number().min(1).max(3).default(2),
  isMobile: z.boolean().default(false),
  hasTouch: z.boolean().default(false),
});

export type ViewportOptions = z.infer<typeof viewportSchema>;

export const proxySchema = z.object({
  server: z.string().min(1, "proxy server is required"),
  bypass: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
});

export type ProxyOptions = z.infer<typeof proxySchema>;

/**
 * Geo targeting. `region` resolves to a locale/timezone/currency bundle and pins the
 * expected egress country; `proxy` supplies the egress itself, since a region cannot
 * be honoured from a host whose IP already sits in the wrong country.
 */
export const regionSchema = z
  .string()
  .toLowerCase()
  .trim()
  .refine((value) => (REGION_IDS as string[]).includes(value), {
    message: `Unknown region. Supported regions: ${REGION_IDS.join(", ")}`,
  });

/**
 * Universal capture options schema. Validates both REST queries/bodies and internal worker tasks.
 */
export const captureOptionsSchema = z.object({
  // Target URL
  url: z
    .string()
    .min(1, "URL is required")
    .transform((val) => {
      const trimmed = val.trim();
      if (!/^https?:\/\//i.test(trimmed)) {
        return `https://${trimmed}`;
      }
      return trimmed;
    })
    .refine((val) => {
      try {
        const parsed = new URL(val);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          return false;
        }
        const hostname = parsed.hostname;
        if (!hostname) return false;
        const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1";
        const hasDot = hostname.includes(".");
        const isIp = /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname) || hostname.startsWith("[");
        return isLocalhost || hasDot || isIp;
      } catch {
        return false;
      }
    }, "Must be a valid HTTP or HTTPS URL with a resolvable hostname"),

  // Dimensions & Device
  viewport: viewportSchema.optional(),
  device: z.string().optional(),
  full_page: z.boolean().default(false),
  full_page_algorithm: z.enum(["by_sections", "native"]).default("by_sections"),
  full_page_scroll_delay: z.number().int().min(0).max(5000).optional(),
  full_page_scroll_by: z.number().int().min(120).max(2160).optional(),
  reduce_motion: z.boolean().default(true),

  // Output formatting
  format: z.enum(CAPTURE_FORMATS).default("webp"),
  quality: z.number().int().min(1).max(100).default(90),

  // Timing & Settlement
  delay: z.number().int().min(0).max(30000).default(0),
  timeout: z.number().int().min(1000).max(60000).default(30000),
  wait_for_selector: z.string().optional(),
  wait_for_content: z.boolean().default(false),
  wait_for_idle: z.boolean().default(true),
  wait_until: z.enum(WAIT_UNTIL_EVENTS).default("load"),
  fail_if_incomplete: z.boolean().default(false),
  fail_if_content_missing: z.array(z.string().trim().min(1).max(500)).max(32).default([]),
  fail_if_content_contains: z.array(z.string().trim().min(1).max(500)).max(32).default([]),
  min_capture_height: z.number().int().positive().optional(),
  min_capture_bytes: z.number().int().positive().optional(),

  // Emulation & Localization
  dark_mode: z.boolean().default(false),
  color_scheme: z.enum(COLOR_SCHEMES).optional(),
  locale: z.string().optional(),
  timezone: z.string().optional(),
  user_agent: z.string().optional(),

  // Geo targeting
  region: regionSchema.optional(),
  proxy: proxySchema.optional(),
  verify_egress: z.boolean().default(true),

  // Content Filters & Stealth
  block_ads: z.boolean().default(true),
  block_cookie_banners: z.boolean().default(true),
  block_chats: z.boolean().default(true),
  block_trackers: z.boolean().default(true),

  // DOM Tweaks & Element Targeting
  selector: z.string().optional(),
  hide_selectors: z.array(z.string()).default([]),
  remove_selectors: z.array(z.string()).default([]),
  custom_css: z.string().optional(),
  custom_js: z.string().optional(),

  // HTTP & Auth overrides
  headers: z.record(z.string()).optional(),

  // Pipeline control
  sync: z.boolean().default(true),
  cache_ttl: z.number().int().min(0).default(3600),
  store: z.boolean().default(false),
});

export type CaptureOptions = z.infer<typeof captureOptionsSchema>;
export type CaptureOptionsInput = z.input<typeof captureOptionsSchema>;
