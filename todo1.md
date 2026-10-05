# Snapforge: delivery plan for the remaining market gaps

Prepared: 2026-10-03. Updated: 2026-10-05. Part 1's dashboard/service migration and Part 2's automatic terminal settlement, durable enqueue recovery, request idempotency, and independent webhook delivery are implemented. Deployment, real BullMQ outage verification, the additional 80% latency target, and unchecked items remain open. [Settlement evidence](docs/automatic-capture-settlement.md), [enqueue recovery evidence](docs/durable-enqueue-recovery.md), [retry and webhook evidence](docs/request-retries-and-webhook-delivery.md).

This is the execution follow-up to [todo.md](todo.md), which remains the master roadmap. It builds on [the completed readiness fixes](docs/market-readiness.md). The goal is a reliable screenshot service that customers can adopt easily, with lower time and cost per usable capture.

## Starting position and rules

Already implemented: phase timing, adaptive settlement, browser warmup, loading-shell rejection, optional content/output requirements, standalone proxy routing, worker storage-cache lookup, TTL freshness, worker heartbeats, and public-worker network checks. Preserve these rather than rebuilding them.

Three new comparable full runs pass 27/27 eligible sites each, with 27/30 all-site success and three access blocks. Their p50 values are 9.618s, 8.904s, and 8.383s; p95 values are 23.073s, 15.877s, and 15.245s. All seven controlled fixtures match longer-settled pixel references. The earlier 24/28 failing run remains retained, and the prior passing 8.677s reference still defines the additional 80% target of 1.7354s. That latency target and production readiness remain unproven. [Full evidence](apps/benchmark/results/reliability-release.md).

- A HTTP 202 acknowledgement is not a completed screenshot. Measure time until a usable artifact is available.
- Report cold startup, warm fresh captures, cache hits, and proxy-assisted captures separately. Cache improvements must not be presented as an 80% improvement in fresh rendering.
- Do not achieve a faster median by dropping slow sites, loosening quality assertions, or omitting failures and retries.
- Failed, incomplete, or undeliverable captures must not consume rendering credits. Free cache hits are a proposed pricing change in Part 3.
- Every hosted capture path must use the same account authorization, network policy, limits, and billing behavior.
- Keep credentials, cookies, raw headers, and page content out of routine logs and metric labels. Keep account-specific captures isolated.
- Use Hostinger tokens from `packages/brand` for all customer UI. Explain progress and outcomes in plain language; leave worker, Redis, and queue internals out of onboarding.
- Ship small increments. Run checks for the changed behavior, retain regression evidence, and enable new behavior gradually with a reversible release switch where necessary.

## Parts, priority, and dependencies

| Part | Priority | Customer benefit | Depends on | Scope |
| --- | --- | --- | --- | --- |
| 1. One protected capture path | P0 | Dashboard and API behave consistently | Existing gateway and queue | Medium |
| 2. Automatic completion and settlement | P0 | No stuck credits, polling obligations, or duplicate charges | Part 1 shared service boundary | Large |
| 3. Fast, fairly billed cached captures | P1 | Repeated captures are faster and use no rendering credits | Part 2 lifecycle | Medium |
| 4. Measured speed and complete output | P0 release gate | Fresh screenshots stay usable under load | Parts 1–2; baseline measurements begin immediately | Large |
| 5. SDKs, onboarding, and hosted MCP | P1 | One SDK call or sign-in, with no browser installation | Parts 1–4 contracts and service | Large, split into releases |
| 6. Managed proxy fallback | P1 for target customers | Fewer failed captures without configuring a proxy | Parts 2 and 4; a provider account | Medium plus external validation |
| 7. Additional capture workflows | P2, driven by demand | HTML, authenticated pages, and richer outputs | Parts 1–5 | Separate small feature releases |
| 8. Production proof and paid pilots | P0 before broad launch | Trustworthy service, pricing, and support | Parts 1–4; feature-specific gates for 5–7 | Ongoing validation |

