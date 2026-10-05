import {
  createEngine,
  InProcessCaptureCache,
  type CaptureCachePort,
  type CachedCapture,
  type SnapforgeEngine,
} from "@snapforge/engine";
import {
  CaptureCache,
  CaptureStore,
  MemoryCacheBackend,
  createR2Storage,
  resolveStorageConfig,
  type CacheStats,
} from "@snapforge/storage";

interface EngineHolder {
  engine?: SnapforgeEngine;
  store?: CaptureStore;
  starting?: Promise<SnapforgeEngine>;
}

const globalRef = globalThis as unknown as { __snapforgeEngine?: EngineHolder };
const holder: EngineHolder = (globalRef.__snapforgeEngine ??= {});

/**
 * Builds the capture cache.
 *
 * When storage credentials are present, captures land in R2 and cache entries point at
 * a CDN or presigned URL. Without credentials the cache stays in process, so `cache_ttl`
 * still behaves the same locally and the dev bridge needs no infrastructure.
 *
 * The store returns a discriminated `LookupResult`; the engine's port wants a flat
 * `CachedCapture | null`, so the boundary translates the two and discards the cache-miss
 * shape.
 */
function buildCache(): CaptureCachePort {
  const config = resolveStorageConfig();
  if (config) {
    const cache = new CaptureCache(new MemoryCacheBackend({ maxEntries: 512 }));
    const store = new CaptureStore({ cache, storage: createR2Storage(config) });
    holder.store = store;
    return {
      lookup: async (options): Promise<CachedCapture | null> => {
        const result = await store.lookup(options);
        return result.hit ? { data: result.data, buffer: result.buffer } : null;
      },
      save: (options, data, buffer) => store.save(options, data, buffer),
    };
  }
  return new InProcessCaptureCache();
}

export function createDashboardEngine(cache: CaptureCachePort): SnapforgeEngine {
  return createEngine({
    headless: true,
    stealth: true,
    allowPrivateNetwork: false,
    retries: 1,
    maxPageHeight: 24_000,
    idlePhaseMs: 3_000,
    fontWaitMs: 2_000,
    logger: (level, message, meta) => {
      if (level === "error" || level === "warn") console.warn(`[engine] ${message}`, meta ?? {});
    },
  }, cache);
}

export function getEngine(): Promise<SnapforgeEngine> {
  if (holder.engine) return Promise.resolve(holder.engine);
  if (!holder.starting) {
    holder.starting = Promise.resolve()
      .then(() => createDashboardEngine(buildCache()))
      .then((engine) => {
        holder.engine = engine;
        return engine;
      })
      .finally(() => {
        holder.starting = undefined;
      });
  }
  return holder.starting;
}

/** Cache counters for the health endpoint, when a store is configured. */
export function getStoreStats(): CacheStats | null {
  return holder.store?.stats ?? null;
}
