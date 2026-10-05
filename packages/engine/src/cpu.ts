import os from "node:os";

/**
 * Snapshot of host capacity. Sampled rather than cached so a burst of launches cannot
 * size the pool off a stale reading, and so tests can inject a deterministic sample.
 */
export interface CpuSample {
  parallelism: number;
  load1: number;
  freeMemoryMb: number;
  totalMemoryMb: number;
  sampledAt: number;
}

/**
 * Rules for turning a sample into a concurrency ceiling.
 *
 * `reservedCores` covers the OS, our own Node event loop, and the browser's own
 * bookkeeping threads — oversubscribing those is what turns a queue spike into
 * OOM-kills rather than slower throughput. `coresPerCapture` is fractional because a
 * single render is bursty: mostly waiting on I/O, briefly pegging one core.
 */
export interface ConcurrencyPolicy {
  min: number;
  max: number;
  reservedCores: number;
  coresPerCapture: number;
  memoryPerCaptureMb: number;
  memoryHeadroomMb: number;
  /**
   * Load ceiling as a fraction of parallelism. Past this we stop handing out new
   * slots so queued work waits for headroom instead of deepening the backlog.
   */
  throttleRatio: number;
}

/** Which resource capped the derived concurrency. Surfaced in health output. */
export type ConcurrencyConstraint = "cpu" | "memory" | "ceiling" | "floor";

export interface ConcurrencyBudget {
  /** Slots the pool may hand out right now, already clamped and degraded. */
  allowed: number;
  /** Slots the host could sustain at rest, before load-based degradation. */
  target: number;
  /** Hard ceiling from policy; never exceeded regardless of sample. */
  ceiling: number;
  /** Why `target` landed where it did. */
  constraint: ConcurrencyConstraint;
  throttled: boolean;
  sample: CpuSample;
}

const MB = 1024 * 1024;

export const DEFAULT_CONCURRENCY_POLICY: ConcurrencyPolicy = {
  min: 1,
  max: 12,
  reservedCores: 2,
  coresPerCapture: 1.5,
  memoryPerCaptureMb: 320,
  memoryHeadroomMb: 512,
  throttleRatio: 0.85,
};

export function sampleCpu(now = Date.now()): CpuSample {
  const cpus = os.cpus();
  const totalMemoryMb = Math.round(os.totalmem() / MB);
  // availableParallelism respects cgroup CPU quotas and CPU affinity masks, which
  // os.cpus().length does not — it matters on the container hosts we deploy to.
  const detected =
    typeof os.availableParallelism === "function" ? os.availableParallelism() : cpus.length;
  const parallelism = Math.max(1, detected);
  const [load1 = 0] = os.loadavg();
  return {
    parallelism,
    load1,
    freeMemoryMb: Math.round(os.freemem() / MB),
    totalMemoryMb,
    sampledAt: now,
  };
}

export function deriveConcurrency(
  policy: ConcurrencyPolicy,
  sample: CpuSample,
): ConcurrencyBudget {
  const ceiling = Math.max(policy.min, Math.floor(policy.max));
  const usableCores = Math.max(0, sample.parallelism - policy.reservedCores);
  const byCpu = Math.floor(usableCores / Math.max(0.25, policy.coresPerCapture));
  const byMemory = Math.floor(
    Math.max(0, sample.freeMemoryMb - policy.memoryHeadroomMb) /
      Math.max(1, policy.memoryPerCaptureMb),
  );

  const raw = Math.min(byCpu, byMemory);
  let constraint: ConcurrencyConstraint;
  if (raw >= ceiling) constraint = "ceiling";
  else if (raw <= policy.min) constraint = "floor";
  else if (byMemory < byCpu) constraint = "memory";
  else constraint = "cpu";

  const target = Math.min(ceiling, Math.max(policy.min, raw));

  const loadCeiling = Math.max(1, sample.parallelism * policy.throttleRatio);
  const throttled = sample.load1 > loadCeiling && target > policy.min;

  return {
    allowed: throttled ? policy.min : target,
    target,
    ceiling,
    constraint,
    throttled,
    sample,
  };
}

export function resolvePolicy(overrides: Partial<ConcurrencyPolicy> = {}): ConcurrencyPolicy {
  return { ...DEFAULT_CONCURRENCY_POLICY, ...overrides };
}
