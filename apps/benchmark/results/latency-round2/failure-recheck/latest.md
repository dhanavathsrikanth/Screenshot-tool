# Snapforge Gauntlet - 30-Site Quality Gate

- **Verdict**: FAIL (pass rate 80% vs gate 95%)
- **Started**: 2026-10-03T02:51:30.715Z
- **Finished**: 2026-10-03T02:53:41.658Z
- **Runs**: 1 concurrent, 1 retries, text checks on
- **Overall**: 4/5 passed of 5 gate-eligible sites (5 total, 0 blocked), success 100%, p50 23347ms, p95 43789ms

## By tier

| Tier | Sites | Blocked | Passed | Pass rate | Success rate | p50 | p95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| easy | 0 | 0 | 0 | 0% | 0% | 0ms | 0ms |
| moderate | 3 | 0 | 3 | 100% | 100% | 16663ms | 30493ms |
| hard | 2 | 0 | 1 | 50% | 100% | 23347ms | 43789ms |

## Results

| Site | Tier | Status | Attempts | Latency | Size | Dimensions | Notes |
| --- | --- | --- | ---: | ---: | ---: | --- | --- |
| allbirds-store | moderate | PASS | 1 | 16634ms | 685.6 KB | 1280×720 |  |
| dribbble-grid | moderate | PASS | 1 | 16663ms | 720.3 KB | 1280×13883 |  |
| github-home | moderate | PASS | 1 | 30493ms | 89.2 KB | 1280×720 |  |
| spotify-home | hard | FAIL | 1 | 23347ms | 18.2 KB | 1280×720 | min_bytes: Only 18628 bytes (minimum 40000) — likely blank or failed render |
| youtube-watch | hard | PASS | 1 | 43789ms | 625.4 KB | 1280×720 |  |

## Capture phase timings

Timings include failed attempts, retries, and context cleanup. Values are milliseconds; an em-dash means the phase did not run.

| Site | Attempt | Total | pool_wait | browser_start | context_setup | init_scripts | request_filters | page_setup | egress | navigation | load_settle | challenge_check | dom_tweaks | pre_capture | growth_wait | scroll | post_scroll | page_metrics | screenshot | inspection | cleanup |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| allbirds-store | 1 | 16634 | 0 | 0 | — | 6 | 2 | 0 | 0 | 13306 | 3006 | 4 | 18 | 8 | — | — | — | 3 | 192 | 69 | 17 |
| dribbble-grid | 1 | 16663 | 0 | 0 | — | 11 | 2 | 0 | 0 | 3608 | 3007 | 10 | 14 | 1086 | 4 | 3988 | 4127 | 2 | 676 | 118 | 6 |
| github-home | 1 | 30492 | 0 | 1610 | 11 | 5 | 2 | 4218 | 0 | 21311 | 3005 | 5 | 19 | 47 | — | — | — | 2 | 166 | 75 | 8 |
| spotify-home | 1 | 23348 | 0 | 0 | — | 11 | 3 | 0 | 0 | 18925 | 3011 | 4 | 15 | 1303 | — | — | — | 1 | 35 | 30 | 5 |
| youtube-watch | 1 | 43789 | 0 | 0 | — | 10 | 1 | 0 | 0 | 40433 | 3012 | 16 | 32 | 12 | — | — | — | 1 | 174 | 82 | 12 |
