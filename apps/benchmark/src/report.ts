import { BENCHMARK_TIERS } from "./sites.js";
import { CAPTURE_PHASES } from "@snapforge/engine";
import type { BenchmarkReport, SiteResult } from "./runner.js";

function statusLabel(result: SiteResult): string {
  if (result.error?.code === "blocked_by_target") return "BLOCKED";
  if (result.error) return `ERROR ${result.error.code}`;
  if (result.ok) return "PASS";
  return "FAIL";
}

function detailLabel(result: SiteResult): string {
  if (result.error) return result.error.message.slice(0, 120);
  return result.failures
    .map((failure) => `${failure.check}: ${failure.message}`)
    .join("; ")
    .slice(0, 200);
}

export function renderMarkdown(report: BenchmarkReport): string {
  const { summary } = report;
  const verdict = summary.gate_passed ? "PASS" : "FAIL";
  const excluded =
    summary.blocked > 0
      ? `; ${summary.blocked} blocked_by_target site(s) excluded from the gate`
      : "";
  const lines: string[] = [
    "# Snapforge Gauntlet - 30-Site Quality Gate",
    "",
    `- **Verdict**: ${verdict} (pass rate ${summary.pass_rate}% vs gate ${summary.gate_percent}%${excluded})`,
    `- **Started**: ${report.started_at}`,
    `- **Finished**: ${report.finished_at}`,
    `- **Runs**: ${report.options.concurrency} concurrent, ${report.options.retries} retries, text checks ${report.options.inspect_text ? "on" : "off"}`,
    `- **Overall**: ${summary.passed}/${summary.eligible} passed of ${summary.eligible} gate-eligible sites (${summary.total} total, ${summary.blocked} blocked), success ${summary.success_rate}%, p50 ${summary.p50_ms}ms, p95 ${summary.p95_ms}ms`,
    "",
    "## By tier",
    "",
    "| Tier | Sites | Blocked | Passed | Pass rate | Success rate | p50 | p95 |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
  ];

  for (const tier of BENCHMARK_TIERS) {
    const row = summary.by_tier[tier];
    lines.push(
      `| ${tier} | ${row.total} | ${row.blocked} | ${row.passed} | ${row.pass_rate}% | ${row.success_rate}% | ${row.p50_ms}ms | ${row.p95_ms}ms |`,
    );
  }

  lines.push(
    "",
    "## Results",
    "",
    "| Site | Tier | Status | Attempts | Latency | Size | Dimensions | Notes |",
    "| --- | --- | --- | ---: | ---: | ---: | --- | --- |",
  );

  for (const result of report.results) {
    const size = result.bytes > 0 ? `${(result.bytes / 1024).toFixed(1)} KB` : "—";
    const dims = result.width > 0 ? `${result.width}×${result.height}` : "—";
    lines.push(
      `| ${result.id} | ${result.tier} | ${statusLabel(result)} | ${result.attempts} | ${result.latency_ms}ms | ${size} | ${dims} | ${detailLabel(result)} |`,
    );
  }

  const timed = report.results.filter((result) => result.attempt_timings?.length);
  if (timed.length > 0) {
    const phases = CAPTURE_PHASES.filter((phase) => timed.some((result) =>
      result.attempt_timings?.some((timing) => timing.phases_ms[phase] !== undefined),
    ));
    lines.push(
      "", "## Capture phase timings", "",
      "Timings include failed attempts, retries, and context cleanup. Values are milliseconds; an em-dash means the phase did not run.", "",
      `| Site | Attempt | Total | ${phases.join(" | ")} |`,
      `| --- | ---: | ---: | ${phases.map(() => "---:").join(" | ")} |`,
    );
    for (const result of timed) {
      for (const [index, timing] of (result.attempt_timings ?? []).entries()) {
        lines.push(`| ${result.id} | ${index + 1} | ${timing.total_ms} | ${phases.map((phase) => timing.phases_ms[phase] ?? "—").join(" | ")} |`);
      }
    }
  }
  lines.push("");
  return lines.join("\n");
}
