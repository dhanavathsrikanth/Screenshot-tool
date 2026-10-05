import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createCaptureSubmissionCodec } from "./submission.js";
import { verifySignature } from "./webhook.js";
import { isPublicWebhookAddress, sendWebhookAttempt, WebhookDeliveryConsumer, WebhookDestinationError,
  type WebhookClaim, type WebhookAttempt, type WebhookOutboxRepository } from "./webhook-outbox.js";

const target = { url: "https://hooks.example.com/event", secret: "webhook-test-secret" };
const codec = createCaptureSubmissionCodec(randomBytes(32).toString("base64"));
const claim: WebhookClaim = { id: "delivery-job", jobId: "job", accountId: "account", token: "lease", attempt: 1, generation: 0,
  ciphertext: codec.sealWebhook(target, { accountId: "account", jobId: "job" }),
  result: { request_id: "job", mode: "async", ok: false, error: { code: "render_timeout", message: "Timeout", retriable: true, request_id: "job" },
    duration_ms: 100, enqueued_at: 1, completed_at: 101, attempts_made: 1 } };

test("webhook encryption authenticates purpose and ownership", () => {
  assert.deepEqual(codec.openWebhook(claim.ciphertext, claim), target);
  assert.equal(claim.ciphertext.includes(target.secret), false);
  assert.throws(() => codec.openWebhook(claim.ciphertext, { ...claim, accountId: "other" }));
});

test("delivery rejects private, special, mapped, and mixed DNS addresses before transport", async () => {
  for (const address of ["127.0.0.1", "169.254.169.254", "10.0.0.1", "100.64.0.1", "0.0.0.0", "198.19.1.1", "192.0.2.1", "224.1.1.1",
    "::1", "::ffff:127.0.0.1", "fe80::1", "fc00::1", "2001:db8::1", "2002:7f00:1::1"]) {
    assert.equal(isPublicWebhookAddress(address), false);
    await assert.rejects(sendWebhookAttempt(claim, target, 1000, { resolve: async () => [{ address: "8.8.8.8", family: 4 }, { address, family: 4 }],
      send: async () => { assert.fail("unsafe connection"); } }), WebhookDestinationError);
  }
  assert.equal(isPublicWebhookAddress("8.8.8.8"), true);
  assert.equal(isPublicWebhookAddress("2606:4700:4700::1111"), true);
});

test("delivery pins a public address, signs its stable identity, and never follows redirects", async () => {
  for (const statusCode of [204, 302, 400, 429, 500]) {
    const outcome = await sendWebhookAttempt(claim, target, 1000, { resolve: async () => [{ address: "8.8.8.8", family: 4 }],
      send: async (url, address, body, headers) => {
        assert.equal(url.hostname, "hooks.example.com"); assert.equal(address.address, "8.8.8.8");
        assert.equal(verifySignature({ body, secret: target.secret, signature: headers["x-snapforge-signature"] }), true);
        assert.equal(JSON.parse(body).delivery_id, claim.id);
        assert.equal(JSON.parse(body).delivery_generation, claim.generation);
        assert.equal(JSON.parse(body).job_id, claim.jobId);
        return statusCode;
      } });
    assert.equal(outcome.delivered, statusCode === 204);
    assert.equal(outcome.retry, statusCode === 429 || statusCode === 500);
  }
});

test("independent delivery retries failures within a bound and does not call a renderer", async () => {
  const outcomes: WebhookAttempt[] = [];
  let attempts = 0;
  const repository: WebhookOutboxRepository = { claim: async () => attempts < 2 ? [{ ...claim, attempt: ++attempts }] : [],
    complete: async (_, outcome) => { outcomes.push(outcome); }, status: async () => null, redeliver: async () => false };
  const consumer = new WebhookDeliveryConsumer(repository, codec, { maxAttempts: 2, send: async () => { throw new Error("receiver down"); } });
  await consumer.reconcile(); await consumer.reconcile(); await consumer.reconcile(); await consumer.close();
  assert.deepEqual(outcomes.map((item) => item.retry), [true, false]);
  assert.equal(consumer.stats().failed, 1);
});

test("invalid destinations stop immediately; a lost database acknowledgement keeps delivery recoverable", async () => {
  let completions = 0;
  const repository: WebhookOutboxRepository = { claim: async () => [claim], complete: async (_, outcome) => {
    assert.equal(outcome.retry, false); completions++; if (completions === 1) throw new Error("database reply lost");
  }, status: async () => null, redeliver: async () => false };
  const consumer = new WebhookDeliveryConsumer(repository, codec, { send: async () => { throw new WebhookDestinationError("blocked"); } });
  await consumer.reconcile(); await consumer.reconcile();
  assert.equal(consumer.stats().errors, 1); assert.equal(completions, 2);
  await consumer.close();
});
