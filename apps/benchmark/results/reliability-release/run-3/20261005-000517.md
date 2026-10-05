# Snapforge Gauntlet - 30-Site Quality Gate

- **Verdict**: PASS (pass rate 100% vs gate 95%; 3 blocked_by_target site(s) excluded from the gate)
- **Started**: 2026-10-04T18:34:08.794Z
- **Finished**: 2026-10-04T18:35:17.696Z
- **Runs**: 4 concurrent, 1 retries, text checks on
- **Overall**: 27/27 passed of 27 gate-eligible sites (30 total, 3 blocked), success 90%, p50 8383ms, p95 15245ms

## By tier

| Tier | Sites | Blocked | Passed | Pass rate | Success rate | p50 | p95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| easy | 10 | 0 | 10 | 100% | 100% | 6642ms | 17455ms |
| moderate | 10 | 0 | 10 | 100% | 100% | 7228ms | 14828ms |
| hard | 10 | 3 | 7 | 100% | 70% | 8518ms | 11303ms |

## Results

| Site | Tier | Status | Attempts | Latency | Size | Dimensions | Notes |
| --- | --- | --- | ---: | ---: | ---: | --- | --- |
| example-com | easy | PASS | 1 | 13460ms | 34.7 KB | 1280×720 |  |
| gnu-home | easy | PASS | 1 | 6642ms | 321.5 KB | 1280×720 |  |
| hackernews-front | easy | PASS | 1 | 13387ms | 99.4 KB | 1280×720 |  |
| kernel-org | easy | PASS | 1 | 3811ms | 130.2 KB | 1280×720 |  |
| mdn-web | easy | PASS | 1 | 17455ms | 162.1 KB | 1280×720 |  |
| peps-index | easy | PASS | 1 | 15245ms | 2218.8 KB | 1280×24000 |  |
| python-docs | easy | PASS | 1 | 5498ms | 165.7 KB | 1280×1572 |  |
| python-org-home | easy | PASS | 1 | 4730ms | 109.2 KB | 1280×720 |  |
| rust-lang-home | easy | PASS | 1 | 3584ms | 72.7 KB | 1280×720 |  |
| wikipedia-home | easy | PASS | 1 | 12294ms | 81.1 KB | 1280×720 |  |
| allbirds-store | moderate | PASS | 1 | 10870ms | 686.7 KB | 1280×720 |  |
| amazon-serp | moderate | PASS | 1 | 8383ms | 219.6 KB | 1280×720 |  |
| dribbble-grid | moderate | PASS | 1 | 14828ms | 2029.4 KB | 1280×7133 |  |
| github-home | moderate | PASS | 1 | 9000ms | 213.4 KB | 1280×720 |  |
| nextjs-docs | moderate | PASS | 1 | 4401ms | 79.8 KB | 1280×720 |  |
| react-dev | moderate | PASS | 1 | 4033ms | 77.2 KB | 1280×720 |  |
| svelte-docs | moderate | PASS | 1 | 4955ms | 73.3 KB | 1280×720 |  |
| tailwind-docs | moderate | PASS | 1 | 10881ms | 257.1 KB | 1280×2547 |  |
| typescript-docs | moderate | PASS | 1 | 4701ms | 55.6 KB | 1280×720 |  |
| vercel-docs | moderate | PASS | 1 | 7228ms | 102.0 KB | 1280×720 |  |
| bbc-news | hard | PASS | 1 | 7916ms | 242.7 KB | 1280×720 |  |
| booking-home | hard | PASS | 1 | 6518ms | 787.4 KB | 1280×720 |  |
| cloudflare-turnstile | hard | PASS | 1 | 8647ms | 67.8 KB | 1280×720 |  |
| guardian-home | hard | PASS | 1 | 5399ms | 132.7 KB | 1280×720 |  |
| imdb-home | hard | BLOCKED | 1 | 8703ms | — | — | Target blocked the capture (status 405): Human Verification |
| reddit-feed | hard | BLOCKED | 1 | 8518ms | — | — | Target blocked the capture (status 200): Reddit - Prove your humanity |
| spotify-home | hard | PASS | 1 | 8913ms | 147.7 KB | 1280×720 |  |
| stackoverflow-home | hard | BLOCKED | 1 | 7450ms | — | — | Target blocked the capture (status 403): Forbidden - Stack Exchange |
| twitch-home | hard | PASS | 1 | 11192ms | 429.3 KB | 1280×720 |  |
| youtube-watch | hard | PASS | 1 | 11303ms | 541.0 KB | 1280×720 |  |

