# Snapforge Gauntlet - 30-Site Quality Gate

- **Verdict**: PASS (pass rate 100% vs gate 95%; 3 blocked_by_target site(s) excluded from the gate)
- **Started**: 2026-10-04T01:25:31.960Z
- **Finished**: 2026-10-04T01:27:03.288Z
- **Runs**: 4 concurrent, 1 retries, text checks on
- **Overall**: 27/27 passed of 27 gate-eligible sites (30 total, 3 blocked), success 90%, p50 9783ms, p95 23818ms

## By tier

| Tier | Sites | Blocked | Passed | Pass rate | Success rate | p50 | p95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| easy | 10 | 0 | 10 | 100% | 100% | 8234ms | 23898ms |
| moderate | 10 | 0 | 10 | 100% | 100% | 9573ms | 23818ms |
| hard | 10 | 3 | 7 | 100% | 70% | 9783ms | 16303ms |

## Results

| Site | Tier | Status | Attempts | Latency | Size | Dimensions | Notes |
| --- | --- | --- | ---: | ---: | ---: | --- | --- |
| example-com | easy | PASS | 1 | 20171ms | 34.7 KB | 1280×720 |  |
| gnu-home | easy | PASS | 1 | 8025ms | 326.4 KB | 1280×720 |  |
| hackernews-front | easy | PASS | 1 | 23898ms | 93.5 KB | 1280×720 |  |
| kernel-org | easy | PASS | 1 | 5154ms | 130.2 KB | 1280×720 |  |
| mdn-web | easy | PASS | 1 | 21656ms | 162.3 KB | 1280×720 |  |
| peps-index | easy | PASS | 1 | 19058ms | 2218.8 KB | 1280×24000 |  |
| python-docs | easy | PASS | 1 | 8234ms | 165.7 KB | 1280×1572 |  |
| python-org-home | easy | PASS | 1 | 7815ms | 107.7 KB | 1280×720 |  |
| rust-lang-home | easy | PASS | 1 | 4670ms | 72.7 KB | 1280×720 |  |
| wikipedia-home | easy | PASS | 1 | 20513ms | 81.1 KB | 1280×720 |  |
| allbirds-store | moderate | PASS | 1 | 12403ms | 685.6 KB | 1280×720 |  |
| amazon-serp | moderate | PASS | 1 | 10174ms | 183.5 KB | 1280×720 |  |
| dribbble-grid | moderate | PASS | 1 | 23818ms | 4528.3 KB | 1280×10473 |  |
| github-home | moderate | PASS | 1 | 10053ms | 215.8 KB | 1280×720 |  |
| nextjs-docs | moderate | PASS | 1 | 5678ms | 79.8 KB | 1280×720 |  |
| react-dev | moderate | PASS | 1 | 9573ms | 77.2 KB | 1280×720 |  |
| svelte-docs | moderate | PASS | 1 | 6151ms | 73.3 KB | 1280×720 |  |
| tailwind-docs | moderate | PASS | 1 | 12491ms | 257.1 KB | 1280×2547 |  |
| typescript-docs | moderate | PASS | 1 | 7543ms | 55.6 KB | 1280×720 |  |
| vercel-docs | moderate | PASS | 1 | 9373ms | 102.0 KB | 1280×720 |  |
| bbc-news | hard | PASS | 1 | 10060ms | 310.1 KB | 1280×720 |  |
| booking-home | hard | PASS | 1 | 10482ms | 407.6 KB | 1280×720 |  |
| cloudflare-turnstile | hard | PASS | 1 | 6960ms | 67.8 KB | 1280×720 |  |
| guardian-home | hard | PASS | 1 | 8766ms | 124.7 KB | 1280×720 |  |
| imdb-home | hard | BLOCKED | 1 | 10183ms | — | — | Target blocked the capture (status 405): Human Verification |
| reddit-feed | hard | BLOCKED | 1 | 9783ms | — | — | Target blocked the capture (status 200): Reddit - Prove your humanity |
| spotify-home | hard | PASS | 1 | 9477ms | 541.2 KB | 1280×720 |  |
| stackoverflow-home | hard | BLOCKED | 1 | 9217ms | — | — | Target blocked the capture (status 403): Forbidden - Stack Exchange |
| twitch-home | hard | PASS | 1 | 15977ms | 442.9 KB | 1280×720 |  |
| youtube-watch | hard | PASS | 1 | 16303ms | 334.7 KB | 1280×720 |  |

