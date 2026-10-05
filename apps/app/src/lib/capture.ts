import type { CaptureFormat } from "@snapforge/contracts";

export interface CaptureMetrics {
  url: string;
  final_url: string;
  format: CaptureFormat;
  width: number;
  height: number;
  bytes: number;
  duration_ms: number;
  blocked_requests: number;
}

export interface CaptureFailure {
  code: string;
  message: string;
  retriable: boolean;
  request_id: string;
  details?: Record<string, unknown>;
}

export type CaptureResult =
  | { ok: true; pending?: false; metrics: CaptureMetrics; image: string; artifact_url?: string; id: string; at: number }
  | { ok: true; pending: true; job_id: string; state: string; progress: number | string | null; poll_url: string; id: string; at: number }
  | { ok: false; pending?: false; error: CaptureFailure; id: string; at: number };

export interface CaptureLogEntry {
  id: string;
  at: number;
  ok: boolean;
  cached?: boolean;
  url: string;
  format: CaptureFormat;
  width: number | null;
  height: number | null;
  bytes: number;
  duration_ms: number;
  blocked_requests: number;
  code: string | null;
  message: string | null;
  request_id: string;
}

export interface EngineHealthPayload {
  ok: boolean;
  in_flight: number;
  concurrency: number;
  /** Ceiling the host could sustain at rest, ignoring current load. */
  concurrency_target: number;
  browser: {
    connected: boolean;
    age_ms: number;
    contexts_served: number;
    restarts: number;
  } | null;
  pool: {
    size: number;
    busy: number;
    idle: number;
    recycling: number;
    restarts: number;
    queued: number;
    budget: {
      target: number;
      allowed: number;
      ceiling: number;
      throttled: boolean;
      constraint: string;
      parallelism: number;
      load1: number;
      free_memory_mb: number;
    };
  } | null;
  cache: {
    hits: number;
    misses: number;
    writes: number;
    hit_rate: number;
  } | null;
}

export { CAPTURE_MIME_TYPES as MIME_BY_FORMAT } from "@snapforge/contracts";
