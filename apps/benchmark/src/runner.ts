import { SnapforgeError } from "@snapforge/contracts";
import { CAPTURE_PHASES, type CaptureOutcome, type CaptureTimings } from "@snapforge/engine";
import { evaluateCapture, type CheckFailure } from "./checks.js";
import { percentile, round } from "./stats.js";
import { BENCHMARK_TIERS, type BenchmarkSite, type BenchmarkTier } from "./sites.js";

export interface BenchEngine {
  capture(
    input: unknown,
    mode?: { inspectPage?: boolean; includeSelectorBox?: boolean },
  ): Promise<CaptureOutcome>;
}

export interface SiteResult {
  id: string;
  tier: BenchmarkTier;
  url: string;
  ok: boolean;
  attempts: number;
  latency_ms: number;
  attempt_timings?: CaptureTimings[];
  width: number;
  height: number;
  bytes: number;
  failures: CheckFailure[];
  error?: { code: string; message: string };
  /** True when text assertions were skipped (`--no-inspect`). */
  text_checks_skipped: boolean;
}

export interface TierSummary {
  tier: BenchmarkTier;
  total: number;
  blocked: number;
  passed: number;
  pass_rate: number;
  success_rate: number;
  p50_ms: number;
  p95_ms: number;
}

export interface RunSummary {
  total: number;
  blocked: number;
  eligible: number;
  passed: number;
  pass_rate: number;
  success_rate: number;
  gate_percent: number;
  gate_passed: boolean;
  p50_ms: number;
  p95_ms: number;
  by_tier: Record<BenchmarkTier, TierSummary>;
}

export interface BenchmarkReport {
  started_at: string;
  finished_at: string;
  options: {
    concurrency: number;
    retries: number;
    inspect_text: boolean;
    gate_percent: number;
  };
  summary: RunSummary;
  results: SiteResult[];
}

export interface RunOptions {
  concurrency?: number;
  retries?: number;
  gatePercent?: number;
  inspectText?: boolean;
  onResult?: (result: SiteResult) => void;
}

export const DEFAULT_CONCURRENCY = 4;
export const DEFAULT_RETRIES = 1;
export const DEFAULT_GATE_PERCENT = 95;

function errorInfo(err: unknown): { code: string; message: string } {
  if (err instanceof SnapforgeError) {
    return { code: err.code, message: err.message };
  }
  return {
    code: "internal_error",
    message: err instanceof Error ? err.message : String(err),
  };
}

function isRetriable(err: unknown): boolean {
  return !(err instanceof SnapforgeError) || err.retriable;
}

async function runSite(
  engine: BenchEngine,
  site: BenchmarkSite,
  retries: number,
  inspectText: boolean,
): Promise<SiteResult> {
  const started = Date.now();
  let attempts = 0;
  let lastError: { code: string; message: string } | null = null;
  const attemptTimings: CaptureTimings[] = [];

  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    attempts = attempt;
    try {
      const outcome = await engine.capture(
        { ...site.options, url: site.url },
        { inspectPage: inspectText },
      );
      if (outcome.timings) attemptTimings.push(outcome.timings);
      // Match against both extraction surfaces: markdown covers semantic content,
      // the accessible tree covers SPA chrome where brand text lives in logos.
      const text = inspectText
        ? [outcome.inspection?.markdown, outcome.inspection?.accessibleTree]
            .filter((part): part is string => Boolean(part))
            .join("\n")
        : undefined;
      const failures = evaluateCapture(site, outcome.data, outcome.buffer, text);
      return {
        id: site.id,
        tier: site.tier,
        url: site.url,
        ok: failures.length === 0,
        attempts,
        latency_ms: Date.now() - started,
        ...(attemptTimings.length > 0 ? { attempt_timings: attemptTimings } : {}),
        width: outcome.data.width,
        height: outcome.data.height,
        bytes: outcome.data.bytes,
        failures,
        text_checks_skipped: !inspectText,
      };
    } catch (err) {
      const timings = err instanceof SnapforgeError ? err.details?.timings : undefined;
      if (isCaptureTimings(timings)) attemptTimings.push(timings);
      lastError = errorInfo(err);
      if (!isRetriable(err) || attempt > retries) break;
    }
  }

  return {
    id: site.id,
    tier: site.tier,
    url: site.url,
    ok: false,
    attempts,
    latency_ms: Date.now() - started,
    ...(attemptTimings.length > 0 ? { attempt_timings: attemptTimings } : {}),
    width: 0,
    height: 0,
    bytes: 0,
    failures: [],
    error: lastError ?? { code: "internal_error", message: "Capture failed without an error" },
    text_checks_skipped: !inspectText,
  };
}

