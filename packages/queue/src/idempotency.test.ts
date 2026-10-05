import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { CaptureService } from "./service.js";
import { captureRequestFingerprint, CaptureRequestConflictError, idempotentJobId } from "./idempotency.js";
import { createCaptureSubmissionCodec, type SealedCaptureSubmission, type CaptureSubmissionRepository } from "./submission.js";
import { CaptureQueue } from "./queue.js";
import { CaptureDispatcher } from "./dispatcher.js";
import { resolveQueueConfig } from "./config.js";
import { FakeQueueHost } from "./fakes.js";

function fixture() {
  const records = new Map<string, SealedCaptureSubmission>();
  const host = new FakeQueueHost();
  const config = resolveQueueConfig({ redisUrl: "redis://localhost:6379" });
  const queue = new CaptureQueue(host, config);
  const admitted: string[] = [];
  const released: string[] = [];
  let reservations = 0;
  const submissions: CaptureSubmissionRepository = {
    existingRequest: async (_, id) => records.has(id) ? { fingerprint: records.get(id)!.requestFingerprint!, apiKeyId: records.get(id)!.apiKeyId } : null,
    reserveSubmission: async (input) => {
      const existing = records.get(input.jobId);
      if (existing && (existing.requestFingerprint !== input.requestFingerprint || existing.apiKeyId !== input.apiKeyId)) throw new CaptureRequestConflictError(input.jobId);
      if (!existing) { records.set(input.jobId, input); reservations++; }
      return true;
    },
    pendingSubmission: async (account, id) => records.get(id)?.accountId === account ? { ...records.get(id)!, acknowledged: false } : null,
    dispatchSubmission: async (id, deliver) => { await deliver(records.get(id)!); return true; },
    claimPendingSubmissions: async () => [],
  };
  const service = new CaptureService({ queue, dispatcher: new CaptureDispatcher(queue, config), submissionCodec: createCaptureSubmissionCodec(randomBytes(32).toString("base64")),
    admission: { acquireJob: async (_, id) => { admitted.push(id); }, releaseJob: async (_, id) => { released.push(id); } },
    billing: { submissions, reserveCapture: async () => { throw new Error("legacy"); }, linkReservationToJob: async () => {},
      reservationForJob: async () => null, settleCapture: async () => { throw new Error("unexpected refund"); }, recordCapture: async () => {} } });
  return { service, records, host, admitted, released, count: () => reservations };
}

test("canonical request hashes ignore object key order and preserve ordered arrays", () => {
  assert.equal(captureRequestFingerprint({ a: 1, b: { x: 1, y: 2 } }), captureRequestFingerprint({ b: { y: 2, x: 1 }, a: 1 }));
  assert.notEqual(captureRequestFingerprint([1, 2]), captureRequestFingerprint([2, 1]));
  assert.notEqual(idempotentJobId("one", "same"), idempotentJobId("two", "same"));
});

test("lost HTTP response can be retried with default-normalized options without another hold or render", async () => {
  const f = fixture();
  const identity = { accountId: "account", apiKeyId: "key-a" };
  const first = await f.service.submit(identity, { url: "https://example.com" }, "request-one", "async", "safe-key");
  const second = await f.service.submit(identity, { url: "https://example.com", format: "png" }, "request-two", "async", "safe-key");
  assert.equal(first.id, second.id);
  assert.equal(f.count(), 1);
  assert.equal(f.host.added.length, 1);
  assert.equal(f.admitted.length, 1);
  assert.equal((await f.service.lookupRequest(identity, "safe-key", "request-three")).id, first.id);
});

test("conflicting options, modes, callback secrets, and credentials preserve the original capture", async () => {
  const f = fixture();
  const identity = { accountId: "account", apiKeyId: "key-a" };
  const body = { url: "https://example.com", webhook: { url: "https://hooks.example.com", secret: "original-signing-secret" } };
  await f.service.submit(identity, body, "first", "async", "key");
  for (const [owner, input, mode] of [[identity, { ...body, full_page: true }, "async"], [identity, body, "sync"],
    [identity, { ...body, webhook: { ...body.webhook, secret: "changed-signing-secret" } }, "async"],
    [{ ...identity, apiKeyId: "other-key" }, body, "async"]] as const) {
    await assert.rejects(f.service.submit(owner, input, "retry", mode, "key"), CaptureRequestConflictError);
  }
  assert.equal(f.count(), 1);
  assert.equal(f.host.added.length, 1);
  assert.equal(f.released.length, 0);
});

test("the same key is isolated between accounts and invalid keys never reserve", async () => {
  const f = fixture();
  const input = { url: "https://example.com" };
  const a = await f.service.submit({ accountId: "a" }, input, "a", "async", "same");
  const b = await f.service.submit({ accountId: "b" }, input, "b", "async", "same");
  assert.notEqual(a.id, b.id);
  for (const key of ["", "x".repeat(129), "spaces not allowed", "key:colon"]) await assert.rejects(f.service.submit({ accountId: "a" }, input, "bad", "async", key));
  assert.equal(f.count(), 2);
});
