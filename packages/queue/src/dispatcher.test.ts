import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { captureOptionsSchema, SnapforgeError } from "@snapforge/contracts";
import { CaptureQueue } from "./queue.js";
import { CaptureDispatcher, isTimeout } from "./dispatcher.js";
import { resolveQueueConfig } from "./config.js";
import { FakeQueueHost, FakeWaiter } from "./fakes.js";
import type { CaptureJobPayload, CaptureJobResult } from "./types.js";

const config = resolveQueueConfig({ redisUrl: "redis://example:6379" });

const basePayload = {
  options: captureOptionsSchema.parse({ url: "https://example.com" }),
  enqueued_at: 1_700_000_000_000,
  attempt_budget: 3,
};

const completedResult: CaptureJobResult = {
  request_id: "req_1",
  mode: "sync",
  ok: true,
  data: {
    url: "https://example.com",
    final_url: "https://example.com",
    format: "png",
    width: 1280,
    height: 720,
    bytes: 10,
    duration_ms: 5,
    cached: false,
    blocked_requests: 0,
  },
  duration_ms: 5,
  attempts_made: 1,
  enqueued_at: 1_700_000_000_000,
  completed_at: 1_700_000_005_000,
};

const failedResult: CaptureJobResult = {
  request_id: "req_1",
  mode: "sync",
  ok: false,
  error: {
    code: "render_timeout",
    message: "navigation exceeded 15000ms",
    retriable: true,
    request_id: "req_1",
  },
  duration_ms: 15_000,
  attempts_made: 3,
  enqueued_at: 1_700_000_000_000,
  completed_at: 1_700_000_015_000,
};

function build(behaviour: ConstructorParameters<typeof FakeWaiter>[0]) {
  const host = new FakeQueueHost();
  const queue = new CaptureQueue(host, config);
  const waiter = new FakeWaiter(behaviour);
  const dispatcher = new CaptureDispatcher(queue, config, waiter);
  return { host, dispatcher, waiter };
}

describe("CaptureDispatcher async mode", () => {
  it("enqueues and returns immediately without waiting", async () => {
    const { host, dispatcher, waiter } = build({ kind: "pending" });

    const result = await dispatcher.dispatch({
      requestId: "req_1",
      mode: "async",
      ...basePayload,
    });

    assert.equal(result.job_id, "job_1");
    assert.equal(result.mode, "async");
    assert.equal(result.settled, false);
    assert.equal(result.state, "waiting");
    assert.equal(result.result, undefined);
    assert.equal(waiter.ttls.length, 0);
    assert.equal(host.added.length, 1);
  });

  it("uses the request id as the BullMQ job id when supplied", async () => {
    const { dispatcher } = build({ kind: "pending" });
    const result = await dispatcher.dispatch({
      requestId: "req_1",
      mode: "async",
      ...basePayload,
      jobId: "req_1",
    });
    assert.equal(result.job_id, "req_1");
  });

  it("forwards delay for scheduled captures", async () => {
    const { host, dispatcher } = build({ kind: "pending" });
    await dispatcher.dispatch({
      requestId: "req_1",
      mode: "async",
      ...basePayload,
      delayMs: 60_000,
    });
    assert.equal(host.added[0].opts.delay, 60_000);
  });

  it("passes the webhook target and api key through to the payload", async () => {
    const { host, dispatcher } = build({ kind: "pending" });
    await dispatcher.dispatch({
      requestId: "req_1",
      mode: "async",
      ...basePayload,
      apiKeyId: "key_abc",
      webhook: { url: "https://hooks.example.com/x", secret: "whsec_12345678" },
    });

    const stored = host.added[0].data as CaptureJobPayload;
    assert.equal(stored.api_key_id, "key_abc");
    assert.equal(stored.webhook?.url, "https://hooks.example.com/x");
    assert.equal(stored.attempt_budget, config.attempts);
  });

  it("rejects an invalid capture option before touching Redis", async () => {
    const { host, dispatcher } = build({ kind: "pending" });

    await assert.rejects(
      dispatcher.dispatch({
        requestId: "req_1",
        mode: "async",
        options: { url: "not-a-url" } as never,
      }),
    );
    assert.equal(host.added.length, 0);
  });
});

