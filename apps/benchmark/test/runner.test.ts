import test from "node:test";
import assert from "node:assert/strict";
import { SnapforgeError } from "@snapforge/contracts";
import type { CaptureOutcome } from "@snapforge/engine";
import {
  runSuite,
  summarizeResults,
  type BenchEngine,
  type SiteResult,
} from "../src/runner.js";
import type { BenchmarkSite } from "../src/sites.js";
import { makeOutcome } from "./helpers.js";

function site(overrides: Partial<BenchmarkSite> = {}): BenchmarkSite {
  return {
    id: "fixture",
    tier: "easy",
    url: "https://example.com",
    note: "fixture",
    checks: { expectText: ["Example Domain"] },
    ...overrides,
  };
}

/** Scripted engine: replays queued outcomes/errors in order, recording every call. */
class FakeEngine implements BenchEngine {
  readonly calls: Array<{ input: unknown; mode?: unknown }> = [];
  private readonly script: Array<CaptureOutcome | Error>;

  constructor(script: Array<CaptureOutcome | Error>) {
    this.script = [...script];
  }

  capture = async (input: unknown, mode?: unknown): Promise<CaptureOutcome> => {
    this.calls.push({ input, mode });
    const next = this.script.shift();
    if (!next) throw new Error("FakeEngine script exhausted");
    if (next instanceof Error) throw next;
    return next;
  };
}

const GOOD = (): CaptureOutcome => makeOutcome({ markdown: "Welcome to Example Domain" });

test("reports preserve timings from a failed attempt and its successful retry", async () => {
  const failedTimings = { total_ms: 200, phases_ms: { navigation: 180, cleanup: 20 } };
  const successTimings = { total_ms: 100, phases_ms: { screenshot: 80, cleanup: 20 } };
  const error = new SnapforgeError({
    code: "render_timeout", message: "timed out", requestId: "timed",
    details: { timings: failedTimings },
  });
  const report = await runSuite(new FakeEngine([error, { ...GOOD(), timings: successTimings }]), [site()]);
  assert.deepEqual(report.results[0].attempt_timings, [failedTimings, successTimings]);
  assert.equal(report.results[0].attempts, 2);
});

test("blocked captures retain timing diagnostics", async () => {
  const timings = { total_ms: 400, phases_ms: { challenge_check: 350, cleanup: 50 } };
  const error = new SnapforgeError({
    code: "blocked_by_target", message: "blocked", requestId: "timed",
    details: { timings },
  });
  const report = await runSuite(new FakeEngine([error]), [site()]);
  assert.deepEqual(report.results[0].attempt_timings, [timings]);
  assert.equal(report.results[0].error?.code, "blocked_by_target");
});

test("a passing site yields a passing report and gate", async () => {
  const engine = new FakeEngine([GOOD()]);
  const report = await runSuite(engine, [site()], { gatePercent: 95 });

  assert.equal(report.summary.total, 1);
  assert.equal(report.summary.passed, 1);
  assert.equal(report.summary.pass_rate, 100);
  assert.equal(report.summary.success_rate, 100);
  assert.equal(report.summary.gate_passed, true);
  assert.equal(report.results[0].ok, true);
  assert.equal(report.results[0].attempts, 1);
  assert.equal(report.results[0].text_checks_skipped, false);
});

test("the capture is requested with inspection and the site url", async () => {
  const engine = new FakeEngine([GOOD()]);
  await runSuite(engine, [site()], {});

  const call = engine.calls[0];
  assert.deepEqual(call.input, { url: "https://example.com" });
  assert.deepEqual(call.mode, { inspectPage: true });
});

test("--no-inspect skips text extraction and text checks", async () => {
  const engine = new FakeEngine([makeOutcome({})]);
  const report = await runSuite(engine, [site()], { inspectText: false });

  assert.deepEqual(engine.calls[0].mode, { inspectPage: false });
  assert.equal(report.results[0].ok, true, "missing text checks should not fail the site");
  assert.equal(report.results[0].text_checks_skipped, true);
});

test("failing visual checks mark the site as failed", async () => {
  const engine = new FakeEngine([makeOutcome({ markdown: "totally unrelated body" })]);
  const report = await runSuite(engine, [site()], { gatePercent: 100 });

  assert.equal(report.results[0].ok, false);
  assert.ok(report.results[0].failures.some((failure) => failure.check === "expect_text"));
  assert.equal(report.summary.gate_passed, false);
});

test("retriable errors are retried until they succeed", async () => {
  const timeout = new SnapforgeError({
    code: "render_timeout",
    message: "Navigation timeout of 30000 ms exceeded",
    requestId: "req_test",
  });
  const engine = new FakeEngine([timeout, GOOD()]);
  const report = await runSuite(engine, [site()], { retries: 1 });

  assert.equal(engine.calls.length, 2);
  assert.equal(report.results[0].ok, true);
  assert.equal(report.results[0].attempts, 2);
});

test("non-retriable errors are not retried", async () => {
  const blocked = new SnapforgeError({
    code: "blocked_by_target",
    message: "Target blocked the capture",
    requestId: "req_test",
  });
  const engine = new FakeEngine([blocked, GOOD()]);
  const report = await runSuite(engine, [site()], { retries: 3 });

  assert.equal(engine.calls.length, 1);
  assert.equal(report.results[0].ok, false);
  assert.equal(report.results[0].attempts, 1);
  assert.equal(report.results[0].error?.code, "blocked_by_target");
  assert.equal(report.summary.success_rate, 0);
});

