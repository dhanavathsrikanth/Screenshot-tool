import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { EventEmitter } from "node:events";
import { captureOptionsSchema, SnapforgeError } from "@snapforge/contracts";
import { CaptureService, type CaptureServiceDependencies } from "./service.js";
import { CaptureCompletionConsumer } from "./settlement.js";
import { CaptureQueue } from "./queue.js";
import { CaptureDispatcher } from "./dispatcher.js";
import { resolveQueueConfig } from "./config.js";
import { FakeQueueHost } from "./fakes.js";
import { captureSubmissionCodecFromEnv, createCaptureSubmissionCodec, deliverCaptureSubmission,
  type CaptureSubmissionIntent, type CaptureSubmissionRepository, type SealedCaptureSubmission } from "./submission.js";

const key = randomBytes(32).toString("base64");
const codec = createCaptureSubmissionCodec(key);
const intent: CaptureSubmissionIntent = { accountId: "account", jobId: "durable-job", apiKeyId: "key-a", mode: "async", enqueuedAt: 1700000000000,
  options: captureOptionsSchema.parse({ url: "https://example.com", headers: { authorization: "Bearer private-header" } }) };
const sealed = () => ({ accountId: intent.accountId, jobId: intent.jobId, apiKeyId: intent.apiKeyId,
  mode: intent.mode, enqueuedAt: intent.enqueuedAt, ciphertext: codec.seal(intent) });

test("intent encryption authenticates secrets, row identity, and metadata", () => {
  const record = sealed();
  assert.equal(record.ciphertext.includes("private-header"), false);
  assert.equal(record.ciphertext.includes("example.com"), false);
  assert.deepEqual(codec.open(record), intent);
  assert.notEqual(sealed().ciphertext, record.ciphertext);
  for (const patch of [{ accountId: "other" }, { jobId: "other" }, { apiKeyId: "key-b" }, { mode: "sync" as const }, { enqueuedAt: 1 }]) {
    assert.throws(() => codec.open({ ...record, ...patch }));
  }
  const parts = record.ciphertext.split(".");
  parts[3] = (parts[3][0] === "A" ? "B" : "A") + parts[3].slice(1);
  assert.throws(() => codec.open({ ...record, ciphertext: parts.join(".") }));
  assert.throws(() => codec.open({ ...record, ciphertext: "A".repeat(600000) }));
});

test("intent keys fail closed and rotation can recover an old pending submission", () => {
  assert.throws(() => captureSubmissionCodecFromEnv({}), /32-byte key/);
  assert.throws(() => createCaptureSubmissionCodec("short"), /32-byte key/);
  const next = randomBytes(32).toString("base64");
  assert.throws(() => createCaptureSubmissionCodec(next).open(sealed()), /key is unavailable/);
  const rotated = createCaptureSubmissionCodec(next, [key]);
  assert.deepEqual(rotated.open(sealed()), intent);
  assert.deepEqual(createCaptureSubmissionCodec(next).open({ ...sealed(), ciphertext: rotated.seal(intent) }), intent);
});

function fixture() {
  const config = resolveQueueConfig({ redisUrl: "redis://localhost:6379" });
  const host = new FakeQueueHost();
  const queue = new CaptureQueue(host, config);
  let row: SealedCaptureSubmission | undefined;
  let acknowledged = false;
  let held = false;
  let locked = false;
  let lock = Promise.resolve();
  const calls: string[] = [];
  const submissions: CaptureSubmissionRepository = {
    reserveSubmission: async (input) => { calls.push("reserve"); row = input; held = true; return true; },
    pendingSubmission: async (account, id, apiKey) => held && row && row.accountId === account && row.jobId === id && (!apiKey || apiKey === row.apiKeyId)
      ? { ...row, acknowledged } : null,
    claimPendingSubmissions: async () => held && row && !acknowledged ? [{ accountId: row.accountId, jobId: row.jobId }] : [],
    dispatchSubmission: async (id, deliver) => {
      const previous = lock;
      let unlock!: () => void;
      lock = new Promise<void>((resolve) => { unlock = resolve; });
      await previous;
      try {
        locked = true;
        if (!held || !row || row.jobId !== id || acknowledged) return false;
        await deliver(row);
        acknowledged = true;
        calls.push("acknowledge");
        return true;
      } finally { locked = false; unlock(); }
    },
  };
  const deps: CaptureServiceDependencies = { queue, dispatcher: new CaptureDispatcher(queue, config), submissionCodec: codec,
    billing: { submissions, reserveCapture: async () => { throw new Error("legacy reservation used"); },
      settleCapture: async () => { calls.push("refund"); }, linkReservationToJob: async () => { throw new Error("non-atomic link used"); },
      reservationForJob: async () => null, recordCapture: async () => {},
    },
    admission: { acquireJob: async () => { calls.push("admit"); }, releaseJob: async () => { calls.push("release"); } }, newId: () => intent.jobId,
  };
  const recovery = () => deliverCaptureSubmission(intent.jobId, { submissions, codec, queue: deps.queue, dispatcher: deps.dispatcher });
  return { host, queue, calls, submissions, deps, service: new CaptureService(deps), recovery,
    row: () => row!, locked: () => locked, finish: () => { held = false; acknowledged = true; } };
}

