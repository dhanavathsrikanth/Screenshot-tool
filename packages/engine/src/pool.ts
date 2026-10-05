import { SnapforgeError } from "@snapforge/contracts";
import { BrowserManager } from "./browser.js";
import {
  deriveConcurrency,
  sampleCpu,
  type ConcurrencyConstraint,
  type ConcurrencyPolicy,
  type ConcurrencyBudget,
} from "./cpu.js";
import type { ResolvedEngineConfig } from "./types.js";

export type SlotState = "idle" | "busy" | "recycling";

export interface SlotHealth {
  id: number;
  state: SlotState;
  connected: boolean | null;
  contexts_served: number;
  restarts: number;
  age_ms: number | null;
  /** Set when the slot was recycled rather than returned cleanly. */
  last_fault: string | null;
}

export interface PoolHealth {
  size: number;
  busy: number;
  idle: number;
  recycling: number;
  restarts: number;
  /** Callers waiting for a slot, which is the backpressure signal to watch. */
  queued: number;
  slots: SlotHealth[];
}

export interface PoolBudget {
  allowed: number;
  target: number;
  ceiling: number;
  throttled: boolean;
  constraint: ConcurrencyConstraint;
  parallelism: number;
  /** Short-term load average; 0 when sampling is disabled. */
  load1: number;
  free_memory_mb: number;
}

/** One browser process and its lease bookkeeping. Slots share nothing, so recycling a
 * slot cannot close a browser a neighbour is actively driving.
 */
export class BrowserSlot {
  readonly manager: BrowserManager;
  state: SlotState = "idle";
  lastFault: string | null = null;

  constructor(
    readonly id: number,
    config: ResolvedEngineConfig,
  ) {
    this.manager = new BrowserManager(config);
  }

  get leased(): boolean {
    return this.state !== "idle";
  }

  /** Launches or reuses this slot's own browser, independent of sibling slots. */
  ensureBrowser(countContext = true) {
    return this.manager.ensureBrowser(countContext);
  }

  get health(): SlotHealth {
    const browser = this.manager.health;
    return {
      id: this.id,
      state: this.state,
      connected: browser?.connected ?? null,
      contexts_served: browser?.contexts_served ?? 0,
      restarts: this.manager.restartCount,
      age_ms: browser?.age_ms ?? null,
      last_fault: this.lastFault,
    };
  }
}

interface Waiter {
  requestId: string;
  resolve: (slot: BrowserSlot) => void;
  reject: (error: SnapforgeError) => void;
}

/**
 * Fixed pool of independent browser slots, sized from host CPU rather than config.
 *
 * Under sustained load the ceiling collapses to `min` so queued work waits for
 * headroom instead of stacking more renderers onto a saturated box. Surplus slots stay
 * warm rather than being torn down, so a load drop costs nothing.
 */
export class BrowserPool {
  private readonly slots: BrowserSlot[];
  private waiters: Waiter[] = [];
  private budget: PoolBudget;
  private lastSampleAt = 0;
  private destroyed = false;

  constructor(
    private readonly config: ResolvedEngineConfig,
    private readonly policy: ConcurrencyPolicy,
  ) {
    const initial = this.sampleBudget();
    const size = Math.max(1, initial.target);
    this.slots = Array.from({ length: size }, (_, id) => new BrowserSlot(id, config));
    this.budget = this.toBudget(initial);
    this.lastSampleAt = initial.sample.sampledAt;
  }

  get size(): number {
    return this.slots.length;
  }

  get inFlight(): number {
    return this.slots.filter((slot) => slot.leased).length;
  }

  get queued(): number {
    return this.waiters.length;
  }

  /** Slot lookup for the caller that leased it, so retries reuse the same browser. */
  slot(id: number): BrowserSlot {
    const found = this.slots[id];
    if (!found) {
      throw new SnapforgeError({
        code: "internal_error",
        message: `Unknown browser slot ${id}`,
        requestId: "engine",
      });
    }
    return found;
  }

  private toBudget(derived: ReturnType<typeof deriveConcurrency>): PoolBudget {
    return {
      allowed: Math.max(1, Math.min(derived.allowed, this.slots.length)),
      target: derived.target,
      ceiling: derived.ceiling,
      throttled: derived.throttled,
      constraint: derived.constraint,
      parallelism: derived.sample.parallelism,
      load1: Math.round(derived.sample.load1 * 100) / 100,
      free_memory_mb: derived.sample.freeMemoryMb,
    };
  }

