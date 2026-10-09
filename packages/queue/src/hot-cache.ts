import type { CaptureOptions, CaptureSuccessData } from "@snapforge/contracts";
import { cacheKey, FastLRU, type FastLruStats } from "@snapforge/storage";

export interface HotCacheOptions {
  /** Maximum entries kept in memory. Defaults to 1024. */
  maxEntries?: number;
  /** Optional ceiling on per-entry TTL, regardless of what the caller asked for. */
  defaultTtlMs?: number;
  /** Optional clock for tests. */
  now?: () => number;
}

/**
 * Synchronous, in-process cache for completed capture results.
 *
 * The dispatcher's hot path needs a cache that returns within microseconds — no
 * Redis round-trip, no JSON parse. Entries are keyed by `cacheKey(options)` so two
 * callers asking for the same render land on the same key, regardless of which
 * fields differ only in non-rendering knobs (e.g. webhook secrets, `cache_ttl`).
 *
 * A zero `cache_ttl` is treated as "do not cache" and the entry is skipped on both
 * write and read — the same rule `CaptureCache` follows so the two stay consistent.
 */
export class HotCache {
  private readonly lru: FastLRU<CaptureSuccessData>;
  private readonly defaultTtlMs: number;

  constructor(options: HotCacheOptions = {}) {
    this.lru = new FastLRU<CaptureSuccessData>({ maxEntries: options.maxEntries ?? 1024, now: options.now });
    this.defaultTtlMs = Math.max(0, options.defaultTtlMs ?? 0);
  }

  /** TTL in milliseconds; zero means "do not cache". */
  static resolveTtlMs(options: Pick<CaptureOptions, "cache_ttl">): number {
    const ttl = Math.floor(options.cache_ttl);
    return ttl > 0 ? ttl * 1000 : 0;
  }

  /**
   * Returns the cached payload for these options, or `undefined` on miss / expiry.
   * Synchronous: callers on the dispatch hot path do not pay an event-loop turn.
   */
  get(options: CaptureOptions): CaptureSuccessData | undefined {
    const ttlMs = HotCache.resolveTtlMs(options);
    if (ttlMs === 0) return undefined;
    return this.lru.get(cacheKey(options));
  }

  /**
   * Stores a payload under these options. A zero `cache_ttl` skips the write
   * entirely so a request that asked not to be cached never ends up in memory.
   */
  set(options: CaptureOptions, data: CaptureSuccessData): void {
    const ttlMs = HotCache.resolveTtlMs(options);
    if (ttlMs === 0) return;
    const ttl = this.defaultTtlMs > 0 ? Math.min(ttlMs, this.defaultTtlMs) : ttlMs;
    this.lru.set(cacheKey(options), data, ttl);
  }

  delete(options: CaptureOptions): void {
    this.lru.delete(cacheKey(options));
  }

  clear(): void {
    this.lru.clear();
  }

  get size(): number {
    return this.lru.size;
  }

  get stats(): FastLruStats {
    return this.lru.stats;
  }
}