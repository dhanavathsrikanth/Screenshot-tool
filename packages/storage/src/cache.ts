import type { CaptureOptions, CaptureSuccessData } from "@snapforge/contracts";
import { cacheKey, cacheKeyParts, objectKeyFor } from "./canonical.js";

/**
 * A cached capture. `buffer` is optional because the metadata cache does not hold the
 * payload — bytes live in object storage and are rehydrated on read.
 */
export interface CacheEntry {
  data: CaptureSuccessData;
  buffer?: Buffer;
  storedAt: number;
  expiresAt: number;
  hits: number;
}

export interface CacheStats {
  hits: number;
  misses: number;
  writes: number;
  evictions: number;
  size: number;
  hitRate: number;
}

/**
 * Pluggable backend so the same cache logic runs against an in-process map locally and
 * R2 (or Redis) in production without the caller caring which.
 */
export interface CacheBackend {
  get(key: string): Promise<CacheEntry | null>;
  set(key: string, entry: CacheEntry): Promise<void>;
  delete(key: string): Promise<void>;
  /** Keys currently held, used for bounded eviction and diagnostics. */
  keys(): Promise<string[]>;
}

export interface MemoryCacheBackendOptions {
  maxEntries?: number;
}

interface MemoryRecord {
  entry: CacheEntry;
}

/**
 * Bounded in-process cache with LRU eviction.
 *
 * Entries are evicted on access rather than on write, so a hot key is never the one
 * dropped, and the bound is enforced after write because that is when the map can
 * exceed its ceiling.
 */
export class MemoryCacheBackend implements CacheBackend {
  private readonly map = new Map<string, MemoryRecord>();
  private readonly maxEntries: number;

  constructor(options: MemoryCacheBackendOptions = {}) {
    this.maxEntries = Math.max(1, options.maxEntries ?? 256);
  }

  async get(key: string): Promise<CacheEntry | null> {
    const record = this.map.get(key);
    if (!record) return null;
    this.map.delete(key);
    this.map.set(key, record);
    return record.entry;
  }

  async set(key: string, entry: CacheEntry): Promise<void> {
    this.map.delete(key);
    this.map.set(key, { entry });
    while (this.map.size > this.maxEntries) {
      const oldest = this.map.keys().next();
      if (oldest.done) break;
      this.map.delete(oldest.value);
    }
  }

  async delete(key: string): Promise<void> {
    this.map.delete(key);
  }

  async keys(): Promise<string[]> {
    return [...this.map.keys()];
  }
}

/**
 * TTL cache over captures, keyed by canonical options.
 *
 * A TTL of zero means "do not cache" and is checked on read *and* write: a zero-TTL
 * entry that slipped into the store would otherwise be served from a later read.
 */
export class CaptureCache {
  private hits = 0;
  private misses = 0;
  private writes = 0;
  private evictions = 0;

  constructor(
    private readonly backend: CacheBackend,
    private readonly now: () => number = Date.now,
  ) {}

  /**
   * Resolves the effective TTL. A request may only shorten the window, never extend it
   * past what the caller originally agreed to.
   */
  static resolveTtl(options: Pick<CaptureOptions, "cache_ttl">): number {
    return Math.max(0, Math.floor(options.cache_ttl));
  }

  async get(options: CaptureOptions): Promise<CacheEntry | null> {
    const ttl = CaptureCache.resolveTtl(options);
    if (ttl === 0) {
      return null;
    }
    const key = cacheKey(options);
    const entry = await this.backend.get(key);
    if (!entry) {
      this.misses += 1;
      return null;
    }
    if (Math.min(entry.expiresAt, entry.storedAt + ttl * 1000) <= this.now()) {
      await this.backend.delete(key);
      this.misses += 1;
      this.evictions += 1;
      return null;
    }
    this.hits += 1;
    return { ...entry, hits: entry.hits + 1 };
  }

  /**
   * Stores a capture, tagged with where its bytes live. A `ttl` of zero skips the write
   * entirely rather than persisting an entry that can never be read.
   */
  async put(
    options: CaptureOptions,
    data: CaptureSuccessData,
    buffer?: Buffer,
  ): Promise<CacheEntry | null> {
    const ttl = CaptureCache.resolveTtl(options);
    if (ttl === 0) return null;

    const now = this.now();
    const key = cacheKey(options);
    const entry: CacheEntry = {
      data: { ...data, cached: false },
      ...(buffer ? { buffer } : {}),
      storedAt: now,
      expiresAt: now + ttl * 1000,
      hits: 0,
    };
    await this.backend.set(key, entry);
    this.writes += 1;
    return entry;
  }

  /**
   * Cache-hit shape of the response: `cached: true` plus the original render duration,
   * which is what makes a hit visible in the metrics rather than looking like a 0ms render.
   */
  static asHit(entry: CacheEntry): CaptureSuccessData {
    return { ...entry.data, cached: true };
  }

  /** Storage location for a set of options, for writing bytes after a cache miss. */
  static locationFor(options: CaptureOptions): {
    digest: string;
    key: string;
    objectKey: string;
    targetUrl: string;
    format: string;
  } {
    const parts = cacheKeyParts(options);
    return {
      digest: parts.digest,
      key: parts.digest,
      objectKey: objectKeyFor(parts.digest, parts.format),
      targetUrl: parts.targetUrl,
      format: parts.format,
    };
  }

  async delete(options: CaptureOptions): Promise<void> {
    await this.backend.delete(cacheKey(options));
  }

  async clear(): Promise<void> {
    for (const key of await this.backend.keys()) {
      await this.backend.delete(key);
    }
  }

  get stats(): CacheStats {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      writes: this.writes,
      evictions: this.evictions,
      size: total,
      hitRate: total === 0 ? 0 : this.hits / total,
    };
  }
}
