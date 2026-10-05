# Shared capture service and worker artifact delivery

Follow-up: [automatic terminal settlement and recovery](automatic-capture-settlement.md) is now implemented. It supersedes this historical report's polling-only cleanup limitation; durable enqueue recovery, webhooks, and deployment remain open.

Implemented on 2026-10-03. This completes ticket 2 in [todo1.md](../todo1.md), including the stable reservation/job identity needed before enqueueing. Deployment-level isolation and the remaining automatic-settlement work remain open.

## Customer outcome

The dashboard and public API now use `CaptureService` from `@snapforge/queue` for validation, account admission, credit reservation, dispatch, ownership checks, and terminal result handling. The dashboard authenticates through Clerk on the server, uses the existing account directly, and does not require an API key. Its default capture path sends work to the same worker queue as the API. It does not launch a dashboard browser or make a public API HTTP round trip.

The playground receives a job handle, displays queued/rendering status, and polls until ready or failed. It saves only the accepted job ID in session storage. Reloading the same tab restores status requests for that job rather than sending another capture POST. Leaving the page stops browser polling and allows the worker job to continue. Transient network errors, HTTP 503, and HTTP 429 retry status reads with backoff. A recovery handle in a submission error is also retained.

Images and PDFs return worker artifact URLs. The dashboard keeps its `image` string as a URL alias and adds `artifact_url`; existing preview and Save actions consume those links. Screenshot bytes and base64 expansion are removed from the default dashboard JSON response. Explicit development mode retains the original inline response adapter. Signed-link expiration still follows storage configuration; refreshing expired delivery signatures is separate follow-up work.

## Safeguards and performance

- Both write paths use the same SHA-256 account key and `snapforge:capture-admission` namespace. Defaults are 60 capture attempts per rolling minute and five pending/running jobs per account. Multiple API keys no longer multiply the capture allowance. API job-read scopes and key ownership are preserved; dashboard reads require the matching account.
- Admission precedes bounded body parsing. Both paths enforce 256 KiB and the shared options schema. Invalid bodies do not touch billing. The verified identity is supplied separately from request options.
- One server-generated UUID is the job and reservation ID. The account/reservation/job link is stored before enqueueing, and verified identifiers travel in the job payload. A fast worker cannot beat reservation linking.
- If an enqueue acknowledgement is lost but the job exists, the service returns that original job. If queue verification is unavailable, it preserves the reservation and exposes the handle. Accepted-job lookup outages also preserve that handle. Fully durable recovery of ambiguous or missing jobs is still Part 2 work.
- Terminal state is read from the queue rather than inferred from a sync-waiter exception. Intermediate retries do not consume or refund a reservation. Success requires positive output metadata, a supported format, and an HTTP(S) artifact URL. Inline data URLs are stripped. Incomplete or undeliverable terminal jobs release their reservation through existing idempotent settlement.
- Worker failures persist their structured error envelope so polling preserves `render_incomplete`, blocked-target, and timeout information. Dashboard HTTP statuses match the shared taxonomy. Webhook secrets are removed from returned snapshots.
- Status lookup reuses the already-authorized job object instead of retrieving its payload twice. A process shares its queue client. Queue job slots use a two-hour expiry and are released during terminal lookup; automatic completion release and durable reconciliation remain outstanding.

Rendering options, settlement budgets, fonts, scrolling, retries, and content-quality requirements were not weakened. The worker retains its public-network policy. Warm browser ownership stays with workers. HTTP 202 measures acceptance only; end-to-end fresh-capture latency includes rendering and artifact availability.

## Runtime configuration

Configure the same Redis TCP database, queue name/prefix, and billing database in the API, dashboard, and worker. The worker also requires configured object storage and delivery URLs. `REDIS_URL` or `UPSTASH_REDIS_URL` provides TCP connectivity; REST credentials alone cannot run BullMQ.

The dashboard default is the queue in development and production. Set `SNAPFORGE_LOCAL_CAPTURE=1` explicitly for local inline development. Production ignores that switch and never falls back to local rendering. Dashboard health reflects ready worker heartbeats and queue pause state, rather than an idle browser in the web process.

No deployment, secret change, or billing migration was performed. Drain legacy jobs before rolling out the shared admission namespace so legacy and new admission accounting do not overlap. The workspace currently has REST Redis credentials but no TCP URL, so configure TCP and storage before running the fleet together.

## Verification

- Queue package compilation and its 100-test suite passed before the final additional recovery case. The final shared-service suite passed 19 tests after the recovery and invalid-input billing fixes. Those counts overlap; the existing live BullMQ integration suite was skipped because TCP was not configured.
- API compilation and ten route tests passed: shared dispatch, reservation ordering, PDF links, incomplete-output refund, pending handles, account ownership, admission, body limits, scopes, and health. Final targeted service/API checks passed 29 tests.
- Dashboard test compilation, app type checking, and changed-file lint passed. The dashboard suite passed 34 tests including real Redis admission through the REST test adapter. The final local run passed 36 tests, including three additional terminal-status checks for HTTP 400/451/504; the already-passing live Redis case was excluded from that final rerun. Two pre-existing screenshot `<img>` lint warnings remain.
- Worker compilation and 13 worker tests passed, including a controlled browser fixture that rendered real PNG and PDF output, stored both, fetched both artifact URLs, verified PNG dimensions/signature and PDF signature/type, and rejected another account's job lookup. The 32-test worker/service run includes the 19 service tests; do not add these overlapping counts.
- Client tests prove queued-to-rendering-to-ready progress, status-only reload recovery, cancellation on navigation, network retry, and `Retry-After` backoff without a second POST.
- The full Next production build passed, including `/api/capture/jobs/[id]`. Build verification also fixed the retained inline adapter's runtime module resolution by using shared contract MIME types. An existing missing-secret webhook guard now runs before SDK construction, allowing the app to build without a configured payment secret while keeping that webhook unavailable with HTTP 503. This does not verify live payment delivery.

The browser delivery fixture uses a trusted loopback target and HTTP storage fixture, not deployed Redis/R2/PostgreSQL. Account billing operations are injected in these tests. Live fleet interoperability, real billing transactions, object-storage account configuration, and sustained load still require staging verification.

## Remaining next work

Durable enqueue recovery, transactional completion/history/outbox writes, terminal event consumption, reconciliation, and automatic slot/credit settlement without polling remain Part 2 work. The current shared terminal path runs during a sync response or a status lookup; closing a tab can therefore delay cleanup until later polling/recovery or lease expiry. Do not treat this migration as completion of that lifecycle work.

Production network-level egress isolation is still unchecked. The full live quality gate and requested additional 80% fresh-latency reduction remain unproven; this change does not replace those measurements with faster acknowledgement times or cache hits.