P0 means required for a trustworthy release. P1 improves adoption or the chosen customer use case. P2 should wait for evidence of demand. These are relative scope estimates, not delivery dates.

Recommended implementation order: Part 1 hotfix, Part 2, Part 3, Part 4, SDK onboarding in Part 5, then hosted MCP. Complete Part 8's deployment and measurement work throughout. Pull Part 6 forward if design partners primarily capture protected third-party sites. Part 7 is not required to launch a focused public-URL screenshot product.

## Part 1 — Make every hosted entry point use the protected service

**Customer friction removed:** the playground works like the API, captures keep working after a page refresh, and PNG/PDF downloads use the same result format.

**Code:** `apps/app/src/lib/engine.ts`, `apps/app/src/app/api/capture/route.ts`, `apps/api/src/gateway.ts`, `apps/worker/src/main.ts`; introduce a shared application-service package if needed. Keep HTTP and database work outside `packages/engine`.

- [x] Apply the immediate dashboard fix: configure its hosted engine with `allowPrivateNetwork: false` and enforce account-level admission limits. Trusted local development can use a separate explicit configuration. [Implementation and verification](docs/dashboard-boundary-fix.md).
- [x] Extract one authenticated capture service for validation, admission, reservation, dispatch, and result lookup. Have the API and dashboard call that service; avoid a duplicate render/billing implementation or an unnecessary public HTTP round trip between them. [Implementation and verification](docs/shared-capture-service.md).
- [x] Resolve the dashboard user to an account on the server. Never trust a submitted account ID, expose a service credential in the browser, or make users generate an API key to use the playground.
- [x] Move production dashboard rendering to the worker queue. Give it the same safeguards, ownership checks, resource budgets, and cancellation rules as public API requests. The code path is migrated; production fleet deployment remains Part 8 work.
- [x] Return an artifact URL and download action for images and PDFs. Replace base64 image transport by default, and fix the current PDF success response that contains no usable download artifact. Retain a compatibility adapter during migration. The dashboard retains its `image` field as a URL alias; explicit development mode retains the original inline adapter.
- [x] Preserve a job handle and progress across reloads. Distinguish queued, rendering, ready, and failed states; display a useful failure explanation and safe retry action. Session restoration polls the existing job rather than repeating its POST.
- [ ] Apply network-level isolation to renderers in staging and production. Exercise private initial URLs, redirects, subresources, WebSockets, subframes, and newly opened windows; test the authenticated dashboard path as well as the API.

**Performance:** warm browsers belong in workers, not each dashboard instance. Artifact URLs avoid base64 expansion and duplicate image buffers in the web process. Put cheap authentication and admission checks before expensive work; size limits must not change with the entry point.

**Exit checks:** private-network tests pass for both paths; a forged account/job identifier cannot retrieve another account's result; a real PDF downloads and opens; refresh does not create a second capture; accepted dashboard work stays on the worker fleet. Compare admission overhead with a fixed before/after workload.

## Part 2 — Settle jobs without customer polling

**Customer friction removed:** credits and available slots update automatically, even when a tab closes, the client disconnects, or only a webhook is used.

**Code:** `packages/queue/src/types.ts`, `dispatcher.ts`, `worker.ts`, `webhook.ts`; `packages/database/src/schema.ts`, `index.ts`, and migrations; API lifecycle wiring. Add a completion consumer/reconciler and a separate webhook delivery worker.

