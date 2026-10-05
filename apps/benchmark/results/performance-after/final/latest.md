# Snapforge Gauntlet - 30-Site Quality Gate

- **Verdict**: PASS (pass rate 100% vs gate 95%; 2 blocked_by_target site(s) excluded from the gate)
- **Started**: 2026-10-02T10:56:34.113Z
- **Finished**: 2026-10-02T10:57:52.517Z
- **Runs**: 4 concurrent, 1 retries, text checks on
- **Overall**: 28/28 passed of 28 gate-eligible sites (30 total, 2 blocked), success 93.33%, p50 8677ms, p95 16190ms

## By tier

| Tier | Sites | Blocked | Passed | Pass rate | Success rate | p50 | p95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| easy | 10 | 0 | 10 | 100% | 100% | 7340ms | 16190ms |
| moderate | 10 | 0 | 10 | 100% | 100% | 7028ms | 41561ms |
| hard | 10 | 2 | 8 | 100% | 80% | 8758ms | 15904ms |

## Results

| Site | Tier | Status | Attempts | Latency | Size | Dimensions | Notes |
| --- | --- | --- | ---: | ---: | ---: | --- | --- |
| example-com | easy | PASS | 1 | 11607ms | 10.7 KB | 1280×720 |  |
| gnu-home | easy | PASS | 1 | 7340ms | 321.5 KB | 1280×720 |  |
| hackernews-front | easy | PASS | 1 | 12126ms | 91.7 KB | 1280×720 |  |
| kernel-org | easy | PASS | 1 | 3817ms | 138.4 KB | 1280×720 |  |
| mdn-web | easy | PASS | 1 | 11282ms | 162.7 KB | 1280×720 |  |
| peps-index | easy | PASS | 1 | 16190ms | 2218.8 KB | 1280×24000 |  |
| python-docs | easy | PASS | 1 | 5526ms | 165.9 KB | 1280×1572 |  |
| python-org-home | easy | PASS | 1 | 5083ms | 109.2 KB | 1280×720 |  |
| rust-lang-home | easy | PASS | 1 | 4228ms | 72.7 KB | 1280×720 |  |
| wikipedia-home | easy | PASS | 1 | 14740ms | 81.1 KB | 1280×720 |  |
| allbirds-store | moderate | PASS | 1 | 11243ms | 685.6 KB | 1280×720 |  |
| amazon-serp | moderate | PASS | 1 | 9614ms | 174.8 KB | 1280×720 |  |
| dribbble-grid | moderate | PASS | 1 | 41561ms | 6908.3 KB | 1280×12589 |  |
| github-home | moderate | PASS | 1 | 10698ms | 218.6 KB | 1280×720 |  |
| nextjs-docs | moderate | PASS | 1 | 4414ms | 79.8 KB | 1280×720 |  |
| react-dev | moderate | PASS | 1 | 4118ms | 77.2 KB | 1280×720 |  |
| svelte-docs | moderate | PASS | 1 | 4121ms | 73.3 KB | 1280×720 |  |
| tailwind-docs | moderate | PASS | 1 | 8123ms | 257.1 KB | 1280×2547 |  |
| typescript-docs | moderate | PASS | 1 | 4314ms | 55.6 KB | 1280×720 |  |
| vercel-docs | moderate | PASS | 1 | 7028ms | 102.0 KB | 1280×720 |  |
| bbc-news | hard | PASS | 1 | 7475ms | 238.8 KB | 1280×720 |  |
| booking-home | hard | PASS | 1 | 8677ms | 789.1 KB | 1280×720 |  |
| cloudflare-turnstile | hard | PASS | 1 | 8758ms | 67.8 KB | 1280×720 |  |
| guardian-home | hard | PASS | 1 | 7654ms | 158.5 KB | 1280×720 |  |
| imdb-home | hard | BLOCKED | 1 | 9576ms | — | — | Target blocked the capture (status 405): Human Verification |
| reddit-feed | hard | BLOCKED | 1 | 9157ms | — | — | Target blocked the capture (status 200): Reddit - Prove your humanity |
| spotify-home | hard | PASS | 1 | 8621ms | 520.1 KB | 1280×720 |  |
| stackoverflow-home | hard | PASS | 1 | 11453ms | 142.1 KB | 1280×720 |  |
| twitch-home | hard | PASS | 1 | 15904ms | 413.0 KB | 1280×720 |  |
| youtube-watch | hard | PASS | 1 | 14963ms | 586.8 KB | 1280×720 |  |

