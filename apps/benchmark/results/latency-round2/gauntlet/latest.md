# Snapforge Gauntlet - 30-Site Quality Gate

- **Verdict**: PASS (pass rate 100% vs gate 95%; 2 blocked_by_target site(s) excluded from the gate)
- **Started**: 2026-10-02T11:26:41.628Z
- **Finished**: 2026-10-02T11:28:27.655Z
- **Runs**: 4 concurrent, 1 retries, text checks on
- **Overall**: 28/28 passed of 28 gate-eligible sites (30 total, 2 blocked), success 93.33%, p50 7717ms, p95 32608ms

## By tier

| Tier | Sites | Blocked | Passed | Pass rate | Success rate | p50 | p95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| easy | 10 | 0 | 10 | 100% | 100% | 7110ms | 32608ms |
| moderate | 10 | 0 | 10 | 100% | 100% | 7217ms | 38377ms |
| hard | 10 | 2 | 8 | 100% | 80% | 8891ms | 26079ms |

## Results

| Site | Tier | Status | Attempts | Latency | Size | Dimensions | Notes |
| --- | --- | --- | ---: | ---: | ---: | --- | --- |
| example-com | easy | PASS | 1 | 24508ms | 10.7 KB | 1280×720 |  |
| gnu-home | easy | PASS | 1 | 6655ms | 321.5 KB | 1280×720 |  |
| hackernews-front | easy | PASS | 1 | 26166ms | 92.8 KB | 1280×720 |  |
| kernel-org | easy | PASS | 1 | 4289ms | 138.4 KB | 1280×720 |  |
| mdn-web | easy | PASS | 1 | 32608ms | 163.8 KB | 1280×720 |  |
| peps-index | easy | PASS | 1 | 19573ms | 2218.8 KB | 1280×24000 |  |
| python-docs | easy | PASS | 1 | 4418ms | 165.9 KB | 1280×1572 |  |
| python-org-home | easy | PASS | 1 | 7110ms | 109.2 KB | 1280×720 |  |
| rust-lang-home | easy | PASS | 1 | 3031ms | 72.7 KB | 1280×720 |  |
| wikipedia-home | easy | PASS | 1 | 27285ms | 81.1 KB | 1280×720 |  |
| allbirds-store | moderate | PASS | 1 | 10589ms | 687.3 KB | 1280×720 |  |
| amazon-serp | moderate | PASS | 1 | 11547ms | 183.2 KB | 1280×720 |  |
| dribbble-grid | moderate | PASS | 1 | 38377ms | 7129.5 KB | 1280×12589 |  |
| github-home | moderate | PASS | 1 | 11909ms | 218.8 KB | 1280×720 |  |
| nextjs-docs | moderate | PASS | 1 | 5539ms | 79.8 KB | 1280×720 |  |
| react-dev | moderate | PASS | 1 | 3989ms | 77.2 KB | 1280×720 |  |
| svelte-docs | moderate | PASS | 1 | 3789ms | 73.3 KB | 1280×720 |  |
| tailwind-docs | moderate | PASS | 1 | 7717ms | 257.1 KB | 1280×2547 |  |
| typescript-docs | moderate | PASS | 1 | 5061ms | 55.6 KB | 1280×720 |  |
| vercel-docs | moderate | PASS | 1 | 7217ms | 102.0 KB | 1280×720 |  |
| bbc-news | hard | PASS | 1 | 9004ms | 238.8 KB | 1280×720 |  |
| booking-home | hard | PASS | 1 | 12755ms | 407.6 KB | 1280×720 |  |
| cloudflare-turnstile | hard | PASS | 1 | 7367ms | 67.8 KB | 1280×720 |  |
| guardian-home | hard | PASS | 1 | 5968ms | 158.5 KB | 1280×720 |  |
| imdb-home | hard | BLOCKED | 1 | 7158ms | — | — | Target blocked the capture (status 405): Human Verification |
| reddit-feed | hard | BLOCKED | 1 | 7136ms | — | — | Target blocked the capture (status 200): Reddit - Prove your humanity |
| spotify-home | hard | PASS | 1 | 8891ms | 39.7 KB | 1280×720 |  |
| stackoverflow-home | hard | PASS | 1 | 20412ms | 137.5 KB | 1280×720 |  |
| twitch-home | hard | PASS | 1 | 24752ms | 404.3 KB | 1280×720 |  |
| youtube-watch | hard | PASS | 1 | 26079ms | 638.6 KB | 1280×720 |  |

