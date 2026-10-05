import { z } from "zod";
import { errorEnvelopeSchema } from "./errors.js";

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
});

export type CaptureSuccessData = z.infer<typeof captureSuccessDataSchema>;

export const captureResponseEnvelopeSchema = z.object({
  ok: z.boolean(),
  request_id: z.string(),
  data: captureSuccessDataSchema.optional(),
  error: errorEnvelopeSchema.optional(),
});

export type CaptureResponseEnvelope = z.infer<typeof captureResponseEnvelopeSchema>;