## Capture phase timings

Timings include failed attempts, retries, and context cleanup. Values are milliseconds; an em-dash means the phase did not run.

| Site | Attempt | Total | pool_wait | browser_start | context_setup | init_scripts | request_filters | page_setup | egress | navigation | load_settle | challenge_check | dom_tweaks | pre_capture | growth_wait | scroll | post_scroll | quality_check | page_metrics | screenshot | inspection | failure_artifacts | cleanup |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| example-com | 1 | 13460 | 1 | 8283 | 16 | 12 | 2 | 4045 | 0 | 442 | 502 | 7 | 29 | 3 | — | — | — | 4 | 2 | 62 | 37 | — | 6 |
| gnu-home | 1 | 6642 | 0 | 0 | 6 | 7 | 2 | 2022 | 0 | 1329 | 3000 | 9 | 31 | 6 | — | — | — | 9 | 3 | 124 | 79 | — | 12 |
| hackernews-front | 1 | 13386 | 0 | 8024 | 19 | 16 | 2 | 2240 | 0 | 1698 | 874 | 7 | 26 | 4 | — | — | — | 8 | 2 | 74 | 123 | — | 11 |
| kernel-org | 1 | 3811 | 0 | 0 | 5 | 13 | 3 | 2394 | 0 | 300 | 898 | 5 | 8 | 2 | — | — | — | 4 | 2 | 81 | 86 | — | 8 |
| mdn-web | 1 | 17455 | 0 | 8177 | 5 | 8 | 3 | 6058 | 0 | 685 | 2002 | 25 | 36 | 7 | — | — | — | 11 | 4 | 88 | 81 | — | 6 |
| peps-index | 1 | 15244 | 0 | 0 | 6 | 7 | 1 | 1978 | 0 | 542 | 1638 | 10 | 30 | 8 | 4 | 7238 | 8 | 16 | 16 | 2667 | 1042 | — | 27 |
| python-docs | 1 | 5498 | 0 | 0 | 6 | 12 | 4 | 2372 | 0 | 616 | 1643 | 6 | 27 | 5 | 4 | 503 | 5 | 5 | 3 | 222 | 56 | — | 6 |
| python-org-home | 1 | 4730 | 0 | 0 | 6 | 5 | 1 | 1986 | 0 | 932 | 1617 | 8 | 25 | 7 | — | — | — | 6 | 2 | 62 | 66 | — | 5 |
| rust-lang-home | 1 | 3583 | 0 | 0 | 14 | 16 | 2 | 2198 | 0 | 518 | 618 | 30 | 33 | 4 | — | — | — | 9 | 4 | 63 | 60 | — | 10 |
| wikipedia-home | 1 | 12293 | 0 | 8018 | 22 | 19 | 4 | 2212 | 0 | 992 | 512 | 12 | 38 | 6 | — | — | — | 13 | 4 | 69 | 86 | — | 24 |
| allbirds-store | 1 | 10870 | 0 | 0 | 12 | 9 | 2 | 2754 | 0 | 4531 | 3011 | 12 | 36 | 7 | — | — | — | 7 | 4 | 314 | 148 | — | 21 |
| amazon-serp | 1 | 8383 | 0 | 0 | 9 | 10 | 3 | 2532 | 0 | 2111 | 3001 | 14 | 64 | 8 | — | — | — | 40 | 7 | 153 | 408 | — | 19 |
| dribbble-grid | 1 | 14828 | 0 | 0 | 9 | 8 | 2 | 2655 | 0 | 3808 | 3002 | 160 | 449 | 40 | 33 | 1740 | 898 | 43 | 31 | 1738 | 195 | — | 14 |
| github-home | 1 | 9000 | 0 | 0 | 6 | 12 | 2 | 2478 | 0 | 2120 | 2363 | 160 | 404 | 54 | — | — | — | 59 | 77 | 752 | 494 | — | 16 |
| nextjs-docs | 1 | 4401 | 0 | 0 | 5 | 9 | 2 | 2212 | 0 | 883 | 623 | 152 | 165 | 17 | — | — | — | 13 | 3 | 74 | 226 | — | 11 |
| react-dev | 1 | 4033 | 0 | 0 | 5 | 8 | 2 | 1832 | 0 | 1070 | 744 | 6 | 28 | 4 | — | — | — | 94 | 3 | 84 | 144 | — | 5 |
| svelte-docs | 1 | 4955 | 0 | 0 | 20 | 9 | 2 | 2109 | 0 | 1275 | 1370 | 4 | 20 | 3 | — | — | — | 5 | 3 | 65 | 61 | — | 6 |
| tailwind-docs | 1 | 10881 | 0 | 0 | 6 | 9 | 2 | 2222 | 0 | 1001 | 3008 | 9 | 33 | 5 | 3 | 708 | 3021 | 14 | 6 | 627 | 186 | — | 17 |
| typescript-docs | 1 | 4701 | 0 | 0 | 6 | 10 | 2 | 2145 | 0 | 269 | 1854 | 8 | 33 | 5 | — | — | — | 6 | 5 | 102 | 242 | — | 12 |
| vercel-docs | 1 | 7227 | 0 | 0 | 6 | 7 | 2 | 2243 | 0 | 1517 | 3002 | 15 | 35 | 34 | — | — | — | 12 | 6 | 80 | 247 | — | 17 |
| bbc-news | 1 | 7916 | 0 | 0 | 9 | 30 | 3 | 2037 | 0 | 2508 | 3005 | 25 | 43 | 10 | — | — | — | 6 | 2 | 123 | 101 | — | 11 |
| booking-home | 1 | 6517 | 0 | 0 | 6 | 6 | 1 | 2011 | 0 | 908 | 3003 | 82 | 47 | 14 | — | — | — | 9 | 4 | 281 | 122 | — | 20 |
| cloudflare-turnstile | 1 | 8647 | 0 | 0 | 8 | 8 | 2 | 2754 | 0 | 2626 | 3005 | 5 | 27 | 6 | — | — | — | 4 | 1 | 85 | 104 | — | 9 |
| guardian-home | 1 | 5399 | 0 | 0 | 7 | 7 | 2 | 1813 | 0 | 1441 | 1723 | 8 | 32 | 12 | — | — | — | 12 | 4 | 92 | 229 | — | 12 |
| imdb-home | 1 | 8703 | 0 | 0 | 11 | 12 | 4 | 2011 | 0 | 1112 | 3001 | 2521 | — | — | — | — | — | — | — | — | — | 9 | 18 |
| reddit-feed | 1 | 8517 | 0 | 0 | 5 | 9 | 2 | 2181 | 0 | 757 | 3001 | 2529 | — | — | — | — | — | — | — | — | — | 14 | 11 |
| spotify-home | 1 | 8914 | 0 | 0 | 26 | 5 | 1 | 2372 | 0 | 2988 | 3003 | 207 | 63 | 12 | — | — | — | 24 | 4 | 88 | 110 | — | 8 |
| stackoverflow-home | 1 | 7450 | 0 | 0 | 5 | 116 | 5 | 3028 | 0 | 625 | 1133 | 2524 | — | — | — | — | — | — | — | — | — | 3 | 6 |
| twitch-home | 1 | 11192 | 0 | 0 | 7 | 7 | 1 | 1916 | 0 | 1343 | 3001 | 854 | 2719 | 527 | — | — | — | 75 | 84 | 433 | 197 | — | 24 |
| youtube-watch | 1 | 11303 | 0 | 0 | 6 | 7 | 2 | 2145 | 0 | 4602 | 3005 | 179 | 133 | 28 | — | — | — | 28 | 97 | 554 | 472 | — | 40 |
