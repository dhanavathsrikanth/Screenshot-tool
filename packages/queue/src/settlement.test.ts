import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { captureOptionsSchema } from "@snapforge/contracts";
import { CaptureCompletionConsumer, CaptureFinalizer, type CaptureFinalization, type CaptureLifecycleRepository } from "./settlement.js";
import { CaptureService, type CaptureBilling } from "./service.js";
import { CaptureQueue } from "./queue.js";
import { FakeQueueHost, FakeJob } from "./fakes.js";
import { resolveQueueConfig } from "./config.js";

const data = { url: "https://example.com", final_url: "https://example.com", format: "png", width: 1280, height: 720,
  bytes: 123, duration_ms: 100, blocked_requests: 0, cached: false, cdn_url: "https://cdn.example.com/capture.png" };

async function fixture() {
  const host = new FakeQueueHost();
  const queue = new CaptureQueue(host, resolveQueueConfig({ redisUrl: "redis://localhost:6379" }));
  const events = new EventEmitter();
  const job = await queue.enqueue({ jobId: "capture", payload: { request_id: "capture", mode: "async",
    options: captureOptionsSchema.parse({ url: data.url }), enqueued_at: Date.now(), attempt_budget: 3,
    billing_account_id: "account", reservation_id: "capture", api_key_id: "key-a" } }) as FakeJob;
  const held = new Set(["capture"]);
  const cleanup = new Set<string>();
  const stored = new Map<string, CaptureFinalization>();
  let charges = 0;
  let failCommit = false;
  let failCleanup = false;
  let releases = 0;
  let renewals = 0;
  let expired = false;
  const lifecycle: CaptureLifecycleRepository = {
    async commitCapture(input) {
      if (failCommit) throw new Error("transaction outage");
      const existing = stored.get(input.jobId);
      if (existing) return existing.snapshot;
      if (held.delete(input.jobId) && input.snapshot.result?.ok) charges++;
      stored.set(input.jobId, input);
      cleanup.add(input.jobId);
      return input.snapshot;
    },
    async storedCapture(accountId, jobId, apiKeyId) {
      const entry = stored.get(jobId);
      return entry?.accountId === accountId && (!apiKeyId || entry.apiKeyId === apiKeyId) ? entry.snapshot : null;
    },
    async claimPendingCaptures() { return [...held].map((jobId) => ({ accountId: "account", jobId })); },
    async claimPendingCleanup() { return [...cleanup].map((jobId) => ({ accountId: "account", jobId })); },
    async completeCleanup(jobId) { cleanup.delete(jobId); },
    async expiredCaptures() { return expired ? [...stored.keys()].filter((jobId) => !cleanup.has(jobId)).map((jobId) => ({ accountId: "account", jobId })) : []; },
    async completePruning() { expired = false; },
  };
  const billing: CaptureBilling & { lifecycle: CaptureLifecycleRepository } = {
    lifecycle, reserveCapture: async () => true, linkReservationToJob: async () => {},
    reservationForJob: async () => { throw new Error("legacy polling billing was used"); },
    settleCapture: async () => { throw new Error("legacy polling settlement was used"); },
    recordCapture: async () => { throw new Error("nontransactional history was used"); },
  };
  const admission = { releaseJob: async () => { if (failCleanup) throw new Error("Redis outage"); releases++; },
    renewJob: async () => { renewals++; }, acquireJob: async () => {} };
  const consumer = () => new CaptureCompletionConsumer({ queue, events, billing, admission });
  function finish(ok = true) {
    job.setState(ok ? "completed" : "failed");
    job.returnvalue = { request_id: "capture", mode: "async", ok, ...(ok ? { data: { ...data } } : { error: {
      code: "render_timeout", message: "Timed out", retriable: true, request_id: "capture",
    } as const }), duration_ms: 100, attempts_made: 1, enqueued_at: job.timestamp, completed_at: Date.now() };
  }
  return { host, queue, job, events, held, cleanup, stored, billing, admission, consumer, finish,
    finalizer: new CaptureFinalizer(billing, admission),
    counts: () => ({ charges, releases, renewals }),
    failCommit: (value: boolean) => { failCommit = value; },
    failCleanup: (value: boolean) => { failCleanup = value; },
    expire: () => { expired = true; },
  };
}

