# Market readiness changes

The first priority is a usable, deliverable screenshot. This change adds runtime quality checks, fixes proxy routing, connects worker caching, and makes worker readiness observable. These are engineering prerequisites for launch. The additional 80% latency target and production readiness are not yet established.

## Capture quality

`fail_if_incomplete` defaults to `true`. The engine checks the rendered main content, excluding navigation and footer text, for an obvious loading shell. A completed page proceeds immediately. A failed check polls within the existing bounded content-wait and capture budgets, then returns `render_incomplete` if it remains incomplete. Hidden loading indicators and ordinary prose discussing loading remain valid.

For a page with specific acceptance criteria, provide required or forbidden text, minimum output dimensions or size, and a meaningful readiness selector:

```json
{
  "url": "https://example.com/report",
  "wait_for_selector": "main .report-ready",
  "fail_if_content_missing": ["Quarterly report"],
  "fail_if_content_contains": ["Something went wrong"],
  "min_capture_height": 720,
  "min_capture_bytes": 10000,
  "cache_ttl": 0
}
```

Text checks are case insensitive. Each text array allows 32 strings, each 1–500 characters. Output thresholds are positive integers. Explicit content requirements apply to page text, while the loading-shell heuristic examines visible content in the selected element or main document region. Set `fail_if_incomplete: false` when an intentional loading-state screenshot is the requested output.

`render_incomplete` is a retriable HTTP 502 error with failed requirements in its details. Rejected captures are not stored as successful screenshots. API credit reservations are released on failure. The worker also fails delivery when storage cannot produce a screenshot URL. Queue retries remain bounded by the configured attempt count.

The heuristic does not prove pixel accuracy or complete layouts on every website. It cannot replace screenshot baselines, representative live tests, or page-specific readiness requirements. Minimum byte size alone does not establish quality.

## Cache and delivery

The worker now passes its capture store to the engine's cache lookup. A valid hit returns stored bytes before leasing a browser slot, and the executor skips a second upload. Cache lookup outages fall back to rendering. `cache_ttl: 0` bypasses both warm metadata and bucket rehydration; shortening the TTL rejects captures older than that requested window. Cold bucket objects require valid stored and expiration timestamps. Legacy objects without those timestamps are misses.

Delivery URLs are regenerated on lookup so an expired signed URL is not reused from metadata. Screenshot object keys depend on request options and can be overwritten by a fresh capture. They therefore no longer advertise immutable content. The capture store defaults to `public, max-age=0, must-revalidate`; optional edge TTL is capped by the request's capture TTL. Renderer caching still avoids repeated browser work.

Before rollout, purge any CDN objects previously served with immutable headers and ensure CDN rules respect revalidation. Explicitly configuring a positive edge TTL permits delivery caches to retain bytes for that interval. Validate actual signed URL downloads and CDN behavior against the configured bucket; fake storage tests do not establish live account readiness.

## Proxy routing

An explicit `proxy` now reaches Playwright even without `region`, including separately supplied proxy authentication. Region emulation remains compatible with a proxy. Actual HTTP proxy routing is covered by a browser fixture.

This enables a bring-your-own provider. It does not provision a residential provider, rotate exits, solve challenges, or guarantee access to blocked websites. Choose and verify a provider before promising those capabilities. A configured region still needs a matching verified exit country.

## Worker readiness and public network policy

Workers initialize browsers before accepting captures. Their browser pool is capped at queue concurrency unless the embedding application explicitly overrides engine configuration. A Redis heartbeat publishes readiness every five seconds when engine health is good. Entries older than 20 seconds are not counted; shutdown withdraws readiness. API `GET /v1/health` returns HTTP 503 if there is no recent ready worker, the queue is paused, Redis fails, or the configured database fails.

Hosted workers default to `allowPrivateNetwork: false`. The engine validates the initial target and proxy before cache lookup, checks resource and WebSocket destinations, and validates redirect locations before following them. It rejects private, loopback, metadata, local hostname, and selected reserved destinations, including encoded and mapped IP forms. Failed guard initialization closes its browser context with a bounded wait. Trusted local engine consumers retain private-network access by default; the hosted worker sets the stricter policy explicitly.

Proxy endpoint validation accepts HTTP, HTTPS, SOCKS4, SOCKS5, and bare host/port forms; provide authentication in separate proxy fields. Network validation and guard initialization are timed under `network_policy`, and runtime quality checking is timed under `quality_check`.

