# Further latency work — 3 October 2026

The requested additional 80% latency reduction is **not achieved**. The previous passing run had p50 8.677s and p95 16.190s, so the requested targets are approximately 1.735s and 3.238s. The latest comparable four-concurrent-capture run is slower and fails the quality gate. These changes are not validated for rollout.

## Changes implemented

- Font and network readiness waits run concurrently, retaining their original budgets. Network activity is checked again after the parallel waits, and images are checked again after post-scroll network settlement.
- Banner removal uses a combined native selector query instead of checking every selector against every element. Shadow-root traversal, delayed sweeps, removal limits, and scroll unlocking remain.
- Completed static documents without executable scripts or embedded documents omit fixed scroll sleeps. Animation-frame waits, lazy-media loading, full-page bounds, and final network/image settlement remain. Custom JavaScript retains the conservative path.
- Workers warm their browser and an unused isolated page before accepting jobs. Subsequent unused pages may be prepared in the background when memory permits. Context settings must match; used contexts are closed and never reused. Startup, cancellation, shutdown, and late context creation have bounded cleanup.
- Browser recycling now counts each served capture and avoids preparing a spare page immediately before recycling. Locale-specific fingerprint languages follow the requested locale.

## Measurements

| Run | Concurrency | p50 | p95 | Eligible quality passes | Gate |
| --- | ---: | ---: | ---: | ---: | --- |
| Original saved run | 4 requested | 38.658s | 76.551s | 28/28 | PASS |
| Previous passing latency fix | 4 | 8.677s | 16.190s | 28/28 | PASS |
| Current full live run | 4 | 16.205s | 93.195s | 24/28 | FAIL |

All full runs use the same 30 sites and text checks. Anti-bot blocks remain excluded from the quality denominator under the existing policy. The current run has two blocks, two navigation failures, and two rendered captures failing quality assertions; success rate is 86.67%. The identities of blocked sites changed: IMDb and Stack Overflow were blocked, while Reddit passed.

The four-browser run sampled only 516MB free memory on a 7,584MB host. Several target navigations exhausted the 45-second navigation timeout. Dribbble exhausted both existing five-second content/growth guards and returned a 720px capture instead of the required 4,000px minimum; its timing shows those guards were not skipped. Spotify returned fewer bytes than its quality threshold. Memory and network variability are possible contributors, not a proven explanation for all failures.

A separate single-browser recheck passed GitHub, Allbirds, Dribbble, and YouTube; Spotify still failed. This five-site recheck is not a replacement for the full gate. Spotify screenshots show a loading shell even with an additional five-second delay. With page prewarming disabled, its normal capture still returned the same 18,624-byte loading shell. The remaining failure is therefore not resolved by reverting page prewarming.

Across the 35 capture attempts in the full run, navigation had a lower-median duration of 10.727s and page setup 1.466s. These current measurements already exceed the requested total-latency target before all rendering phases are counted. They identify the next bottlenecks; reducing settlement alone cannot meet the requested target on this run.

The warm-worker local fixture took 5.814s to initialize, then 0.618s, 2.113s, and 2.015s for three fresh uncached captures with identical output. The first request consumes the page prepared during initialization. Memory limits disabled further background preparation during this measurement. These local static results are not substitutes for the 30-site latency distribution.

On the controlled 12,000-element banner fixture, mean sweep time fell from 82.895ms to 9.815ms, approximately 88% less work. This is a component measurement, not an 88% reduction in capture latency. The static lazy-image fixture's scroll phase fell from approximately 1.394s to 0.890s.

## Quality verification

- All seven deterministic fixtures produced identical PNG buffers to longer-settled references: static HTML, delayed hydration, delayed image, lazy images, document growth, delayed shadow-root consent banner, and a delayed font with background network activity.
- The six fixtures with saved pre-change screenshots also matched those baseline buffers exactly.
- The complete engine suite passed 185 tests. After the final recycling guard, the entire browser fixture passed again: 28 tests, zero failures or cancellations.
- Worker and benchmark suites passed 51 tests combined; engine, worker, and benchmark TypeScript builds passed.

These checks detected no fixture regressions, but the failed full live gate means quality and user satisfaction cannot yet be claimed unchanged across the live suite. No deployment was performed.

## Evidence and reproduction

- Previous passing full run: `performance-after/final/latest.json`.
- Current comparable full run: `latency-round2/final-gauntlet/latest.json` and `latest.md`.
- Failure recheck: `latency-round2/failure-recheck/latest.json`. Spotify diagnostic captures: `latency-round2/spotify-debug/` and `latency-round2/spotify-no-prewarm/`.
- Current exact-image checks: `latency-round2/verified-quality/profile.json` and its PNG files; saved baseline: `latency-round2/before/`.
- Warm-worker measurement: `latency-round2/warm-profile.json`.
- Tests: `latency-round2/engine-tests.log` and `latency-round2/final-e2e-tests.log`. The short-timeout `recycling-tests.log` is an invalid focused-test invocation, superseded by the passing complete browser fixture.

```sh
node --test --test-concurrency=1 --test-timeout=240000 packages/engine/dist/*.test.js
node apps/benchmark/scripts/quality-profile.mjs apps/benchmark/results/quality-check apps/benchmark/results/latency-round2/before
node apps/benchmark/scripts/warm-profile.mjs apps/benchmark/results/warm-check.json
node apps/benchmark/dist/src/cli.js --out apps/benchmark/results/live-check
```

Run browser measurements separately from browser tests. Keep cold initialization, warm initialization, concurrency, caching, quality settings, failed captures, and retries visible when comparing results. Reducing waits further without readiness evidence would not satisfy the quality constraint.
