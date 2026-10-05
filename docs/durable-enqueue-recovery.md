# Durable enqueue recovery

Implemented 2026-10-04. This completes implementation ticket 3 in [todo1.md](../todo1.md). Production rollout and real BullMQ outage verification remain open. Later the same day, [account-scoped POST retries and independent webhook delivery](request-retries-and-webhook-delivery.md) were implemented; that evidence supersedes the outstanding idempotency/webhook tickets described in this earlier report.

## Customer outcome

A capture accepted into PostgreSQL can reach the renderer after a queue outage or API restart without a customer submitting it again. Recovery keeps the original job ID, options, submission timestamp, account, API key, and credit reservation. A confirmed database reservation followed by an enqueue outage returns a pending handle; the playground follows that handle and restores it after reload.

If the database commit acknowledgement itself is lost, the API returns HTTP 503 with `error.details.job_id`. Its outcome is uncertain: inspect that handle before sending another POST. The playground already saves and follows handles in these errors. A request whose transaction never committed has no recoverable capture; a later owned lookup can report job not found. Account-scoped POST idempotency remains a separate ticket, including complete loss of the HTTP response before the client receives any handle.

## Implementation and safeguards

- `reserveCapture` atomically reserves monthly quota or prepaid credit, links the account/job, and stores the encrypted intent. There is no separate linking write in the production submission path. Retrying the same internal sealed reservation does not hold another credit.
- `captureSubmissions.dispatchSubmission` locks the reservation and reads its current state before delivering. Delivery and terminal finalization serialize on this row. An old claimed intent cannot recreate a finalized or pruned job.
- Recovery checks Redis for the original job and verifies its account, reservation, API key, request ID, mode, and original submission timestamp. Existing matching work is acknowledged without another queue add. Identity conflicts retain evidence and produce a recovery error.
- If the queue accepts a write but its acknowledgement or the database acknowledgement is lost, the transaction retains the intent. The next attempt finds the original retained queue job. Ambiguous outcomes do not trigger a blind refund or a replacement job ID.
- The existing long-running API completion consumer recovers pending submissions at startup and on its periodic scan. A partial index supports batches of at most 100, default 32, with four deliveries at a time. `FOR UPDATE SKIP LOCKED` separates concurrent claims; each claim becomes eligible again after 15 seconds if still pending. These are scheduling intervals, not a recovery-time guarantee.
- Before adding a missing job, production recovery restores or renews the original account lease. It checks account concurrency and does not repeat the original request-rate charge. Full accounts leave their intents pending for a later attempt.
- Producer commands have a two-second timeout, one retry per request, and no offline command buffering. The dashboard retains its one-second command timeout. Worker and QueueEvents blocking connections keep unbounded reconnect behavior without the producer command timeout. Never add an independent `Promise.race` timeout around delivery: abandoning a still-running queue write would weaken the database guard.
- Enqueue delivery is separated from the synchronous result wait. The two-second sync wait starts after the database transaction releases its lock. Recovery never holds that lock while rendering or waiting for a completion notification.
- Owned PostgreSQL snapshots and pending metadata remain available when Redis is unavailable. Pending metadata omits options, ciphertext, and secrets. Unknown queue state is reported as `unknown`; it is not a terminal failure or proof that work was lost. Attempt counts/budgets are zero in this fallback until queue evidence is available.
- Process-local `enqueue_recovered` and `enqueue_errors` counters join settlement health diagnostics. Logs include job IDs without plaintext options or secret-bearing exception messages.

## Secret configuration and retention

Configure the same `CAPTURE_INTENT_ENCRYPTION_KEY` in the API and dashboard: a cryptographically random 32-byte key encoded in base64, stored in the deployment secret manager. The implementation uses AES-256-GCM with fresh nonces and authenticated account/job identities. It validates decrypted options again. Missing or invalid configuration fails closed before reserving credit; there is no plaintext fallback or generated production key.

For rotation, set a new current key and retain old base64 keys as comma-separated `CAPTURE_INTENT_PREVIOUS_KEYS` on all producers and recovery consumers. Deploy the readers of the new key everywhere before allowing producers to write with it. Keep previous keys until their pending intents drain; deleting a needed key leaves those submissions held for investigation.

