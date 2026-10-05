import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { captureOptionsSchema, SnapforgeError } from "@snapforge/contracts";
import { UnrecoverableError } from "bullmq";
import { resolveQueueConfig } from "./config.js";
import {
  CaptureWorker,
  COMPLETED_PROGRESS,
  DELIVERED_PROGRESS,
  RENDER_PROGRESS,
  classifyFailure,
  errorEnvelopeFor,
  isRetriableCode,
  isTerminalFailure,
  type CaptureExecutor,
  type CaptureOutcome,
} from "./worker.js";
import { FakeJob, FakeWorkerHost } from "./fakes.js";
import type { CaptureJobPayload, CaptureJobResult } from "./types.js";

const config = resolveQueueConfig({ redisUrl: "redis://example:6379", attempts: 3 });

const payload: CaptureJobPayload = {
  request_id: "req_1",
  mode: "async",
  options: captureOptionsSchema.parse({ url: "https://example.com" }),
  enqueued_at: 1_700_000_000_000,
  attempt_budget: 3,
};

const successData = {
  url: "https://example.com",
  final_url: "https://example.com",
  format: "png" as const,
  width: 1280,
  height: 720,
  bytes: 4096,
  duration_ms: 120,
  cached: false,
  blocked_requests: 2,
};

const webhook = { url: "https://hooks.example.com/cb", secret: "whsec_abcdefgh" };

interface WebhookBody {
  event: string;
  id: string;
  job_id: string;
  request_id: string;
  mode: string;
  ok: boolean;
  data: CaptureJobResult["data"] | null;
  error: CaptureJobResult["error"] | null;
  attempts_made: number;
}

interface Recorded {
  url: string;
  headers: Record<string, string>;
  body: WebhookBody;
}

