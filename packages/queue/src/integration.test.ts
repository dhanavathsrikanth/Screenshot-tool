import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { captureOptionsSchema, SnapforgeError } from "@snapforge/contracts";
import { resolveQueueConfig, type QueueConfig } from "./config.js";
import { createQueueConnection, createQueueHost } from "./connection.js";
import { CaptureQueue } from "./queue.js";
import { CaptureDispatcher, createQueueEvents, createQueueEventsWaiter } from "./dispatcher.js";
import { createCaptureWorker, type CaptureExecutor } from "./worker.js";
import type { CaptureJobPayload, CaptureJobResult } from "./types.js";

const REDIS_URL = process.env.REDIS_URL ?? process.env.TEST_REDIS_URL;
const run = REDIS_URL !== undefined && REDIS_URL !== "" ? describe : describe.skip;

const successData = (url: string): NonNullable<CaptureJobResult["data"]> => ({
  url,
  final_url: url,
  format: "png",
  width: 1280,
  height: 720,
  bytes: 1024,
  duration_ms: 10,
  cached: false,
  blocked_requests: 0,
});

let counter = 0;
const unique = () => `it${process.pid}${Date.now()}${counter++}`;

interface Fleet {
  config: QueueConfig;
  queue: CaptureQueue;
  dispatcher: CaptureDispatcher;
  worker: ReturnType<typeof createCaptureWorker>;
  close(): Promise<void>;
}

/**
 * Every scenario gets its own queue name, Redis namespace, QueueEvents and
 * worker. Sharing one fleet would let a fast default worker steal the job meant
 * for a scenario-specific executor, which is exactly the flake these tests exist
 * to avoid.
 */
async function withFleet(executor: CaptureExecutor, overrides: Partial<QueueConfig> = {}): Promise<Fleet> {
  const config = resolveQueueConfig({
    redisUrl: REDIS_URL as string,
    queueName: `${unique()}-queue`,
    prefix: unique(),
    concurrency: 1,
    attempts: 2,
    backoffDelayMs: 50,
    ...overrides,
  });

  const connection = createQueueConnection(config);
  const queue = new CaptureQueue(createQueueHost(config, connection.producer), config);
  const events = await createQueueEvents(config, connection.producer);
  const dispatcher = new CaptureDispatcher(queue, config, createQueueEventsWaiter(events, queue));
  const worker = createCaptureWorker(config, executor, {
    client: connection.worker,
    workerId: `worker-${unique()}`,
  });
  const running = worker.start();
  void running.catch(() => {});

  return {
    config,
    queue,
    dispatcher,
    worker,
    async close() {
      await worker.close(true);
      await running.catch(() => {});
      await events.close();
      await connection.close();
    },
  };
}

const echo: CaptureExecutor = async (options) => ({ data: successData(options.url) });

