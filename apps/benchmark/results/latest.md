# Snapforge Gauntlet - 30-Site Quality Gate

- **Verdict**: FAIL (pass rate 85.71% vs gate 95%; 2 blocked_by_target site(s) excluded from the gate)
- **Started**: 2026-10-03T02:46:32.318Z
- **Finished**: 2026-10-03T02:50:36.691Z
- **Runs**: 4 concurrent, 1 retries, text checks on
- **Overall**: 24/28 passed of 28 gate-eligible sites (30 total, 2 blocked), success 86.67%, p50 16205ms, p95 93195ms

## By tier

| Tier | Sites | Blocked | Passed | Pass rate | Success rate | p50 | p95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| easy | 10 | 0 | 10 | 100% | 100% | 10708ms | 16688ms |
| moderate | 10 | 0 | 8 | 80% | 90% | 15354ms | 96720ms |
| hard | 10 | 2 | 6 | 75% | 70% | 27141ms | 92855ms |

## Results

| Site | Tier | Status | Attempts | Latency | Size | Dimensions | Notes |
| --- | --- | --- | ---: | ---: | ---: | --- | --- |
| example-com | easy | PASS | 1 | 11963ms | 34.7 KB | 1280×720 |  |
| gnu-home | easy | PASS | 1 | 10708ms | 87.6 KB | 1280×720 |  |
| hackernews-front | easy | PASS | 1 | 14178ms | 91.2 KB | 1280×720 |  |
| kernel-org | easy | PASS | 1 | 4376ms | 132.9 KB | 1280×720 |  |
| mdn-web | easy | PASS | 1 | 16688ms | 120.1 KB | 1280×720 |  |
| peps-index | easy | PASS | 1 | 16205ms | 2218.8 KB | 1280×24000 |  |
| python-docs | easy | PASS | 1 | 6559ms | 165.7 KB | 1280×1572 |  |
| python-org-home | easy | PASS | 1 | 9934ms | 107.7 KB | 1280×720 |  |
| rust-lang-home | easy | PASS | 1 | 6204ms | 72.7 KB | 1280×720 |  |
| wikipedia-home | easy | PASS | 1 | 13441ms | 81.1 KB | 1280×720 |  |
| allbirds-store | moderate | ERROR render_timeout | 2 | 93195ms | — | — | page.goto: Timeout 45000ms exceeded.
Call log:
[2m  - navigating to "https://www.allbirds.com/", waiting until "domcont |
| amazon-serp | moderate | PASS | 1 | 19920ms | 164.8 KB | 1280×720 |  |
| dribbble-grid | moderate | FAIL | 1 | 43399ms | 27.7 KB | 1280×720 | min_height: Height 720 is below the minimum 4000 |
| github-home | moderate | PASS | 2 | 96720ms | 91.0 KB | 1280×720 |  |
| nextjs-docs | moderate | PASS | 1 | 8881ms | 79.8 KB | 1280×720 |  |
| react-dev | moderate | PASS | 1 | 11742ms | 77.2 KB | 1280×720 |  |
| svelte-docs | moderate | PASS | 1 | 9283ms | 73.3 KB | 1280×720 |  |
| tailwind-docs | moderate | PASS | 1 | 35029ms | 256.4 KB | 1280×2547 |  |
| typescript-docs | moderate | PASS | 1 | 8255ms | 55.6 KB | 1280×720 |  |
| vercel-docs | moderate | PASS | 1 | 15354ms | 102.2 KB | 1280×720 |  |
| bbc-news | hard | PASS | 1 | 31753ms | 196.3 KB | 1280×720 |  |
| booking-home | hard | PASS | 1 | 18344ms | 45.9 KB | 1280×720 |  |
| cloudflare-turnstile | hard | PASS | 2 | 68756ms | 61.8 KB | 1280×720 |  |
| guardian-home | hard | PASS | 1 | 27141ms | 161.2 KB | 1280×720 |  |
| imdb-home | hard | BLOCKED | 1 | 16112ms | — | — | Target blocked the capture: Human Verification |
| reddit-feed | hard | PASS | 1 | 21262ms | 7.1 KB | 1280×720 |  |
| spotify-home | hard | FAIL | 2 | 78275ms | 18.2 KB | 1280×720 | min_bytes: Only 18624 bytes (minimum 40000) — likely blank or failed render |
| stackoverflow-home | hard | BLOCKED | 1 | 16755ms | — | — | Target blocked the capture (status 403): Just a moment... |
| twitch-home | hard | PASS | 1 | 50564ms | 86.7 KB | 1280×720 |  |
| youtube-watch | hard | ERROR render_timeout | 2 | 92855ms | — | — | page.goto: Timeout 45000ms exceeded.
Call log:
[2m  - navigating to "https://www.youtube.com/watch?v=dQw4w9WgXcQ", wait |

## Capture phase timings

Timings include failed attempts, retries, and context cleanup. Values are milliseconds; an em-dash means the phase did not run.

| Site | Attempt | Total | pool_wait | browser_start | context_setup | init_scripts | request_filters | page_setup | egress | navigation | load_settle | challenge_check | dom_tweaks | pre_capture | growth_wait | scroll | post_scroll | page_metrics | screenshot | inspection | failure_artifacts | cleanup |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| example-com | 1 | 11962 | 1 | 6342 | 22 | 14 | 1 | 1764 | 0 | 3202 | 509 | 5 | 20 | 2 | — | — | — | 2 | 37 | 27 | — | 7 |
| gnu-home | 1 | 10708 | 0 | 0 | 6 | 5 | 1 | 1585 | 0 | 5967 | 3005 | 7 | 22 | 3 | — | — | — | 2 | 46 | 49 | — | 7 |
| hackernews-front | 1 | 14178 | 0 | 6232 | 19 | 12 | 3 | 1747 | 0 | 5010 | 880 | 4 | 17 | 4 | — | — | — | 1 | 57 | 74 | — | 4 |
| kernel-org | 1 | 4376 | 0 | 0 | 4 | 6 | 2 | 1581 | 0 | 1559 | 1116 | 4 | 5 | 1 | — | — | — | 1 | 44 | 45 | — | 5 |
| mdn-web | 1 | 16688 | 0 | 6226 | 25 | 4 | 1 | 3131 | 0 | 4031 | 3002 | 6 | 20 | 2 | — | — | — | 1 | 63 | 55 | — | 5 |
| peps-index | 1 | 16204 | 0 | 0 | 6 | 5 | 2 | 1601 | 0 | 2026 | 3015 | 9 | 24 | 7 | 4 | 7124 | 4 | 1 | 1704 | 665 | — | 6 |
| python-docs | 1 | 6559 | 0 | 0 | 4 | 7 | 2 | 1551 | 0 | 2509 | 1743 | 6 | 19 | 6 | 3 | 491 | 4 | 2 | 171 | 34 | — | 4 |
| python-org-home | 1 | 9934 | 0 | 0 | 5 | 10 | 1 | 1587 | 0 | 4693 | 3001 | 4 | 16 | 1 | — | — | — | 1 | 560 | 46 | — | 5 |
| rust-lang-home | 1 | 6204 | 0 | 0 | 4 | 8 | 2 | 1607 | 0 | 2475 | 1986 | 5 | 19 | 3 | — | — | — | 1 | 51 | 35 | — | 5 |
| wikipedia-home | 1 | 13440 | 0 | 6328 | 6 | 4 | 1 | 4395 | 0 | 1951 | 505 | 6 | 22 | 3 | — | — | — | 2 | 55 | 45 | — | 6 |
| allbirds-store | 1 | 46734 | 0 | 0 | 7 | 7 | 1 | 1661 | 0 | 45014 | — | — | — | — | — | — | — | — | — | — | 36 | 6 |
| allbirds-store | 2 | 46460 | 0 | 0 | 4 | 8 | 3 | 1400 | 0 | 45004 | — | — | — | — | — | — | — | — | — | — | 34 | 5 |
| amazon-serp | 1 | 19920 | 0 | 0 | 4 | 4 | 1 | 1533 | 0 | 15053 | 3003 | 5 | 25 | 10 | — | — | — | 1 | 77 | 197 | — | 4 |
| dribbble-grid | 1 | 43398 | 0 | 0 | 5 | 4 | 1 | 1389 | 0 | 20214 | 3002 | 4520 | 65 | 5009 | 5009 | 2 | 3006 | 1 | 1036 | 122 | — | 10 |
| github-home | 1 | 46625 | 0 | 0 | 5 | 5 | 1 | 1564 | 0 | 45013 | — | — | — | — | — | — | — | — | — | — | 28 | 3 |
| github-home | 2 | 50095 | 0 | 0 | 4 | 5 | 1 | 1403 | 0 | 37236 | 3006 | 5 | 100 | 8 | — | — | — | 5 | 8219 | 94 | — | 6 |
| nextjs-docs | 1 | 8881 | 0 | 0 | 5 | 4 | 1 | 1627 | 0 | 3987 | 3002 | 9 | 34 | 6 | — | — | — | 3 | 50 | 142 | — | 8 |
| react-dev | 1 | 11742 | 0 | 0 | 5 | 4 | 1 | 1466 | 0 | 7504 | 2373 | 10 | 35 | 5 | — | — | — | 2 | 104 | 224 | — | 5 |
| svelte-docs | 1 | 9283 | 0 | 0 | 4 | 5 | 1 | 1523 | 0 | 4602 | 3011 | 3 | 17 | 2 | — | — | — | 1 | 55 | 48 | — | 8 |
| tailwind-docs | 1 | 35029 | 0 | 0 | 7 | 5 | 1 | 1526 | 0 | 3684 | 3007 | 4 | 33 | 2 | 2 | 658 | 3002 | 1 | 23011 | 77 | — | 6 |
| typescript-docs | 1 | 8255 | 0 | 0 | 4 | 4 | 1 | 1758 | 0 | 3001 | 3001 | 10 | 15 | 1 | — | — | — | 1 | 389 | 63 | — | 3 |
| vercel-docs | 1 | 15354 | 0 | 0 | 7 | 4 | 1 | 1427 | 0 | 10727 | 3014 | 5 | 20 | 3 | — | — | — | 1 | 51 | 89 | — | 4 |
| bbc-news | 1 | 31753 | 0 | 0 | 6 | 8 | 1 | 1408 | 0 | 27176 | 3015 | 3 | 15 | 2 | — | — | — | 1 | 61 | 50 | — | 4 |
| booking-home | 1 | 18345 | 0 | 0 | 4 | 5 | 1 | 1389 | 0 | 13803 | 3010 | 3 | 16 | 3 | — | — | — | 1 | 47 | 55 | — | 4 |
| cloudflare-turnstile | 1 | 46433 | 0 | 0 | 3 | 4 | 1 | 1384 | 0 | 45000 | — | — | — | — | — | — | — | — | — | — | 35 | 3 |
| cloudflare-turnstile | 2 | 22323 | 0 | 0 | 5 | 5 | 1 | 1414 | 0 | 17667 | 3006 | 4 | 14 | 4 | — | — | — | 1 | 139 | 59 | — | 3 |
| guardian-home | 1 | 27141 | 0 | 0 | 4 | 6 | 1 | 1401 | 0 | 22513 | 3006 | 5 | 18 | 5 | — | — | — | 1 | 46 | 130 | — | 4 |
| imdb-home | 1 | 16111 | 0 | 0 | 8 | 6 | 1 | 1434 | 0 | 6633 | 3000 | 4 | 14 | 5004 | — | — | — | — | — | — | 1 | 3 |
| reddit-feed | 1 | 21262 | 0 | 0 | 5 | 4 | 1 | 1336 | 0 | 15256 | 3011 | 8 | 17 | 1575 | — | — | — | 1 | 23 | 20 | — | 3 |
| spotify-home | 1 | 46414 | 0 | 0 | 5 | 5 | 1 | 1384 | 0 | 45002 | — | — | — | — | — | — | — | — | — | — | 12 | 3 |
| spotify-home | 2 | 31860 | 0 | 0 | 3 | 4 | 1 | 1406 | 0 | 25222 | 3014 | 9 | 18 | 2097 | — | — | — | 1 | 47 | 32 | — | 5 |
| stackoverflow-home | 1 | 16755 | 0 | 0 | 4 | 4 | 1 | 1363 | 0 | 9847 | 3009 | 2519 | — | — | — | — | — | — | — | — | 2 | 4 |
| twitch-home | 1 | 50564 | 0 | 0 | 3 | 6 | 2 | 1416 | 0 | 29857 | 3000 | 6 | 17 | 4163 | — | — | — | 3 | 12018 | 60 | — | 10 |
| youtube-watch | 1 | 46455 | 0 | 0 | 6 | 4 | 1 | 1394 | 0 | 45002 | — | — | — | — | — | — | — | — | — | — | 37 | 7 |
| youtube-watch | 2 | 46401 | 0 | 0 | 5 | 4 | 1 | 1345 | 0 | 45004 | — | — | — | — | — | — | — | — | — | — | 35 | 5 |