## Capture phase timings

Timings include failed attempts, retries, and context cleanup. Values are milliseconds; an em-dash means the phase did not run.

| Site | Attempt | Total | pool_wait | browser_start | context_setup | init_scripts | request_filters | page_setup | egress | navigation | load_settle | challenge_check | dom_tweaks | pre_capture | growth_wait | scroll | post_scroll | quality_check | page_metrics | screenshot | inspection | failure_artifacts | cleanup |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| example-com | 1 | 20169 | 2 | 12356 | 21 | 14 | 3 | 3409 | 0 | 3624 | 514 | 10 | 41 | 4 | — | — | — | 5 | 3 | 76 | 64 | — | 12 |
| gnu-home | 1 | 8024 | 0 | 0 | 6 | 18 | 2 | 2900 | 0 | 1756 | 3001 | 10 | 42 | 3 | — | — | — | 9 | 2 | 179 | 84 | — | 7 |
| hackernews-front | 1 | 23898 | 0 | 12010 | 13 | 9 | 2 | 8734 | 0 | 1393 | 885 | 15 | 44 | 9 | — | — | — | 13 | 3 | 115 | 168 | — | 8 |
| kernel-org | 1 | 5154 | 0 | 0 | 7 | 17 | 3 | 3085 | 0 | 414 | 1386 | 7 | 12 | 3 | — | — | — | 5 | 2 | 113 | 85 | — | 9 |
| mdn-web | 1 | 21655 | 0 | 11885 | 21 | 12 | 2 | 6222 | 0 | 603 | 2136 | 7 | 38 | 3 | — | — | — | 8 | 3 | 112 | 118 | — | 8 |
| peps-index | 1 | 19058 | 0 | 0 | 8 | 8 | 2 | 2941 | 0 | 1905 | 1618 | 20 | 85 | 14 | 8 | 7469 | 46 | 22 | 3 | 3386 | 1485 | — | 33 |
| python-docs | 1 | 8234 | 0 | 0 | 8 | 18 | 3 | 3054 | 0 | 2584 | 1639 | 8 | 35 | 3 | 2 | 496 | 6 | 7 | 3 | 277 | 76 | — | 11 |
| python-org-home | 1 | 7815 | 0 | 0 | 10 | 9 | 3 | 2987 | 0 | 1526 | 3005 | 8 | 39 | 3 | — | — | — | 10 | 3 | 92 | 104 | — | 10 |
| rust-lang-home | 1 | 4670 | 0 | 0 | 7 | 9 | 2 | 2995 | 0 | 801 | 633 | 8 | 34 | 5 | — | — | — | 7 | 2 | 91 | 66 | — | 6 |
| wikipedia-home | 1 | 20512 | 1 | 11880 | 22 | 13 | 7 | 3303 | 0 | 4069 | 483 | 8 | 35 | 3 | — | — | — | 12 | 3 | 90 | 92 | — | 9 |
| allbirds-store | 1 | 12403 | 0 | 0 | 18 | 10 | 2 | 3774 | 0 | 4525 | 3005 | 16 | 56 | 17 | — | — | — | 8 | 5 | 508 | 415 | — | 40 |
| amazon-serp | 1 | 10173 | 0 | 0 | 7 | 23 | 4 | 3396 | 0 | 2437 | 3007 | 16 | 122 | 51 | — | — | — | 28 | 5 | 357 | 669 | — | 29 |
| dribbble-grid | 1 | 23818 | 0 | 0 | 11 | 45 | 4 | 3594 | 0 | 3686 | 3004 | 601 | 193 | 123 | 14 | 6037 | 1335 | 131 | 31 | 4287 | 705 | — | 12 |
| github-home | 1 | 10053 | 0 | 0 | 9 | 9 | 2 | 3155 | 0 | 2095 | 2498 | 162 | 441 | 59 | — | — | — | 79 | 74 | 839 | 605 | — | 15 |
| nextjs-docs | 1 | 5678 | 0 | 0 | 6 | 9 | 2 | 2889 | 0 | 1384 | 490 | 246 | 211 | 18 | — | — | — | 12 | 3 | 151 | 244 | — | 11 |
| react-dev | 1 | 9573 | 0 | 0 | 6 | 10 | 2 | 2930 | 0 | 5194 | 881 | 13 | 36 | 6 | — | — | — | 138 | 6 | 126 | 203 | — | 16 |
| svelte-docs | 1 | 6150 | 0 | 0 | 43 | 11 | 2 | 3715 | 0 | 894 | 1221 | 7 | 41 | 3 | — | — | — | 4 | 3 | 97 | 92 | — | 14 |
| tailwind-docs | 1 | 12490 | 0 | 0 | 6 | 11 | 3 | 2983 | 0 | 1348 | 3004 | 10 | 45 | 5 | 4 | 1041 | 3009 | 18 | 6 | 706 | 259 | — | 29 |
| typescript-docs | 1 | 7542 | 0 | 0 | 9 | 15 | 2 | 3205 | 0 | 922 | 3001 | 9 | 43 | 3 | — | — | — | 5 | 4 | 100 | 205 | — | 14 |
| vercel-docs | 1 | 9374 | 0 | 0 | 129 | 8 | 2 | 3279 | 0 | 2308 | 3002 | 22 | 55 | 16 | — | — | — | 16 | 9 | 152 | 348 | — | 22 |
| bbc-news | 1 | 10061 | 0 | 0 | 32 | 14 | 3 | 4782 | 0 | 1482 | 3008 | 20 | 71 | 14 | — | — | — | 20 | 43 | 305 | 232 | — | 30 |
| booking-home | 1 | 10482 | 0 | 0 | 7 | 12 | 3 | 3377 | 0 | 958 | 3016 | 627 | 191 | 1101 | — | — | — | 24 | 31 | 340 | 781 | — | 10 |
| cloudflare-turnstile | 1 | 6960 | 0 | 0 | 7 | 9 | 2 | 3316 | 0 | 1588 | 1728 | 13 | 40 | 11 | — | — | — | 7 | 2 | 86 | 141 | — | 6 |
| guardian-home | 1 | 8765 | 0 | 0 | 12 | 11 | 3 | 4101 | 0 | 1907 | 2035 | 18 | 75 | 21 | — | — | — | 20 | 4 | 126 | 417 | — | 11 |
| imdb-home | 1 | 10183 | 0 | 0 | 8 | 12 | 4 | 3421 | 0 | 1199 | 3002 | 2516 | — | — | — | — | — | — | — | — | — | 6 | 9 |
| reddit-feed | 1 | 9783 | 0 | 0 | 8 | 34 | 3 | 3864 | 0 | 285 | 3003 | 2532 | — | — | — | — | — | — | — | — | — | 31 | 15 |
| spotify-home | 1 | 9477 | 0 | 0 | 5 | 9 | 2 | 3269 | 0 | 2275 | 3008 | 79 | 73 | 15 | — | — | — | 34 | 13 | 366 | 316 | — | 11 |
| stackoverflow-home | 1 | 9217 | 0 | 0 | 10 | 9 | 3 | 5005 | 0 | 554 | 1105 | 2516 | — | — | — | — | — | — | — | — | — | 4 | 7 |
| twitch-home | 1 | 15977 | 0 | 0 | 15 | 9 | 2 | 3937 | 0 | 2116 | 3009 | 96 | 349 | 17 | — | — | — | 13 | 12 | 337 | 6038 | — | 22 |
| youtube-watch | 1 | 16302 | 0 | 0 | 5 | 21 | 3 | 4658 | 0 | 6931 | 3002 | 109 | 281 | 50 | — | — | — | 76 | 46 | 557 | 548 | — | 11 |