run("queue integration against Redis", () => {
  const fleets: Fleet[] = [];

  const fleet = async (executor: CaptureExecutor, overrides: Partial<QueueConfig> = {}): Promise<Fleet> => {
    const created = await withFleet(executor, overrides);
    fleets.push(created);
    return created;
  };

  after(async () => {
    await Promise.allSettled(fleets.map((entry) => entry.close()));
  });

  it("round-trips a job through real BullMQ, the queue and QueueEvents", async () => {
    const { dispatcher } = await fleet(echo);

    const result = await dispatcher.dispatch({
      requestId: `req_${unique()}`,
      mode: "sync",
      options: captureOptionsSchema.parse({ url: "https://example.com" }),
    });

    assert.equal(result.settled, true, "a fast render must settle inside the sync budget");
    assert.equal(result.state, "completed");
    assert.equal(result.result?.ok, true);
    assert.equal(result.result?.data?.bytes, 1024);
  });

  it("stores the completed result where the status endpoint can read it", async () => {
    const { dispatcher, queue } = await fleet(echo);
    const requestId = `req_${unique()}`;

    const dispatched = await dispatcher.dispatch({
      requestId,
      mode: "sync",
      options: captureOptionsSchema.parse({ url: "https://example.com" }),
    });

    const snapshot = await queue.snapshot(dispatched.job_id);
    assert.ok(snapshot !== null);
    assert.equal(snapshot?.id, dispatched.job_id);
    assert.equal(snapshot?.request_id, requestId);
    assert.equal(snapshot?.state, "completed");
    assert.equal(snapshot?.result?.ok, true);
    assert.equal(snapshot?.progress, 100);
  });

  it("removes a job and clears its snapshot", async () => {
    const { dispatcher, queue } = await fleet(echo);

    const dispatched = await dispatcher.dispatch({
      requestId: `req_${unique()}`,
      mode: "async",
      options: captureOptionsSchema.parse({ url: "https://example.com" }),
    });

    await queue.remove(dispatched.job_id);
    assert.equal(await queue.snapshot(dispatched.job_id), null);
  });

  it("honours a delayed job and reports it as delayed", async () => {
    const { dispatcher, queue } = await fleet(echo);

    const dispatched = await dispatcher.dispatch({
      requestId: `req_${unique()}`,
      mode: "async",
      options: captureOptionsSchema.parse({ url: "https://example.com" }),
      delayMs: 60_000,
    });

    const snapshot = await queue.snapshot(dispatched.job_id);
    assert.equal(snapshot?.state, "delayed");
    await queue.remove(dispatched.job_id);
  });

  it("reports non-negative, unpaused queue depth", async () => {
    const { queue } = await fleet(echo);
    const depth = await queue.depth();
    assert.ok(depth.waiting >= 0);
    assert.ok(depth.active >= 0);
    assert.equal(depth.paused, false);
    assert.equal(depth.total_pending, depth.waiting + depth.active + depth.prioritized + depth.delayed);
  });

  it("surfaces a non-retriable failure as a settled failure on the first attempt", async () => {
    const { dispatcher } = await fleet(async () => {
      throw new SnapforgeError({ code: "blocked_by_target", message: "nope", requestId: "x" });
    });

    const requestId = `req_${unique()}`;
    const result = await dispatcher.dispatch({
      requestId,
      mode: "sync",
      options: captureOptionsSchema.parse({ url: "https://example.com" }),
    });

    assert.equal(result.settled, true);
    assert.equal(result.state, "failed");
    assert.equal(result.result?.ok, false);
    assert.equal(result.result?.error?.code, "blocked_by_target");
    assert.equal(result.result?.request_id, requestId, "the envelope carries the caller's request id, not the job id");
    assert.equal(result.result?.attempts_made, 1, "a non-retriable code must not consume the retry budget");
  });

  it("retries a retriable failure until the attempt budget is spent", async () => {
    let calls = 0;
    const { dispatcher } = await fleet(async () => {
      calls += 1;
      throw new SnapforgeError({ code: "render_timeout", message: "slow", requestId: "x" });
    });

    const result = await dispatcher.dispatch({
      requestId: `req_${unique()}`,
      mode: "sync",
      options: captureOptionsSchema.parse({ url: "https://example.com" }),
    });

    assert.equal(result.state, "failed");
    assert.equal(result.result?.error?.code, "render_timeout");
    assert.equal(calls, 2, "attempts: 2 means the render runs twice");
  });

  it("degrades a render slower than the budget to an async handle", async () => {
    const syncTimeoutMs = 400;
    const { dispatcher, queue } = await fleet(
      async (options) => {
        await new Promise((resolve) => setTimeout(resolve, syncTimeoutMs + 600));
        return { data: successData(options.url) };
      },
      { syncTimeoutMs },
    );

    const dispatched = await dispatcher.dispatch({
      requestId: `req_${unique()}`,
      mode: "sync",
      options: captureOptionsSchema.parse({ url: "https://example.com" }),
    });

    assert.equal(dispatched.settled, false, "a render slower than the budget must not fail the request");
    assert.equal(dispatched.state, "active");
    assert.ok(dispatched.job_id.length > 0);

    const snapshot = await queue.snapshot(dispatched.job_id);
    assert.notEqual(snapshot, null, "the job must survive the timeout so the worker keeps rendering");
  });

  it("keeps the payload schema honest over the wire", async () => {
    const { dispatcher, queue } = await fleet(echo);
    const requestId = `req_${unique()}`;

    const dispatched = await dispatcher.dispatch({
      requestId,
      mode: "async",
      options: captureOptionsSchema.parse({ url: "https://example.com" }),
    });

    const job = await queue.getJob(dispatched.job_id);
    assert.ok(job !== undefined);
    const payload: CaptureJobPayload = job.data;
    assert.equal(payload.request_id, requestId);
    assert.equal(payload.mode, "async");
    assert.equal(payload.attempt_budget, 2);
    assert.equal(payload.options.url, "https://example.com");
    await queue.remove(dispatched.job_id);
  });
});