test("durable reservation contains trusted identity and is not separately linked", async () => {
  const f = fixture();
  const reply = await f.service.submit({ accountId: intent.accountId, apiKeyId: "key-a" }, { url: intent.options.url, billing_account_id: "forged" }, "http", "async");
  assert.equal(reply.state, "waiting");
  assert.equal(codec.open(f.row()).accountId, intent.accountId);
  assert.equal(f.host.added[0].data.billing_account_id, intent.accountId);
  assert.deepEqual(f.calls, ["admit", "reserve", "acknowledge"]);
});

test("confirmed enqueue outage retains credits and recovers the same submission after restart", async () => {
  const f = fixture();
  const original = f.deps.dispatcher;
  f.deps.dispatcher = { dispatch: async () => { throw new Error("queue unavailable"); } };
  const reply = await f.service.submit({ accountId: intent.accountId }, { url: intent.options.url }, "http", "async");
  assert.equal(reply.id, intent.jobId);
  assert.equal(reply.state, "waiting");
  assert.deepEqual(f.calls, ["admit", "reserve"]);
  f.deps.dispatcher = original;
  await f.recovery();
  assert.equal(f.host.added.length, 1);
  assert.equal(f.host.added[0].data.enqueued_at, f.row().enqueuedAt);
  assert.equal(f.calls.filter((value) => value === "reserve").length, 1);
  assert.equal(f.calls.includes("refund"), false);
});

test("accepted enqueue with lost acknowledgement is found without dispatching twice", async () => {
  const f = fixture();
  const actual = f.deps.dispatcher;
  f.deps.dispatcher = { dispatch: async (request) => { await actual.dispatch(request); throw new Error("reply lost"); } };
  await f.service.submit({ accountId: intent.accountId }, { url: intent.options.url }, "http", "async");
  await Promise.all([f.recovery(), f.recovery(), f.recovery()]);
  assert.equal(f.host.added.length, 1);
  assert.deepEqual(f.calls, ["admit", "reserve", "acknowledge"]);
});

test("an ambiguous reservation commit returns a handle and does not release a possible accepted hold", async () => {
  const f = fixture();
  const reserve = f.submissions.reserveSubmission;
  f.submissions.reserveSubmission = async (input) => { await reserve(input); throw new Error("database acknowledgement lost"); };
  await assert.rejects(f.service.submit({ accountId: intent.accountId }, { url: intent.options.url }, "http", "async"), (error: unknown) =>
    error instanceof SnapforgeError && error.code === "egress_unavailable" && error.details?.job_id === intent.jobId);
  assert.deepEqual(f.calls, ["admit", "reserve"]);
  await f.recovery();
  assert.equal(f.host.added.length, 1);
});

test("definitive quota denial or missing encryption releases admission before queueing", async () => {
  for (const missingKey of [true, false]) {
    const f = fixture();
    if (missingKey) f.deps.submissionCodec = undefined;
    else f.submissions.reserveSubmission = async () => false;
    await assert.rejects(f.service.submit({ accountId: intent.accountId }, { url: intent.options.url }, "http", "async"));
    assert.deepEqual(f.calls, ["admit", "release"]);
    assert.equal(f.host.added.length, 0);
  }
});

