# Snapforge Gauntlet - 30-Site Quality Gate

- **Verdict**: PASS (pass rate 100% vs gate 95%; 3 blocked_by_target site(s) excluded from the gate)
- **Started**: 2026-10-04T18:32:15.698Z
- **Finished**: 2026-10-04T18:33:34.081Z
- **Runs**: 4 concurrent, 1 retries, text checks on
- **Overall**: 27/27 passed of 27 gate-eligible sites (30 total, 3 blocked), success 90%, p50 8904ms, p95 15877ms

## By tier

| Tier | Sites | Blocked | Passed | Pass rate | Success rate | p50 | p95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| easy | 10 | 0 | 10 | 100% | 100% | 12857ms | 18217ms |
| moderate | 10 | 0 | 10 | 100% | 100% | 9856ms | 14065ms |
| hard | 10 | 3 | 7 | 100% | 70% | 8461ms | 14247ms |

## Results

| Site | Tier | Status | Attempts | Latency | Size | Dimensions | Notes |
| --- | --- | --- | ---: | ---: | ---: | --- | --- |
| example-com | easy | PASS | 1 | 14445ms | 34.7 KB | 1280×720 |  |
| gnu-home | easy | PASS | 1 | 12857ms | 321.6 KB | 1280×720 |  |
| hackernews-front | easy | PASS | 1 | 18217ms | 99.4 KB | 1280×720 |  |
| kernel-org | easy | PASS | 1 | 3452ms | 130.2 KB | 1280×720 |  |
| mdn-web | easy | PASS | 1 | 15333ms | 120.9 KB | 1280×720 |  |
| peps-index | easy | PASS | 1 | 15877ms | 2218.8 KB | 1280×24000 |  |
| python-docs | easy | PASS | 1 | 5257ms | 165.7 KB | 1280×1572 |  |
| python-org-home | easy | PASS | 1 | 12153ms | 109.2 KB | 1280×720 |  |
| rust-lang-home | easy | PASS | 1 | 4053ms | 72.7 KB | 1280×720 |  |
| wikipedia-home | easy | PASS | 1 | 14054ms | 81.1 KB | 1280×720 |  |
| allbirds-store | moderate | PASS | 1 | 9856ms | 686.7 KB | 1280×720 |  |
| amazon-serp | moderate | PASS | 1 | 10131ms | 219.8 KB | 1280×720 |  |
| dribbble-grid | moderate | PASS | 1 | 14065ms | 914.1 KB | 1280×7467 |  |
| github-home | moderate | PASS | 1 | 11750ms | 217.6 KB | 1280×720 |  |
| nextjs-docs | moderate | PASS | 1 | 4687ms | 79.8 KB | 1280×720 |  |
| react-dev | moderate | PASS | 1 | 10131ms | 77.2 KB | 1280×720 |  |
| svelte-docs | moderate | PASS | 1 | 7689ms | 73.3 KB | 1280×720 |  |
| tailwind-docs | moderate | PASS | 1 | 10597ms | 257.1 KB | 1280×2547 |  |
| typescript-docs | moderate | PASS | 1 | 8904ms | 55.6 KB | 1280×720 |  |
| vercel-docs | moderate | PASS | 1 | 7751ms | 102.0 KB | 1280×720 |  |
| bbc-news | hard | PASS | 1 | 7566ms | 242.7 KB | 1280×720 |  |
| booking-home | hard | PASS | 1 | 8550ms | 72.1 KB | 1280×720 |  |
| cloudflare-turnstile | hard | PASS | 1 | 7737ms | 67.8 KB | 1280×720 |  |
| guardian-home | hard | PASS | 1 | 7999ms | 132.7 KB | 1280×720 |  |
| imdb-home | hard | BLOCKED | 1 | 9025ms | — | — | Target blocked the capture (status 405): Human Verification |
| reddit-feed | hard | BLOCKED | 1 | 8518ms | — | — | Target blocked the capture (status 200): Reddit - Prove your humanity |
| spotify-home | hard | PASS | 1 | 8461ms | 150.1 KB | 1280×720 |  |
| stackoverflow-home | hard | BLOCKED | 1 | 7171ms | — | — | Target blocked the capture (status 403): Forbidden - Stack Exchange |
| twitch-home | hard | PASS | 1 | 8713ms | 432.0 KB | 1280×720 |  |
| youtube-watch | hard | PASS | 1 | 14247ms | 542.5 KB | 1280×720 |  |

