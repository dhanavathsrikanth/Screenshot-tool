/**
 * Synchronous, bounded LRU with per-entry TTL.
 *
 * Designed for the dispatcher fast-path: a cache hit must not allocate an event-loop
 * turn, so `Map`-backed O(1) access is the only viable backing store. Per-entry TTL
 * lets a single cache hold keys that expire at different times without a separate
 * reaper — expiry is checked on read.
 */
export interface FastLruOptions {
  maxEntries?: number;
  now?: () => number;
}

export interface FastLruStats {
  hits: number;
  misses: number;
  writes: number;
  evictions: number;
  expirations: number;
  size: number;
}

interface FastLruRecord<V> {
  value: V;
  expiresAt: number;
}

export class FastLRU<V> {
  private readonly map = new Map<string, FastLruRecord<V>>();
  private readonly maxEntries: number;
  private readonly now: () => number;
  private readonly stats_ = { hits: 0, misses: 0, writes: 0, evictions: 0, expirations: 0 };

  constructor(options: FastLruOptions = {}) {
    this.maxEntries = Math.max(1, options.maxEntries ?? 1024);
    this.now = options.now ?? Date.now;
  }

  get(key: string): V | undefined {
    const record = this.map.get(key);
    if (!record) {
      this.stats_.misses += 1;
      return undefined;
    }
    if (record.expiresAt <= this.now()) {
      this.map.delete(key);
      this.stats_.misses += 1;
      this.stats_.expirations += 1;
      return undefined;
    }
    this.map.delete(key);
    this.map.set(key, record);
    this.stats_.hits += 1;
    return record.value;
  }

  set(key: string, value: V, ttlMs: number): void {
    if (ttlMs <= 0) {
      this.map.delete(key);
      return;
    }
    this.map.delete(key);
    this.map.set(key, { value, expiresAt: this.now() + ttlMs });
    while (this.map.size > this.maxEntries) {
      const oldest = this.map.keys().next();
      if (oldest.done) break;
      this.map.delete(oldest.value);
      this.stats_.evictions += 1;
    }
    this.stats_.writes += 1;
  }

  delete(key: string): void {
    this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }

  get stats(): FastLruStats {
    return { ...this.stats_, size: this.map.size };
  }
}