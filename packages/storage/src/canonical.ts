import { createHash } from "node:crypto";
import type { CaptureOptions } from "@snapforge/contracts";

/**
 * Options that describe *delivery* rather than *rendering*. Two requests differing only
 * in these produce byte-identical images, so folding them into the key would split the
 * cache for no reason — and `cache_ttl` in particular must stay out or a caller could
 * never read back a key written under a different TTL.
 */
export const NON_RENDERING_OPTIONS = ["sync", "store", "cache_ttl"] as const;

/**
 * Renders a value as a deterministic string: object keys sorted, `undefined` dropped.
 *
 * Two callers that pass the same options in a different property order, or the same
 * headers in a different order, must land on the same key or the cache leaks.
 */
export function canonicalize(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    if (entries.length === 0) return "{}";
    return `{${entries
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalize(item)}`)
      .join(",")}}`;
  }
  if (value === undefined) return "null";
  return JSON.stringify(value) ?? "null";
}

/**
 * Normalizes the target URL for key purposes.
 *
 * Host case and default ports are folded because they cannot change the response, but
 * the fragment is deliberately preserved: it never reaches the server, yet client-side
 * routers render `#/route` differently from `#/other`.
 */
export function normalizeTargetUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    parsed.hostname = parsed.hostname.toLowerCase();
    if (
      (parsed.protocol === "https:" && parsed.port === "443") ||
      (parsed.protocol === "http:" && parsed.port === "80")
    ) {
      parsed.port = "";
    }
    return parsed.toString();
  } catch {
    return rawUrl.trim();
  }
}

/** The render-affecting subset of the options, for both keying and debugging. */
export function renderFingerprint(options: CaptureOptions): Record<string, unknown> {
  const excluded = new Set<string>(NON_RENDERING_OPTIONS);
  const entries = Object.entries(options as unknown as Record<string, unknown>)
    .filter(([key, value]) => !excluded.has(key) && value !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return Object.fromEntries(entries);
}

export interface CacheKeyParts {
  /** sha256 over canonical options plus the normalized target URL. */
  digest: string;
  /** Normalized URL, kept for human-readable object paths and debugging. */
  targetUrl: string;
  /** Format-specific prefix so PNG and WebP of one render never collide. */
  format: string;
}

/**
 * Derives the cache key: `sha256(canonical(options) + target_url)`.
 *
 * Auth headers are part of the fingerprint on purpose — a page behind a bearer token
 * renders differently per token, so ignoring them would serve one caller's authenticated
 * screenshot to another. The digest is one-way, so credentials never land in an object
 * path or in a log line.
 */
export function cacheKey(options: CaptureOptions): string {
  const fingerprint = renderFingerprint(options);
  const targetUrl = normalizeTargetUrl(options.url);
  return sha256(`${canonicalize(fingerprint)}|${targetUrl}`);
}

export function cacheKeyParts(options: CaptureOptions): CacheKeyParts {
  return {
    digest: cacheKey(options),
    targetUrl: normalizeTargetUrl(options.url),
    format: options.format,
  };
}

export function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/**
 * Content-addressed object path. Sharding on the digest prefix keeps any single R2
 * prefix from becoming a hot partition once the bucket is large.
 */
export function objectKeyFor(digest: string, format: string): string {
  const safeFormat = format.toLowerCase();
  const shard = digest.slice(0, 2);
  const nested = digest.slice(2, 4);
  return `captures/${shard}/${nested}/${digest}.${safeFormat}`;
}
