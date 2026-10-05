import test from "node:test";
import assert from "node:assert/strict";
import { renderMarkdown } from "../src/report.js";
import { summarizeResults, type BenchmarkReport, type SiteResult } from "../src/runner.js";

function result(id: string, tier: SiteResult["tier"], ok: boolean): SiteResult {
  return {
    id,
    tier,
    url: `https://${id}.example`,
    ok,
    attempts: 1,
    latency_ms: 420,
    width: 1280,
    height: 720,
    bytes: 51_200,
    failures: ok ? [] : [{ check: "expect_text", message: `missing text on ${id}` }],
    text_checks_skipped: false,
  };
}

function report(gatePercent: number): BenchmarkReport {
  const results = [
    result("example-com", "easy", true),
    result("react-dev", "moderate", true),
    result("reddit-feed", "hard", false),
  ];
  return {
    started_at: "2026-10-02T10:00:00.000Z",
    finished_at: "2026-10-02T10:02:00.000Z",
    options: { concurrency: 4, retries: 1, inspect_text: true, gate_percent: gatePercent },
    summary: summarizeResults(results, gatePercent),
    results,
  };
}

test("phase timing rows include cleanup, failed attempts, and skipped phases", () => {
  const input = report(60);
  input.results[0].attempt_timings = [
    { total_ms: 200, phases_ms: { navigation: 180, cleanup: 20 } },
    { total_ms: 100, phases_ms: { screenshot: 80, cleanup: 20 } },
  ];
  const markdown = renderMarkdown(input);
  assert.match(markdown, /Capture phase timings/);
  assert.match(markdown, /\| Site \| Attempt \| Total \| navigation \| screenshot \| cleanup \|/);
  assert.match(markdown, /\| example-com \| 1 \| 200 \| 180 \| — \| 20 \|/);
  assert.match(markdown, /\| example-com \| 2 \| 100 \| — \| 80 \| 20 \|/);
});

test("the markdown report carries the verdict, tiers, and per-site rows", () => {
  const markdown = renderMarkdown(report(60));
  assert.match(markdown, /Verdict\*\*: PASS \(pass rate 66\.67% vs gate 60%\)/);
  assert.match(markdown, /\| easy \| 1 \| 0 \| 1 \| 100% \| 100% \| 420ms \| 420ms \|/);
  assert.match(markdown, /\| reddit-feed \| hard \| FAIL \|/);
  assert.match(markdown, /expect_text: missing text on reddit-feed/);
});

test("a failing gate renders a FAIL verdict", () => {
  const markdown = renderMarkdown(report(100));
  assert.match(markdown, /Verdict\*\*: FAIL \(pass rate 66\.67% vs gate 100%\)/);
});

test("failed captures without an image render em-dashes instead of dimensions", () => {
  const failed: SiteResult = {
    ...result("blocked-site", "hard", false),
    width: 0,
    height: 0,
    bytes: 0,
    failures: [],
    error: { code: "blocked_by_target", message: "Target blocked the capture" },
  };
  const summary = summarizeResults([failed], 95);
  const markdown = renderMarkdown({
    started_at: "2026-10-02T10:00:00.000Z",
    finished_at: "2026-10-02T10:02:00.000Z",
    options: { concurrency: 1, retries: 0, inspect_text: true, gate_percent: 95 },
    summary,
    results: [failed],
  });
  assert.match(markdown, /\| blocked-site \| hard \| BLOCKED \|/);
  assert.match(markdown, /\| — \| — \|/);
  assert.match(markdown, /1 blocked_by_target site\(s\) excluded from the gate/);
  assert.equal(summary.blocked, 1);
  assert.equal(summary.eligible, 0);
  assert.equal(summary.gate_passed, false);
});