- [x] Allocate a stable job ID and persist its reservation/account link before enqueueing. Production reservations now commit the link and encrypted submission intent in the same transaction. This closes the fast-worker and reserve-before-link crash windows.
- [x] Make enqueue failures and ambiguous enqueue acknowledgements recoverable with the same job ID. Recovery keeps the original reservation, checks matching queue evidence, and serializes with finalization to prevent stale replay. Encrypted options, bounded claims/producer commands, and account lease restoration are implemented. Six real PostgreSQL scenarios and live Redis admission Lua verification pass; real BullMQ outage verification and rollout remain open. [Evidence and limits](docs/durable-enqueue-recovery.md).
- [x] Implement one idempotent finalizer used by synchronous delivery, terminal queue events, polling reconciliation, and recovery. Derive success from the final job result plus validated output and the worker's delivered artifact, not from an intermediate attempt or progress percentage. [Verification](docs/automatic-capture-settlement.md).
- [x] Commit the billing transition, result/audit record, and pending Redis cleanup transactionally in PostgreSQL. Use conditional updates and unique capture/job identifiers. Recover Redis slot release separately; PostgreSQL and Redis do not share one transaction. Notification outbox records remain in the webhook ticket below.
- [x] Implement terminal BullMQ event consumption plus an indexed, bounded reconciliation scan for linked unsettled jobs after restarts, missed/trimmed events, or outages. Check queue state/result before settling. The consumer starts in the long-running API; live Redis TCP verification and deployment remain Part 8 checks.
- [x] Retain results and lifecycle records for recovery. Prune queue evidence only after committed finalization and acknowledged slot release; keep an owned database snapshot. Remove age-only reservation refunds and retain held reservations when job evidence is missing. Artifact expiry/deletion remains Part 8 work.
- [x] Add a durable webhook outbox and an independent delivery queue. Signed delivery IDs, bounded retries, fenced crash recovery, and conditional manual redelivery are implemented. Rendering workers make no callback HTTP calls. Real PostgreSQL recovery tests pass; deployed throughput verification remains open. [Evidence and rollout](docs/request-retries-and-webhook-delivery.md).
- [x] Expose webhook configuration through an explicit public request schema. Validate HTTPS/public destination policy, pin resolved addresses, refuse redirects, enforce job/account ownership for delivery management, and encrypt callback secrets. External receiver ownership registration is not implemented; the destination policy does not claim to verify it.
- [x] Add account-scoped request idempotency. Persist the normalized fingerprint with a stable account/key job ID; matching retries return the same job, while conflicts return HTTP 409. Concurrent PostgreSQL retries reserve once. The dashboard saves its key before POST and restores it by GET; new API credentials do not inherit old job access.
- [x] Keep polling finalization idempotent as a recovery path; normal completion has an independent consumer. Expose process-local settlement-lag samples, cleanup failures, and recovery counters. Exported metrics, percentile/SLO measurement, and live verification remain Part 8 work.

**Performance:** short database transactions and indexed recovery batches; no full-table scan per request. Notifications run separately from capture. Release slots promptly after terminal completion; do not wait for customer HTTP calls or webhook delivery. Avoid creating a new database/Redis connection per event.

**Exit checks:** a successful or failed job settles without any client polling; intermediate retries do not finalize; duplicate events/replayed requests do not double-charge or double-refund; completion-before-API-response is safe; a finalizer crash recovers; a Redis cleanup outage recovers; an unreachable webhook cannot reduce renderer throughput. Proposed normal-operation target: 99% of terminal jobs settle and release their slot within five seconds, measured separately from screenshot latency.

BullMQ documents `QueueEvents` and its Redis stream backing; the durable database recovery design above is Snapforge's proposed implementation. [Reference](https://docs.bullmq.io/guide/events/).

## Part 3 — Make cached captures fast and commercially useful

**Customer friction removed:** repeat requests reuse a valid screenshot, have an understandable freshness window, and do not spend rendering credits.

**Code:** `apps/worker/src/cache.ts`, `executor.ts`, the shared capture service, `packages/engine/src/cache.ts`, `packages/storage/src/cache.ts`, `store.ts`, and the billing finalizer.

