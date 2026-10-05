# Snapforge Gauntlet - 30-Site Quality Gate

- **Verdict**: PASS (pass rate 100% vs gate 95%)
- **Started**: 2026-10-03T04:03:48.864Z
- **Finished**: 2026-10-03T04:04:12.766Z
- **Runs**: 1 concurrent, 0 retries, text checks on
- **Overall**: 1/1 passed of 1 gate-eligible sites (1 total, 0 blocked), success 100%, p50 23890ms, p95 23890ms

## By tier

| Tier | Sites | Blocked | Passed | Pass rate | Success rate | p50 | p95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| easy | 0 | 0 | 0 | 0% | 0% | 0ms | 0ms |
| moderate | 0 | 0 | 0 | 0% | 0% | 0ms | 0ms |
| hard | 1 | 0 | 1 | 100% | 100% | 23890ms | 23890ms |

## Results

| Site | Tier | Status | Attempts | Latency | Size | Dimensions | Notes |
| --- | --- | --- | ---: | ---: | ---: | --- | --- |
| spotify-home | hard | PASS | 1 | 23890ms | 161.1 KB | 1280×720 |  |

## Capture phase timings

Timings include failed attempts, retries, and context cleanup. Values are milliseconds; an em-dash means the phase did not run.

| Site | Attempt | Total | pool_wait | browser_start | context_setup | init_scripts | request_filters | page_setup | egress | navigation | load_settle | challenge_check | dom_tweaks | pre_capture | quality_check | page_metrics | screenshot | inspection | cleanup |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| spotify-home | 1 | 23889 | 0 | 3645 | 23 | 15 | 5 | 8915 | 0 | 6466 | 3006 | 50 | 69 | 273 | 334 | 63 | 384 | 591 | 30 |
