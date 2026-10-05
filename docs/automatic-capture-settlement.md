# Automatic capture settlement

Implemented 2026-10-03. This delivers the terminal-finalization and recovery slices of Part 2 in [todo1.md](../todo1.md). Follow-up: [durable enqueue recovery](durable-enqueue-recovery.md) is implemented 2026-10-04. Deployment, live Redis TCP verification, request idempotency, and webhook delivery remain open. Verification counts below record this earlier release.

## Customer outcome

Hosted captures can now update credits, history, and account concurrency without a customer polling the result. Closing a tab does not stop completion handling. A failed or undeliverable terminal capture releases its reservation; a usable completed capture consumes it once. Intermediate retries preserve the reservation.

The Node API process starts the completion consumer before accepting requests. It must run continuously for dashboard captures too. If it is down, workers can finish and retained jobs are reconciled when it restarts. A serverless dashboard alone does not run this background consumer.

## Implementation

- `packages/queue/src/outcome.ts` validates supported output, positive dimensions/bytes, and an HTTP(S) artifact URL. Inline bytes and webhook secrets are omitted from stored/public results. This relies on the worker's successful storage delivery; it does not repeatedly download artifacts during settlement.
- `CaptureFinalizer` serves synchronous result delivery, polling, completion events, and recovery. Production API and dashboard both use the PostgreSQL lifecycle repository. Legacy jobs can recover through the verified database account/job link even when their reservation ID differs from their job ID. The Redis-only development billing adapter retains its compatibility behavior and is not a durable production settlement backend.
- Migration `0003_capture_completion.sql` adds a retained terminal snapshot, API-key identity, durable cleanup marker, recovery scheduling, and partial indexes to reservations.
- `commitCapture` locks and verifies the reservation/job/account link, conditionally transitions billing, and commits the result, history, and pending Redis cleanup together. A history failure rolls back the entire transaction. Repeated callers return the first committed snapshot.
- Slot release happens after commit. Redis failure, or failure to acknowledge a successful Redis release in PostgreSQL, leaves cleanup pending. Releasing the same Redis member again is safe.
- `CaptureCompletionConsumer` listens to BullMQ terminal events and re-reads actual job state. An event payload or progress percentage cannot charge/refund a capture. Active event work is bounded to four tasks, duplicate active IDs are suppressed, and at most 256 event IDs wait in memory. Dropped events remain recoverable through PostgreSQL.
- A scan runs at startup and every two seconds without overlapping itself. PostgreSQL claims at most 32 records per batch with `FOR UPDATE SKIP LOCKED`; held jobs rotate on a 30-second schedule and failed cleanup can retry on a five-second schedule. Checks and cleanup run in groups of four. Missing jobs remain held and are counted rather than blindly refunded.
- The old age-based reservation refund is removed. Queue-wide automatic age/count removal is disabled, including the in-memory options on jobs processed by upgraded workers. Otherwise one completion's BullMQ retention policy could remove another job's unsettled evidence.
- Queue pruning requires a committed result and acknowledged slot cleanup, then uses the longer configured completed/failed retention period. Ownership-checked PostgreSQL results remain readable after Redis job pruning. Database-result deletion, bucket-object cleanup, and refreshing expired signed download URLs remain retention/delivery work in Part 8.
- API health includes bounded counters for finalization operations, recovery errors, missing jobs, cleanup failures, pending events, active event tasks, and the most recent settlement-lag sample. These are process-local diagnostics, not an exported percentile/SLO proof.

## Verification

The migration was generated with Drizzle and applied using a direct connection to isolated Neon branch `dev-capture-settlement-20261003` (`br-holy-boat-b7g0fi5f`). The main branch schema was checked read-only and has not received this migration. Root application credentials were not switched. Test credentials are in ignored `.env.settlement-test.local`.

Nine PostgreSQL integration scenarios passed across the complete initial run and targeted final checks:

