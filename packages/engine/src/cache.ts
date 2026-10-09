import { CAPTURE_RENDER_VERSION, type CaptureOptions, type CaptureSuccessData } from "@snapforge/contracts";

/**
 * The engine's view of a capture store. Declared here rather than imported from
 * `@snapforge/storage` so the engine keeps no storage or AWS dependency: the engine
 * renders, and something else decides whether the bytes are worth keeping.
 *
 * A hit must carry the bytes. `CaptureOutcome.buffer` is required, so a port that could
 * only return metadata would force the engine to know how to rehydrate — which is the
 * storage package's job, not this one's.
 */
export interface CaptureCachePort {
  /** Returns a previously stored capture, or null on a miss. */
  lookup(options: CaptureOptions): Promise<CachedCapture | null>;
  /** Persists a fresh capture. Failures must not fail the capture. */
  save(
    options: CaptureOptions,
    data: CaptureSuccessData,
    buffer: Buffer,
  ): Promise<CaptureSuccessData>;
}

export interface CachedCapture {
  data: CaptureSuccessData;
  buffer: Buffer;
}

/** Port with every method disabled, so caching can be omitted entirely. */
export const nullCaptureCache: CaptureCachePort = {
  async lookup() {
    return null;
  },
  async save(_options, data) {
    return data;
  },
};

export class CaptureCacheConfigError extends Error {
  readonly code = "config_invalid";
}

/**
 * In-process cache honouring `cache_ttl`.
 *
 * This is the default when no store is injected. It keeps `cache_ttl` real — a
 * `cache_ttl: 0` request always re-renders — without requiring any infrastructure,
 * which is what makes cache behaviour testable at the engine level.
 */
export class InProcessCaptureCache implements CaptureCachePort {
  private readonly entries = new Map<
    string,
    { data: CaptureSuccessData; buffer: Buffer; storedAt: number; expiresAt: number }
  >();

  constructor(
    private readonly now: () => number = Date.now,
    private readonly maxEntries = 512,
  ) {}

  async lookup(options: CaptureOptions): Promise<CachedCapture | null> {
    const ttl = ttlOf(options);
    if (ttl === 0) return null;
    const key = cacheKeyOf(options);
    const hit = this.entries.get(key);
    if (!hit) return null;
    if (Math.min(hit.expiresAt, hit.storedAt + ttl * 1000) <= this.now()) {
      this.entries.delete(key);
      return null;
    }
    this.entries.delete(key);
    this.entries.set(key, hit);
    return { data: { ...hit.data, cached: true }, buffer: hit.buffer };
  }

  async save(
    options: CaptureOptions,
    data: CaptureSuccessData,
    buffer: Buffer,
  ): Promise<CaptureSuccessData> {
    const ttl = ttlOf(options);
    if (ttl === 0) return data;
    const key = cacheKeyOf(options);
    this.entries.delete(key);
    const storedAt = this.now();
    this.entries.set(key, { data, buffer, storedAt, expiresAt: storedAt + ttl * 1000 });
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next();
      if (oldest.done) break;
      this.entries.delete(oldest.value);
    }
    return data;
  }

  get size(): number {
    return this.entries.size;
  }

  clear(): void {
    this.entries.clear();
  }
}

function ttlOf(options: CaptureOptions): number {
  return Math.max(0, Math.floor(options.cache_ttl));
}

/**
 * Engine-side cache key. This mirrors `canonicalize` + `sha256(canonical + target_url)`
 * from the storage package so both layers agree on what identifies a capture, without
 * the engine importing that package.
 */
function cacheKeyOf(options: CaptureOptions): string {
  const fingerprint: Record<string, unknown> = {};
  for (const key of Object.keys(options as unknown as Record<string, unknown>).sort()) {
    if (key === "sync" || key === "store" || key === "cache_ttl") continue;
    fingerprint[key] = (options as unknown as Record<string, unknown>)[key];
  }
  return `${CAPTURE_RENDER_VERSION}|${stableStringify(fingerprint)}|${options.url}`;
}

function stableStringify(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return entries.length === 0
      ? "{}"
      : `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
  }
  if (value === undefined) return "null";
  return JSON.stringify(value) ?? "null";
}
