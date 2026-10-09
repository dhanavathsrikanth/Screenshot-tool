import { renderDiagnosticsSchema, type CaptureOptions, type CaptureSuccessData } from "@snapforge/contracts";
import { CaptureCache, type CacheEntry } from "./cache.js";
import type { StorageClient } from "./r2.js";

export interface CaptureStoreOptions {
  cache: CaptureCache;
  storage: StorageClient;
  /** Seconds to advertise at the CDN for stored objects. */
  edgeTtlSeconds?: number;
  now?: () => number;
}

/** A hit always carries bytes; the engine requires them to satisfy `CaptureOutcome`. */
export type LookupResult =
  | { hit: true; data: CaptureSuccessData; buffer: Buffer }
  | { hit: false; data?: undefined; buffer?: undefined };

const CONTENT_TYPES: Record<string, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
  pdf: "application/pdf",
};

function contentTypeFor(format: string): string {
  return CONTENT_TYPES[format.toLowerCase()] ?? "application/octet-stream";
}

/**
 * Serialises the response fields worth preserving across a metadata-cache eviction into
 * the flat string map S3 accepts as user-defined `Metadata`. Numeric fields are stringified
 * so the same value survives the round-trip through the wire format; `cdn_url` is omitted
 * because the lookup path recomputes it from the bucket key.
 */
function metadataFromData(data: CaptureSuccessData, storedAt: number, ttl: number): import("./r2.js").StoredObjectMetadata {
  return {
    url: data.url,
    final_url: data.final_url,
    format: data.format,
    width: String(data.width),
    height: String(data.height),
    bytes: String(data.bytes),
    duration_ms: String(data.duration_ms),
    blocked_requests: String(data.blocked_requests),
    stored_at: String(storedAt),
    expires_at: String(storedAt + ttl * 1000),
    ...(data.render_diagnostics ? { render_diagnostics: JSON.stringify(data.render_diagnostics) } : {}),
  };
}

/**
 * Rebuilds a `CaptureSuccessData` from a stored object's sidecar metadata. Anything that
 * was not preserved (or that the metadata cache never had) falls back to the request
 * options — they are stable for a given cache key, so reusing them produces a consistent
 * envelope. `cached: true` is set because by definition the render was avoided.
 */
