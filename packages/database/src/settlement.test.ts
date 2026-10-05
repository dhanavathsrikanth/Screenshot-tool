import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { CaptureCompletionConsumer, CaptureFinalizer, CaptureService, type CaptureFinalization } from "@snapforge/queue";
import { captureLifecycle, commitCapture, getBillingState, linkReservationToJob, pool, recordCapture, reservationForJob, reserveCapture, settleCapture } from "./index.js";

const enabled = process.env.SNAPFORGE_SETTLEMENT_TEST === "1";
after(async () => { await pool.end(); });
const billing = { reserveCapture, settleCapture, linkReservationToJob, reservationForJob, recordCapture, lifecycle: captureLifecycle };

async function fixture(success = true) {
  const accountId = `settlement-test-${randomUUID()}`;
  const jobId = randomUUID();
  assert.equal(await reserveCapture(accountId, jobId), true);
  await linkReservationToJob(accountId, jobId, jobId);
  const at = Date.now();
  const snapshot: CaptureFinalization["snapshot"] = { id: jobId, state: success ? "completed" : "failed", mode: "async",
    request_id: jobId, progress: 100, attempts_made: 1, attempt_budget: 3, enqueued_at: at - 100, webhook: null,
    result: { request_id: jobId, mode: "async", ok: success, duration_ms: 100, attempts_made: 1, enqueued_at: at - 100, completed_at: at,
      ...(success ? { data: { url: "https://example.com", final_url: "https://example.com", format: "png", width: 1280, height: 720,
        bytes: 123, duration_ms: 100, blocked_requests: 0, cached: false, cdn_url: "https://cdn.example.com/capture.png" } }
        : { error: { code: "render_timeout", message: "Timeout", retriable: true, request_id: jobId } }),
    },
  };
  const input: CaptureFinalization = { accountId, jobId, reservationId: jobId, apiKeyId: "key-a", snapshot,
    entry: { id: jobId, at, ok: success, url: "https://example.com", format: "png", width: success ? 1280 : null,
      height: success ? 720 : null, bytes: success ? 123 : 0, duration_ms: 100, blocked_requests: 0,
      code: success ? null : "render_timeout", message: success ? null : "Timeout", request_id: jobId } };
  return { input, accountId, jobId, snapshot };
}

async function reservation(jobId: string) {
  const result = await pool.query("SELECT status, result, cleanup_pending FROM capture_reservations WHERE job_id = $1", [jobId]);
  return result.rows[0];
}

test("PostgreSQL concurrent finalizers charge once and commit one result/history/cleanup record", { skip: !enabled }, async () => {
  const f = await fixture();
  await Promise.all(Array.from({ length: 12 }, () => commitCapture(f.input)));
  const state = await getBillingState(f.accountId);
  assert.equal(state.used, 1);
  assert.equal(state.reserved, 0);
  const row = await reservation(f.jobId);
  assert.equal(row.status, "consumed");
  assert.equal(row.cleanup_pending, true);
  assert.equal(row.result.result.ok, true);
  const logs = await pool.query("SELECT count(*)::integer AS count FROM capture_logs WHERE id = $1", [f.jobId]);
  assert.equal(logs.rows[0].count, 1);
  assert.equal((await captureLifecycle.storedCapture(f.accountId, f.jobId, "key-a"))?.result?.ok, true);
  assert.equal(await captureLifecycle.storedCapture("other-account", f.jobId), null);
  assert.equal(await captureLifecycle.storedCapture(f.accountId, f.jobId, "key-b"), null);
  await captureLifecycle.completeCleanup(f.jobId);
});

test("PostgreSQL history failure rolls back billing, result, and cleanup together", { skip: !enabled }, async () => {
  const f = await fixture();
  await assert.rejects(commitCapture({ ...f.input, entry: { ...f.input.entry, duration_ms: 2 ** 40 } }));
  const state = await getBillingState(f.accountId);
  assert.equal(state.used, 0);
  assert.equal(state.reserved, 1);
  const row = await reservation(f.jobId);
  assert.equal(row.status, "held");
  assert.equal(row.result, null);
  assert.equal(row.cleanup_pending, false);
  await commitCapture(f.input);
  assert.equal((await getBillingState(f.accountId)).used, 1);
  await captureLifecycle.completeCleanup(f.jobId);
});

test("PostgreSQL finalization verifies reservation ownership before billing", { skip: !enabled }, async () => {
  const f = await fixture();
  await assert.rejects(commitCapture({ ...f.input, accountId: "forged-account" }), /reservation link/);
  await assert.rejects(commitCapture({ ...f.input, reservationId: randomUUID() }), /reservation link/);
  const state = await getBillingState(f.accountId);
  assert.equal(state.used, 0);
  assert.equal(state.reserved, 1);
  assert.equal((await reservation(f.jobId)).result, null);
  await pool.query("UPDATE capture_reservations SET request_id = $1 WHERE job_id = $2", [randomUUID(), f.jobId]);
  assert.equal((await commitCapture({ ...f.input, reservationId: undefined })).id, f.jobId);
  assert.equal((await getBillingState(f.accountId)).used, 1);
  await captureLifecycle.completeCleanup(f.jobId);
});