function recordingFetch(responses: Array<{ status: number }>) {
  const calls: Recorded[] = [];
  let index = 0;
  const impl = (async (url: string, init: RequestInit) => {
    const spec = responses[Math.min(index, responses.length - 1)];
    index += 1;
    calls.push({
      url: String(url),
      headers: (init.headers ?? {}) as Record<string, string>,
      body: JSON.parse(String(init.body)) as WebhookBody,
    });
    return new Response("", { status: spec.status });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

function okExecutor(outcome: CaptureOutcome = { data: successData }): CaptureExecutor {
  return async () => outcome;
}

function build(executor: CaptureExecutor, overrides: { webhook?: typeof webhook; now?: () => number } = {}) {
  const job = new FakeJob("job_1", overrides.webhook ? { ...payload, webhook: overrides.webhook } : payload, {
    attempts: 3,
    backoff: { type: "exponential", delay: 2_000 },
  });
  const host = new FakeWorkerHost();
  const fetchStub = recordingFetch([{ status: 200 }]);
  const worker = new CaptureWorker(host, config, executor, {
    workerId: "worker-1",
    fetchImpl: fetchStub.impl,
    now: overrides.now ?? (() => 1_700_000_001_000),
  });
  return { job, host, worker, calls: fetchStub.calls };
}

describe("CaptureWorker happy path", () => {
  it("protects jobs submitted with old queue-wide retention options", async () => {
    const { job, worker } = build(okExecutor());
    job.opts.removeOnComplete = { age: 1, count: 1 };
    job.opts.removeOnFail = { age: 1, count: 1 };
    await worker.process(job);
    assert.equal(job.opts.removeOnComplete, false);
    assert.equal(job.opts.removeOnFail, false);
  });

  it("returns a completed result and reports progress in order", async () => {
    const { job, worker } = build(okExecutor());
    const result = await worker.process(job as never, undefined, undefined);

    assert.equal(result.ok, true);
    assert.equal(result.request_id, "req_1");
    assert.equal(result.mode, "async");
    assert.equal(result.attempts_made, 1);
    assert.equal(result.worker_id, "worker-1");
    assert.equal(result.duration_ms, 120);
    assert.equal(result.completed_at, 1_700_000_001_000);
    assert.deepEqual(job.progressLog, [RENDER_PROGRESS, DELIVERED_PROGRESS, COMPLETED_PROGRESS]);
    assert.equal(worker.getStats().completed, 1);
  });

  it("passes the attempt number, worker id and signal to the executor", async () => {
    let seen: { attempt: number; workerId: string; aborted: boolean } | undefined;
    const executor: CaptureExecutor = async (_options, context) => {
      seen = { attempt: context.attempt, workerId: context.workerId, aborted: context.signal.aborted };
      return { data: successData };
    };
    const { job, worker } = build(executor);
    job.attemptsMade = 1;

    await worker.process(job as never, undefined, undefined);
    assert.deepEqual(seen, { attempt: 2, workerId: "worker-1", aborted: false });
  });

  it("forwards the abort signal so a shutdown cancels the render", async () => {
    const controller = new AbortController();
    let aborted = false;
    const executor: CaptureExecutor = async (_options, context) => {
      context.signal.addEventListener("abort", () => {
        aborted = true;
      });
      controller.abort();
      return { data: successData };
    };
    const { job, worker } = build(executor);

    await worker.process(job as never, undefined, controller.signal);
    assert.equal(aborted, true);
  });

  it("emits progress updates requested mid-render", async () => {
    const executor: CaptureExecutor = async (_options, context) => {
      await context.updateProgress(50);
      await context.updateProgress(75);
      return { data: successData };
    };
    const { job, worker } = build(executor);
    await worker.process(job as never);
    assert.deepEqual(job.progressLog, [RENDER_PROGRESS, 50, 75, DELIVERED_PROGRESS, COMPLETED_PROGRESS]);
  });
});

describe("CaptureWorker retries", () => {
  it("throws a retriable SnapforgeError so BullMQ backs off and retries", async () => {
    const executor: CaptureExecutor = async () => {
      throw new SnapforgeError({ code: "render_timeout", message: "too slow", requestId: "req_1" });
    };
    const { job, worker } = build(executor);

    await assert.rejects(worker.process(job as never), (error: unknown) => {
      assert.ok(error instanceof SnapforgeError);
      assert.equal(error.code, "render_timeout");
      assert.ok(!(error instanceof UnrecoverableError));
      return true;
    });
    assert.equal(worker.getStats().failed, 0);
  });

  it("does not send a webhook for an intermediate retryable failure", async () => {
    const executor: CaptureExecutor = async () => {
      throw new SnapforgeError({ code: "navigation_failed", message: "slow", requestId: "req_1" });
    };
    const { job, worker, calls } = build(executor, { webhook });

    await assert.rejects(worker.process(job as never));
    assert.equal(calls.length, 0, "the callback must fire once, not once per attempt");
  });

  it("exhausted captures finish without calling a webhook endpoint", async () => {
    const executor: CaptureExecutor = async () => {
      throw new SnapforgeError({ code: "render_timeout", message: "too slow", requestId: "req_1" });
    };
    const { job, worker, calls } = build(executor, { webhook });
    job.attemptsMade = 2;

    await assert.rejects(worker.process(job as never));
    assert.equal(calls.length, 0);
    assert.equal(worker.getStats().failed, 1);
  });

  it("permanent capture failures finish without waiting on webhooks", async () => {
    const executor: CaptureExecutor = async () => {
      throw new SnapforgeError({ code: "blocked_by_target", message: "blocked", requestId: "req_1" });
    };
    const { job, worker, calls } = build(executor, { webhook });

    await assert.rejects(worker.process(job as never), UnrecoverableError);
    assert.equal(calls.length, 0);
  });

  it("treats an untyped exception as a retriable internal error", async () => {
    const executor: CaptureExecutor = async () => {
      throw new Error("browser crashed");
    };
    const { job, worker } = build(executor);

    await assert.rejects(worker.process(job as never), (error: unknown) => {
      assert.ok(error instanceof SnapforgeError);
      assert.equal(error.code, "internal_error");
      return true;
    });
    assert.equal(worker.getStats().failed, 0);
  });

  it("does not fail the job when webhook delivery fails", async () => {
    const { impl } = recordingFetch([{ status: 500 }]);
    const job = new FakeJob("job_1", { ...payload, webhook }, { attempts: 3 });
    const worker = new CaptureWorker(new FakeWorkerHost(), config, okExecutor(), {
      workerId: "worker-1",
      fetchImpl: impl,
      now: () => 1_700_000_001_000,
    });

    const result = await worker.process(job as never);
    assert.equal(result.ok, true, "a dead callback endpoint must not discard a successful capture");
    assert.equal(worker.getStats().webhookFailed, 0);
    assert.equal(worker.getStats().completed, 1);
  });

  it("a successful renderer never makes a callback HTTP call", async () => {
    const { job, worker, calls } = build(okExecutor(), { webhook });
    await worker.process(job as never);

    assert.equal(calls.length, 0);
  });

  it("leaves callback ownership to the durable completion consumer", async () => {
    const { job, worker, calls } = build(okExecutor(), { webhook });
    await worker.process(job as never);

    assert.equal(calls.length, 0);
  });

  it("falls back to the request id when the job has no id", async () => {
    const { job, worker, calls } = build(okExecutor(), { webhook });
    (job as { id?: string }).id = undefined;
    await worker.process(job as never);
    assert.equal(calls.length, 0);
  });
});

describe("CaptureWorker lifecycle", () => {
  it("starts and closes the underlying worker", async () => {
    const { host, worker } = build(okExecutor());
    await worker.start();
    await worker.close();
    assert.equal(host.runCount, 1);
    assert.equal(host.closeCount, 1);
  });

  it("defaults the worker id to the process id", async () => {
    const job = new FakeJob("job_1", payload, { attempts: 3 });
    const worker = new CaptureWorker(new FakeWorkerHost(), config, okExecutor());
    assert.match(worker.getStats().workerId, /^worker-\d+$/);
    assert.equal((await worker.process(job as never)).worker_id, worker.getStats().workerId);
  });

  it("returns a copy of the stats so callers cannot mutate them", () => {
    const { worker } = build(okExecutor());
    const stats = worker.getStats();
    stats.completed = 99;
    assert.equal(worker.getStats().completed, 0);
  });
});

describe("error classification", () => {
  it("marks known codes retriable per the contract table", () => {
    assert.equal(isRetriableCode("render_timeout"), true);
    assert.equal(isRetriableCode("rate_limited"), true);
    assert.equal(isRetriableCode("invalid_request"), false);
    assert.equal(isRetriableCode("unauthorized"), false);
    assert.equal(isRetriableCode("blocked_by_target"), false);
    assert.equal(isRetriableCode("quota_exceeded"), false);
  });

  it("defaults unknown codes to retriable so a new error does not drop work", () => {
    assert.equal(isRetriableCode("brand_new_code"), true);
  });

  it("wraps an unknown throwable in the error taxonomy", () => {
    const envelope = errorEnvelopeFor("a string", payload);
    assert.equal(envelope.code, "internal_error");
    assert.equal(envelope.request_id, "req_1");
    assert.equal(envelope.retriable, true);
  });

  it("raises UnrecoverableError for permanent codes", () => {
    const error = classifyFailure({
      code: "invalid_request",
      message: "bad options",
      retriable: false,
      request_id: "req_1",
    });
    assert.ok(error instanceof UnrecoverableError);
    assert.match(error.message, /invalid_request: bad options/);
  });

  it("keeps retriable codes as ordinary errors", () => {
    const error = classifyFailure({
      code: "navigation_failed",
      message: "slow",
      retriable: true,
      request_id: "req_1",
    });
    assert.ok(error instanceof SnapforgeError);
    assert.ok(!(error instanceof UnrecoverableError));
  });

  it("treats the last attempt as terminal", () => {
    const job = new FakeJob("job_1", payload, { attempts: 3 });
    job.attemptsMade = 2;
    const retriable = {
      code: "render_timeout" as const,
      message: "slow",
      retriable: true,
      request_id: "req_1",
    };
    assert.equal(isTerminalFailure(job as never, retriable), true);
    job.attemptsMade = 0;
    assert.equal(isTerminalFailure(job as never, retriable), false);
  });

  it("treats a non-retriable failure as terminal on the first attempt", () => {
    const job = new FakeJob("job_1", payload, { attempts: 3 });
    assert.equal(
      isTerminalFailure(job as never, {
        code: "forbidden",
        message: "nope",
        retriable: false,
        request_id: "req_1",
      }),
      true,
    );
  });
});