function isCaptureTimings(value: unknown): value is CaptureTimings {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.total_ms !== "number" || !Number.isFinite(candidate.total_ms) || candidate.total_ms < 0) return false;
  if (!candidate.phases_ms || typeof candidate.phases_ms !== "object") return false;
  return Object.entries(candidate.phases_ms).every(([phase, ms]) =>
    CAPTURE_PHASES.includes(phase as typeof CAPTURE_PHASES[number]) &&
    typeof ms === "number" && Number.isFinite(ms) && ms >= 0,
  );
}

async function runWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const lanes = Math.max(1, Math.min(limit, items.length));
  await Promise.all(
    Array.from({ length: lanes }, async () => {
      while (true) {
        const index = cursor++;
        if (index >= items.length) return;
        await worker(items[index]);
      }
    }),
  );
}

/** Anti-bot walls (datacenter-IP reputation blocks) are reported, not gamed. */
function isBlocked(result: SiteResult): boolean {
  return result.error?.code === "blocked_by_target";
}

function summarizeTier(tier: BenchmarkTier, results: readonly SiteResult[]): TierSummary {
  const scoped = results.filter((result) => result.tier === tier);
  const blocked = scoped.filter(isBlocked).length;
  const eligible = scoped.length - blocked;
  const passed = scoped.filter((result) => result.ok).length;
  const succeeded = scoped.filter((result) => !result.error).length;
  const latencies = scoped.map((result) => result.latency_ms);
  return {
    tier,
    total: scoped.length,
    blocked,
    passed,
    pass_rate: eligible === 0 ? 0 : round((passed / eligible) * 100),
    success_rate: scoped.length === 0 ? 0 : round((succeeded / scoped.length) * 100),
    p50_ms: percentile(latencies, 50),
    p95_ms: percentile(latencies, 95),
  };
}

export function summarizeResults(
  results: readonly SiteResult[],
  gatePercent: number,
): RunSummary {
  const total = results.length;
  const blocked = results.filter(isBlocked).length;
  const eligible = total - blocked;
  const passed = results.filter((result) => result.ok).length;
  const succeeded = results.filter((result) => !result.error).length;
  const latencies = results.map((result) => result.latency_ms);
  const passRate = eligible === 0 ? 0 : round((passed / eligible) * 100);

  const byTier = Object.fromEntries(
    BENCHMARK_TIERS.map((tier) => [tier, summarizeTier(tier, results)]),
  ) as Record<BenchmarkTier, TierSummary>;

  return {
    total,
    blocked,
    eligible,
    passed,
    pass_rate: passRate,
    success_rate: total === 0 ? 0 : round((succeeded / total) * 100),
    gate_percent: gatePercent,
    gate_passed: eligible > 0 && passRate >= gatePercent,
    p50_ms: percentile(latencies, 50),
    p95_ms: percentile(latencies, 95),
    by_tier: byTier,
  };
}

export async function runSuite(
  engine: BenchEngine,
  sites: readonly BenchmarkSite[],
  options: RunOptions = {},
): Promise<BenchmarkReport> {
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  const retries = options.retries ?? DEFAULT_RETRIES;
  const gatePercent = options.gatePercent ?? DEFAULT_GATE_PERCENT;
  const inspectText = options.inspectText ?? true;
  const startedAt = new Date();

  const results: SiteResult[] = [];
  await runWithConcurrency(sites, concurrency, async (site) => {
    const result = await runSite(engine, site, retries, inspectText);
    results.push(result);
    options.onResult?.(result);
  });

  results.sort(
    (a, b) =>
      BENCHMARK_TIERS.indexOf(a.tier) - BENCHMARK_TIERS.indexOf(b.tier) ||
      a.id.localeCompare(b.id),
  );

  return {
    started_at: startedAt.toISOString(),
    finished_at: new Date().toISOString(),
    options: { concurrency, retries, inspect_text: inspectText, gate_percent: gatePercent },
    summary: summarizeResults(results, gatePercent),
    results,
  };
}
