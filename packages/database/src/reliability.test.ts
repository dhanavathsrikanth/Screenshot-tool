import test, { after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { CaptureRequestConflictError, captureJobPayloadSchema, captureRequestFingerprint, createCaptureSubmissionCodec,
  idempotentJobId, type CaptureFinalization, type SealedCaptureSubmission } from "@snapforge/queue";
import { captureSubmissions, commitCapture, getBillingState, pool, webhookDeliveries } from "./index.js";

const enabled = process.env.SNAPFORGE_SETTLEMENT_TEST === "1";
const codec = createCaptureSubmissionCodec(randomBytes(32).toString("base64"));
const accounts: string[] = [];
afterEach(async () => {
  if (accounts.length) await pool.query("DELETE FROM accounts WHERE user_id = ANY($1::text[])", [accounts.splice(0)]);
});
after(async () => { await pool.end(); });

function fixture() {
  const accountId = `reliability-test-${randomUUID()}`;
  accounts.push(accountId);
  const jobId = idempotentJobId(accountId, "retry-key");
  const enqueuedAt = Date.now();
  const options = captureJobPayloadSchema.parse({ request_id: jobId, mode: "async", enqueued_at: enqueuedAt, attempt_budget: 3,
    options: { url: "https://example.com" } }).options;
  const webhook = { url: "https://receiver.example.com/callback", secret: "test-callback-private-secret" };
  const intent = { accountId, jobId, apiKeyId: "key-a", mode: "async" as const, enqueuedAt, options, webhook };
  const sealed: SealedCaptureSubmission = { ...intent, ciphertext: codec.seal(intent),
    requestFingerprint: captureRequestFingerprint({ options, mode: "async", webhook }),
    webhookCiphertext: codec.sealWebhook(webhook, intent) };
  const result: CaptureFinalization["snapshot"]["result"] = { request_id: jobId, mode: "async", ok: true,
    duration_ms: 100, attempts_made: 1, enqueued_at: enqueuedAt, completed_at: enqueuedAt + 100,
    data: { url: options.url, final_url: options.url, format: "png", width: 1280, height: 720, bytes: 123,
      duration_ms: 100, blocked_requests: 0, cached: false, cdn_url: "https://cdn.example.com/capture.png" } };
  const input: CaptureFinalization = { accountId, jobId, reservationId: jobId, apiKeyId: "key-a",
    snapshot: { id: jobId, state: "completed", mode: "async", request_id: jobId, progress: 100, attempts_made: 1,
      attempt_budget: 3, enqueued_at: enqueuedAt, webhook: null, result },
    entry: { id: jobId, at: enqueuedAt + 100, ok: true, url: options.url, format: "png", width: 1280, height: 720,
      bytes: 123, duration_ms: 100, blocked_requests: 0, code: null, message: null, request_id: jobId } };
  return { accountId, jobId, intent, sealed, input, webhook };
}

test("PostgreSQL concurrent HTTP retries keep one hold and original encrypted request", { skip: !enabled }, async () => {
  const f = fixture();
  const attempts = Array.from({ length: 6 }, (_, n) => ({ ...f.sealed, enqueuedAt: f.intent.enqueuedAt + n,
    ciphertext: codec.seal({ ...f.intent, enqueuedAt: f.intent.enqueuedAt + n }) }));
  assert.deepEqual(await Promise.all(attempts.map((sealed) => captureSubmissions.reserveSubmission(sealed))), attempts.map(() => true));
  assert.equal((await getBillingState(f.accountId)).reserved, 1);
  const rows = await pool.query("SELECT submission_ciphertext, submitted_at FROM capture_reservations WHERE job_id = $1", [f.jobId]);
  assert.equal(rows.rowCount, 1);
  assert.ok(attempts.some((attempt) => attempt.ciphertext === rows.rows[0].submission_ciphertext &&
    attempt.enqueuedAt === rows.rows[0].submitted_at.getTime()));
  await assert.rejects(captureSubmissions.reserveSubmission({ ...f.sealed, requestFingerprint: "conflicting-options" }), CaptureRequestConflictError);
  await assert.rejects(captureSubmissions.reserveSubmission({ ...f.sealed, apiKeyId: "key-b" }), CaptureRequestConflictError);
  assert.equal((await getBillingState(f.accountId)).reserved, 1);
  assert.equal(await captureSubmissions.existingRequest!("other-account", f.jobId), null);
});

test("PostgreSQL finalization rolls back callback creation with history then commits it once", { skip: !enabled }, async () => {
  const f = fixture();
  await captureSubmissions.reserveSubmission(f.sealed);
  await assert.rejects(commitCapture({ ...f.input, entry: { ...f.input.entry, duration_ms: 2 ** 40 } }));
  assert.equal(await webhookDeliveries.status(f.accountId, f.jobId), null);
  assert.equal((await getBillingState(f.accountId)).reserved, 1);
  await Promise.all(Array.from({ length: 5 }, () => commitCapture(f.input)));
  assert.equal((await getBillingState(f.accountId)).used, 1);
  assert.equal((await getBillingState(f.accountId)).reserved, 0);
  const rows = await pool.query("SELECT target_ciphertext, result FROM webhook_outbox WHERE job_id = $1", [f.jobId]);
  assert.equal(rows.rowCount, 1);
  assert.equal(rows.rows[0].target_ciphertext.includes(f.webhook.secret), false);
  assert.deepEqual(codec.openWebhook(rows.rows[0].target_ciphertext, f), f.webhook);
  assert.equal(rows.rows[0].result.ok, true);
  assert.equal(await webhookDeliveries.status("other-account", f.jobId), null);
  assert.equal(await webhookDeliveries.status(f.accountId, f.jobId, "key-b"), null);
  assert.equal(await webhookDeliveries.redeliver(f.accountId, f.jobId, 0, "key-b"), false);
});

test("PostgreSQL webhook claims recover crashes and fence stale acknowledgements and manual retries", { skip: !enabled }, async () => {
  const f = fixture();
  await captureSubmissions.reserveSubmission(f.sealed);
  await commitCapture(f.input);
  const [original] = await webhookDeliveries.claim(1, 5, 120);
  assert.equal(original.jobId, f.jobId);
  assert.equal((await webhookDeliveries.claim(1, 5, 120)).length, 0);
  await pool.query("UPDATE webhook_outbox SET lease_until = now() - interval '1 second' WHERE job_id = $1", [f.jobId]);
  const [replacement] = await webhookDeliveries.claim(1, 5, 120);
  assert.equal(replacement.attempt, 2);
  assert.notEqual(original.token, replacement.token);
  await webhookDeliveries.complete(original, { delivered: true, retry: false, statusCode: 200 }, new Date());
  assert.equal((await webhookDeliveries.status(f.accountId, f.jobId))!.state, "pending");
  await webhookDeliveries.complete(replacement, { delivered: false, retry: false, statusCode: 400 }, new Date());
  const redeliveries = await Promise.all(Array.from({ length: 4 }, () => webhookDeliveries.redeliver(f.accountId, f.jobId, 0, "key-a")));
  assert.equal(redeliveries.filter(Boolean).length, 1);
  const [redelivery] = await webhookDeliveries.claim(1, 5, 120);
  assert.equal(redelivery.id, original.id);
  assert.equal(redelivery.generation, 1);
  assert.equal(redelivery.attempt, 1);
  await webhookDeliveries.complete(replacement, { delivered: true, retry: false }, new Date());
  assert.equal((await webhookDeliveries.status(f.accountId, f.jobId))!.state, "pending");
  await webhookDeliveries.complete(redelivery, { delivered: true, retry: false, statusCode: 200 }, new Date());
  assert.equal((await webhookDeliveries.status(f.accountId, f.jobId))!.state, "delivered");
  assert.equal((await getBillingState(f.accountId)).used, 1);
});

test("PostgreSQL callbacks for failed captures refund credits and claims remain bounded and disjoint", { skip: !enabled }, async () => {
  const fixtures = Array.from({ length: 3 }, () => fixture());
  for (const f of fixtures) {
    await captureSubmissions.reserveSubmission(f.sealed);
    const result = { ...f.input.snapshot.result!, ok: false, data: undefined,
      error: { code: "render_incomplete" as const, message: "Incomplete capture", retriable: true, request_id: f.jobId } };
    await commitCapture({ ...f.input, snapshot: { ...f.input.snapshot, state: "failed", result },
      entry: { ...f.input.entry, ok: false, code: "render_incomplete", message: "Incomplete capture" } });
    assert.equal((await getBillingState(f.accountId)).used, 0);
    assert.equal((await getBillingState(f.accountId)).reserved, 0);
  }
  const claims = (await Promise.all([webhookDeliveries.claim(2, 2, 120), webhookDeliveries.claim(2, 2, 120)])).flat();
  assert.equal(claims.length, 3);
  assert.equal(new Set(claims.map((claim) => claim.id)).size, 3);
  assert.ok(claims.every((claim) => claim.result.ok === false));
  for (const claim of claims) await webhookDeliveries.complete(claim, { delivered: false, retry: true }, new Date());
  assert.equal((await webhookDeliveries.claim(4, 2, 120)).length, 3);
  await pool.query("UPDATE webhook_outbox SET lease_until = now() - interval '1 second' WHERE user_id = ANY($1::text[])", [fixtures.map((f) => f.accountId)]);
  assert.equal((await webhookDeliveries.claim(4, 2, 120)).length, 0);
  for (const f of fixtures) assert.equal((await webhookDeliveries.status(f.accountId, f.jobId))!.state, "failed");
});
