import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { captureOptionsSchema } from "@snapforge/contracts";
import { CaptureQueue } from "./queue.js";
import { resolveQueueConfig } from "./config.js";
import { FakeJob, FakeQueueHost } from "./fakes.js";
import type { CaptureJobPayload, CaptureJobResult } from "./types.js";

const config = resolveQueueConfig({ redisUrl: "redis://example:6379" });

const payload: CaptureJobPayload = {
  request_id: "req_1",
  mode: "sync",
  options: captureOptionsSchema.parse({ url: "https://example.com", full_page: true }),
  enqueued_at: 1_700_000_000_000,
  attempt_budget: 3,
};

describe("CaptureQueue", () => {
  it("parses the payload before enqueueing and stores job options", async () => {
    const host = new FakeQueueHost();
    const queue = new CaptureQueue(host, config);
    const job = await queue.enqueue({ payload });

    assert.equal(host.added.length, 1);
    assert.equal(host.added[0].data.request_id, "req_1");
    assert.equal(job.opts.attempts, 3);
    assert.deepEqual(job.opts.backoff, { type: "exponential", delay: 2_000 });
    assert.equal(job.opts.removeOnComplete, false);
    assert.equal(job.opts.removeOnFail, false);
  });

  it("passes through jobId and delay", async () => {
    const host = new FakeQueueHost();
    const queue = new CaptureQueue(host, config);
    await queue.enqueue({ payload, jobId: "req_1", delayMs: 5_000 });

    assert.equal(host.added[0].opts.jobId, "req_1");
    assert.equal(host.added[0].opts.delay, 5_000);
  });

  it("returns a snapshot of a pending job", async () => {
    const host = new FakeQueueHost();
    const queue = new CaptureQueue(host, config);
    const job = await queue.enqueue({ payload });
    job.attemptsMade = 1;
    (job as FakeJob).progress = 25;

    const snapshot = await queue.snapshot("job_1");
    assert.ok(snapshot !== null);
    assert.equal(snapshot?.id, "job_1");
    assert.equal(snapshot?.request_id, "req_1");
    assert.equal(snapshot?.mode, "sync");
    assert.equal(snapshot?.state, "waiting");
    assert.equal(snapshot?.attempts_made, 1);
    assert.equal(snapshot?.progress, 25);
    assert.equal(snapshot?.result, undefined);
  });

  it("exposes the stored result once the job completes", async () => {
    const host = new FakeQueueHost();
    const queue = new CaptureQueue(host, config);
    const job = await queue.enqueue({ payload });
    (job as FakeJob).setState("completed");
    job.returnvalue = {
      request_id: "req_1",
      mode: "sync",
      ok: true,
      data: { url: "https://example.com", width: 1280, height: 720, bytes: 10, duration_ms: 5 },
      duration_ms: 5,
      attempts_made: 1,
      enqueued_at: 1_700_000_000_000,
      completed_at: 1_700_000_005_000,
    } as CaptureJobResult;

    const snapshot = await queue.snapshot("job_1");
    assert.equal(snapshot?.state, "completed");
    assert.equal(snapshot?.result?.ok, true);
  });

  it("synthesizes metadata when the payload is not schema-compliant", async () => {
    const host = new FakeQueueHost();
    const queue = new CaptureQueue(host, config);
    const malformed = new FakeJob("job_2", payload, {}, "active");
    (malformed as any).data = { trash: true };
    host.jobs.set("job_2", malformed);

    const snapshot = await queue.snapshot("job_2");
    assert.ok(snapshot !== null);
    assert.equal(snapshot?.mode, "async");
    assert.equal(snapshot?.request_id, "job_2");
    assert.equal(snapshot?.state, "active");
  });

  it("aggregates depth from job counts", async () => {
    const host = new FakeQueueHost({
      counts: { waiting: 5, active: 2, prioritized: 1, delayed: 3, completed: 10, failed: 1 },
    });
    const queue = new CaptureQueue(host, config);
    const depth = await queue.depth();

    assert.equal(depth.waiting, 5);
    assert.equal(depth.active, 2);
    assert.equal(depth.prioritized, 1);
    assert.equal(depth.delayed, 3);
    assert.equal(depth.completed, 10);
    assert.equal(depth.failed, 1);
    assert.equal(depth.total_pending, 11);
    assert.equal(depth.paused, false);
  });

  it("reports a paused queue", async () => {
    const host = new FakeQueueHost({ paused: true });
    const queue = new CaptureQueue(host, config);
    assert.equal((await queue.depth()).paused, true);
  });

  it("removes and closes through the host", async () => {
    const host = new FakeQueueHost();
    const queue = new CaptureQueue(host, config);
    await queue.enqueue({ payload });
    await queue.remove("job_1");
    await queue.close();

    assert.equal(host.removed[0], "job_1");
    assert.equal(host.closed, true);
  });

  it("returns null when the job does not exist", async () => {
    const host = new FakeQueueHost();
    const queue = new CaptureQueue(host, config);
    assert.equal(await queue.snapshot("missing"), null);
  });
});
