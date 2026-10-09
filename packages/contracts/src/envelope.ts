import { z } from "zod";
import { errorEnvelopeSchema } from "./errors.js";

export const renderDiagnosticsSchema = z.object({
  version: z.number().int(),
  algorithm: z.enum(["by_sections", "native", "element"]),
  sections: z.number().int().nonnegative(),
  device_scale_factor: z.number().positive(),
  scroll_height: z.number().nonnegative(),
  stopped_reason: z.string(),
  truncated: z.boolean(),
});

export type RenderDiagnostics = z.infer<typeof renderDiagnosticsSchema>;

export const captureSuccessDataSchema = z.object({
  url: z.string(),
  final_url: z.string(),
  format: z.string(),
  width: z.number(),
  height: z.number(),
  bytes: z.number(),
  duration_ms: z.number(),
  cached: z.boolean().default(false),
  data_url: z.string().optional(),
  cdn_url: z.string().optional(),
  blocked_requests: z.number().default(0),
  region: z.string().optional(),
  egress_country: z.string().optional(),
  render_diagnostics: renderDiagnosticsSchema.optional(),
});

export type CaptureSuccessData = z.infer<typeof captureSuccessDataSchema>;

export const captureResponseEnvelopeSchema = z.object({
  ok: z.boolean(),
  request_id: z.string(),
  data: captureSuccessDataSchema.optional(),
  error: errorEnvelopeSchema.optional(),
});

export type CaptureResponseEnvelope = z.infer<typeof captureResponseEnvelopeSchema>;