  private sampleBudget(): ConcurrencyBudget {
    const sample = sampleCpu();
    if (this.config.autoConcurrency) return deriveConcurrency(this.policy, sample);
    const slots = Math.max(1, Math.floor(this.config.maxConcurrentCaptures));
    return {
      allowed: slots,
      target: slots,
      ceiling: slots,
      throttled: false,
      constraint: "ceiling",
      sample,
    };
  }

  /**
   * Re-samples on an interval rather than per capture: `os.loadavg` is a decayed
   * average, so polling it per request produces noise rather than signal.
   */
  private budgetFor(force = false): PoolBudget {
    if (force || Date.now() - this.lastSampleAt >= this.config.budgetSampleIntervalMs) {
      this.budget = this.toBudget(this.sampleBudget());
      this.lastSampleAt = Date.now();
    }
    return this.budget;
  }

  /**
   * Slots the budget currently permits to newly lease.
   *
   * `allowed` caps how many slots may be leased *at once*, so the grantable count is
   * the headroom left after existing leases — not a slice of slot ids, which would let
   * concurrency drift past the ceiling as low-numbered slots happened to fill up.
   */
  private permittedIdle(budget: PoolBudget): BrowserSlot[] {
    const leased = this.slots.filter((slot) => slot.leased).length;
    const grantable = Math.max(0, budget.allowed - leased);
    return this.slots.filter((slot) => !slot.leased).slice(0, grantable);
  }

  async acquire(requestId: string): Promise<BrowserSlot> {
    if (this.destroyed) {
      throw new SnapforgeError({
        code: "internal_error",
        message: "Browser pool is closed",
        requestId,
      });
    }

    const budget = this.budgetFor();
    const available = this.permittedIdle(budget);
    const slot = available[0];
    if (slot) {
      slot.state = "busy";
      return slot;
    }

    return new Promise<BrowserSlot>((resolve, reject) => {
      this.waiters.push({ requestId, resolve, reject });
    });
  }

  release(slot: BrowserSlot): void {
    if (slot.state === "busy") slot.state = "idle";
    this.pump();
  }

  async warm(prepare: (slot: BrowserSlot) => Promise<void>): Promise<void> {
    if (this.destroyed) throw new Error("Browser pool is closed");
    const available = this.permittedIdle(this.budgetFor());
    for (const slot of available) slot.state = "busy";
    const results = await Promise.allSettled(available.map(async (slot) => {
      try {
        await prepare(slot);
      } finally {
        this.release(slot);
      }
    }));
    for (const result of results) {
      if (result.status === "rejected") throw result.reason;
    }
  }

  /**
   * Restarts one slot after a crash. Only this slot's browser is closed, so captures
   * running on sibling slots are untouched.
   */
  async recycle(slot: BrowserSlot, fault: string): Promise<void> {
    slot.lastFault = fault;
    slot.state = "recycling";
    this.config.logger("warn", "recycling browser slot", {
      slot: slot.id,
      fault,
      busy: this.inFlight,
      queued: this.waiters.length,
    });
    try {
      await slot.manager.recycle();
    } finally {
      slot.state = "idle";
    }
    this.pump();
  }

  /** Hands free permitted slots to queued callers, oldest waiter first. */
  private pump(): void {
    if (this.destroyed) return;
    const budget = this.budgetFor();
    const available = this.permittedIdle(budget);
    while (available.length > 0 && this.waiters.length > 0) {
      const slot = available.shift() as BrowserSlot;
      const waiter = this.waiters.shift() as Waiter;
      slot.state = "busy";
      waiter.resolve(slot);
    }
  }

  /** Fails every queued caller. Used on shutdown, where waiting can never resolve. */
  private drainWaiters(reason: string): void {
    const pending = this.waiters;
    this.waiters = [];
    for (const waiter of pending) {
      waiter.reject(
        new SnapforgeError({
          code: "internal_error",
          message: reason,
          requestId: waiter.requestId,
        }),
      );
    }
  }

  get budgetSnapshot(): PoolBudget {
    return { ...this.budgetFor() };
  }

  get health(): PoolHealth {
    const slots = this.slots.map((slot) => slot.health);
    return {
      size: this.slots.length,
      busy: slots.filter((slot) => slot.state !== "idle").length,
      idle: slots.filter((slot) => slot.state === "idle").length,
      recycling: slots.filter((slot) => slot.state === "recycling").length,
      restarts: slots.reduce((total, slot) => total + slot.restarts, 0),
      queued: this.waiters.length,
      slots,
    };
  }

  async destroy(): Promise<void> {
    this.destroyed = true;
    this.drainWaiters("Browser pool closed");
    await Promise.all(this.slots.map((slot) => slot.manager.destroy()));
  }
}
