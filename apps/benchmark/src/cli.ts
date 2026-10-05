import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createEngine } from "@snapforge/engine";
import {
  BENCHMARK_TIERS,
  SITE_SUITE,
  selectSites,
  type BenchmarkTier,
} from "./sites.js";
import {
  DEFAULT_CONCURRENCY,
  DEFAULT_GATE_PERCENT,
  DEFAULT_RETRIES,
  runSuite,
  type BenchmarkReport,
  type SiteResult,
} from "./runner.js";
import { renderMarkdown } from "./report.js";

interface CliArgs {
  tiers: BenchmarkTier[];
  ids: string[];
  concurrency: number;
  retries: number;
  gatePercent: number;
  outDir: string;
  inspectText: boolean;
  list: boolean;
  help: boolean;
}

const HELP = `snapforge gauntlet — the 30-site benchmark quality gate

Usage: node dist/src/cli.js [options]

Options:
  --tier <list>        Comma-separated tiers to run: easy, moderate, hard (default: all)
  --site <id>          Run only these site ids (repeatable)
  --concurrency <n>    Parallel captures (default: ${DEFAULT_CONCURRENCY})
  --retries <n>        Extra attempts per site for retriable failures (default: ${DEFAULT_RETRIES})
  --gate <percent>     Minimum pass rate to exit 0 (default: ${DEFAULT_GATE_PERCENT})
  --out <dir>          Report output directory (default: apps/benchmark/results)
  --no-inspect         Skip text-based visual checks (faster, no page extraction)
  --list               Print the suite and exit
  --help               Show this help

Exit codes: 0 gate passed, 1 gate failed, 2 bad usage.`;

