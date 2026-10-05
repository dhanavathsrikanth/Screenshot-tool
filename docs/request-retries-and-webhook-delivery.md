# Safe request retries and independent webhook delivery

Implemented 2026-10-04; verification updated 2026-10-05. This completes the request-idempotency and webhook implementation tickets in [todo1.md](../todo1.md). Production rollout, real BullMQ outage tests, and the additional 80% fresh-render latency target remain open.

## Customer behavior

Send `Idempotency-Key` with a capture POST. Keep the same key and request body when retrying after a lost response; use a new key for a new capture. Keys contain 1–128 letters, digits, dots, underscores, or hyphens. The account and key produce one stable job ID. Normalized options, resolved mode, and webhook configuration produce the retained request fingerprint. Matching retries return the original logical capture without another reservation or charge; changed options, mode, webhook secret, or API credential return HTTP 409 `idempotency_conflict`.

Keys remain associated with their original request while its reservation record is retained; there is no timed expiry or automatic key reuse. Object property order does not change a request, while array order does. Requests from different accounts never share a job. Public API retries must use the original API credential, consistent with existing job ownership checks. Revoking that credential does not authorize its replacement to retrieve the original API job. The dashboard uses its authenticated account identity.

If the entire POST response is lost, recover with `GET /v1/requests/:key` using `jobs:read`. This only reads the original request; it does not submit work. An uncommitted transaction can have no job yet. Retrying the same POST/key safely covers that case. POSTs without a key remain separate captures. The dashboard saves the key before submitting, retries with identical bytes up to three times within one 20-second acceptance budget, and restores by GET after reload. Explicit local development captures retain their full render deadline and do not automatically repeat POSTs.

## Public callbacks

The existing flat capture request now accepts an optional callback:

```json
{
  "url": "https://example.com",
  "webhook": {
    "url": "https://your-service.example/capture-complete",
    "secret": "your-random-shared-secret-at-least-16-characters"
  }
}
```

The destination must use HTTPS on its default port, with no URL credentials or fragment. The signing secret must contain 16–256 characters. Delivery resolves DNS each attempt, rejects private/reserved and mixed public/private answers, pins the connection to a permitted address, retains TLS hostname verification, and refuses redirects. A receiver that redirects must be configured with its final HTTPS URL. This policy restricts network destinations; it does not prove ownership of an external receiver.

Successful and terminal failed captures generate `capture.completed` and `capture.failed` respectively. The body retains the original capture result plus `delivery_id` and `delivery_generation`. Verify `x-snapforge-signature` against the exact received body and a recent timestamp using the existing HMAC verification helper. Retries keep the same delivery ID and generation, but receive a fresh signature timestamp and an increasing `x-snapforge-delivery` attempt number. Deduplicate by the signed `(delivery_id, delivery_generation)` pair; delivery is at least once.

`GET /v1/jobs/:id/webhook` requires `jobs:read` and returns owned delivery status and an ETag containing its generation. `POST /v1/jobs/:id/webhook/redeliver` requires `screenshot:write` and that ETag in `If-Match`. Only a delivered or failed notification can be redelivered. Concurrent or stale requests return 409; at most three manual generations are allowed. Redelivery resets the notification attempt budget without rendering or charging again. A new generation deliberately lets a receiver process an explicit manual redelivery.

## Implementation and performance