## Capture phase timings

Timings include failed attempts, retries, and context cleanup. Values are milliseconds; an em-dash means the phase did not run.

| Site | Attempt | Total | pool_wait | browser_start | context_setup | init_scripts | request_filters | page_setup | egress | navigation | load_settle | challenge_check | dom_tweaks | pre_capture | growth_wait | scroll | post_scroll | page_metrics | screenshot | inspection | failure_artifacts | cleanup |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| example-com | 1 | 11607 | 1 | 6744 | 30 | 21 | 2 | 3808 | 0 | 290 | 568 | 6 | 29 | 5 | — | — | — | 2 | 43 | 48 | — | 6 |
| gnu-home | 1 | 7340 | 0 | 0 | 7 | 2 | 1 | 2200 | 0 | 1719 | 3137 | 7 | 37 | 4 | — | — | — | 4 | 132 | 76 | — | 10 |
| hackernews-front | 1 | 12125 | 0 | 6590 | 39 | 16 | 0 | 2041 | 0 | 2256 | 766 | 8 | 32 | 3 | — | — | — | 3 | 68 | 141 | — | 8 |
| kernel-org | 1 | 3817 | 0 | 0 | 6 | 3 | 1 | 2528 | 0 | 277 | 818 | 6 | 10 | 2 | — | — | — | 2 | 80 | 76 | — | 6 |
| mdn-web | 1 | 11281 | 0 | 6586 | 29 | 21 | 5 | 2035 | 0 | 506 | 1691 | 6 | 30 | 3 | — | — | — | 2 | 97 | 84 | — | 25 |
| peps-index | 1 | 16190 | 0 | 0 | 6 | 2 | 1 | 2289 | 0 | 695 | 1710 | 10 | 56 | 11 | 4 | 7689 | 5 | 2 | 2670 | 1025 | — | 12 |
| python-docs | 1 | 5526 | 0 | 0 | 5 | 2 | 0 | 2535 | 0 | 538 | 1543 | 13 | 46 | 13 | 4 | 497 | 2 | 1 | 248 | 64 | — | 10 |
| python-org-home | 1 | 5084 | 0 | 0 | 6 | 2 | 1 | 2155 | 0 | 851 | 1777 | 8 | 41 | 4 | — | — | — | 3 | 97 | 131 | — | 6 |
| rust-lang-home | 1 | 4229 | 0 | 0 | 7 | 2 | 0 | 2460 | 0 | 914 | 626 | 13 | 30 | 11 | — | — | — | 7 | 69 | 74 | — | 10 |
| wikipedia-home | 1 | 14740 | 0 | 6736 | 9 | 28 | 1 | 5658 | 0 | 1321 | 556 | 13 | 40 | 7 | — | — | — | 2 | 92 | 114 | — | 7 |
| allbirds-store | 1 | 11243 | 0 | 0 | 5 | 3 | 1 | 2358 | 0 | 4631 | 3276 | 101 | 260 | 14 | — | — | — | 3 | 368 | 174 | — | 46 |
| amazon-serp | 1 | 9614 | 0 | 0 | 4 | 1 | 0 | 2562 | 0 | 3159 | 3142 | 19 | 88 | 35 | — | — | — | 4 | 205 | 381 | — | 10 |
| dribbble-grid | 1 | 41559 | 0 | 0 | 9 | 10 | 2 | 3057 | 0 | 1483 | 3009 | 105 | 143 | 33 | 24 | 29424 | 51 | 55 | 3432 | 692 | — | 25 |
| github-home | 1 | 10697 | 0 | 0 | 9 | 5 | 1 | 1683 | 0 | 2533 | 3170 | 827 | 1125 | 209 | — | — | — | 137 | 820 | 167 | — | 8 |
| nextjs-docs | 1 | 4414 | 0 | 0 | 8 | 5 | 0 | 2320 | 0 | 795 | 534 | 278 | 161 | 25 | — | — | — | 8 | 73 | 194 | — | 10 |
| react-dev | 1 | 4117 | 0 | 0 | 21 | 2 | 0 | 2164 | 0 | 702 | 805 | 12 | 48 | 9 | — | — | — | 3 | 136 | 199 | — | 13 |
| svelte-docs | 1 | 4120 | 0 | 0 | 11 | 3 | 1 | 1903 | 0 | 455 | 1201 | 162 | 89 | 15 | — | — | — | 7 | 104 | 132 | — | 35 |
| tailwind-docs | 1 | 8122 | 0 | 0 | 7 | 2 | 1 | 2192 | 0 | 706 | 3333 | 23 | 27 | 3 | 2 | 693 | 513 | 3 | 478 | 124 | — | 13 |
| typescript-docs | 1 | 4314 | 0 | 0 | 12 | 6 | 0 | 2280 | 0 | 328 | 1532 | 6 | 22 | 2 | — | — | — | 1 | 61 | 59 | — | 4 |
| vercel-docs | 1 | 7028 | 0 | 0 | 4 | 2 | 0 | 1908 | 0 | 1505 | 3086 | 10 | 44 | 5 | — | — | — | 3 | 170 | 220 | — | 68 |
| bbc-news | 1 | 7475 | 0 | 0 | 26 | 2 | 1 | 2780 | 0 | 1196 | 3060 | 12 | 54 | 11 | — | — | — | 4 | 164 | 142 | — | 18 |
| booking-home | 1 | 8676 | 0 | 0 | 41 | 37 | 75 | 3623 | 0 | 846 | 3057 | 318 | 48 | 167 | — | — | — | 8 | 277 | 163 | — | 12 |
| cloudflare-turnstile | 1 | 8758 | 0 | 0 | 10 | 3 | 1 | 2573 | 0 | 2821 | 3046 | 7 | 65 | 8 | — | — | — | 1 | 85 | 129 | — | 7 |
| guardian-home | 1 | 7654 | 0 | 0 | 42 | 2 | 0 | 2912 | 0 | 2144 | 1833 | 44 | 70 | 21 | — | — | — | 4 | 100 | 419 | — | 55 |
| imdb-home | 1 | 9573 | 0 | 0 | 10 | 2 | 2 | 2572 | 0 | 1118 | 3011 | 2651 | — | — | — | — | — | — | — | — | 62 | 67 |
| reddit-feed | 1 | 9155 | 0 | 0 | 13 | 6 | 4 | 2910 | 0 | 500 | 3148 | 2527 | — | — | — | — | — | — | — | — | 19 | 23 |
| spotify-home | 1 | 8620 | 0 | 0 | 7 | 16 | 1 | 2722 | 0 | 2440 | 3009 | 34 | 50 | 17 | — | — | — | 14 | 150 | 150 | — | 8 |
| stackoverflow-home | 1 | 11453 | 0 | 0 | 10 | 8 | 1 | 3035 | 0 | 3668 | 3036 | 811 | 52 | 542 | — | — | — | 14 | 191 | 75 | — | 5 |
| twitch-home | 1 | 15898 | 0 | 0 | 37 | 6 | 2 | 2915 | 0 | 1529 | 3383 | 179 | 938 | 198 | — | — | — | 34 | 1318 | 5302 | — | 51 |
| youtube-watch | 1 | 14954 | 0 | 0 | 18 | 20 | 7 | 2991 | 0 | 6274 | 3226 | 608 | 393 | 72 | — | — | — | 117 | 758 | 445 | — | 21 |