function parseIntArg(value: string | undefined, name: string): number {
  const parsed = Number(value);
  if (!value || !Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} expects a non-negative integer, got "${value ?? ""}"`);
  }
  return parsed;
}

function parseArgs(argv: readonly string[]): CliArgs {
  const args: CliArgs = {
    tiers: [],
    ids: [],
    concurrency: DEFAULT_CONCURRENCY,
    retries: DEFAULT_RETRIES,
    gatePercent: DEFAULT_GATE_PERCENT,
    outDir: join(fileURLToPath(new URL("../../", import.meta.url)), "results"),
    inspectText: true,
    list: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const next = (): string => {
      const value = argv[++i];
      if (value === undefined) throw new Error(`${flag} expects a value`);
      return value;
    };
    switch (flag) {
      case "--tier": {
        for (const raw of next().split(",")) {
          const tier = raw.trim() as BenchmarkTier;
          if (!BENCHMARK_TIERS.includes(tier)) {
            throw new Error(`Unknown tier "${raw}". Use: ${BENCHMARK_TIERS.join(", ")}`);
          }
          args.tiers.push(tier);
        }
        break;
      }
      case "--site":
        args.ids.push(next());
        break;
      case "--concurrency":
        args.concurrency = parseIntArg(next(), "--concurrency");
        if (args.concurrency < 1) throw new Error("--concurrency must be at least 1");
        break;
      case "--retries":
        args.retries = parseIntArg(next(), "--retries");
        break;
      case "--gate": {
        const gate = Number(next());
        if (!Number.isFinite(gate) || gate < 0 || gate > 100) {
          throw new Error("--gate expects a percentage between 0 and 100");
        }
        args.gatePercent = gate;
        break;
      }
      case "--out":
        args.outDir = next();
        break;
      case "--no-inspect":
        args.inspectText = false;
        break;
      case "--list":
        args.list = true;
        break;
      case "--help":
      case "-h":
        args.help = true;
        break;
      default:
        throw new Error(`Unknown option "${flag}". Run with --help for usage.`);
    }
  }

  return args;
}

function printSuite(): void {
  for (const tier of BENCHMARK_TIERS) {
    const sites = SITE_SUITE.filter((site) => site.tier === tier);
    console.log(`\n${tier.toUpperCase()} (${sites.length})`);
    for (const site of sites) {
      console.log(`  ${site.id.padEnd(24)} ${site.url}`);
      console.log(`  ${"".padEnd(24)} ${site.note}`);
    }
  }
}

function stamp(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

function writeReports(report: BenchmarkReport, outDir: string): string[] {
  mkdirSync(outDir, { recursive: true });
  const json = JSON.stringify(report, null, 2);
  const markdown = renderMarkdown(report);
  const name = stamp(new Date());
  const files = [
    join(outDir, "latest.json"),
    join(outDir, "latest.md"),
    join(outDir, `${name}.json`),
    join(outDir, `${name}.md`),
  ];
  writeFileSync(files[0], json, "utf8");
  writeFileSync(files[1], markdown, "utf8");
  writeFileSync(files[2], json, "utf8");
  writeFileSync(files[3], markdown, "utf8");
  return files;
}

function printResult(index: number, total: number, result: SiteResult): void {
  const status = result.ok
    ? "PASS"
    : result.error?.code === "blocked_by_target"
      ? "BLOCK"
      : "FAIL";
  const detail = result.error
    ? `${result.error.code}: ${result.error.message.slice(0, 80)}`
    : result.failures.map((failure) => failure.check).join(",");
  console.log(
    `[${String(index).padStart(2)}/${total}] ${status} ${result.tier.padEnd(8)} ` +
      `${result.id.padEnd(24)} ${String(result.latency_ms).padStart(6)}ms` +
      (detail ? `  ${detail}` : ""),
  );
}

function printSummary(report: BenchmarkReport): void {
  const { summary } = report;
  console.log("\n=== Gauntlet summary ===");
  for (const tier of BENCHMARK_TIERS) {
    const row = summary.by_tier[tier];
    const blockedNote = row.blocked > 0 ? ` (${row.blocked} blocked)` : "";
    console.log(
      `  ${tier.padEnd(9)} ${String(row.passed).padStart(2)}/${row.total - row.blocked} passed${blockedNote}` +
        `  pass ${String(row.pass_rate).padStart(6)}%` +
        `  success ${String(row.success_rate).padStart(6)}%` +
        `  p50 ${String(row.p50_ms).padStart(5)}ms  p95 ${String(row.p95_ms).padStart(5)}ms`,
    );
  }
  const overallBlocked = summary.blocked > 0 ? ` (${summary.blocked} blocked)` : "";
  console.log(
    `  ${"overall".padEnd(9)} ${String(summary.passed).padStart(2)}/${summary.eligible} passed${overallBlocked}` +
      `  pass ${String(summary.pass_rate).padStart(6)}%` +
      `  success ${String(summary.success_rate).padStart(6)}%` +
      `  p50 ${String(summary.p50_ms).padStart(5)}ms  p95 ${String(summary.p95_ms).padStart(5)}ms`,
  );
  const excluded =
    summary.blocked > 0
      ? ` (${summary.eligible} eligible, ${summary.blocked} blocked excluded)`
      : "";
  console.log(
    `\n  Gate: ${summary.pass_rate}% >= ${summary.gate_percent}% → ${summary.gate_passed ? "PASS" : "FAIL"}${excluded}`,
  );
}

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
  let args: CliArgs;
  try {
    args = parseArgs(argv);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 2;
  }

  if (args.help) {
    console.log(HELP);
    return 0;
  }
  if (args.list) {
    printSuite();
    return 0;
  }

  const sites = selectSites(SITE_SUITE, { tiers: args.tiers, ids: args.ids });
  if (sites.length === 0) {
    console.error("No sites matched the given filters. Use --list to see the suite.");
    return 2;
  }

  const engine = createEngine({
    maxConcurrentCaptures: args.concurrency,
    autoConcurrency: false,
    logger: (level, message, meta) => {
      if (level === "warn" || level === "error") {
        console.error(`[engine:${level}] ${message}${meta ? ` ${JSON.stringify(meta)}` : ""}`);
      }
    },
  });

  let completed = 0;
  try {
    const report = await runSuite(engine, sites, {
      concurrency: args.concurrency,
      retries: args.retries,
      gatePercent: args.gatePercent,
      inspectText: args.inspectText,
      onResult: (result) => printResult(++completed, sites.length, result),
    });

    const files = writeReports(report, args.outDir);
    printSummary(report);
    console.log(`\n  Reports: ${files[1]}`);
    return report.summary.gate_passed ? 0 : 1;
  } finally {
    await engine.close();
  }
}

const invokedDirectly =
  process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (invokedDirectly) {
  process.exitCode = await main();
}