function rehydrateFromMetadata(
  options: CaptureOptions,
  head: import("./r2.js").ObjectMetadata,
  byteLength: number,
  url: string,
): CaptureSuccessData {
  let diagnostics: ReturnType<typeof renderDiagnosticsSchema.safeParse> | undefined;
  try { diagnostics = renderDiagnosticsSchema.safeParse(JSON.parse(head.custom.render_diagnostics ?? "null")); } catch {}
  const num = (raw: string | undefined, fallback: number): number => {
    if (raw === undefined) return fallback;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  return {
    url: head.custom.url ?? options.url,
    final_url: head.custom.final_url ?? options.url,
    format: head.custom.format ?? options.format,
    width: num(head.custom.width, 0),
    height: num(head.custom.height, 0),
    duration_ms: num(head.custom.duration_ms, 0),
    bytes: num(head.custom.bytes, byteLength),
    blocked_requests: num(head.custom.blocked_requests, 0),
    cached: true,
    cdn_url: url,
    ...(diagnostics?.success ? { render_diagnostics: diagnostics.data } : {}),
  };
}

/**
 * Byte store for captures: content-addressed objects in R2 with a TTL metadata cache in
 * front of them.
 *
 * The cache holds metadata, not bytes. A hit therefore fetches the payload from object
 * storage only when the process does not already have it, which is what keeps a warm
 * cache cheap regardless of image size.
 */
export class CaptureStore {
  constructor(private readonly options: CaptureStoreOptions) {}

  /**
   * Resolves a warm entry for these options, rehydrating bytes when needed.
   *
   * Lookup runs three steps, each only as far as it needs to:
   * 1. Read the TTL-bound cache. A cache hit carries the full response shape, and skips
   *    object storage entirely when its buffer field is populated.
   * 2. On a metadata-only cache hit, fetch the bytes from object storage and stitch the
   *    response together.
   * 3. On a cache miss, fall back to the object directly. The bucket copy survives a
   *    metadata eviction because the response data is mirrored in user-defined object
   *    metadata; the cost is one HEAD + one GET instead of a fresh render.
   *
   * A metadata entry whose object has since been deleted from the bucket is reported as
   * a miss: serving a cache hit without bytes would produce a response the engine
   * cannot honour, so re-rendering is the honest outcome.
   */
  async lookup(options: CaptureOptions): Promise<LookupResult> {
    const ttl = CaptureCache.resolveTtl(options);
    if (ttl === 0) return { hit: false };
    const location = CaptureCache.locationFor(options);
    const entry = await this.options.cache.get(options);

    if (entry) {
      let buffer = entry.buffer;
      if (!buffer) {
        try {
          buffer = (await this.options.storage.get(location.objectKey)) ?? undefined;
        } catch {
          return { hit: false };
        }
        if (!buffer) return { hit: false };
      }
      const url = await this.options.storage.urlFor(location.objectKey);
      return {
        hit: true,
        buffer,
        data: { ...CaptureCache.asHit(entry), cdn_url: url },
      };
    }

    // Cold cache, warm bucket: rehydrate from the object and its sidecar metadata.
    let head: import("./r2.js").ObjectMetadata | null;
    try {
      head = await this.options.storage.head(location.objectKey);
    } catch {
      return { hit: false };
    }
    if (!head) return { hit: false };
    const storedAt = Number(head.custom.stored_at);
    const expiresAt = Number(head.custom.expires_at);
    const now = this.options.now?.() ?? Date.now();
    if (!Number.isFinite(storedAt) || !Number.isFinite(expiresAt) || storedAt > now ||
      now >= Math.min(expiresAt, storedAt + ttl * 1000)) return { hit: false };

    let buffer: Buffer | undefined;
    try {
      buffer = (await this.options.storage.get(location.objectKey)) ?? undefined;
    } catch {
      return { hit: false };
    }
    if (!buffer) return { hit: false };

    const url = await this.options.storage.urlFor(location.objectKey);
    return {
      hit: true,
      buffer,
      data: rehydrateFromMetadata(options, head, buffer.byteLength, url),
    };
  }

  /**
   * Persists a fresh capture and returns the response data with `cdn_url` filled in.
   *
   * The response shape (URLs, format, dimensions, duration, blocked-request count) is
   * written as user-defined object metadata alongside the bytes, so a cold-cache lookup
   * can rebuild the same envelope without re-rendering.
   *
   * A storage failure is not fatal to the capture: the bytes already exist in the
   * response. The cache write is skipped too, since pointing at an object that was
   * never created would produce a broken link on the next hit.
   */
  async save(
    options: CaptureOptions,
    data: CaptureSuccessData,
    buffer: Buffer,
  ): Promise<CaptureSuccessData> {
    const location = CaptureCache.locationFor(options);
    let stored: CaptureSuccessData;
    try {
      await this.options.storage.put(
        location.objectKey,
        buffer,
        contentTypeFor(location.format),
        Math.min(this.options.edgeTtlSeconds ?? 0, CaptureCache.resolveTtl(options)),
        metadataFromData(data, this.options.now?.() ?? Date.now(), CaptureCache.resolveTtl(options)),
      );
      const url = await this.options.storage.urlFor(location.objectKey);
      stored = { ...data, cdn_url: url };
    } catch {
      return data;
    }

    await this.options.cache.put(options, stored);
    return stored;
  }

  /** Drops both the metadata entry and the stored object. */
  async forget(options: CaptureOptions): Promise<void> {
    await this.options.cache.delete(options);
    const location = CaptureCache.locationFor(options);
    await this.options.storage.delete(location.objectKey);
  }

  get stats() {
    return this.options.cache.stats;
  }

  /** Direct access for diagnostics that need the raw entry. */
  async entryFor(options: CaptureOptions): Promise<CacheEntry | null> {
    return this.options.cache.get(options);
  }
}