## Capture phase timings

Timings include failed attempts, retries, and context cleanup. Values are milliseconds; an em-dash means the phase did not run.

| Site | Attempt | Total | pool_wait | browser_start | context_setup | init_scripts | request_filters | page_setup | egress | navigation | load_settle | challenge_check | dom_tweaks | pre_capture | growth_wait | scroll | post_scroll | page_metrics | screenshot | inspection | failure_artifacts | cleanup |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| example-com | 1 | 24506 | 6 | 15714 | 58 | 24 | 15 | 4199 | 1 | 3480 | 378 | 74 | 150 | 15 | — | — | — | 8 | 106 | 204 | — | 47 |
| gnu-home | 1 | 6655 | 0 | 0 | — | 17 | 5 | 1285 | 0 | 1872 | 3004 | 14 | 71 | 12 | — | — | — | 4 | 219 | 133 | — | 16 |
| hackernews-front | 1 | 26166 | 0 | 15138 | 68 | 26 | 3 | 4535 | 0 | 4129 | 865 | 59 | 88 | 29 | — | — | — | 19 | 167 | 448 | — | 15 |
| kernel-org | 1 | 4289 | 0 | 0 | — | 38 | 8 | 2352 | 0 | 255 | 1245 | 20 | 38 | 7 | — | — | — | 10 | 138 | 153 | — | 22 |
| mdn-web | 1 | 32608 | 0 | 15405 | 35 | 21 | 10 | 12982 | 0 | 1158 | 1989 | 11 | 62 | 8 | — | — | — | 3 | 148 | 180 | — | 14 |
| peps-index | 1 | 19573 | 0 | 0 | — | 23 | 8 | 2438 | 0 | 1498 | 1518 | 34 | 87 | 14 | 11 | 8339 | 34 | 11 | 3814 | 1591 | — | 147 |
| python-docs | 1 | 4417 | 0 | 0 | — | 18 | 8 | 0 | 0 | 1376 | 1658 | 15 | 61 | 10 | 8 | 572 | 9 | 8 | 487 | 138 | — | 40 |
| python-org-home | 1 | 7110 | 0 | 0 | — | 61 | 7 | 3514 | 0 | 1534 | 1613 | 20 | 59 | 4 | — | — | — | 10 | 130 | 143 | — | 9 |
| rust-lang-home | 1 | 3031 | 0 | 0 | — | 14 | 5 | 0 | 0 | 1338 | 812 | 215 | 195 | 15 | — | — | — | 13 | 213 | 174 | — | 30 |
| wikipedia-home | 1 | 27284 | 1 | 15123 | 79 | 38 | 7 | 8246 | 0 | 1775 | 565 | 44 | 110 | 38 | — | — | — | 14 | 322 | 209 | — | 132 |
| allbirds-store | 1 | 10589 | 0 | 0 | — | 5 | 2 | 0 | 0 | 6285 | 3002 | 34 | 93 | 47 | — | — | — | 14 | 808 | 239 | — | 58 |
| amazon-serp | 1 | 11547 | 0 | 0 | — | 12 | 2 | 1135 | 0 | 3333 | 3336 | 1338 | 493 | 280 | — | — | — | 102 | 620 | 834 | — | 58 |
| dribbble-grid | 1 | 38371 | 0 | 0 | — | 111 | 5 | 0 | 0 | 4627 | 3015 | 624 | 90 | 1813 | 217 | 16036 | 1335 | 52 | 6327 | 2775 | — | 1340 |
| github-home | 1 | 11909 | 0 | 0 | — | 13 | 4 | 403 | 0 | 2683 | 3005 | 1811 | 2107 | 243 | — | — | — | 184 | 1001 | 361 | — | 77 |
| nextjs-docs | 1 | 5539 | 0 | 0 | — | 14 | 3 | 1751 | 0 | 1945 | 111 | 31 | 80 | 16 | — | — | — | 766 | 395 | 404 | — | 15 |
| react-dev | 1 | 3989 | 0 | 0 | — | 14 | 3 | 1256 | 0 | 983 | 1000 | 12 | 58 | 9 | — | — | — | 6 | 156 | 469 | — | 17 |
| svelte-docs | 1 | 3788 | 0 | 0 | — | 33 | 5 | 0 | 0 | 1256 | 1225 | 172 | 161 | 18 | — | — | — | 40 | 438 | 298 | — | 123 |
| tailwind-docs | 1 | 7717 | 0 | 0 | — | 21 | 7 | 0 | 0 | 967 | 3005 | 16 | 51 | 16 | 3 | 837 | 2025 | 2 | 625 | 128 | — | 9 |
| typescript-docs | 1 | 5061 | 0 | 0 | — | 16 | 3 | 1189 | 0 | 913 | 2245 | 171 | 75 | 14 | — | — | — | 5 | 168 | 226 | — | 33 |
| vercel-docs | 1 | 7216 | 0 | 0 | — | 25 | 7 | 0 | 0 | 2455 | 3055 | 366 | 282 | 22 | — | — | — | 8 | 248 | 467 | — | 275 |
| bbc-news | 1 | 9001 | 0 | 0 | — | 42 | 6 | 2021 | 0 | 3221 | 3004 | 40 | 83 | 7 | — | — | — | 44 | 289 | 207 | — | 21 |
| booking-home | 1 | 12738 | 0 | 0 | — | 29 | 3 | 0 | 0 | 1187 | 3009 | 1172 | 1559 | 254 | — | — | — | 982 | 3772 | 622 | — | 109 |
| cloudflare-turnstile | 1 | 7366 | 0 | 0 | — | 131 | 12 | 0 | 0 | 3483 | 2899 | 43 | 261 | 47 | — | — | — | 4 | 163 | 252 | — | 57 |
| guardian-home | 1 | 5967 | 0 | 0 | — | 9 | 2 | 0 | 0 | 1866 | 3001 | 64 | 142 | 18 | — | — | — | 7 | 180 | 652 | — | 23 |
| imdb-home | 1 | 7157 | 0 | 0 | — | 33 | 3 | 0 | 0 | 1459 | 3017 | 2599 | — | — | — | — | — | — | — | — | 18 | 23 |
| reddit-feed | 1 | 7134 | 0 | 0 | — | 18 | 10 | 0 | 0 | 274 | 3007 | 3519 | — | — | — | — | — | — | — | — | 288 | 11 |
| spotify-home | 1 | 8889 | 0 | 0 | — | 32 | 20 | 0 | 0 | 4053 | 3006 | 421 | 353 | 432 | — | — | — | 18 | 242 | 247 | — | 43 |
| stackoverflow-home | 1 | 20412 | 0 | 0 | — | 2153 | 21 | 0 | 0 | 10459 | 3001 | 2815 | 121 | 1122 | — | — | — | 28 | 496 | 167 | — | 12 |
| twitch-home | 1 | 24752 | 0 | 0 | — | 13 | 2 | 0 | 0 | 2484 | 3003 | 549 | 1515 | 1388 | — | — | — | 12804 | 2200 | 696 | — | 89 |
| youtube-watch | 1 | 26078 | 0 | 0 | — | 9 | 3 | 0 | 0 | 14129 | 3020 | 3400 | 1543 | 87 | — | — | — | 1106 | 2312 | 414 | — | 52 |
