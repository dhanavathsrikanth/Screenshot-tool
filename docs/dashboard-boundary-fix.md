# Dashboard capture boundary hotfix

This records the first hotfix. The subsequent [shared capture service migration](shared-capture-service.md) makes the worker queue the default path, shares admission with the API, and replaces default inline output with artifact URLs.

Implemented and verified on 2026-10-03. This completes the first immediate P0 ticket in [todo1.md](../todo1.md), not the entire shared-service migration.

The dashboard previously rendered with the trusted-local engine defaults and no account admission guard. Its engine now explicitly sets `allowPrivateNetwork: false`. The existing engine validates initial targets and proxies before cache lookup/browser acquisition and installs resource, WebSocket, and redirect checks for fresh renders. Local/private capture options cannot override the hosted configuration. Trusted local consumers can still create a separate engine explicitly.

## Admission and customer behavior

The route uses the server-authenticated Clerk user as the account key. Submitted account identifiers are discarded by the shared options schema. A single atomic Redis script admits at most 60 attempts in a rolling 60-second window and five concurrent dashboard requests per account across dashboard instances. Other accounts have separate allowances. Attempts rejected for concurrency still count toward the rolling rate budget, limiting repeated retries. Rate rejections do not reserve credits or launch a browser and include HTTP 429 plus `Retry-After`.

Admission precedes body parsing and billing. Both declared and streamed request bodies are limited to 256 KiB. Schema validation precedes credit reservation. Quota rejection, invalid input, engine failure, and success all run lease cleanup. Failed rendering attempts release their credit reservation through the existing idempotent database operation. Unexpected exceptions return a generic message without exposing internal connection details. Responses carry a request identifier and `Cache-Control: no-store`.

Success responses are serialized before successful settlement. Empty output fails as `render_incomplete`. A capture-history write failure cannot convert a completed charged capture into a failure response. PDF responses now include `data:application/pdf;base64,...`, enabling the existing Save link. Image response shape and bytes remain compatible. Artifact URLs and default removal of base64 transport remain separate migration work.

Slots have five-minute leases, renewed every 100 seconds and explicitly removed on request completion. Redis server time determines windows and expiration; accounts do not depend on dashboard clock synchronization. Initial connection and commands have one-second deadlines. A shared process client reconnects after outages. Production denies new captures with retryable HTTP 503 when admission cannot be established. Redis cleanup failures are logged using the request identifier and expire through the lease; durable billing recovery still belongs to Part 2.

## Configuration and deployment

Set `REDIS_URL` or `UPSTASH_REDIS_URL` to a Redis TCP connection string in every hosted dashboard instance. Use the same Redis database and namespace across those instances. Development without a TCP URL uses bounded in-process admission; production requires shared Redis. No secrets were changed and no deployment was performed.

The current workspace has Upstash REST credentials but an empty TCP URL. Configure the TCP URL before enabling hosted dashboard captures in production. This hotfix does not use REST credentials as a runtime replacement for the queue's TCP configuration. The integration test can exercise the identical admission scripts through a test-only REST adapter using the existing provider. [Upstash documents both transports and scripting support](https://upstash.com/docs/redis/overall/compatibility).

The dashboard allowance matches the API's current default numbers, but the API still limits per key through a separate implementation. Combined dashboard/API account budgets, shared worker dispatch, durable job settlement, and account-scoped artifact delivery remain unchecked in the plan. Application DNS validation also needs deployment-level private/metadata egress denial to address validation-to-connection races. Network isolation was not deployed by this change.

## Verification

- App test compilation and `tsc --noEmit` passed. The engine was rebuilt before its regression tests.
- All 24 dashboard tests passed, including real Redis atomic admission across two instances, account isolation, rolling rate limits, renewal beyond lease duration, expired orphan recovery, and exact test-key cleanup. Production missing-Redis behavior and malformed/outage replies are covered.
- Handler tests verify authentication, forged identity, malformed/oversized bodies, quota, concurrent requests, success/error slot cleanup, credit refund calls, unchanged quality options, empty output, history-write failure, and PDF download bytes. Database operations are injected in these tests; live billing transactions were not reverified.
- The dashboard factory rejects localhost, decimal/hex loopback, private/metadata, mapped IPv6, and private proxy targets before cache lookup or browser startup.
- All 12 focused engine regression tests passed: address/DNS/proxy policy plus browser loading-shell rejection, delayed hydration recovery, loading-related prose, output minimums, standalone proxy traffic, explicit loading-state opt-out, and redirects. Private redirect traffic never reached the private fixture.
- Lint passed for changed app files with two existing warnings for screenshot `<img>` previews. The obsolete ESLint compatibility configuration was replaced with Next 16's documented flat configuration so lint can run.

From this workspace, 30 sequential live Redis admission acquisitions measured p50 295.27 ms and p95 366.25 ms through the REST test adapter. Those timings exclude release and initial connection and are not a production TCP latency measurement. Normal admission uses one atomic command; release uses one removal command. No sleeps or render-quality budgets were reduced.

Reproduce from `apps/app`:

```powershell
.\node_modules\.bin\tsc.cmd -p tsconfig.test.json
.\node_modules\.bin\tsc.cmd --noEmit
node --env-file-if-exists=../../.env --test --test-concurrency=1 .test-dist/lib/*.test.js
```

The live test uses a UUID-prefixed namespace and only removes its exact keys; it does not inspect or clear customer data. It skips only if neither TCP nor complete REST test configuration is supplied. Configured Redis connection failures fail the test.

This change protects admission and delivery without altering page settlement, fonts, scroll behavior, retries, or quality requirements. A new full live gauntlet was not run. The last comparable full gate remains failed, and the requested additional 80% fresh-render latency reduction remains unproven. Next implementation work is the shared capture/job lifecycle, followed by durable completion and settlement.