async function waitFor(assertion: () => boolean): Promise<void> {
  for (let i = 0; i < 100; i++) {
    if (assertion()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.ok(assertion(), "completion did not settle");
}

for (const success of [true, false]) {
  test(`terminal event settles ${success ? "success" : "failure"} without customer polling`, async () => {
    const f = await fixture();
    const consumer = f.consumer();
    await consumer.start();
    try {
      f.finish(success);
      f.events.emit(success ? "completed" : "failed", { jobId: "capture", returnvalue: { ok: !success } });
      await waitFor(() => !f.held.size && !f.cleanup.size);
      assert.equal(f.counts().charges, success ? 1 : 0);
      assert.equal(f.stored.get("capture")?.snapshot.result?.ok, success);
      assert.equal(f.stored.get("capture")?.entry.ok, success);
      assert.ok(f.counts().releases > 0);
    } finally { await consumer.close(); }
  });
}

test("duplicate events and concurrent polling finalize once", async () => {
  const f = await fixture();
  const consumer = f.consumer();
  await consumer.start();
  try {
    f.finish();
    for (let i = 0; i < 20; i++) f.events.emit("completed", { jobId: "capture" });
    const service = new CaptureService({ queue: f.queue, billing: f.billing, admission: f.admission,
      dispatcher: { dispatch: async () => { throw new Error("unexpected render"); } } });
    await Promise.all(Array.from({ length: 10 }, () => service.lookup({ accountId: "account", apiKeyId: "key-a" }, "capture", "read")));
    await waitFor(() => consumer.stats().active === 0);
    assert.equal(f.counts().charges, 1);
    assert.equal(f.stored.size, 1);
    assert.equal(f.cleanup.size, 0);
  } finally { await consumer.close(); }
});

test("intermediate retry events cannot refund or charge", async () => {
  const f = await fixture();
  f.job.setState("delayed");
  const consumer = f.consumer();
  await consumer.start();
  try {
    f.events.emit("failed", { jobId: "capture" });
    await waitFor(() => consumer.stats().active === 0);
    assert.equal(f.held.size, 1);
    assert.equal(f.stored.size, 0);
    assert.equal(f.counts().charges, 0);
    assert.equal(f.counts().releases, 0);
    assert.ok(f.counts().renewals > 0);
  } finally { await consumer.close(); }
});

test("startup scan recovers terminal work after missed events", async () => {
  const f = await fixture();
  f.finish();
  const consumer = f.consumer();
  await consumer.start();
  await consumer.close();
  assert.equal(f.counts().charges, 1);
  assert.equal(f.held.size, 0);
  assert.equal(f.cleanup.size, 0);
});

test("recovery uses the database account link for a legacy job", async () => {
  const f = await fixture();
  delete f.job.data.billing_account_id;
  delete f.job.data.reservation_id;
  f.finish();
  await f.consumer().reconcile();
  assert.equal(f.stored.get("capture")?.accountId, "account");
  assert.equal(f.counts().charges, 1);
});

test("database outage keeps evidence and recovers after restart", async () => {
  const f = await fixture();
  f.finish();
  f.failCommit(true);
  const first = f.consumer();
  await first.start();
  await first.close();
  assert.equal(f.held.size, 1);
  assert.equal(f.counts().releases, 0);
  assert.equal(f.host.jobs.size, 1);
  f.failCommit(false);
  const second = f.consumer();
  await second.start();
  await second.close();
  assert.equal(f.counts().charges, 1);
  assert.equal(f.held.size, 0);
});

test("Redis cleanup outage persists work for restart recovery", async () => {
  const f = await fixture();
  f.finish();
  f.failCleanup(true);
  const first = f.consumer();
  await first.start();
  await first.close();
  assert.equal(f.held.size, 0);
  assert.equal(f.cleanup.size, 1);
  assert.equal(f.counts().charges, 1);
  f.failCleanup(false);
  const second = f.consumer();
  await second.start();
  await second.close();
  assert.equal(f.cleanup.size, 0);
  assert.equal(f.counts().charges, 1);
  assert.ok(f.counts().releases > 0);
});

test("missing and old active jobs keep their reservation", async () => {
  const f = await fixture();
  Object.defineProperty(f.job, "timestamp", { value: 0 });
  f.job.setState("active");
  const consumer = f.consumer();
  await consumer.reconcile();
  f.host.jobs.delete("capture");
  await consumer.reconcile();
  assert.equal(f.held.size, 1);
  assert.equal(f.stored.size, 0);
  assert.equal(f.counts().releases, 0);
  assert.equal(consumer.stats().missing_jobs, 1);
});

test("cleanup acknowledgement failure retries an already released slot safely", async () => {
  const f = await fixture();
  f.finish();
  const acknowledge = f.billing.lifecycle.completeCleanup;
  f.billing.lifecycle.completeCleanup = async () => { throw new Error("database cleanup acknowledgement outage"); };
  const first = f.consumer();
  await first.reconcile();
  assert.equal(f.counts().charges, 1);
  assert.equal(f.cleanup.size, 1);
  assert.ok(f.counts().releases > 0);
  f.billing.lifecycle.completeCleanup = acknowledge;
  await f.consumer().reconcile();
  assert.equal(f.cleanup.size, 0);
  assert.equal(f.counts().charges, 1);
});

test("undeliverable output refunds even if the queue says completed", async () => {
  const f = await fixture();
  f.finish();
  delete f.job.returnvalue!.data!.cdn_url;
  await f.consumer().reconcile();
  assert.equal(f.counts().charges, 0);
  assert.equal(f.stored.get("capture")?.snapshot.result?.error?.code, "render_incomplete");
});

test("only settled and cleaned jobs are pruned; owned result survives pruning", async () => {
  const f = await fixture();
  f.finish();
  f.failCleanup(true);
  f.expire();
  const consumer = f.consumer();
  await consumer.reconcile();
  assert.equal(f.host.jobs.size, 1);
  f.failCleanup(false);
  await consumer.reconcile();
  assert.equal(f.host.jobs.size, 0);
  const service = new CaptureService({ queue: f.queue, billing: f.billing, admission: f.admission,
    dispatcher: { dispatch: async () => { throw new Error("unexpected render"); } } });
  assert.equal((await service.lookup({ accountId: "account", apiKeyId: "key-a" }, "capture", "read")).result?.ok, true);
  for (const identity of [{ accountId: "other" }, { accountId: "account", apiKeyId: "key-b" }]) {
    await assert.rejects(service.lookup(identity, "capture", "read"), /Job not found/);
  }
});

test("event storms have bounded memory and close detaches listeners", async () => {
  const f = await fixture();
  const consumer = f.consumer();
  await consumer.start();
  let resume!: () => void;
  const blocked = new Promise<void>((resolve) => { resume = resolve; });
  const getJob = f.queue.getJob.bind(f.queue);
  f.queue.getJob = async (id) => { await blocked; return getJob(id); };
  for (let i = 0; i < 1000; i++) f.events.emit("completed", { jobId: `event-${i}` });
  assert.ok(consumer.stats().pending_events <= 256);
  assert.ok(consumer.stats().active <= 4);
  resume();
  await consumer.close();
  assert.equal(f.events.listenerCount("completed"), 0);
  assert.equal(f.events.listenerCount("failed"), 0);
});
