# Snapforge Gauntlet - 30-Site Quality Gate

- **Verdict**: PASS (pass rate 100% vs gate 95%; 3 blocked_by_target site(s) excluded from the gate)
- **Started**: 2026-10-04T18:29:57.250Z
- **Finished**: 2026-10-04T18:31:25.401Z
- **Runs**: 4 concurrent, 1 retries, text checks on
- **Overall**: 27/27 passed of 27 gate-eligible sites (30 total, 3 blocked), success 90%, p50 9618ms, p95 23073ms

## By tier

| Tier | Sites | Blocked | Passed | Pass rate | Success rate | p50 | p95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| easy | 10 | 0 | 10 | 100% | 100% | 9636ms | 23073ms |
| moderate | 10 | 0 | 10 | 100% | 100% | 8696ms | 24974ms |
| hard | 10 | 3 | 7 | 100% | 70% | 9479ms | 13085ms |

## Results

| Site | Tier | Status | Attempts | Latency | Size | Dimensions | Notes |
| --- | --- | --- | ---: | ---: | ---: | --- | --- |
| example-com | easy | PASS | 1 | 16945ms | 34.7 KB | 1280×720 |  |
| gnu-home | easy | PASS | 1 | 9636ms | 321.5 KB | 1280×720 |  |
| hackernews-front | easy | PASS | 1 | 23073ms | 99.4 KB | 1280×720 |  |
| kernel-org | easy | PASS | 1 | 7557ms | 130.2 KB | 1280×720 |  |
| mdn-web | easy | PASS | 1 | 22290ms | 161.3 KB | 1280×720 |  |
| peps-index | easy | PASS | 1 | 19598ms | 2218.8 KB | 1280×24000 |  |
| python-docs | easy | PASS | 1 | 5554ms | 165.7 KB | 1280×1572 |  |
| python-org-home | easy | PASS | 1 | 6566ms | 109.2 KB | 1280×720 |  |
| rust-lang-home | easy | PASS | 1 | 4969ms | 72.7 KB | 1280×720 |  |
| wikipedia-home | easy | PASS | 1 | 18081ms | 81.1 KB | 1280×720 |  |
| allbirds-store | moderate | PASS | 1 | 12598ms | 685.6 KB | 1280×720 |  |
| amazon-serp | moderate | PASS | 1 | 8178ms | 219.0 KB | 1280×720 |  |
| dribbble-grid | moderate | PASS | 1 | 24974ms | 1332.0 KB | 1280×7467 |  |
| github-home | moderate | PASS | 1 | 10742ms | 209.4 KB | 1280×720 |  |
| nextjs-docs | moderate | PASS | 1 | 5264ms | 79.8 KB | 1280×720 |  |
| react-dev | moderate | PASS | 1 | 4446ms | 77.2 KB | 1280×720 |  |
| svelte-docs | moderate | PASS | 1 | 8696ms | 73.3 KB | 1280×720 |  |
| tailwind-docs | moderate | PASS | 1 | 10546ms | 257.1 KB | 1280×2547 |  |
| typescript-docs | moderate | PASS | 1 | 6290ms | 55.6 KB | 1280×720 |  |
| vercel-docs | moderate | PASS | 1 | 9641ms | 102.0 KB | 1280×720 |  |
| bbc-news | hard | PASS | 1 | 13085ms | 242.7 KB | 1280×720 |  |
| booking-home | hard | PASS | 1 | 12436ms | 407.6 KB | 1280×720 |  |
| cloudflare-turnstile | hard | PASS | 1 | 7627ms | 67.8 KB | 1280×720 |  |
| guardian-home | hard | PASS | 1 | 9618ms | 132.7 KB | 1280×720 |  |
| imdb-home | hard | BLOCKED | 1 | 10612ms | — | — | Target blocked the capture (status 405): Human Verification |
| reddit-feed | hard | BLOCKED | 1 | 8364ms | — | — | Target blocked the capture (status 200): Reddit - Prove your humanity |
| spotify-home | hard | PASS | 1 | 9479ms | 150.0 KB | 1280×720 |  |
| stackoverflow-home | hard | BLOCKED | 1 | 7191ms | — | — | Target blocked the capture (status 403): Forbidden - Stack Exchange |
| twitch-home | hard | PASS | 1 | 9106ms | 66.5 KB | 1280×720 |  |
| youtube-watch | hard | PASS | 1 | 12201ms | 245.9 KB | 1280×720 |  |