test("an exhausted retry budget records the last error", async () => {
  const timeout = new SnapforgeError({
    code: "render_timeout",
    message: "still timing out",
    requestId: "req_test",
  });
  const engine = new FakeEngine([timeout, timeout, timeout]);
  const report = await runSuite(engine, [site()], { retries: 2 });

  assert.equal(engine.calls.length, 3);
  assert.equal(report.results[0].ok, false);
  assert.equal(report.results[0].attempts, 3);
  assert.equal(report.results[0].error?.code, "render_timeout");
});

test("retries default to one extra attempt", async () => {
  const crash = new SnapforgeError({
    code: "render_crashed",
    message: "renderer process crashed",
    requestId: "req_test",
  });
  const engine = new FakeEngine([crash, crash]);
  const report = await runSuite(engine, [site()], {});

  assert.equal(engine.calls.length, 2);
  assert.equal(report.results[0].attempts, 2);
});

test("every site runs and onResult reports each completion", async () => {
  const sites = [
    site({ id: "a" }),
    site({ id: "b" }),
    site({ id: "c" }),
  ];
  const engine = new FakeEngine([GOOD(), GOOD(), GOOD()]);
  const seen: string[] = [];
  const report = await runSuite(engine, sites, {
    concurrency: 2,
    onResult: (result) => seen.push(result.id),
  });

  assert.equal(report.summary.total, 3);
  assert.equal(seen.length, 3);
  assert.deepEqual(
    report.results.map((result) => result.id),
    ["a", "b", "c"],
  );
});

test("site options are merged with the target url", async () => {
  const targeted = site({ options: { full_page: true, timeout: 45_000 } });
  const engine = new FakeEngine([GOOD()]);
  await runSuite(engine, [targeted], {});

  assert.deepEqual(engine.calls[0].input, {
    full_page: true,
    timeout: 45_000,
    url: "https://example.com",
  });
});

function syntheticResult(id: string, ok: boolean): SiteResult {
  return {
    id,
    tier: "easy",
    url: `https://${id}.example`,
    ok,
    attempts: 1,
    latency_ms: 100,
    width: 1280,
    height: 720,
    bytes: 50_000,
    failures: [],
    text_checks_skipped: false,
  };
}

function blockedResult(id: string): SiteResult {
  return {
    ...syntheticResult(id, false),
    error: { code: "blocked_by_target", message: "Prove your humanity" },
  };
}

test("the gate passes at 29/30 and fails at 28/30", () => {
  const almost: SiteResult[] = Array.from({ length: 30 }, (_, i) =>
    syntheticResult(`site-${i}`, i !== 0),
  );
  const pass = summarizeResults(almost, 95);
  assert.equal(pass.passed, 29);
  assert.equal(pass.pass_rate, 96.67);
  assert.equal(pass.gate_passed, true);

  const fail: SiteResult[] = Array.from({ length: 30 }, (_, i) =>
    syntheticResult(`site-${i}`, i > 1),
  );
  const summary = summarizeResults(fail, 95);
  assert.equal(summary.passed, 28);
  assert.equal(summary.pass_rate, 93.33);
  assert.equal(summary.gate_passed, false);
});

test("summarize computes per-tier latency percentiles", () => {
  const results: SiteResult[] = [
    { ...syntheticResult("a", true), tier: "easy", latency_ms: 100 },
    { ...syntheticResult("b", true), tier: "easy", latency_ms: 300 },
    { ...syntheticResult("c", false), tier: "hard", latency_ms: 900 },
  ];
  const summary = summarizeResults(results, 95);

  assert.equal(summary.by_tier.easy.total, 2);
  assert.equal(summary.by_tier.easy.pass_rate, 100);
  assert.equal(summary.by_tier.easy.p50_ms, 100);
  assert.equal(summary.by_tier.easy.p95_ms, 300);
  assert.equal(summary.by_tier.hard.total, 1);
  assert.equal(summary.by_tier.hard.pass_rate, 0);
  assert.equal(summary.by_tier.hard.success_rate, 100);
  assert.equal(summary.p50_ms, 300);
  assert.equal(summary.p95_ms, 900);
  assert.equal(summary.success_rate, 100);
});

test("blocked_by_target sites are excluded from the gate denominator", () => {
  const results: SiteResult[] = [
    ...Array.from({ length: 2 }, (_, i) => blockedResult(`blocked-${i}`)),
    ...Array.from({ length: 28 }, (_, i) => syntheticResult(`site-${i}`, true)),
  ];
  const summary = summarizeResults(results, 95);

  assert.equal(summary.total, 30);
  assert.equal(summary.blocked, 2);
  assert.equal(summary.eligible, 28);
  assert.equal(summary.passed, 28);
  assert.equal(summary.pass_rate, 100);
  assert.equal(summary.gate_passed, true);
  assert.equal(summary.success_rate, 93.33);
  assert.equal(summary.by_tier.easy.blocked, 2);
  assert.equal(summary.by_tier.easy.pass_rate, 100);
});

test("genuine failures still fail the gate when blocked sites are excluded", () => {
  const results: SiteResult[] = [
    blockedResult("blocked-0"),
    blockedResult("blocked-1"),
    ...Array.from({ length: 26 }, (_, i) => syntheticResult(`pass-${i}`, true)),
    syntheticResult("fail-0", false),
    syntheticResult("fail-1", false),
  ];
  const summary = summarizeResults(results, 95);

  assert.equal(summary.eligible, 28);
  assert.equal(summary.passed, 26);
  assert.equal(summary.pass_rate, 92.86);
  assert.equal(summary.gate_passed, false);
});
