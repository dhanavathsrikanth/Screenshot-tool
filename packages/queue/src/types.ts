import { z } from "zod";
import {
  captureOptionsSchema,
  captureSuccessDataSchema,
  errorEnvelopeSchema,
} from "@snapforge/contracts";

export const CAPTURE_MODES = ["sync", "async"] as const;
export type CaptureMode = (typeof CAPTURE_MODES)[number];

export const JOB_STATES = [
  "waiting",
  "prioritized",
  "active",
  "completed",
  "failed",
  "delayed",
  "paused",
  "unknown",
] as const;

export type JobState = (typeof JOB_STATES)[number];

export const WEBHOOK_EVENTS = ["capture.completed", "capture.failed"] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export const webhookTargetSchema = z.object({
  url: z.string().url(),
  secret: z.string().min(8).optional(),
  event: z.enum(WEBHOOK_EVENTS).optional(),
});

export type WebhookTarget = z.infer<typeof webhookTargetSchema>;

/**
 * BullMQ persists payloads as JSON, so the job contract is schema-validated on
 * both ends: the producer validates before enqueueing and the worker validates
 * on read so a rolling deploy with a changed schema fails loudly instead of
 * rendering with undefined options.
 */
export const captureJobPayloadSchema = z.object({
  request_id: z.string().min(1),
  mode: z.enum(CAPTURE_MODES),
  options: captureOptionsSchema,
  webhook: webhookTargetSchema.optional(),
  enqueued_at: z.number().int().nonnegative(),
  attempt_budget: z.number().int().positive(),
  api_key_id: z.string().optional(),
  billing_account_id: z.string().min(1).optional(),
  reservation_id: z.string().min(1).optional(),
  last_error: errorEnvelopeSchema.optional(),
});

export type CaptureJobPayload = z.infer<typeof captureJobPayloadSchema>;

export const captureJobResultSchema = z.object({
  request_id: z.string().min(1),
  mode: z.enum(CAPTURE_MODES),
  ok: z.boolean(),
  data: captureSuccessDataSchema.optional(),
  error: errorEnvelopeSchema.optional(),
  duration_ms: z.number().nonnegative(),
  attempts_made: z.number().int().nonnegative(),
  enqueued_at: z.number().int().nonnegative(),
  completed_at: z.number().int().nonnegative(),
  worker_id: z.string().optional(),
});

export type CaptureJobResult = z.infer<typeof captureJobResultSchema>;

export interface JobSnapshot {
  id: string;
  state: JobState;
  mode: CaptureMode;
  request_id: string;
  progress: number | string | null;
  attempts_made: number;
  attempt_budget: number;
  enqueued_at: number;
  result?: CaptureJobResult;
  webhook: WebhookTarget | null;
}

export interface QueueDepth {
  waiting: number;
  active: number;
  prioritized: number;
  delayed: number;
  completed: number;
  failed: number;
  paused: boolean;
  total_pending: number;
}

export interface DispatchResult {
  job_id: string;
  mode: CaptureMode;
  /** True when the job finished inside the sync budget and `result` is present. */
  settled: boolean;
  state: JobState;
  result?: CaptureJobResult;
}

export const CAPTURE_JOB_NAME = "capture" as const;
export type CaptureJobName = typeof CAPTURE_JOB_NAME;
