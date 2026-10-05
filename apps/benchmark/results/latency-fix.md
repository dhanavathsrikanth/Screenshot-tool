# Capture latency fix — 2 October 2026

The largest measured delay was browser-pool waiting. The gauntlet requested four concurrent captures with `autoConcurrency: false`, but the pool ignored that setting and still applied CPU and memory limits. In the instrumented run before fixing this setting, kernel.org spent 12.5 seconds waiting for a slot and GNU spent 21.9 seconds. The pool now honors explicitly fixed concurrency. Automatic host-based limits remain the default.

Short, complete static documents also spent five seconds in the automatic content guard because they contained less than 400 characters. Static HTML without executable scripts now exits that guard early. Full-page captures of static documents that fit the viewport skip the growth wait. Script-driven pages and custom JavaScript keep the existing guards; explicit `wait_for_content` keeps its 400-character threshold.

| Measurement | Original saved run | Instrumented run before concurrency fix | Final run |
| --- | ---: | ---: | ---: |
| p50 latency | 38.658s | 26.685s | 8.677s |
| p95 latency | 76.551s | 32.484s | 16.190s |
| Successful captures | 28/30 | 28/30 | 28/30 |
| Eligible quality checks passed | 28/28 | 28/28 | 28/28 |

All runs used the same 30-site suite, four requested concurrent captures, and DOM/accessibility text checks. The final run used all four browser slots and required no retries. Reddit and IMDb remain blocked and excluded from the quality-gate denominator.

These are individual runs on this machine. Network conditions, target content, cold browser startup, and available resources affect latency; the comparison is not a production SLA or a matched competitor benchmark. The controlled static-fixture profile independently demonstrated removal of the five-second content wait, reducing repeated warm captures from approximately 7.1s to 2.1s.

Validation: engine and benchmark TypeScript builds passed; 162 engine tests passed, including browser and egress checks; the final pool changes passed targeted regression tests including fixed-concurrency and automatic-limit behavior; all 45 benchmark tests passed. Browser regressions verify identical PNG buffers for the static fixture, delayed hydration, delayed custom JavaScript, explicit content thresholds, cookie removal, output formats, and error classification.

Evidence:

- Original run: `20261002-150559.json`.
- Instrumented run before the concurrency fix: `performance-after/gauntlet/latest.json`.
- Final run with phase timings: `performance-after/final/latest.json` and `latest.md`.
- Controlled fixture profiles: `performance-baseline/profile.json` and `performance-after/profile.json`.

Reproduce:

```sh
pnpm --filter @snapforge/engine run build
pnpm --filter @snapforge/benchmark run build
node apps/benchmark/scripts/profile.mjs apps/benchmark/results/profile-check.json
node apps/benchmark/dist/src/cli.js --out apps/benchmark/results/verification
```