Application DNS checks cannot eliminate a DNS change between validation and connection, or establish the policy of a remote proxy. Production workers also need network-level egress restrictions that deny private and metadata destinations, isolated from privileged infrastructure. Test redirects, subframes, browser-created windows, and the chosen proxy service in that deployment before treating the boundary as hardened.

## Verification recorded on 2026-10-03

- Full engine suite: 204 tests passed before the final TTL and initialization-cleanup follow-ups. The follow-up contracts, cache, context, network, quality, storage, queue, worker, and benchmark run passed 218 tests, including those changes.
- Final targeted cache, context, proxy/network validation, timings, and worker checks passed 36 tests after the last edits. Browser integration checks passed eight tests; API checks passed four. These focused runs overlap the broader suites and are not an additional count of unique tests.
- API tests cover readiness with a live/stale or absent worker, paused queues, and releasing a credit reservation after runtime quality rejection. Dashboard typechecking and contracts, engine, storage, queue, worker, benchmark, API, and MCP builds passed.
- Seven deterministic PNG fixtures match longer-settled captures exactly. Six also match saved pre-change PNGs: static HTML, delayed hydration, delayed images, lazy images, document growth, and a delayed shadow-root consent banner. The seventh verifies delayed font rendering with background network activity.
- The new Spotify-only live check passed at 23.890 seconds with a 164,941-byte screenshot and text checks enabled. Its earlier loading shell was 18,624 bytes. This is one observation, not proof of a consistent recovery or a latency improvement.
- The latest comparable full four-concurrency live gate remains the failed run: 24/28 eligible passes, p50 16.205 seconds, p95 93.195 seconds. A single-site pass does not replace that result.

Evidence: `apps/benchmark/results/market-readiness-engine-tests.log`, `market-readiness-final-tests.log`, `market-readiness-last-tests.log`, `market-readiness-final-browser-tests.log`, `market-readiness-api-tests.log`, `market-readiness/quality/profile.json`, and `market-readiness/spotify/latest.json`. The full live result remains `apps/benchmark/results/latency-round2/final-gauntlet/latest.json`.

## Rollout and next measurements

Configure a compatible PostgreSQL `DATABASE_URL`, Redis `REDIS_URL`, and storage variables `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY_ID`, and `STORAGE_SECRET_ACCESS_KEY`. R2 can use `STORAGE_ACCOUNT_ID`; other S3-compatible services can use `STORAGE_ENDPOINT`, `STORAGE_REGION`, and `STORAGE_FORCE_PATH_STYLE`. A public delivery origin is optional through `STORAGE_CDN_BASE_URL`; without it the client signs object URLs. Store credentials outside the repository. Start API and worker with the same queue configuration and a supervised process manager.

After building dependencies, the process entry points are:

```sh
node apps/worker/dist/src/main.js
node apps/api/dist/main.js
```

Set `SNAPFORGE_QUEUE_CONCURRENCY` to measured host capacity. Do not use the laptop's previous four-browser run as evidence that production capacity is sufficient. Check `/v1/health` before routing traffic; stop a worker and verify readiness expires or is withdrawn. Exercise a real API key, fresh render, downloaded output, cached request, zero-TTL request, incomplete render, and storage outage. Check final billing reservations and asynchronous job settlement.

Rerun the full live gate under controlled capacity with cold startup, warm uncached capture, and cache hits reported separately. Keep viewport, quality options, retries, sites, and concurrency fixed for latency comparisons. Require the roadmap's minimum 95% eligible pass rate before rollout; also report blocked sites separately so the eligible denominator does not conceal customer-visible failures. Measure queue wait, navigation, output delivery, CPU seconds, memory pressure, and cost per usable capture. No additional 80% speedup is claimed until comparable measurements satisfy it without a quality regression.

Live billing provider verification, managed proxy failover, sustained load testing, and paid pilot feedback remain open. These changes do not provide market adoption evidence or a differentiated commercial offer by themselves.

## References

ScreenshotOne's [page-readiness blog](https://screenshotone.com/blog/puppeteer-wait-until-the-page-is-ready/) informed using meaningful rendered readiness instead of navigation events alone. Its [Playwright screenshot blog](https://screenshotone.com/blog/how-to-render-screenshots-with-playwright/) is a capture implementation reference. The [capture options documentation](https://screenshotone.com/docs/options/) provides a comparison for content failure checks, and the [proxy guide](https://screenshotone.com/docs/guides/how-to-use-proxies/) explains bringing external providers and the limits of proxy retries. These are references; the implementation and verification above are specific to Snapforge.
