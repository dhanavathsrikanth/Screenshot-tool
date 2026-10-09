import type { CaptureSuccessData } from "@snapforge/contracts";
import { resolvePolicy, type ConcurrencyPolicy } from "./cpu.js";
import type { PoolBudget, PoolHealth } from "./pool.js";
import type { CaptureTimings } from "./timings.js";

export type LogLevel = "debug" | "info" | "warn" | "error";

export type EngineLogger = (
  level: LogLevel,
  message: string,
  meta?: Record<string, unknown>,
) => void;

export interface EngineConfig {
  headless?: boolean;
  channel?: string;
  executablePath?: string;
  launchArgs?: string[];
  stealth?: boolean;
  prewarmPages?: boolean;
  allowPrivateNetwork?: boolean;
  /**
   * Hard ceiling on concurrent captures. When `autoConcurrency` is on this is only an
   * upper bound — the effective limit is derived from host CPU and memory.
   */
  maxConcurrentCaptures?: number;
  /**
   * Derive concurrency from host CPU and memory instead of trusting
   * `maxConcurrentCaptures` outright. Turn off to pin an exact number.
   */
  autoConcurrency?: boolean;
  /** Overrides for the CPU-derived budget. Ignored unless `autoConcurrency` is on. */
  concurrencyPolicy?: Partial<ConcurrencyPolicy>;
  /** How often to re-sample host load. Sampling per capture just adds noise. */
  budgetSampleIntervalMs?: number;
  recycleAfterContexts?: number;
  maxBrowserAgeMs?: number;
  launchTimeoutMs?: number;
  healthTimeoutMs?: number;
  closeTimeoutMs?: number;
  retries?: number;
  maxPageHeight?: number;
  maxScrollSteps?: number;
  scrollSettleMs?: number;
  idlePhaseMs?: number;
  idleIntervalMs?: number;
  idleWindowMs?: number;
  fontWaitMs?: number;
  contentWaitMs?: number;
  maxPinnedElements?: number;
  artifactsMaxBytes?: number;
  egressLookupUrl?: string;
  logger?: EngineLogger;
}

export interface ResolvedEngineConfig {
  headless: boolean;
  channel?: string;
  executablePath?: string;
  launchArgs: string[];
  stealth: boolean;
  prewarmPages: boolean;
  allowPrivateNetwork: boolean;
  maxConcurrentCaptures: number;
  autoConcurrency: boolean;
  concurrencyPolicy: ConcurrencyPolicy;
  budgetSampleIntervalMs: number;
  recycleAfterContexts: number;
  maxBrowserAgeMs: number;
  launchTimeoutMs: number;
  healthTimeoutMs: number;
  closeTimeoutMs: number;
  retries: number;
  maxPageHeight: number;
  maxScrollSteps: number;
  scrollSettleMs: number;
  idlePhaseMs: number;
  idleIntervalMs: number;
  idleWindowMs: number;
  fontWaitMs: number;
  contentWaitMs: number;
  maxPinnedElements: number;
  artifactsMaxBytes: number;
  egressLookupUrl: string;
  logger: EngineLogger;
}

export interface CaptureOutcome {
  data: CaptureSuccessData;
  buffer: Buffer;
  timings?: CaptureTimings;
  inspection?: {
    markdown?: string;
    accessibleTree?: string;
    selectorBox?: { x: number; y: number; width: number; height: number };
  };
}

export interface EngineBrowserHealth {
  connected: boolean;
  age_ms: number;
  contexts_served: number;
  restarts: number;
}

export interface EngineHealth {
  ok: boolean;
  in_flight: number;
  browser: EngineBrowserHealth | null;
  /** Aggregate across every slot, for dashboards that show fleet-wide restarts. */
  pool: PoolHealth & { budget: PoolBudget };
}

const noopLogger: EngineLogger = () => {};

export function resolveConfig(config: EngineConfig = {}): ResolvedEngineConfig {
  return {
    headless: config.headless ?? true,
    channel: config.channel,
    executablePath: config.executablePath,
    launchArgs: config.launchArgs ?? [],
    stealth: config.stealth ?? true,
    prewarmPages: config.prewarmPages ?? true,
    allowPrivateNetwork: config.allowPrivateNetwork ?? true,
    maxConcurrentCaptures: config.maxConcurrentCaptures ?? 12,
    autoConcurrency: config.autoConcurrency ?? true,
    concurrencyPolicy: resolvePolicy({
      max: config.maxConcurrentCaptures ?? 12,
      ...config.concurrencyPolicy,
    }),
    budgetSampleIntervalMs: config.budgetSampleIntervalMs ?? 2_000,
    recycleAfterContexts: config.recycleAfterContexts ?? 150,
    maxBrowserAgeMs: config.maxBrowserAgeMs ?? 30 * 60_000,
    launchTimeoutMs: config.launchTimeoutMs ?? 30_000,
    healthTimeoutMs: config.healthTimeoutMs ?? 4_000,
    closeTimeoutMs: config.closeTimeoutMs ?? 3_000,
    retries: config.retries ?? 1,
    maxPageHeight: config.maxPageHeight ?? 24_000,
    maxScrollSteps: config.maxScrollSteps ?? 80,
    scrollSettleMs: config.scrollSettleMs ?? 400,
    idlePhaseMs: config.idlePhaseMs ?? 1_500,
    idleIntervalMs: config.idleIntervalMs ?? 120,
    idleWindowMs: config.idleWindowMs ?? 500,
    fontWaitMs: config.fontWaitMs ?? 1_500,
    contentWaitMs: config.contentWaitMs ?? 3_000,
    maxPinnedElements: config.maxPinnedElements ?? 120,
    artifactsMaxBytes: config.artifactsMaxBytes ?? 200_000,
    egressLookupUrl: config.egressLookupUrl ?? "https://ipapi.co/json/",
    logger: config.logger ?? noopLogger,
  };
}
