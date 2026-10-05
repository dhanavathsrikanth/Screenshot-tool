import { z } from "zod";
import { captureOptionsSchema } from "./options.js";

export const captureWebhookSchema = z.object({
  url: z.string().url().max(2048).refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password && !url.hash && (!url.port || url.port === "443");
    } catch { return false; }
  }, "Webhook must use HTTPS on port 443 without URL credentials or a fragment"),
  secret: z.string().min(16).max(256),
});
export const captureRequestSchema = captureOptionsSchema.extend({ webhook: captureWebhookSchema.optional() });
export const idempotencyKeySchema = z.string().min(1).max(128).regex(/^[A-Za-z0-9._-]+$/);
export type CaptureWebhook = z.infer<typeof captureWebhookSchema>;