- PostgreSQL serializes reservation creation per account. Concurrent keyed requests can carry different encryption nonces and timestamps, but reuse the first committed request. A fingerprint/credential conflict cannot release the original hold.
- The terminal finalizer commits billing, retained result, history, cleanup intent, and one encrypted webhook outbox row in the same transaction. A history failure rolls them all back. Duplicate finalizers do not recreate the callback or charge again.
- Rendering workers no longer send callback HTTP requests. The long-running API starts a separate delivery consumer. An unavailable receiver therefore cannot delay renderer completion or trigger another screenshot.
- Pending rows use an indexed schedule. Claims and exhausted-lease cleanup are bounded, use `FOR UPDATE SKIP LOCKED`, and are disjoint across consumers. Four deliveries run at once, with 120-second leases and HTTP attempts capped at ten seconds. Normal delivery permits five attempts, retrying transport errors, 429, and 5xx with bounded exponential backoff and jitter; other 4xx and redirects fail immediately.
- Expired leases recover after crashes. Lease tokens and generations fence stale database acknowledgements. An HTTP acceptance followed by an acknowledgement failure can send a duplicate notification; receiver deduplication is required. No claim promises exactly-once HTTP delivery.
- Targets and secrets use AES-256-GCM authenticated to the account, job, and webhook purpose. New renderer queue payloads omit callback credentials. Status responses omit URLs and secrets. `/v1/health` includes process-local webhook delivery/error counters. This is not yet an exported lag/SLO monitoring system.

## Verification and rollout

The queue suite passes 139 tests, with four opt-in Redis/BullMQ scenarios skipped. Public request contracts pass seven tests. API HTTP boundaries pass 13 tests; dashboard capture/admission/client tests pass 41, with one Redis TCP scenario skipped. The dashboard production build and lint of changed dashboard files pass. Twenty browser quality/network/standby tests pass. Live Upstash REST tests verify repeated admission of the same job does not take another slot or request-rate charge; test keys are removed.

All 19 real PostgreSQL settlement/enqueue/reliability scenarios pass on `dev-capture-settlement-20261003` (`br-holy-boat-b7g0fi5f`). Four new scenarios cover concurrent request retries; atomic callback/history rollback and one finalization; crash recovery and stale acknowledgement fencing; and failed-capture refunds with bounded disjoint callback claims. New tests delete only their generated synthetic accounts.

Three unchanged full live runs pass 27/27 eligible sites each, with three blocks and 90% success across all 30 sites. Their medians are 9.618s, 8.904s, and 8.383s. All seven controlled images match longer-settled pixel references. The requested target remains at most 1.7354s from the prior passing 8.677s reference; it is not achieved. [Raw evidence and measured limiting phases](../apps/benchmark/results/reliability-release.md).

Build before running compiled tests. From `packages/database`, run `node --env-file=../../.env.settlement-test.local --test --test-concurrency=1 dist/settlement.test.js dist/submission.test.js dist/reliability.test.js`; that ignored env file must select the isolated test branch. Full live measurements use `node apps/benchmark/dist/src/cli.js --concurrency 4 --retries 1 --out apps/benchmark/results/reliability-release/run-N` from the repository root. Controlled pixels use `node scripts/quality-profile.mjs results/reliability-release/pixels results/latency-round2/verified-quality` from `apps/benchmark`.

Apply migration `0005_request_idempotency_webhooks` after `0003_capture_completion` and `0004_capture_submission` in staging before deploying this code. Migration 0005 has been applied only to the isolated test branch. The API checks the new schema before serving. Configure the same secret-managed `CAPTURE_INTENT_ENCRYPTION_KEY` and previous-key ring in the API and dashboard; these deployment secrets have not been generated or installed here. Retain previous keys for pending intents and retained webhook targets, including the manual-redelivery retention window. Removing a needed key prevents recovery.

Keep a supervised long-running API process for completion and delivery. A serverless dashboard alone cannot drain the outbox. Before upgrading workers, drain legacy jobs that carry worker-delivered callbacks using the old worker implementation; the new worker does not send those callbacks. New hosted requests use the durable outbox. Direct dispatcher users that bypass the shared service must migrate their callback configuration to it.

This environment has Upstash REST access, but no configured Redis TCP endpoint for BullMQ integration tests. Those tests, a deployed slow-receiver throughput test, production migrations/deployment, storage/billing verification, outbox retention, and exported operational SLOs remain release checks. REST Lua verification does not establish BullMQ transport recovery.

The resource-management direction follows [ScreenshotOne's screenshot API blog](https://screenshotone.com/blog/building-screenshot-api/). The PostgreSQL outbox, retry contracts, and verification results are Snapforge's implementation and evidence.