- [ ] Adopt and document the proposed policy: one rendering credit for a new successful render, zero for failed or incomplete captures, zero for validated cache hits. An idempotent replay does not create another charge; show the original capture's charge consistently.
- [ ] Make chargeable outcome a server-derived, durable field tied to a capture/generation ID. Apply the policy identically to synchronous, asynchronous, dashboard, and MCP requests, including prepaid-credit restoration for non-chargeable outcomes.
- [ ] Add an authenticated cache lookup before queueing where it can return a valid result cheaply. Keep worker lookup to handle races and API misses. Bound cache lookup latency; storage outages fall back to normal capture rather than hanging the gateway.
- [ ] Preserve zero-TTL bypass, shortened TTL semantics, output requirements, fresh signed URLs, and authorization before every cache response. Authenticated or account-specific content must use an account-scoped cache; consider public cross-account sharing only after an explicit privacy review.
- [ ] Avoid transferring screenshot bytes through the API when a validated artifact reference is sufficient. Verify ownership, freshness, and artifact existence, and use short-lived delivery links for private output.
- [ ] After lifecycle correctness is established, add bounded same-account coalescing of identical concurrent renders. Define one billable generation and waiter behavior first. Recover expired producer leases; do not merge requests with different freshness, authentication, actions, or non-deterministic requirements.
- [ ] Add a reuse/fresh toggle and age/expiry information to the playground. Explain that a cached image is a snapshot, not a promise that the website has not changed.
- [ ] Retain request-rate and bandwidth safeguards for free hits. Decide and publish whether authenticated customers with zero remaining rendering credits can retrieve their valid cached artifacts; proposed behavior is yes, within those limits.

**Performance:** gateway hits avoid queue wait and browser setup; same-account coalescing prevents bursts from producing duplicate renders. Keep reuse bounded and observable. CDN reads, signing, storage, and bandwidth still have cost even when rendering credits are zero.

**Exit checks:** cached success consumes no rendering credit across every entry point; stale and zero-TTL requests cannot return an old capture; another account cannot read a private capture; a request burst follows the documented generation/charge policy. Proposed staging target: warm cache-hit p95 below 500ms in a fixed nearby region, excluding the subsequent image download and reported alongside artifact-download latency. This is a target, not a current claim.

