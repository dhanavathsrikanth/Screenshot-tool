# Reliability release verification

Updated 2026-10-05. Request retries and webhook delivery now have implementation and recovery evidence. The fresh-render quality gate passes in three comparable runs; the requested additional 80% latency reduction remains unmet.

## Unchanged full live workload

Each run uses the original 30-site suite, four concurrent captures, one retry, text inspection enabled, and the existing 95% eligible quality gate. No site, output assertion, readiness guard, or retry was removed. Each process starts a new engine with its normal browser lifecycle; these are fresh renders, not cache hits or API acknowledgements. No other CPU-heavy verification ran alongside these three measured runs.

| Run | Eligible passes | All-site success | Blocks | p50 | p95 |
| --- | --- | --- | --- | --- | --- |
| [1](reliability-release/run-1/latest.md) | 27/27 | 27/30 (90%) | 3 | 9.618s | 23.073s |
| [2](reliability-release/run-2/latest.md) | 27/27 | 27/30 (90%) | 3 | 8.904s | 15.877s |
| [3](reliability-release/run-3/latest.md) | 27/27 | 27/30 (90%) | 3 | 8.383s | 15.245s |

Reddit requires proof of humanity, IMDb returns HTTP 405 with human verification, and Stack Overflow returns HTTP 403. They are reported as blocks under the existing gate policy, not successful captures. Allbirds, Dribbble, Spotify, and YouTube pass their unchanged assertions in every measured run. The earlier failed report is retained; passing live pages now does not establish the cause of their earlier failures or guarantee future availability.

The prior passing reference is p50 8.677s, implying a target of at most 1.7354s. These three medians exceed that target substantially. The median of the three reported medians is 8.904s; choosing only the fastest run would not establish a reproducible improvement. Run 1 also exceeds the earlier p95 16.190s, so no stable p95 improvement is claimed. A paired baseline on the intended deployment host and end-to-end queue/storage measurements remain necessary for performance claims.

Phase medians show where further work belongs:

| Phase | Run 1 | Run 2 | Run 3 |
| --- | --- | --- | --- |
| Page setup | 2.323s | 2.592s | 2.212s |
| Navigation | 2.132s | 1.204s | 1.112s |
| Load settlement | 3.001s | 3.001s | 2.363s |
| Full-page scrolling | 2.791s | 2.606s | 1.740s |
| Post-scroll settlement | 3.007s | 1.049s | 0.898s |

Each phase median is calculated over attempts that reported it. Full-page phases apply only to that subset; these medians must not be added together to reconstruct overall latency. Raw phase samples and run options are retained in each JSON report and [verification.json](reliability-release/verification.json).

## Controlled quality and recovery

All seven controlled images match a longer-settled reference byte for byte: static content, delayed hydration, delayed image, lazy images, document growth, delayed shadow consent, and delayed webfont. The six non-font images also match their saved baseline PNGs; the font fixture is compared to its contemporary longer-settled reference because installed font files can vary. [Pixel evidence](reliability-release/pixels/profile.json) and PNGs are retained. Twenty actual-browser quality/network/standby tests pass.

Other verification: 139 queue tests pass with four opt-in scenarios skipped; seven contract tests, 13 API HTTP tests, and 41 dashboard tests pass, with one dashboard Redis TCP scenario skipped. All 19 real PostgreSQL settlement, enqueue, and reliability scenarios pass on the isolated test branch. Live Redis admission Lua tests pass using a temporary namespace. The dashboard production build and lint of changed files pass. [Implementation, customer contracts, and release limits](../../../docs/request-retries-and-webhook-delivery.md).

The engine's rendering behavior was not changed in this reliability release. Moving webhook HTTP work out of render workers removes receiver-dependent slot occupancy; this is a throughput/reliability fix, not evidence of an 80% faster screenshot on sites without callbacks. Production deployment, managed proxy access for blocked sites, real BullMQ outage verification, hosted throughput/SLO tests, and the fresh-render latency target remain open.
