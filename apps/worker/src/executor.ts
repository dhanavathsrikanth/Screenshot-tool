import { SnapforgeError, type CaptureOptions } from "@snapforge/contracts";
import type { SnapforgeEngine, CaptureOutcome } from "@snapforge/engine";
import type { CaptureStore } from "@snapforge/storage";
import type { CaptureContext, CaptureExecutor } from "@snapforge/queue";

/**
 * Wires the headless capture engine to the byte store so a BullMQ job turns into
 * a real screenshot.
 *
 * The executor is the only place where the engine and the store share state. Keeping it
 * thin lets the rest of the worker be a pure queue consumer — easier to test, easier to
 * swap the engine or the store independently.
 */
export function createWorkerExecutor(deps: {
  engine: SnapforgeEngine;
  store: CaptureStore;
  logger?: (level: "debug" | "info" | "warn" | "error", message: string, fields?: Record<string, unknown>) => void;
}): CaptureExecutor {
  const log = deps.logger ?? (() => undefined);
  return async (options: CaptureOptions, context: CaptureContext) => {
    const started = Date.now();
    log("debug", "worker job received", {
      worker_id: context.workerId,
      attempt: context.attempt,
      url: options.url,
    });

    let outcome: CaptureOutcome;
    try {
      outcome = await deps.engine.capture(options);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      log("warn", "worker job failed at engine", {
        worker_id: context.workerId,
        attempt: context.attempt,
        duration_ms: Date.now() - started,
        url: options.url,
        reason,
      });
      throw error;
    }

    const stored = outcome.data.cached ? outcome.data : await deps.store.save(options, outcome.data, outcome.buffer);
    if (!stored.cdn_url) throw new SnapforgeError({
      code: "internal_error",
      message: "Screenshot delivery URL is unavailable; capture was not delivered",
      requestId: context.workerId,
      retriable: true,
    });
    log("info", "worker job completed", {
      worker_id: context.workerId,
      attempt: context.attempt,
      duration_ms: Date.now() - started,
      url: options.url,
      bytes: stored.bytes,
      cached: stored.cached,
    });

    return { data: stored };
  };
}