test("pending handles survive queue outages and enforce account and API-key ownership", async () => {
  const f = fixture();
  await f.submissions.reserveSubmission(sealed());
  f.deps.queue = { getJob: async () => { throw new Error("Redis unavailable"); }, snapshot: async () => null };
  const reply = await f.service.lookup({ accountId: intent.accountId, apiKeyId: "key-a" }, intent.jobId, "http");
  assert.equal(reply.state, "unknown");
  assert.equal(JSON.stringify(reply).includes("ciphertext"), false);
  assert.equal(JSON.stringify(reply).includes("private-header"), false);
  for (const identity of [{ accountId: "other" }, { accountId: intent.accountId, apiKeyId: "key-b" }]) {
    await assert.rejects(f.service.lookup(identity, intent.jobId, "http"), /Job not found/);
  }
});

test("queue ownership conflict is retained for investigation and not overwritten", async () => {
  const f = fixture();
  await f.submissions.reserveSubmission(sealed());
  await f.deps.dispatcher.dispatch({ jobId: intent.jobId, requestId: intent.jobId, options: intent.options, mode: "async", accountId: "other" });
  await assert.rejects(f.recovery(), /identity does not match/);
  assert.equal(f.host.added.length, 1);
  assert.equal((await f.submissions.claimPendingSubmissions(1)).length, 1);
});

test("stale recovery cannot recreate a completed and pruned job", async () => {
  const f = fixture();
  await f.submissions.reserveSubmission(sealed());
  assert.equal((await f.submissions.claimPendingSubmissions(1)).length, 1);
  f.finish();
  assert.equal(await f.recovery(), false);
  assert.equal(f.host.added.length, 0);
});

test("recovery waits for account capacity before enqueueing a missing job", async () => {
  const f = fixture();
  await f.submissions.reserveSubmission(sealed());
  await assert.rejects(deliverCaptureSubmission(intent.jobId, { submissions: f.submissions, codec, queue: f.queue,
    dispatcher: f.deps.dispatcher, admission: { recoverJob: async () => { throw new Error("account full"); } } }), /account full/);
  assert.equal(f.host.added.length, 0);
  assert.equal((await f.submissions.claimPendingSubmissions(1)).length, 1);
  let restored = false;
  await deliverCaptureSubmission(intent.jobId, { submissions: f.submissions, codec, queue: f.queue,
    dispatcher: { dispatch: async (request) => { assert.equal(restored, true); return f.deps.dispatcher.dispatch(request); } },
    admission: { recoverJob: async () => { restored = true; } } });
  assert.equal(f.host.added.length, 1);
});

test("sync fast-path waiting happens after the database delivery guard releases", async () => {
  const f = fixture();
  const original = f.deps.dispatcher;
  let waited = false;
  f.deps.dispatcher = { dispatch: async (request) => { assert.equal(request.waitForCompletion, false); assert.equal(f.locked(), true); return original.dispatch(request); },
    waitForResult: async (id) => { assert.equal(f.locked(), false); waited = true; return { job_id: id, mode: "sync", settled: false, state: "waiting" }; } };
  const reply = await f.service.submit({ accountId: intent.accountId }, { url: intent.options.url }, "http", "sync");
  assert.equal(waited, true);
  assert.equal(reply.mode, "sync");
});

test("startup consumer recovers committed submissions without an HTTP client or customer poll", async () => {
  const f = fixture();
  await f.submissions.reserveSubmission(sealed());
  const consumer = new CaptureCompletionConsumer({ queue: f.queue, events: new EventEmitter(), dispatcher: f.deps.dispatcher, submissionCodec: codec,
    billing: { ...f.deps.billing, lifecycle: { commitCapture: async (input) => input.snapshot, storedCapture: async () => null,
      claimPendingCaptures: async () => [], claimPendingCleanup: async () => [], completeCleanup: async () => {}, expiredCaptures: async () => [], completePruning: async () => {} } },
    admission: f.deps.admission });
  try {
    await consumer.start();
    assert.equal(f.host.added.length, 1);
    assert.equal(consumer.stats().enqueue_recovered, 1);
    await consumer.reconcile();
    assert.equal(f.host.added.length, 1);
  } finally { await consumer.close(); }
});
