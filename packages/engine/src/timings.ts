export const CAPTURE_PHASES = [
  "network_policy", "cache_lookup", "pool_wait", "browser_start", "context_setup", "init_scripts", "request_filters", "page_setup", "egress",
  "navigation", "load_settle", "challenge_check", "dom_tweaks", "pre_capture",
  "growth_wait", "scroll", "post_scroll", "quality_check", "page_metrics", "screenshot",
  "inspection", "failure_artifacts", "cleanup", "browser_recycle", "cache_save",
] as const;

export type CapturePhase = typeof CAPTURE_PHASES[number];

export interface CaptureTimings {
  total_ms: number;
  phases_ms: Partial<Record<CapturePhase, number>>;
}

export class CaptureTimer {
  private readonly started: number;
  private readonly phases: Partial<Record<CapturePhase, number>> = {};

  constructor(private readonly now: () => number = () => performance.now()) {
    this.started = now();
  }

  async measure<T>(phase: CapturePhase, operation: () => Promise<T>): Promise<T> {
    const start = this.now();
    try {
      return await operation();
    } finally {
      this.phases[phase] = (this.phases[phase] ?? 0) + this.now() - start;
    }
  }

  snapshot(): CaptureTimings {
    return {
      total_ms: Math.round(this.now() - this.started),
      phases_ms: Object.fromEntries(
        Object.entries(this.phases).map(([phase, ms]) => [phase, Math.round(ms)]),
      ),
    };
  }
}
