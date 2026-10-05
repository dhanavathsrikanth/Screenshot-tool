import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { SnapforgeError } from "@snapforge/contracts";
import { CaptureCompletionConsumer, type CaptureFinalization, type CaptureLifecycleRepository } from "./settlement.js";
import { CaptureService, type CaptureBilling } from "./service.js";
import { CaptureQueue } from "./queue.js";
import { CaptureDispatcher, createQueueEvents } from "./dispatcher.js";
import { createQueueConnection, createQueue } from "./connection.js";
import { resolveQueueConfig } from "./config.js";
import { createCaptureWorker } from "./worker.js";

const redisUrl = process.env.TEST_REDIS_URL || process.env.REDIS_URL;

for (const outcome of ["success", "failure", "retry"] as const) {
  test(`BullMQ completion settles ${outcome} without polling`, { skip: !redisUrl, timeout: 30_000 }, async () => {
    const suffix = randomUUID();
    const config = resolveQueueConfig({ redisUrl: redisUrl!, queueName: `completion-${suffix}`, prefix: `test-${suffix}`,
      concurrency: 1, attempts: 2, backoffDelayMs: 10 });
    const connection = createQueueConnection(config);
    const host = createQueue(config, connection.producer);
    const queue = new CaptureQueue(host, config);
    const events = await createQueueEvents(config, connection.producer);
    const held = new Set<string>();
    const cleanup = new Set<string>();
    const records = new Map<string, CaptureFinalization>();
    let charges = 0;
    let releases = 0;
    const lifecycle: CaptureLifecycleRepository = {
      async commitCapture(input) {
        const existing = records.get(input.jobId);
        if (existing) return existing.snapshot;
        if (held.delete(input.jobId) && input.snapshot.result?.ok) charges++;
        records.set(input.jobId, input);
        cleanup.add(input.jobId);
        return input.snapshot;
      },
      storedCapture: async (_, jobId) => records.get(jobId)?.snapshot ?? null,
      claimPendingCaptures: async () => [...held].map((jobId) => ({ accountId: "account", jobId })),
      claimPendingCleanup: async () => [...cleanup].map((jobId) => ({ accountId: "account", jobId })),
      completeCleanup: async (jobId) => { cleanup.delete(jobId); },
      expiredCaptures: async () => [], completePruning: async () => {},
    };
    const billing: CaptureBilling & { lifecycle: CaptureLifecycleRepository } = {
      lifecycle, reserveCapture: async (_, id) => { held.add(id); return true; }, linkReservationToJob: async () => {},
      settleCapture: async () => { throw new Error("legacy finalization"); },
      reservationForJob: async () => { throw new Error("polling finalization"); }, recordCapture: async () => {},
    };
    const admission = { acquireJob: async () => {}, releaseJob: async () => { releases++; } };
    const consumer = new CaptureCompletionConsumer({ queue, events, billing, admission, intervalMs: 60_000 });
    let attempts = 0;
    const worker = createCaptureWorker(config, async (options) => {
      attempts++;
      if (outcome === "failure" || (outcome === "retry" && attempts === 1)) {
        throw new SnapforgeError({ code: "render_timeout", message: "Test timeout", requestId: suffix });
      }
      return { data: { url: options.url, final_url: options.url, format: "png", width: 1280, height: 720, bytes: 123,
        duration_ms: 100, cached: false, blocked_requests: 0, cdn_url: "https://cdn.example.com/capture.png" } };
    }, { client: connection.worker });
    let running: Promise<void> | undefined;
    try {
      await consumer.start();
      const service = new CaptureService({ queue, dispatcher: new CaptureDispatcher(queue, config), billing, admission });
      const accepted = await service.submit({ accountId: "account" }, { url: "https://example.com" }, suffix, "async");
      assert.equal(accepted.state, "waiting");
      assert.equal(records.size, 0);
      running = worker.start();
      void running.catch(() => {});
      const deadline = Date.now() + 20_000;
      while ((!records.size || cleanup.size) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20));
      assert.equal(held.size, 0);
      assert.equal(records.size, 1);
      assert.equal(charges, outcome === "failure" ? 0 : 1);
      assert.equal(records.get(accepted.id)?.snapshot.result?.ok, outcome !== "failure");
      assert.ok(releases > 0);
      assert.equal(attempts, outcome === "success" ? 1 : 2);
    } finally {
      await worker.close(true);
      await running?.catch(() => {});
      await consumer.close();
      await events.close();
      await host.obliterate({ force: true });
      await queue.close();
      await connection.close();
    }
  });
}