1. Twelve concurrent finalizers produce one charge and one history/result record.
2. An invalid history write rolls back reservation, quota, result, and cleanup.
3. Reservation/account ownership is verified before billing, including legacy jobs with different reservation/job IDs.
4. Failed monthly captures release quota without consuming it.
5. Successful prepaid captures consume exactly one credit.
6. Failed prepaid captures refund exactly one credit despite duplicate finalizers.
7. A new submission does not age-refund an existing old reservation.
8. Recovery claims are bounded and distinct across concurrent consumers.
9. Startup recovers a terminal job, a Redis cleanup outage survives restart, and an owned result survives queue pruning.

Queue tests exercise completion without polling, replay/concurrent polling, retry preservation, missed events, database outages, Redis failures, cleanup-acknowledgement failure, missing/old active jobs, legacy ownership, undeliverable output, ownership after pruning, bounded event storms, and upgraded-worker retention.

| Check | Result |
| --- | --- |
| Queue package compiled tests | 116 passed; three new Redis TCP scenarios skipped; the existing Redis integration suite also skipped |
| PostgreSQL integration | Nine distinct scenarios passed on the isolated branch; targeted final runs overlap the initial run |
| API regressions | 10 passed |
| Dashboard capture/queue handler regressions | 26 passed |
| Worker startup/executor regressions | 10 passed |
| Queue/database/API/worker builds and dashboard test build | Passed |
| Next dashboard production build | Passed |

For repeat verification, build packages before tests. Queue: `node --test dist/*.test.js` from `packages/queue`. Database: `node --env-file=../../.env.settlement-test.local --test dist/settlement.test.js` from `packages/database`. Set `SNAPFORGE_SETTLEMENT_TEST=1` only with an isolated database branch; tests create dedicated synthetic accounts and retain them for review. Supply an isolated Redis TCP endpoint through `TEST_REDIS_URL` to enable the BullMQ scenarios.

`completion.integration.test.ts` adds three real BullMQ scenarios: success, terminal failure, and success after retry, without customer polling or periodic-scan fallback. They require `TEST_REDIS_URL` or `REDIS_URL`; neither is configured here. Both these scenarios and the existing real Redis suite remain unverified live. The existing Redis integration harness also now starts the long-running worker without awaiting shutdown and uses a supported queue name.

No screenshot readiness, fonts, scrolling, encoding, or visual assertions were relaxed. This is a lifecycle reliability fix; it does not establish the requested 80% fresh-render latency improvement, the five-second settlement SLO, or a passing live visual gauntlet.

## Rollout and recovery

1. Configure real Redis TCP, PostgreSQL, artifact delivery, and a supervised long-running API service in staging. Match the queue namespace across API, dashboard, and workers.
2. Apply the checked-in migration in staging before starting the upgraded API/dashboard; startup reconciliation fails if its schema is missing. Run the real Redis completion tests against an isolated test queue and the database tests against an isolated branch.
3. Pause new submissions for the cutover, drain old workers, and reconcile retained legacy terminal jobs before enabling the new producers. Upgrade the worker fleet as well as API/dashboard. Do not let old workers continue queue-wide retention cleanup alongside new jobs. Evidence already deleted by the previous retention policy requires explicit investigation.
4. Start the completion consumer through `apps/api` before resuming submissions. Exercise browser-tab closure, duplicate events, finalizer failure, API restart, Redis outage, and PostgreSQL outage through the deployed API and authenticated dashboard.
5. Alert on held/missing jobs, pending cleanup, recovery failures, and settlement lag. Missing job evidence is an investigation/enqueue-recovery condition, never an automatic success or age refund. Recovery targets are scheduling intervals, not guarantees under a large backlog or outage.
6. Retain the additive database columns on application rollback. Avoid restoring automatic retention or age refunds while unsettled jobs exist. Disable new submissions while resolving a migration/runtime incompatibility.

The isolated test branch is retained for review and repeat verification; its compute uses the account's normal automatic suspension. No production deployment or payment-provider operation was performed.

## References

The asynchronous architecture follows the resource-management direction discussed in [ScreenshotOne's screenshot API blog](https://screenshotone.com/blog/building-screenshot-api/). [BullMQ's event documentation](https://docs.bullmq.io/guide/events/) explains global QueueEvents and trimmed Redis streams, which is why events here are supplemented by durable recovery. These references do not verify Snapforge's measured speed or deployment readiness.