## Capture phase timings

Timings include failed attempts, retries, and context cleanup. Values are milliseconds; an em-dash means the phase did not run.

| Site | Attempt | Total | pool_wait | browser_start | context_setup | init_scripts | request_filters | page_setup | egress | navigation | load_settle | challenge_check | dom_tweaks | pre_capture | growth_wait | scroll | post_scroll | quality_check | page_metrics | screenshot | inspection | failure_artifacts | cleanup |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| example-com | 1 | 14444 | 2 | 8462 | 28 | 5 | 1 | 4964 | 0 | 345 | 499 | 7 | 25 | 3 | — | — | — | 4 | 2 | 45 | 38 | — | 7 |
| gnu-home | 1 | 12857 | 0 | 0 | 4 | 9 | 2 | 2536 | 0 | 8567 | 1491 | 7 | 26 | 4 | — | — | — | 7 | 2 | 121 | 73 | — | 7 |
| hackernews-front | 1 | 18217 | 0 | 8186 | 58 | 9 | 3 | 6925 | 0 | 1190 | 861 | 12 | 36 | 6 | — | — | — | 9 | 4 | 108 | 218 | — | 4 |
| kernel-org | 1 | 3452 | 0 | 0 | 5 | 10 | 2 | 2209 | 0 | 157 | 877 | 12 | 11 | 4 | — | — | — | 3 | 2 | 64 | 84 | — | 8 |
| mdn-web | 1 | 15333 | 0 | 7889 | 17 | 18 | 5 | 2893 | 0 | 664 | 3008 | 10 | 44 | 3 | — | — | — | 4 | 4 | 73 | 102 | — | 8 |
| peps-index | 1 | 15877 | 0 | 0 | 3 | 22 | 5 | 2602 | 0 | 630 | 1750 | 7 | 22 | 7 | 3 | 7619 | 10 | 19 | 2 | 2268 | 896 | — | 7 |
| python-docs | 1 | 5256 | 0 | 0 | 8 | 9 | 3 | 2399 | 0 | 377 | 1609 | 12 | 41 | 8 | 8 | 500 | 5 | 3 | 1 | 197 | 65 | — | 8 |
| python-org-home | 1 | 12152 | 0 | 0 | 8 | 7 | 1 | 2299 | 0 | 8109 | 1491 | 7 | 27 | 5 | — | — | — | 8 | 3 | 86 | 93 | — | 6 |
| rust-lang-home | 1 | 4052 | 0 | 0 | 6 | 9 | 2 | 2380 | 0 | 721 | 745 | 13 | 45 | 6 | — | — | — | 7 | 8 | 68 | 34 | — | 4 |
| wikipedia-home | 1 | 14053 | 1 | 7891 | 17 | 19 | 6 | 2893 | 0 | 1833 | 499 | 10 | 37 | 6 | — | — | — | 13 | 4 | 70 | 149 | — | 14 |
| allbirds-store | 1 | 9855 | 0 | 0 | 8 | 18 | 4 | 2376 | 0 | 3812 | 3013 | 12 | 38 | 8 | — | — | — | 9 | 3 | 406 | 120 | — | 25 |
| amazon-serp | 1 | 10130 | 0 | 0 | 6 | 4 | 1 | 4287 | 0 | 1644 | 3005 | 53 | 73 | 9 | — | — | — | 41 | 23 | 279 | 691 | — | 9 |
| dribbble-grid | 1 | 14065 | 0 | 0 | 11 | 11 | 2 | 3383 | 0 | 1763 | 3001 | 39 | 68 | 11 | 14 | 2606 | 1049 | 98 | 34 | 1498 | 450 | — | 22 |
| github-home | 1 | 11750 | 0 | 0 | 3 | 4 | 1 | 3560 | 0 | 2921 | 2707 | 229 | 532 | 115 | — | — | — | 67 | 84 | 945 | 561 | — | 18 |
| nextjs-docs | 1 | 4687 | 0 | 0 | 6 | 11 | 2 | 2550 | 0 | 884 | 624 | 147 | 166 | 19 | — | — | — | 7 | 4 | 79 | 179 | — | 7 |
| react-dev | 1 | 10131 | 0 | 0 | 7 | 3 | 1 | 2601 | 0 | 4169 | 3005 | 7 | 25 | 6 | — | — | — | 102 | 3 | 77 | 117 | — | 5 |
| svelte-docs | 1 | 7688 | 0 | 0 | 6 | 10 | 2 | 2592 | 0 | 443 | 4319 | 17 | 46 | 7 | — | — | — | 11 | 4 | 98 | 110 | — | 20 |
| tailwind-docs | 1 | 10597 | 0 | 0 | 8 | 9 | 2 | 2535 | 0 | 974 | 3002 | 6 | 17 | 2 | 3 | 656 | 3005 | 8 | 3 | 263 | 93 | — | 7 |
| typescript-docs | 1 | 8903 | 0 | 0 | 9 | 9 | 2 | 2417 | 0 | 495 | 1993 | 3780 | 46 | 6 | — | — | — | 8 | 3 | 59 | 60 | — | 14 |
| vercel-docs | 1 | 7750 | 0 | 0 | 19 | 4 | 1 | 2244 | 0 | 1660 | 3003 | 144 | 150 | 31 | — | — | — | 16 | 14 | 180 | 264 | — | 18 |
| bbc-news | 1 | 7566 | 0 | 0 | 10 | 11 | 2 | 2743 | 0 | 1383 | 3001 | 15 | 39 | 12 | — | — | — | 11 | 4 | 151 | 151 | — | 29 |
| booking-home | 1 | 8549 | 0 | 0 | 8 | 29 | 6 | 2340 | 0 | 1138 | 3011 | 321 | 90 | 1121 | — | — | — | 31 | 7 | 155 | 273 | — | 15 |
| cloudflare-turnstile | 1 | 7736 | 0 | 0 | 17 | 7 | 1 | 2092 | 0 | 2292 | 3000 | 9 | 29 | 36 | — | — | — | 9 | 2 | 83 | 126 | — | 23 |
| guardian-home | 1 | 7997 | 0 | 0 | 15 | 14 | 4 | 3231 | 0 | 1204 | 3001 | 12 | 41 | 10 | — | — | — | 11 | 2 | 90 | 337 | — | 20 |
| imdb-home | 1 | 9024 | 0 | 0 | 9 | 9 | 1 | 2363 | 0 | 1064 | 3011 | 2539 | — | — | — | — | — | — | — | — | — | 12 | 12 |
| reddit-feed | 1 | 8518 | 0 | 0 | 11 | 19 | 3 | 2432 | 0 | 371 | 3001 | 2625 | — | — | — | — | — | — | — | — | — | 34 | 13 |
| spotify-home | 1 | 8461 | 0 | 0 | 11 | 10 | 2 | 2066 | 0 | 2728 | 3016 | 120 | 82 | 8 | — | — | — | 25 | 20 | 135 | 224 | — | 9 |
| stackoverflow-home | 1 | 7171 | 0 | 0 | 10 | 12 | 3 | 2853 | 0 | 868 | 868 | 2532 | — | — | — | — | — | — | — | — | — | 11 | 9 |
| twitch-home | 1 | 8712 | 0 | 0 | 9 | 8 | 3 | 2637 | 0 | 1542 | 3004 | 335 | 277 | 30 | — | — | — | 23 | 76 | 493 | 245 | — | 27 |
| youtube-watch | 1 | 14246 | 0 | 0 | 6 | 15 | 3 | 3703 | 0 | 5797 | 3002 | 87 | 212 | 102 | — | — | — | 21 | 6 | 599 | 669 | — | 18 |