Validated intent plaintext is bounded to 384 KiB, ciphertext to approximately 512 KiB, in addition to the existing 256 KiB HTTP input bound. Ciphertext is cleared after a confirmed enqueue, finalization, or an explicit reservation release. It remains retained while submission recovery is unresolved, including outages and unavailable old keys; automatic age cancellation/refund and unresolved-intent deletion are not implemented. Database backups follow the separately configured retention policy. Redis job payloads still contain rendering options under the existing queue access policy; this change protects the newly retained PostgreSQL intent.

## Verification

| Check | Result |
| --- | --- |
| Queue compiled suite | 130 passed; 4 opt-in scenarios skipped, plus the existing Redis integration suite |
| Existing real PostgreSQL settlement scenarios | 9 passed |
| New real PostgreSQL enqueue scenarios | 6 passed on the isolated branch |
| Redis recovery admission | Live Lua execution via Upstash REST passed with a unique temporary prefix; temporary keys removed |
| API boundary tests | 11 passed, including durable 202 delivery and protected polling during Redis outages |
| Dashboard capture, polling, admission tests | 35 passed; 1 live Redis TCP admission scenario skipped |
| Production dashboard build | Passed |

The PostgreSQL scenarios cover atomic reservation/link/intent persistence, concurrent reservation replay, ownership, lost enqueue acknowledgement with concurrent recovery, restart before enqueue, finalization and pruning, delivery/finalization serialization, bounded disjoint recovery claims, history-write rollback, and quota denial without an orphan intent. They run on `dev-capture-settlement-20261003` (`br-holy-boat-b7g0fi5f`), not main. New submission tests delete only their dedicated synthetic accounts; earlier settlement test accounts remain available for review.

Build the affected packages before compiled tests. From `packages/database`, migrate the isolated branch using `node --env-file=../../.env.settlement-test.local node_modules/drizzle-kit/bin.cjs migrate --config drizzle.config.ts`, then run `node --env-file=../../.env.settlement-test.local --test --test-concurrency=1 dist/settlement.test.js dist/submission.test.js`. The ignored local env file selects that branch; do not run these tests with production credentials. The optional Redis admission test requires `SNAPFORGE_ADMISSION_REST_TEST=1` plus Upstash REST credentials and uses an isolated random prefix. REST verification does not verify BullMQ, which requires Redis TCP.

The engine's readiness and visual-output checks were not changed. No fresh-render benchmark was run for this lifecycle change, so this does not establish the requested 80% latency reduction or restore the failing full live quality gate.

## Rollout and remaining limits

1. Apply migrations `0003_capture_completion` and `0004_capture_submission` in staging before deploying upgraded API/dashboard code. Configure the shared encryption key and queue namespace. The API start command now matches the actual compiled `dist/main.js` path.
2. Run a supervised long-running API consumer for dashboard jobs. A serverless dashboard alone cannot perform background recovery. Start consumers before enabling submissions and check recovery error counters and outstanding reservations.
3. Supply an isolated Redis TCP endpoint and exercise actual BullMQ acceptance followed by transport loss, API termination before enqueue/acknowledgement, concurrent recovery, worker completion during delivery, Redis restart, producer command timeouts, and retained job pruning. This environment has REST credentials but no Redis TCP endpoint; these checks remain unverified.
4. Drain older workers that can remove unsettled job evidence and retain the conservative queue-pruning policy. BullMQ is an at-least-once system; worker crashes can repeat rendering. This feature prevents extra enqueueing in the covered submission-recovery paths, not a universal exactly-once rendering guarantee across independent databases.
5. Investigate acknowledged jobs whose queue evidence disappears. Their encrypted options have already been cleared; recovery does not recreate them or refund them based solely on age. Total Redis data loss, destructive queue administration, abandoned pre-migration reservations, and request cancellation need separate operational policy.
6. Production migration/deployment, public POST idempotency, independent webhook delivery, cache-hit billing, and the fresh-quality/performance gate remain open. Migration and live tests here changed only the isolated test branch and temporary Redis test keys.

The asynchronous resource-management direction is informed by [ScreenshotOne's screenshot API blog](https://screenshotone.com/blog/building-screenshot-api/). [BullMQ job ID documentation](https://docs.bullmq.io/guide/jobs/job-ids) explains why a retained ID deduplicates queue adds and why removing the job ends that protection. The PostgreSQL guard and rollout criteria above are Snapforge's implementation; references do not prove its production readiness or performance.