## Capture phase timings

Timings include failed attempts, retries, and context cleanup. Values are milliseconds; an em-dash means the phase did not run.

| Site | Attempt | Total | pool_wait | browser_start | context_setup | init_scripts | request_filters | page_setup | egress | navigation | load_settle | challenge_check | dom_tweaks | pre_capture | growth_wait | scroll | post_scroll | quality_check | page_metrics | screenshot | inspection | failure_artifacts | cleanup |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| example-com | 1 | 16942 | 1 | 13113 | 30 | 19 | 1 | 2515 | 0 | 635 | 380 | 12 | 53 | 16 | — | — | — | 9 | 4 | 71 | 61 | — | 16 |
| gnu-home | 1 | 9637 | 0 | 0 | 7 | 63 | 5 | 3567 | 0 | 3346 | 2361 | 6 | 24 | 3 | — | — | — | 7 | 3 | 153 | 77 | — | 9 |
| hackernews-front | 1 | 23073 | 0 | 12851 | 5 | 17 | 4 | 7316 | 0 | 1344 | 763 | 34 | 47 | 5 | — | — | — | 13 | 8 | 91 | 151 | — | 12 |
| kernel-org | 1 | 7556 | 0 | 0 | 22 | 42 | 14 | 4752 | 0 | 665 | 1892 | 7 | 14 | 4 | — | — | — | 4 | 3 | 61 | 67 | — | 5 |
| mdn-web | 1 | 22289 | 0 | 12712 | 21 | 27 | 5 | 4951 | 0 | 1745 | 1985 | 56 | 50 | 31 | — | — | — | 12 | 4 | 108 | 157 | — | 13 |
| peps-index | 1 | 19597 | 0 | 0 | 10 | 42 | 10 | 4385 | 0 | 1393 | 1863 | 15 | 45 | 18 | 14 | 7547 | 14 | 25 | 7 | 2969 | 1227 | — | 8 |
| python-docs | 1 | 5554 | 0 | 0 | 9 | 18 | 2 | 2490 | 0 | 585 | 1514 | 39 | 46 | 6 | 9 | 520 | 4 | 5 | 2 | 258 | 39 | — | 5 |
| python-org-home | 1 | 6566 | 0 | 0 | 4 | 35 | 7 | 3039 | 0 | 1354 | 1876 | 6 | 27 | 4 | — | — | — | 5 | 2 | 87 | 108 | — | 8 |
| rust-lang-home | 1 | 4968 | 0 | 0 | 7 | 9 | 6 | 2111 | 0 | 1519 | 1132 | 6 | 26 | 3 | — | — | — | 7 | 2 | 55 | 66 | — | 14 |
| wikipedia-home | 1 | 18081 | 0 | 12710 | 21 | 13 | 9 | 2502 | 0 | 1683 | 513 | 7 | 31 | 6 | — | — | — | 8 | 2 | 61 | 92 | — | 10 |
| allbirds-store | 1 | 12598 | 0 | 0 | 7 | 24 | 4 | 2628 | 0 | 6579 | 3015 | 5 | 21 | 4 | — | — | — | 4 | 1 | 220 | 69 | — | 15 |
| amazon-serp | 1 | 8177 | 0 | 0 | 6 | 18 | 3 | 2474 | 0 | 2132 | 3002 | 7 | 39 | 3 | — | — | — | 12 | 2 | 136 | 333 | — | 6 |
| dribbble-grid | 1 | 24974 | 0 | 0 | 6 | 27 | 4 | 2670 | 0 | 6172 | 3004 | 5 | 18 | 5015 | 267 | 2791 | 3072 | 73 | 30 | 1440 | 367 | — | 9 |
| github-home | 1 | 10742 | 0 | 0 | 8 | 16 | 4 | 2182 | 0 | 4389 | 2234 | 153 | 401 | 69 | — | — | — | 69 | 62 | 668 | 459 | — | 22 |
| nextjs-docs | 1 | 5263 | 0 | 0 | 7 | 11 | 2 | 2121 | 0 | 1159 | 994 | 318 | 229 | 21 | — | — | — | 19 | 7 | 127 | 230 | — | 13 |
| react-dev | 1 | 4445 | 0 | 0 | 5 | 11 | 3 | 2301 | 0 | 934 | 728 | 8 | 49 | 3 | — | — | — | 97 | 3 | 100 | 185 | — | 16 |
| svelte-docs | 1 | 8696 | 0 | 0 | 20 | 8 | 2 | 1953 | 0 | 3565 | 3007 | 5 | 18 | 4 | — | — | — | 6 | 4 | 47 | 48 | — | 7 |
| tailwind-docs | 1 | 10546 | 0 | 0 | 5 | 22 | 3 | 2359 | 0 | 695 | 3014 | 8 | 37 | 3 | 3 | 818 | 3007 | 13 | 10 | 403 | 129 | — | 13 |
| typescript-docs | 1 | 6290 | 0 | 0 | 10 | 8 | 2 | 2323 | 0 | 645 | 3002 | 25 | 38 | 6 | — | — | — | 7 | 5 | 99 | 107 | — | 7 |
| vercel-docs | 1 | 9641 | 0 | 0 | 5 | 7 | 1 | 1715 | 0 | 4656 | 3002 | 18 | 31 | 2 | — | — | — | 8 | 5 | 67 | 116 | — | 6 |
| bbc-news | 1 | 13084 | 0 | 0 | 5 | 7 | 2 | 1692 | 0 | 7981 | 3008 | 18 | 50 | 7 | — | — | — | 9 | 4 | 141 | 143 | — | 15 |
| booking-home | 1 | 12436 | 0 | 0 | 6 | 11 | 2 | 2323 | 0 | 6098 | 3008 | 180 | 45 | 6 | — | — | — | 8 | 4 | 191 | 538 | — | 12 |
| cloudflare-turnstile | 1 | 7627 | 0 | 0 | 7 | 6 | 2 | 2011 | 0 | 2188 | 3005 | 30 | 48 | 15 | — | — | — | 12 | 6 | 107 | 174 | — | 13 |
| guardian-home | 1 | 9618 | 0 | 0 | 5 | 9 | 2 | 1577 | 0 | 4487 | 3001 | 27 | 39 | 19 | — | — | — | 16 | 3 | 114 | 300 | — | 14 |
| imdb-home | 1 | 10611 | 0 | 0 | 8 | 10 | 2 | 2267 | 0 | 2771 | 3003 | 2523 | — | — | — | — | — | — | — | — | — | 6 | 18 |
| reddit-feed | 1 | 8363 | 0 | 0 | 4 | 7 | 1 | 1692 | 0 | 1108 | 3000 | 2511 | — | — | — | — | — | — | — | — | — | 24 | 9 |
| spotify-home | 1 | 9479 | 0 | 0 | 9 | 38 | 3 | 2020 | 0 | 2840 | 3007 | 467 | 243 | 61 | — | — | — | 206 | 131 | 189 | 246 | — | 14 |
| stackoverflow-home | 1 | 7191 | 0 | 0 | 6 | 18 | 2 | 3442 | 0 | 318 | 876 | 2514 | — | — | — | — | — | — | — | — | — | 4 | 8 |
| twitch-home | 1 | 9105 | 0 | 0 | 9 | 12 | 2 | 2310 | 0 | 2474 | 3012 | 771 | 174 | 8 | — | — | — | 9 | 4 | 183 | 123 | — | 13 |
| youtube-watch | 1 | 12201 | 0 | 0 | 5 | 17 | 3 | 2018 | 0 | 6636 | 3002 | 30 | 61 | 18 | — | — | — | 23 | 7 | 193 | 173 | — | 11 |