ScreenshotOne documents quota-free cache hits, making this a concrete pricing comparison. [Reference](https://screenshotone.com/docs/caching/).

## Part 4 — Improve fresh-capture speed without lowering quality

**Customer friction removed:** fewer settings to tune, predictable completion, and an honest result when a page is too long or not ready.

**Code:** `packages/engine/src/engine.ts`, `context.ts`, `pool.ts`, `standby.ts`, `settlement.ts`, `fullpage.ts`, `formats.ts`, `quality.ts`, `timings.ts`; benchmark runner/reports and controlled fixture scripts.

- [ ] Establish a controlled baseline on a worker host with sufficient measured memory and CPU. Record host resources, worker/browser versions, region, network conditions, options, concurrency, cache state, retry policy, and all attempted sites.
- [ ] Measure queue wait, cache lookup, browser/page startup, network policy, navigation, settlement, scrolling, quality checks, encoding, storage upload, delivery, and finalization. Worker reports must retain engine phases and add storage/queue phases rather than losing them at the API boundary.
- [ ] Measure complete wall-clock latency through downloadable output. Record both usable-capture latency and time to terminal outcome for failures; include retries. Report cache/proxy/cold cohorts separately.
- [ ] Optimize the largest measured phases first. Keep startup warm, reuse browser processes with isolated fresh contexts, prevent preparation from exceeding measured memory headroom, and align queue concurrency with real renderer capacity.
- [ ] Make host capacity decisions container-aware when deployed in containers. CPU/RAM reported for the physical host is not necessarily the renderer's resource limit. Bound pending work and use backpressure rather than accepting a backlog that cannot meet deadlines.
- [ ] Propagate one overall job deadline and cancellation signal through queue wait, engine attempts, proxy fallback, output persistence, and cleanup. Keep the existing per-capture timeout distinct. Do not multiply a 60-second capture budget through several unconstrained retry layers.
- [ ] Retain meaningful readiness checks. Prefer actual content, visible required selectors, settled fonts/images, and bounded growth detection over fixed sleeps. Introduce optional named presets only after paired quality tests show their behavior; do not ship a faster default that silently skips needed assets.
- [ ] Extend quality fixtures to delayed layout changes, missing images, animation, custom JavaScript, and authenticated/private-content cases. Use controlled pixel baselines and content/layout assertions; do not compare changing live pages with a brittle exact PNG check or run expensive OCR on every normal capture.
- [ ] Add explicit full-page completeness metadata: captured/document height, scroll stop reason, and whether output is truncated. Offer bounded slices or a clear strict-completeness failure above the default 24,000-CSS-pixel/80-step limits. Keep image height, slice count, total bytes, and total scroll/deadline budgets bounded.
- [ ] Verify adjacent/overlapping slice boundaries on lazy-loaded content, changing document height, and fixed headers. A slice implementation must not imply completeness merely because the final image is tall.
- [ ] Fix full-suite failures, rerun comparable measurements at least three times, and keep raw reports. A passing single-site recheck cannot replace the 30-site gate.

**Latency target:** the earlier request was an additional 80% reduction. If the previous passing p50 of 8.677s is the accepted reference, the target is at most 1.7354s. Reproduce that reference on the controlled host before comparing. If a different reference is adopted, label it explicitly; do not choose a worse baseline to make the percentage easier. Track p95 without regression and preserve quality while pursuing the target. If measurements cannot meet it, publish the achieved result and limiting phase.

**Exit checks:** all deterministic quality fixtures pass, no unexplained new live failure, and the roadmap's minimum 95% eligible gate passes. Also show success across all 30 sites, including blocks, plus per-site failures. Load results remain stable within declared host capacity. The 80% goal is checked only on comparable fresh-capture results, never on acknowledgements or cache hits.

The readiness approach is informed by ScreenshotOne's discussion of navigation signals and fixed waits; the measured budgets and acceptance criteria above are Snapforge's plan. [Blog reference](https://screenshotone.com/blog/puppeteer-wait-until-the-page-is-ready/).

## Part 5 — Reduce integration and AI-agent setup work

**Customer friction removed:** an application gets a screenshot with one SDK call; an AI-agent user connects a hosted service without installing Chromium.

**Code:** proposed `packages/sdk-js`, a separately packaged Python client, `packages/mcp`, the shared capture service, dashboard onboarding/docs, and `apps/app/public/llms.txt`. Add a shared OpenAPI/schema-generation path from contracts.

### Release 5A — SDKs and onboarding

- [ ] Generate and validate a machine-readable API description from shared schemas; document 200/202 responses, job states, artifacts, errors, billing, limits, idempotency, and deadlines.
- [ ] Ship a small JavaScript/TypeScript client first, then Python using the same conformance fixtures. Provide `capture`, `getJob`, `waitForJob`, and `download` behavior with typed results.
- [ ] Make the default capture convenience method handle the two-second sync-to-async transition and return the final result. Provide a separate start-job method for customers who want immediate acknowledgement.
- [ ] Reuse connections and use bounded polling with jitter and server guidance. Respect `Retry-After`; do not retry permanent errors or re-enqueue an existing job. Safe POST retries must retain an idempotency key and fit one end-to-end budget.
- [ ] Offer signed webhooks for high-volume integrations so customers do not need aggressive polling. Separate capture retry policy from webhook delivery retries.
- [ ] Make first-use onboarding show: create a key, run a working example, inspect/download the artifact, and understand the charge. Include a generated copyable example from the actual playground settings.
- [ ] Add helpful errors for expired links, blocked targets, incomplete content, and exhausted capacity. Show a useful next action; customers should not need to read server logs.
- [ ] Pilot the flow with new users. Proposed adoption check: at least four of five participants obtain and download a valid capture within five minutes of receiving credentials, without a support intervention.

### Release 5B — Hosted MCP

- [ ] Add a hosted HTTP MCP adapter to the shared capture service; retain local stdio as an option. Do not start browsers inside the public MCP web process.
- [ ] Implement scoped authorization and revocation with a proven authorization component. Match supported MCP protocol versions to the installed SDK and target clients. Test discovery and client interoperability before claiming universal compatibility.
- [ ] Route MCP captures through the same quality requirements, admission limits, billing finalizer, and protected workers as the API. Carry request IDs and stable result/job handles across adapters.
- [ ] Expose useful readiness/quality options, screenshot/inspection/element tools, job status, and account usage. For long images, return bounded slices; use compact artifact references with an optional inline image where clients support it.
- [ ] Provide concise connection instructions and account-visible connection/revocation controls. Never require the user to paste a privileged server credential or install a local rendering stack.

**Performance and exit checks:** no separate browser fleet per client; bounded tool and SDK output; cancellation/deadlines survive the adapter. Verify successful rendering, safe retry after transport loss, 202 fallback, failed captures, free cache hits, and account isolation through each client. Define and test the initially supported clients rather than promising every client.

Use the official [MCP transport](https://modelcontextprotocol.io/specification/latest/basic/transports) and [authorization](https://modelcontextprotocol.io/specification/latest/basic/authorization) specifications. ScreenshotOne already documents hosted OAuth MCP, so hosted access closes an adoption gap rather than establishing a unique advantage. [Competitor reference](https://screenshotone.com/docs/mcp/).

## Part 6 — Make proxy fallback selective and measurable

**Customer friction removed:** users do not need a separate proxy subscription for the supported protected-site use case, and plain pages keep the cheaper direct route.

**Code:** worker runtime configuration, engine region/egress integration, queue retry policy, metrics, and a provider adapter. Select a provider only after evaluating its terms, supported regions, credential handling, and live performance.

- [ ] Keep bring-your-own proxy support. Add a server-configured provider adapter and explicitly defined managed-proxy eligibility for supported plans/use cases.
- [ ] Attempt a direct capture first when appropriate; allow a bounded fallback for classified blocks or eligible network failures. Do not proxy every capture or assume every incomplete render is an IP problem.
- [ ] Respect an explicit customer proxy, region and verified egress. Never silently change country or requested authentication behavior on retry.
- [ ] Put direct attempts, exit changes, and queue retries within one overall deadline and cost budget. Record retry reasons and avoid repeatedly trying the same failed exit.
- [ ] Separate capture outcome from provider health; use a circuit breaker and conservative cooldowns so a provider outage does not exhaust worker capacity.
- [ ] Explain when managed proxy service was used and the pricing rule. Proposed default: failed fallback attempts do not consume rendering credits; any supported premium successful-output pricing is explicit before capture.
- [ ] Measure usable captures, block rate, p50/p95, proxy bytes, and cost per usable output by provider/region/site class. Include failed attempts in costs.

**Exit checks:** live provider credentials work; egress matches the requested country; normal pages do not gain proxy overhead; fallback improves the chosen design-partner workload within declared latency and cost budgets. A proxy does not guarantee access to every site or solve every challenge. Provider purchase/configuration is an external dependency, not something to mark complete from a mocked test.

## Part 7 — Expand only the workflows customers need

**Customer friction removed:** generating documents or capturing a signed-in page no longer needs a temporary public website or arbitrary custom scripts.

Implement as independent releases, not one large feature bundle:

- [ ] Direct HTML input: define a mutually exclusive URL/HTML source contract, input-size limit, safe resource/base-URL policy, and isolated rendering path. Guard outgoing resource requests exactly as for URL captures; HTML input must not bypass network policy.
- [ ] Markdown input: convert a bounded document with a maintained converter and deterministic template using brand tokens where Snapforge styles output. Specify HTML allowance/sanitization and test output consistency.
- [ ] Authenticated-page options: support scoped cookies and authorized sessions/actions in fresh isolated contexts. Encrypt retained secrets, limit retention, isolate cache entries, redact logs, and let users revoke saved credentials. Cookies do not remove capture-network restrictions.
- [ ] PDF controls: add validated paper size, margins, orientation, and print behavior. Deliver an actual downloadable PDF and verify multi-page output, fonts, and images.
- [ ] Structured actions if requested: a bounded sequence of click/type/wait operations with action counts, input-size limits, and one shared deadline. Show failures at the specific action; keep arbitrary execution out of routine customer setup.
- [ ] Video/GIF only after pilot demand and cost measurements justify it. Use a separate capacity-limited queue/pool and storage policy; encoding must not starve ordinary screenshot requests.

**Performance and exit checks:** separate workload classes, bounded documents and media, explicit feature costs, and meaningful visual fixtures. Keep the existing URL capture path's measured performance unchanged within normal measurement variation. Add one workflow only when a customer use case and its acceptance fixtures are defined.

## Part 8 — Prove the service and its economics in production

**Customer friction removed:** clear pricing, predictable limits, recoverable failures, and a service customers can trust with a real workflow.

- [ ] Prepare reproducible API/worker deployments, pinned browser/runtime dependencies, secret configuration, migrations, health probes, process supervision, graceful shutdown, and rollback instructions. Warm workers before making them ready.
- [ ] Establish startup/resource limits, queue admission/backpressure, per-account fairness, and separate rendering/webhook/optional-media capacity. Scale from pending work and measured capacity; do not use an unbounded queue as the scaling plan.
- [ ] Verify real PostgreSQL/Redis/storage/CDN behavior and permission boundaries. Exercise presigned downloads, expiry, refresh, zero-TTL captures, worker loss, storage failure, and output cleanup. Readiness checks must cover dependency failure and recent actual workers.
- [ ] Verify payment-provider test flows, duplicate webhook handling, purchased credits, subscriptions, cancellation, and refund/account reconciliation before enabling paid live checkout. Then record the explicitly authorized live verification.
- [ ] Define output/data retention and deletion. A capture's reuse TTL is not automatic deletion of its bucket object; implement cleanup without removing active/recoverable jobs or violating the promised artifact lifetime.
- [ ] Track end-to-end p50/p95, timeouts, incomplete/block rates, queue wait, admission rejection, cached reuse, settlement lag, outstanding reservations, webhook lag, renderer RSS/CPU, and cost per usable capture. Keep metric labels bounded; no raw URLs or secrets.
- [ ] Calculate cost per usable fresh capture as total renderer, proxy, storage, network, and retry cost divided by usable delivered outputs. Measure cached-delivery costs separately. Set plan limits and proxy/media pricing from those measurements, not a competitor's headline price alone.
- [ ] Publish actual limits and a status/support path. Separate verified service commitments from goals; do not advertise perfect fidelity, universal bot bypass, an unproven latency reduction, or an unsupported uptime SLA.
- [ ] Recruit five design partners in a defined initial segment, such as developers building previews or agent workflows on public pages. Record setup time, first-capture success, recurring usable-output rate, support requests, repeat use, and willingness to pay.
- [ ] Use partner evidence to choose the next segment-specific feature and integration. Prioritize a working end-to-end workflow over matching every competitor option.

**Exit checks:** Parts 1–2 are complete; quality and comparable performance gates pass; live billing/storage flows are verified; outage/restart recovery passes; costs support the intended prices; design partners can repeatedly obtain useful captures without routine intervention. Broader launch needs these checks, not just completed source-code checkboxes.

## First implementation tickets

These are the concrete first slices to pick up; they are not checked off by creating this plan.

1. **Completed 2026-10-03:** dashboard network/admission hotfix and boundary tests. [Evidence and deployment requirements](docs/dashboard-boundary-fix.md).
2. **Completed 2026-10-03:** shared capture service, worker-backed dashboard, artifact/PDF delivery, and reload recovery. [Evidence and limitations](docs/shared-capture-service.md).
3. **Implemented 2026-10-04:** atomic reservation/link/encrypted intent and guarded enqueue recovery with the same job ID. Six PostgreSQL scenarios and live Redis admission recovery pass; real BullMQ outage checks and production rollout remain open. [Evidence](docs/durable-enqueue-recovery.md).
4. **Implemented 2026-10-03:** idempotent terminal finalizer and transactional billing/result/history/cleanup migration. Nine real PostgreSQL scenarios pass; notification outbox remains ticket 6. [Evidence](docs/automatic-capture-settlement.md).
5. **Implemented 2026-10-03:** completion consumer, indexed reconciliation, and Redis cleanup recovery. Unit/outage tests pass; real BullMQ integration awaits Redis TCP configuration. [Deployment checks](docs/automatic-capture-settlement.md).
6. **Implemented 2026-10-04:** independent encrypted webhook outbox, public callback schema, conditional manual redelivery, account-scoped POST idempotency, and dashboard response-loss recovery. Four real PostgreSQL scenarios, API/client regressions, and live Redis admission checks pass. [Evidence and remaining rollout checks](docs/request-retries-and-webhook-delivery.md).
7. Free cache-hit policy across all completed entry points.
8. Bounded pre-queue cache lookup; prove the hit does not lease a browser.
9. **Partially verified 2026-10-05:** three unchanged full fresh-render runs pass the eligible quality gate and all seven controlled pixel fixtures pass. The additional 80% latency target, cold/warm/cache separation, hosted end-to-end load report, and stable p95 remain open. [Measurements](apps/benchmark/results/reliability-release.md).
10. Complete-output/truncation metadata and bounded slices.
11. JavaScript SDK and measured first-use onboarding; then Python.
12. Hosted MCP adapter and verified authorization/client interoperability.

Use a small implementation review for each ticket: problem and customer outcome, touched contracts/files, performance tradeoff, tests, rollout/recovery behavior, and measured result. Update this file and `todo.md` with evidence when a ticket is actually complete.

## Measurement checklist for every relevant release

| Measure | How to evaluate | Completion rule |
| --- | --- | --- |
| Correctness | Controlled fixtures and the live suite with unchanged assertions | No unexplained regression; eligible gate at least 95%; all-site success and blocks visible |
| Fresh latency | Same host/options/concurrency/cache state; at least three runs | Compare p50/p95 and per-site failures, not a single favorable run |
| Requested 80% improvement | Agreed passing reference and comparable fresh workload | At most 20% of reference p50, with quality preserved; otherwise report unmet |
| Cached latency | Authenticated valid hit, plus separate download timing | Prove no renderer lease; test proposed p95 budget independently |
| Billing | Success, failure, cache hit, retries, replay, no polling, and restart | Correct charge policy and recoverable automatic settlement |
| Capacity | Sustained representative load with resource limits recorded | Backpressure works; no reservation/slot leak or growing unrecoverable backlog |
| Adoption | New-user setup trials and design-partner workflows | Track first-use time and repeat usable outputs, not signup count alone |

Build affected packages before running their compiled tests. Use browser fixtures for rendering/network changes, real Redis/PostgreSQL integration scenarios for lifecycle changes, and explicit live-account checks for deployment/payment/provider claims. Documentation-only updates need link/content review, not renderer test reruns.

## Planning references

References inform the choices above; they do not prove Snapforge's performance or readiness.

- [ScreenshotOne readiness blog](https://screenshotone.com/blog/puppeteer-wait-until-the-page-is-ready/): navigation events, variable page readiness, and the limitations of fixed waits.
- [ScreenshotOne cache rules](https://screenshotone.com/docs/caching/): quota-free cache hits and reuse tradeoffs.
- [ScreenshotOne hosted MCP](https://screenshotone.com/docs/mcp/): remote authorization and agent onboarding expectations.
- [BullMQ events](https://docs.bullmq.io/guide/events/): completion notification mechanisms; combine them with durable reconciliation.
- [Official MCP transports](https://modelcontextprotocol.io/specification/latest/basic/transports) and [authorization](https://modelcontextprotocol.io/specification/latest/basic/authorization): protocol requirements to verify against supported SDK/client versions.
- [Snapforge readiness report](docs/market-readiness.md) and [latest full live report](apps/benchmark/results/latency-round2/final-gauntlet/latest.md): current implementation and measurement evidence.
