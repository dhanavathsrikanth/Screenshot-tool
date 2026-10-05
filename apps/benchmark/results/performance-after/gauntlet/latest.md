# Snapforge Gauntlet - 30-Site Quality Gate

- **Verdict**: PASS (pass rate 100% vs gate 95%; 2 blocked_by_target site(s) excluded from the gate)
- **Started**: 2026-10-02T10:49:58.322Z
- **Finished**: 2026-10-02T10:53:14.254Z
- **Runs**: 4 concurrent, 1 retries, text checks on
- **Overall**: 28/28 passed of 28 gate-eligible sites (30 total, 2 blocked), success 93.33%, p50 26685ms, p95 32484ms

## By tier

| Tier | Sites | Blocked | Passed | Pass rate | Success rate | p50 | p95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| easy | 10 | 0 | 10 | 100% | 100% | 15058ms | 28824ms |
| moderate | 10 | 0 | 10 | 100% | 100% | 26685ms | 32484ms |
| hard | 10 | 2 | 8 | 100% | 80% | 29326ms | 32501ms |

## Results

| Site | Tier | Status | Attempts | Latency | Size | Dimensions | Notes |
| --- | --- | --- | ---: | ---: | ---: | --- | --- |
| example-com | easy | PASS | 1 | 7598ms | 10.7 KB | 1280×720 |  |
| gnu-home | easy | PASS | 1 | 28756ms | 321.5 KB | 1280×720 |  |
| hackernews-front | easy | PASS | 1 | 14064ms | 91.2 KB | 1280×720 |  |
| kernel-org | easy | PASS | 1 | 15058ms | 138.4 KB | 1280×720 |  |
| mdn-web | easy | PASS | 1 | 18104ms | 162.0 KB | 1280×720 |  |
| peps-index | easy | PASS | 1 | 25979ms | 2218.8 KB | 1280×24000 |  |
| python-docs | easy | PASS | 1 | 16063ms | 165.9 KB | 1280×1572 |  |
| python-org-home | easy | PASS | 1 | 28824ms | 109.2 KB | 1280×720 |  |
| rust-lang-home | easy | PASS | 1 | 14561ms | 72.7 KB | 1280×720 |  |
| wikipedia-home | easy | PASS | 1 | 10456ms | 81.1 KB | 1280×720 |  |
| allbirds-store | moderate | PASS | 1 | 26127ms | 685.6 KB | 1280×720 |  |
| amazon-serp | moderate | PASS | 1 | 27623ms | 174.8 KB | 1280×720 |  |
| dribbble-grid | moderate | PASS | 1 | 32484ms | 2103.9 KB | 1280×7133 |  |
| github-home | moderate | PASS | 1 | 26685ms | 211.0 KB | 1280×720 |  |
| nextjs-docs | moderate | PASS | 1 | 20037ms | 79.8 KB | 1280×720 |  |
| react-dev | moderate | PASS | 1 | 29449ms | 77.2 KB | 1280×720 |  |
| svelte-docs | moderate | PASS | 1 | 29332ms | 73.3 KB | 1280×720 |  |
| tailwind-docs | moderate | PASS | 1 | 23051ms | 257.1 KB | 1280×2547 |  |
| typescript-docs | moderate | PASS | 1 | 23096ms | 55.6 KB | 1280×720 |  |
| vercel-docs | moderate | PASS | 1 | 28735ms | 102.0 KB | 1280×720 |  |
| bbc-news | hard | PASS | 1 | 24175ms | 238.8 KB | 1280×720 |  |
| booking-home | hard | PASS | 1 | 32501ms | 789.1 KB | 1280×720 |  |
| cloudflare-turnstile | hard | PASS | 1 | 30492ms | 67.8 KB | 1280×720 |  |
| guardian-home | hard | PASS | 1 | 24727ms | 155.3 KB | 1280×720 |  |
| imdb-home | hard | BLOCKED | 1 | 29737ms | — | — | Target blocked the capture (status 405): Human Verification |
| reddit-feed | hard | BLOCKED | 1 | 29326ms | — | — | Target blocked the capture (status 200): Reddit - Prove your humanity |
| spotify-home | hard | PASS | 1 | 31042ms | 160.0 KB | 1280×720 |  |
| stackoverflow-home | hard | PASS | 1 | 31245ms | 142.0 KB | 1280×720 |  |
| twitch-home | hard | PASS | 1 | 27088ms | 333.0 KB | 1280×720 |  |
| youtube-watch | hard | PASS | 1 | 28406ms | 480.5 KB | 1280×720 |  |

