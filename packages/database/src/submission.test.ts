import test, { after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { CaptureCompletionConsumer, captureJobPayloadSchema, createCaptureSubmissionCodec, deliverCaptureSubmission,
  type CaptureFinalization, type CaptureJobPayload, type CaptureJobView, type DispatchRequest, type SealedCaptureSubmission } from "@snapforge/queue";
import { captureLifecycle, captureSubmissions, commitCapture, getBillingState, linkReservationToJob, pool,
  recordCapture, reservationForJob, reserveCapture, settleCapture } from "./index.js";

const enabled = process.env.SNAPFORGE_SETTLEMENT_TEST === "1";
const codec = createCaptureSubmissionCodec(randomBytes(32).toString("base64"));
const testAccounts: string[] = [];
const billing = { reserveCapture, settleCapture, linkReservationToJob, reservationForJob, recordCapture,
  lifecycle: captureLifecycle, submissions: captureSubmissions };
afterEach(async () => {
  if (testAccounts.length) await pool.query("DELETE FROM accounts WHERE user_id = ANY($1::text[])", [testAccounts.splice(0)]);
});
after(async () => { await pool.end(); });

function fixture() {
  const accountId = `submission-test-${randomUUID()}`;
  testAccounts.push(accountId);
  const jobId = randomUUID();
  const enqueuedAt = Date.now();
  const options = captureJobPayloadSchema.parse({ request_id: jobId, mode: "async", enqueued_at: enqueuedAt, attempt_budget: 3,
    options: { url: "https://example.com", headers: { authorization: "Bearer test-private-secret" } } }).options;
  const intent = { accountId, jobId, apiKeyId: "key-a", mode: "async" as const, enqueuedAt, options };
  const sealed: SealedCaptureSubmission = { accountId, jobId, apiKeyId: "key-a", mode: "async", enqueuedAt, ciphertext: codec.seal(intent) };
  const snapshot: CaptureFinalization["snapshot"] = { id: jobId, state: "completed", mode: "async", request_id: jobId,
    progress: 100, attempts_made: 1, attempt_budget: 3, enqueued_at: enqueuedAt, webhook: null,
    result: { request_id: jobId, mode: "async", ok: true, duration_ms: 100, attempts_made: 1, enqueued_at: enqueuedAt, completed_at: enqueuedAt + 100,
      data: { url: options.url, final_url: options.url, format: "png", width: 1280, height: 720, bytes: 123, duration_ms: 100,
        blocked_requests: 0, cached: false, cdn_url: "https://cdn.example.com/capture.png" } },
  };
  const input: CaptureFinalization = { accountId, jobId, reservationId: jobId, apiKeyId: "key-a", snapshot,
    entry: { id: jobId, at: enqueuedAt + 100, ok: true, url: options.url, format: "png", width: 1280, height: 720,
      bytes: 123, duration_ms: 100, blocked_requests: 0, code: null, message: null, request_id: jobId } };
  return { ...intent, sealed, snapshot, input };
}

async function row(jobId: string) {
  const result = await pool.query("SELECT * FROM capture_reservations WHERE job_id = $1", [jobId]);
  return result.rows[0];
}

test("PostgreSQL durable reservation atomically links an encrypted intent and reserves once", { skip: !enabled }, async () => {
  const f = fixture();
  assert.deepEqual(await Promise.all(Array.from({ length: 5 }, () => captureSubmissions.reserveSubmission(f.sealed))), [true, true, true, true, true]);
  const state = await getBillingState(f.accountId);
  assert.equal(state.reserved, 1);
  assert.equal(state.used, 0);
  const stored = await row(f.jobId);
  assert.equal(stored.request_id, f.jobId);
  assert.equal(stored.api_key_id, "key-a");
  assert.equal(stored.submission_ciphertext.includes("test-private-secret"), false);
  assert.equal(stored.submission_ciphertext, f.sealed.ciphertext);
  assert.equal((await captureSubmissions.pendingSubmission(f.accountId, f.jobId, "key-a"))?.acknowledged, false);
  assert.equal(await captureSubmissions.pendingSubmission("other", f.jobId), null);
  assert.equal(await captureSubmissions.pendingSubmission(f.accountId, f.jobId, "key-b"), null);
  await assert.rejects(captureSubmissions.reserveSubmission({ ...f.sealed, apiKeyId: "key-b" }), /identity conflict/);
  assert.equal((await getBillingState(f.accountId)).reserved, 1);
});

test("PostgreSQL delivery rollback preserves a lost acknowledgement and concurrent recovery adds no duplicate", { skip: !enabled }, async () => {
  const f = fixture();
  await captureSubmissions.reserveSubmission(f.sealed);
  let queued: CaptureJobView | undefined;
  let additions = 0;
  let loseReply = true;
  const deps = { submissions: captureSubmissions, codec, queue: { getJob: async () => queued }, dispatcher: {
    dispatch: async (request: DispatchRequest) => {
      additions++;
      const payload: CaptureJobPayload = { request_id: request.requestId, mode: request.mode, options: request.options,
        enqueued_at: request.enqueuedAt!, attempt_budget: 3, billing_account_id: request.accountId,
        api_key_id: request.apiKeyId, reservation_id: request.reservationId };
      queued = { id: f.jobId, data: payload, opts: {}, attemptsMade: 0, timestamp: f.enqueuedAt, progress: 0,
        returnvalue: undefined, getState: async () => "waiting", updateProgress: async () => {} };
      if (loseReply) throw new Error("Redis enqueue reply lost after acceptance");
      return { job_id: f.jobId, mode: request.mode, settled: false, state: "waiting" as const };
    },
  } };
  await assert.rejects(deliverCaptureSubmission(f.jobId, deps), /reply lost/);
  assert.equal((await row(f.jobId)).submission_ciphertext, f.sealed.ciphertext);
  assert.equal((await row(f.jobId)).enqueue_acknowledged, false);
  loseReply = false;
  const recovered = await Promise.all(Array.from({ length: 5 }, () => deliverCaptureSubmission(f.jobId, deps)));
  assert.equal(recovered.filter(Boolean).length, 1);
  assert.equal(additions, 1);
  assert.equal(queued!.data.enqueued_at, f.enqueuedAt);
  assert.equal((await row(f.jobId)).submission_ciphertext, null);
  assert.equal((await row(f.jobId)).enqueue_acknowledged, true);
  assert.equal((await getBillingState(f.accountId)).reserved, 1);
});

test("PostgreSQL startup recovers a pre-enqueue crash and finalization prevents stale replay after pruning", { skip: !enabled }, async () => {
  const f = fixture();
  await captureSubmissions.reserveSubmission(f.sealed);
  let queued: CaptureJobView | undefined;
  let additions = 0;
  let releases = 0;
  const queue = { getJob: async (id: string) => id === f.jobId ? queued : undefined,
    snapshot: async () => f.snapshot, remove: async () => { queued = undefined; } };
  const dispatcher = { dispatch: async (request: DispatchRequest) => {
    additions++;
    queued = { id: f.jobId, data: { request_id: request.requestId, mode: request.mode, options: request.options,
      enqueued_at: request.enqueuedAt!, attempt_budget: 3, billing_account_id: request.accountId,
      api_key_id: request.apiKeyId, reservation_id: request.reservationId },
      opts: {}, attemptsMade: 1, timestamp: f.enqueuedAt, progress: 100, returnvalue: f.snapshot.result,
      getState: async () => "completed", updateProgress: async () => {} };
    return { job_id: f.jobId, mode: request.mode, settled: false, state: "waiting" as const };
  } };
  const consumer = new CaptureCompletionConsumer({ queue, dispatcher, submissionCodec: codec, billing, events: new EventEmitter(),
    admission: { releaseJob: async (account, id) => { assert.equal(account, f.accountId); assert.equal(id, f.jobId); releases++; } } });
  try { await consumer.start(); } finally { await consumer.close(); }
  assert.equal(additions, 1);
  assert.ok(releases >= 1);
  assert.equal((await getBillingState(f.accountId)).reserved, 0);
  assert.equal((await getBillingState(f.accountId)).used, 1);
  assert.equal((await row(f.jobId)).submission_ciphertext, null);
  await queue.remove();
  await captureLifecycle.completePruning(f.jobId);
  assert.equal(await deliverCaptureSubmission(f.jobId, { submissions: captureSubmissions, codec, queue, dispatcher }), false);
  assert.equal(additions, 1);
  assert.equal((await captureLifecycle.storedCapture(f.accountId, f.jobId, "key-a"))?.result?.ok, true);
});

test("PostgreSQL delivery and finalization serialize on the same reservation", { skip: !enabled }, async () => {
  const f = fixture();
  await captureSubmissions.reserveSubmission(f.sealed);
  let entered!: () => void;
  const started = new Promise<void>((resolve) => { entered = resolve; });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const delivery = captureSubmissions.dispatchSubmission(f.jobId, async () => { entered(); await gate; });
  await started;
  const finalization = commitCapture(f.input);
  release();
  await Promise.all([delivery, finalization]);
  const stored = await row(f.jobId);
  assert.equal(stored.status, "consumed");
  assert.equal(stored.submission_ciphertext, null);
  assert.equal((await getBillingState(f.accountId)).used, 1);
  assert.equal(await captureSubmissions.dispatchSubmission(f.jobId, async () => { assert.fail("stale submission delivered"); }), false);
});

test("PostgreSQL enqueue claims are bounded and disjoint across concurrent consumers", { skip: !enabled }, async () => {
  const fixtures = Array.from({ length: 5 }, () => fixture());
  await Promise.all(fixtures.map((f) => captureSubmissions.reserveSubmission(f.sealed)));
  const [first, second] = await Promise.all([captureSubmissions.claimPendingSubmissions(2), captureSubmissions.claimPendingSubmissions(2)]);
  assert.equal(first.length, 2);
  assert.equal(second.length, 2);
  assert.equal(first.some((item) => second.some((other) => other.jobId === item.jobId)), false);
  const remaining = await captureSubmissions.claimPendingSubmissions(2);
  assert.equal(remaining.length, 1);
  assert.equal(new Set([...first, ...second, ...remaining].map((item) => item.jobId)).size, 5);
  assert.equal((await captureSubmissions.claimPendingSubmissions(2)).length, 0);
});

test("PostgreSQL failed history commit retains submission intent and quota; quota denial creates no intent", { skip: !enabled }, async () => {
  const f = fixture();
  await captureSubmissions.reserveSubmission(f.sealed);
  await assert.rejects(commitCapture({ ...f.input, entry: { ...f.input.entry, duration_ms: 2 ** 40 } }));
  const stored = await row(f.jobId);
  assert.equal(stored.status, "held");
  assert.equal(stored.submission_ciphertext, f.sealed.ciphertext);
  assert.equal(stored.result, null);
  assert.equal((await getBillingState(f.accountId)).reserved, 1);
  await pool.query("UPDATE monthly_usage SET consumed = capture_limit - reserved WHERE user_id = $1", [f.accountId]);
  const deniedId = randomUUID();
  const denied = { ...f.sealed, jobId: deniedId };
  assert.equal(await captureSubmissions.reserveSubmission(denied), false);
  assert.equal(await row(deniedId), undefined);
  assert.equal((await getBillingState(f.accountId)).reserved, 1);
});