describe("CaptureDispatcher sync fast path", () => {
  it("returns the result inline when the render beats the budget", async () => {
    const { dispatcher, waiter } = build({ kind: "resolve", result: completedResult });

    const result = await dispatcher.dispatch({
      requestId: "req_1",
      mode: "sync",
      ...basePayload,
    });

    assert.equal(result.settled, true);
    assert.equal(result.state, "completed");
    assert.equal(result.result?.ok, true);
    assert.equal(result.result?.data?.width, 1280);
    assert.deepEqual(waiter.ttls, [config.syncTimeoutMs]);
  });

  it("waits at most the 2s budget", async () => {
    const { dispatcher, waiter } = build({ kind: "resolve", result: completedResult });
    await dispatcher.dispatch({ requestId: "req_1", mode: "sync", ...basePayload });
    assert.equal(waiter.ttls[0], 2_000);
  });

  it("degrades to an async handle when the budget expires", async () => {
    const { dispatcher, host } = build({ kind: "timeout" });

    const result = await dispatcher.dispatch({
      requestId: "req_1",
      mode: "sync",
      ...basePayload,
    });

    assert.equal(result.settled, false);
    assert.equal(result.result, undefined);
    assert.equal(result.job_id, "job_1");
    assert.equal(host.jobs.has("job_1"), true, "the job must survive the timeout so the worker keeps rendering");
  });

  it("reports the job's real state after a timeout, not a hard-coded active", async () => {
    const waitingHost = new FakeQueueHost();
    const waitingQueue = new CaptureQueue(waitingHost, config);
    const waitingDispatcher = new CaptureDispatcher(waitingQueue, config, new FakeWaiter({ kind: "timeout" }));
    const waiting = await waitingDispatcher.dispatch({ requestId: "req_1", mode: "sync", ...basePayload });
    assert.equal(waiting.state, "waiting", "a still-queued job must not be reported as active");

    const activeHost = new FakeQueueHost({ jobState: "active" });
    const activeQueue = new CaptureQueue(activeHost, config);
    const activeDispatcher = new CaptureDispatcher(activeQueue, config, new FakeWaiter({ kind: "timeout" }));
    const active = await activeDispatcher.dispatch({ requestId: "req_2", mode: "sync", ...basePayload });
    assert.equal(active.state, "active");
  });

  it("surfaces a settled failure result", async () => {
    const { dispatcher } = build({ kind: "reject", error: new Error("job failed: render_timeout") });

    const result = await dispatcher.dispatch({
      requestId: "req_1",
      mode: "sync",
      ...basePayload,
    });

    assert.equal(result.settled, true);
    assert.equal(result.state, "failed");
    assert.equal(result.result?.ok, false);
    assert.equal(result.result?.error?.code, "internal_error");
    assert.equal(result.result?.request_id, "req_1", "the failure envelope keeps the caller's request id");
    assert.equal(result.job_id, "job_1", "the job handle stays the BullMQ job id");
  });

  it("preserves a SnapforgeError code when the wait rejects", async () => {
    const error = new SnapforgeError({
      code: "blocked_by_target",
      message: "target blocked the render",
      requestId: "req_1",
    });
    const { dispatcher } = build({ kind: "reject", error });

    const result = await dispatcher.dispatch({
      requestId: "req_1",
      mode: "sync",
      ...basePayload,
    });

    assert.equal(result.result?.error?.code, "blocked_by_target");
    assert.equal(result.result?.error?.retriable, false);
  });

  it("maps an ok:false result to a failed state", async () => {
    const { dispatcher } = build({ kind: "resolve", result: failedResult });
    const result = await dispatcher.dispatch({
      requestId: "req_1",
      mode: "sync",
      ...basePayload,
    });
    assert.equal(result.state, "failed");
    assert.equal(result.result?.error?.code, "render_timeout");
  });

  it("refuses sync dispatch without a queue events waiter", async () => {
    const host = new FakeQueueHost();
    const queue = new CaptureQueue(host, config);
    const dispatcher = new CaptureDispatcher(queue, config);

    await assert.rejects(
      dispatcher.dispatch({ requestId: "req_1", mode: "sync", ...basePayload }),
      (error: unknown) => error instanceof SnapforgeError && error.code === "internal_error",
    );
  });

  it("reports a job that vanishes immediately after enqueue", async () => {
    const host = new FakeQueueHost();
    const queue = new CaptureQueue(host, config);
    const waiter = new FakeWaiter({ kind: "pending" });
    const dispatcher = new CaptureDispatcher(queue, config, waiter);
    host.getJob = async () => undefined;

    await assert.rejects(
      dispatcher.dispatch({ requestId: "req_1", mode: "sync", ...basePayload }),
      (error: unknown) => error instanceof SnapforgeError && /vanished/.test(error.message),
    );
  });
});

describe("isTimeout", () => {
  it("recognises BullMQ expiry and abort errors", () => {
    assert.equal(
      isTimeout(new Error("Job wait capture timed out before finishing, no finish notification arrived after 2000ms (id=job_1)")),
      true,
    );
    assert.equal(isTimeout(Object.assign(new Error("x"), { name: "AbortError" })), true);
    assert.equal(isTimeout(new Error("job failed: boom")), false);
    assert.equal(isTimeout("not an error"), false);
  });
});
