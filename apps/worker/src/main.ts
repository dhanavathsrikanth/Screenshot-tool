/**
 * Snapforge worker process entry point.
 *
 * Boots the headless capture engine, an R2-backed byte store, and a BullMQ worker that
 * dispatches capture jobs to them. Designed to be supervised by a process manager
 * (systemd, Docker, fly machines) — the only side effects are Redis + R2 + outbound
 * HTTP for stealth fetches.
 */
import { SnapforgeEngine, createEngine } from "@snapforge/engine";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import {
  CaptureCache,
  MemoryCacheBackend,
  createR2Storage,
  resolveStorageConfig,
  CaptureStore,
} from "@snapforge/storage";
import {
  createCaptureWorker,
  createQueueConnection,
  resolveQueueConfig,
  type CaptureWorker,
  WorkerHeartbeat,
} from "@snapforge/queue";
import { createWorkerExecutor } from "./executor.js";
import { createWorkerCache } from "./cache.js";

export interface WorkerRuntime {
  worker: CaptureWorker;
  engine: SnapforgeEngine;
  store: CaptureStore;
  heartbeat: WorkerHeartbeat;
  close(): Promise<void>;
}

export interface WorkerRuntimeOptions {
  /** Worker process identifier — surfaced in job progress and logs. */
  workerId?: string;
  /** Override the default engine config. */
  engineConfig?: Parameters<typeof createEngine>[0];
  /** Override the byte store. Defaults to the R2 client + memory cache wired from env. */
  store?: CaptureStore;
  /** Override the BullMQ Redis connection. */
  queueConnection?: ReturnType<typeof createQueueConnection>;
  logger?: (level: "debug" | "info" | "warn" | "error", message: string, fields?: Record<string, unknown>) => void;
}

/**
 * Builds the worker runtime from environment variables. The returned object owns every
 * resource that needs to be torn down on shutdown — `close()` flushes them in the
 * reverse order they were opened.
 */
export function buildWorkerRuntime(options: WorkerRuntimeOptions = {}): WorkerRuntime {
  const queueConfig = resolveQueueConfig();
  const connection = options.queueConnection ?? createQueueConnection(queueConfig);
  const store =
    options.store ??
    (() => {
      const storageConfig = resolveStorageConfig();
      if (!storageConfig) {
        throw new Error(
          "STORAGE_BUCKET / STORAGE_ACCESS_KEY_ID / STORAGE_SECRET_ACCESS_KEY must be set for the worker",
        );
      }
      return new CaptureStore({
        cache: new CaptureCache(new MemoryCacheBackend()),
        storage: createR2Storage(storageConfig),
      });
    })();
  const engine = createEngine({ maxConcurrentCaptures: queueConfig.concurrency, allowPrivateNetwork: false, ...options.engineConfig }, createWorkerCache(store));

  const executor = createWorkerExecutor({
    engine,
    store,
    logger: options.logger,
  });

  const workerId = options.workerId ?? `worker-${randomUUID()}`;
  const worker = createCaptureWorker(queueConfig, executor, {
    client: connection.worker,
    workerId,
  });
  const heartbeat = new WorkerHeartbeat(connection.producer, queueConfig, workerId, async () => (await engine.health()).ok);

  let closed = false;
  const close = async (): Promise<void> => {
    if (closed) return;
    closed = true;
    try {
      try {
        await heartbeat.close();
      } finally {
        await worker.close();
      }
    } finally {
      try {
        await engine.close();
      } finally {
        await connection.close();
      }
    }
  };

  return { worker, engine, store, heartbeat, close };
}

/**
 * Runs the worker until SIGINT/SIGTERM. Returns the promise the process is awaiting so
 * the caller can decide what to do after a shutdown (typically: exit 0).
 */
export function runWorker(options: WorkerRuntimeOptions = {}): Promise<void> {
  const runtime = buildWorkerRuntime(options);
  const shutdown = (signal: NodeJS.Signals): void => {
    runtime
      .close()
      .then(() => process.kill(process.pid, signal))
      .catch((error) => {
        const reason = error instanceof Error ? error.stack ?? error.message : String(error);
        // eslint-disable-next-line no-console
        console.error(`worker shutdown failed: ${reason}`);
        process.exit(1);
      });
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  return startWorkerRuntime(runtime);
}

export async function startWorkerRuntime(runtime: {
  engine: Pick<SnapforgeEngine, "warm">;
  worker: Pick<CaptureWorker, "start">;
  heartbeat?: Pick<WorkerHeartbeat, "start" | "close">;
  close(): Promise<void>;
}): Promise<void> {
  let keepWarmTimer: ReturnType<typeof setInterval> | undefined;
  try {
    await runtime.engine.warm();
    keepWarmTimer = setInterval(() => {
      void runtime.engine.warm().catch(() => {});
    }, 10_000);
    const running = runtime.worker.start();
    void running.catch(() => {});
    await runtime.heartbeat?.start();
    try {
      await running;
    } finally {
      if (keepWarmTimer) clearInterval(keepWarmTimer);
      await runtime.heartbeat?.close();
    }
  } catch (error) {
    if (keepWarmTimer) clearInterval(keepWarmTimer);
    await runtime.close().catch(() => {});
    throw error;
  }
}

// Auto-start when invoked as the script entry point.
const isMain = (() => {
  try {
    return !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch {
    return false;
  }
})();

if (isMain) {
  runWorker().catch((error) => {
    const reason = error instanceof Error ? error.stack ?? error.message : String(error);
    // eslint-disable-next-line no-console
    console.error(`worker crashed: ${reason}`);
    process.exit(1);
  });
}