test("PostgreSQL failed monthly capture releases quota without consumption", { skip: !enabled }, async () => {
  const f = await fixture(false);
  await Promise.all([commitCapture(f.input), commitCapture(f.input)]);
  const state = await getBillingState(f.accountId);
  assert.equal(state.used, 0);
  assert.equal(state.reserved, 0);
  assert.equal((await reservation(f.jobId)).status, "released");
  await captureLifecycle.completeCleanup(f.jobId);
});

for (const success of [true, false]) {
  test(`PostgreSQL prepaid ${success ? "success consumes" : "failure refunds"} exactly one credit`, { skip: !enabled }, async () => {
    const f = await fixture(success);
    await settleCapture(f.jobId, false);
    await pool.query("UPDATE monthly_usage SET consumed = capture_limit WHERE user_id = $1", [f.accountId]);
    await pool.query("UPDATE accounts SET prepaid_credits = 3 WHERE user_id = $1", [f.accountId]);
    const newId = randomUUID();
    assert.equal(await reserveCapture(f.accountId, newId), true);
    assert.equal((await getBillingState(f.accountId)).prepaidCredits, 2);
    await linkReservationToJob(f.accountId, newId, newId);
    const input = { ...f.input, jobId: newId, reservationId: newId,
      snapshot: { ...f.snapshot, id: newId, request_id: newId, result: { ...f.snapshot.result!, request_id: newId } }, entry: { ...f.input.entry, id: newId, request_id: newId } };
    await Promise.all(Array.from({ length: 6 }, () => commitCapture(input)));
    assert.equal((await getBillingState(f.accountId)).prepaidCredits, success ? 2 : 3);
    assert.equal((await reservation(newId)).status, success ? "consumed" : "released");
    await captureLifecycle.completeCleanup(newId);
  });
}

test("PostgreSQL old reservations are not refunded on the next submission", { skip: !enabled }, async () => {
  const f = await fixture();
  await pool.query("UPDATE capture_reservations SET created_at = now() - interval '3 days' WHERE job_id = $1", [f.jobId]);
  const second = randomUUID();
  assert.equal(await reserveCapture(f.accountId, second), true);
  assert.equal((await reservation(f.jobId)).status, "held");
  assert.equal((await getBillingState(f.accountId)).reserved, 2);
  await commitCapture(f.input);
  await settleCapture(second, false);
  await captureLifecycle.completeCleanup(f.jobId);
});

test("PostgreSQL recovery claims are bounded, rotate, and do not duplicate across consumers", { skip: !enabled }, async () => {
  const fixtures = await Promise.all(Array.from({ length: 4 }, () => fixture()));
  const [a, b] = await Promise.all([captureLifecycle.claimPendingCaptures(2), captureLifecycle.claimPendingCaptures(2)]);
  assert.ok(a.length <= 2 && b.length <= 2);
  assert.equal(a.filter((row) => b.some((other) => row.jobId === other.jobId)).length, 0);
  for (const f of fixtures) { await commitCapture(f.input); await captureLifecycle.completeCleanup(f.jobId); }
});

test("PostgreSQL startup recovery and Redis cleanup outage need no customer poll", { skip: !enabled }, async () => {
  const f = await fixture();
  const job = { id: f.jobId, data: { request_id: f.jobId, mode: "async" as const, options: { url: "https://example.com", format: "png" },
    billing_account_id: f.accountId, reservation_id: f.jobId, api_key_id: "key-a" },
  } as Parameters<CaptureFinalizer["finalize"]>[0];
  let cleanupFails = true;
  let released = 0;
  const admission = { releaseJob: async () => { if (cleanupFails) throw new Error("Redis unavailable"); released++; } };
  let removed = false;
  const queue = { getJob: async (id: string) => id === f.jobId && !removed ? job : undefined,
    snapshot: async () => f.snapshot, remove: async () => { removed = true; } };
  const createConsumer = () => new CaptureCompletionConsumer({ queue, events: new EventEmitter(), billing, admission });
  const first = createConsumer();
  await first.start();
  await first.close();
  assert.equal((await getBillingState(f.accountId)).used, 1);
  assert.equal((await reservation(f.jobId)).cleanup_pending, true);
  cleanupFails = false;
  await pool.query("UPDATE capture_reservations SET next_cleanup_at = now() WHERE job_id = $1", [f.jobId]);
  const second = createConsumer();
  await second.start();
  await second.close();
  assert.equal((await reservation(f.jobId)).cleanup_pending, false);
  assert.ok(released > 0);
  await pool.query("UPDATE capture_reservations SET settled_at = now() - interval '2 days' WHERE job_id = $1", [f.jobId]);
  await second.reconcile();
  assert.equal(removed, true);
  const service = new CaptureService({ queue, billing, admission: { ...admission, acquireJob: async () => {} },
    dispatcher: { dispatch: async () => { throw new Error("second rendering"); } } });
  assert.equal((await service.lookup({ accountId: f.accountId, apiKeyId: "key-a" }, f.jobId, "read")).result?.ok, true);
});