## Capture phase timings

Timings include failed attempts, retries, and context cleanup. Values are milliseconds; an em-dash means the phase did not run.

| Site | Attempt | Total | pool_wait | browser_start | context_setup | init_scripts | request_filters | page_setup | egress | navigation | load_settle | challenge_check | dom_tweaks | pre_capture | growth_wait | scroll | post_scroll | page_metrics | screenshot | inspection | failure_artifacts | cleanup |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| example-com | 1 | 7597 | 1 | 2030 | 11 | 4 | 2 | 4539 | 0 | 373 | 521 | 5 | 20 | 3 | — | — | — | 2 | 35 | 40 | — | 6 |
| gnu-home | 1 | 28756 | 21927 | 0 | 10 | 8 | 1 | 1831 | 0 | 1622 | 3107 | 5 | 28 | 3 | — | — | — | 2 | 130 | 72 | — | 8 |
| hackernews-front | 1 | 14063 | 10455 | 0 | 4 | 2 | 0 | 1517 | 0 | 1173 | 759 | 4 | 18 | 2 | — | — | — | 1 | 54 | 66 | — | 4 |
| kernel-org | 1 | 15058 | 12455 | 0 | 4 | 1 | 0 | 1503 | 0 | 213 | 780 | 3 | 6 | 1 | — | — | — | 1 | 45 | 41 | — | 3 |
| mdn-web | 1 | 18105 | 14063 | 0 | 4 | 2 | 0 | 1577 | 0 | 560 | 1721 | 5 | 25 | 4 | — | — | — | 1 | 68 | 66 | — | 4 |
| peps-index | 1 | 25979 | 11016 | 0 | 4 | 1 | 0 | 1463 | 0 | 849 | 1711 | 32 | 65 | 23 | 9 | 7711 | 4 | 2 | 2295 | 780 | — | 10 |
| python-docs | 1 | 16063 | 11702 | 0 | 3 | 1 | 0 | 1522 | 0 | 515 | 1656 | 4 | 17 | 3 | 2 | 479 | 1 | 1 | 122 | 28 | — | 5 |
| python-org-home | 1 | 28823 | 24394 | 0 | 5 | 5 | 1 | 1998 | 0 | 638 | 1585 | 5 | 24 | 8 | — | — | — | 2 | 79 | 69 | — | 8 |
| rust-lang-home | 1 | 14561 | 10508 | 0 | 5 | 1 | 0 | 1654 | 0 | 1269 | 1013 | 3 | 17 | 1 | — | — | — | 1 | 49 | 32 | — | 4 |
| wikipedia-home | 1 | 10455 | 7595 | 1 | 5 | 2 | 0 | 1533 | 0 | 672 | 507 | 13 | 25 | 4 | — | — | — | 1 | 45 | 43 | — | 5 |
| allbirds-store | 1 | 26127 | 17779 | 0 | 4 | 2 | 0 | 1551 | 0 | 3063 | 3226 | 6 | 77 | 4 | — | — | — | 8 | 287 | 96 | — | 20 |
| amazon-serp | 1 | 27623 | 21135 | 1 | 9 | 3 | 0 | 1572 | 0 | 1380 | 3055 | 9 | 67 | 3 | — | — | — | 1 | 87 | 289 | — | 7 |
| dribbble-grid | 1 | 32484 | 21652 | 0 | 9 | 2 | 0 | 1904 | 0 | 1292 | 3010 | 56 | 135 | 27 | 25 | 1836 | 403 | 37 | 1801 | 285 | — | 6 |
| github-home | 1 | 26684 | 19866 | 0 | 3 | 3 | 0 | 1535 | 0 | 1236 | 2016 | 225 | 524 | 54 | — | — | — | 57 | 663 | 460 | — | 30 |
| nextjs-docs | 1 | 20035 | 14486 | 0 | 6 | 3 | 1 | 1708 | 0 | 674 | 2918 | 7 | 35 | 2 | — | — | — | 1 | 63 | 122 | — | 4 |
| react-dev | 1 | 29449 | 26220 | 0 | 5 | 2 | 0 | 1772 | 0 | 488 | 675 | 6 | 32 | 3 | — | — | — | 1 | 70 | 160 | — | 8 |
| svelte-docs | 1 | 29332 | 25663 | 0 | 9 | 2 | 1 | 1903 | 0 | 388 | 1152 | 11 | 31 | 6 | — | — | — | 7 | 74 | 70 | — | 9 |
| tailwind-docs | 1 | 23050 | 13206 | 0 | 5 | 1 | 0 | 1565 | 0 | 952 | 3255 | 7 | 22 | 5 | 4 | 686 | 3013 | 2 | 242 | 76 | — | 7 |
| typescript-docs | 1 | 23095 | 18620 | 0 | 8 | 2 | 0 | 1546 | 0 | 530 | 2263 | 8 | 18 | 2 | — | — | — | 1 | 43 | 45 | — | 6 |
| vercel-docs | 1 | 28735 | 22846 | 0 | 9 | 3 | 0 | 1750 | 0 | 1157 | 2666 | 8 | 45 | 3 | — | — | — | 1 | 97 | 139 | — | 7 |
| bbc-news | 1 | 24175 | 18494 | 0 | 3 | 1 | 0 | 1608 | 0 | 752 | 3122 | 6 | 23 | 3 | — | — | — | 1 | 80 | 71 | — | 7 |
| booking-home | 1 | 32501 | 25518 | 0 | 7 | 2 | 0 | 1574 | 0 | 619 | 3028 | 1363 | 44 | 5 | — | — | — | 1 | 260 | 72 | — | 4 |
| cloudflare-turnstile | 1 | 30491 | 23624 | 0 | 4 | 2 | 1 | 1566 | 0 | 1951 | 3128 | 7 | 29 | 9 | — | — | — | 1 | 77 | 81 | — | 8 |
| guardian-home | 1 | 24726 | 20508 | 0 | 4 | 2 | 0 | 1593 | 0 | 688 | 1532 | 12 | 55 | 13 | — | — | — | 3 | 77 | 231 | — | 6 |
| imdb-home | 1 | 29737 | 21408 | 0 | 8 | 3 | 1 | 1816 | 0 | 972 | 3013 | 2508 | — | — | — | — | — | — | — | — | 3 | 3 |
| reddit-feed | 1 | 29327 | 20387 | 0 | 5 | 2 | 0 | 1890 | 0 | 1262 | 3094 | 2656 | — | — | — | — | — | — | — | — | 15 | 8 |
| spotify-home | 1 | 31042 | 22162 | 0 | 8 | 2 | 0 | 1678 | 0 | 2919 | 3010 | 46 | 30 | 586 | — | — | — | 36 | 194 | 362 | — | 6 |
| stackoverflow-home | 1 | 31245 | 22932 | 0 | 5 | 1 | 0 | 1586 | 0 | 2519 | 1013 | 2855 | 57 | 4 | — | — | — | 18 | 164 | 84 | — | 5 |
| twitch-home | 1 | 27088 | 19466 | 0 | 9 | 3 | 0 | 1779 | 0 | 1044 | 3150 | 6 | 42 | 7 | — | — | — | 1 | 608 | 941 | — | 26 |
| youtube-watch | 1 | 28406 | 18837 | 0 | 4 | 2 | 1 | 1695 | 0 | 3800 | 3116 | 158 | 245 | 39 | — | — | — | 4 | 304 | 187 | — | 12 |
