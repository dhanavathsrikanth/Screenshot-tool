import { CAPTURE_FORMATS, captureSuccessDataSchema } from "@snapforge/contracts";
import type { CaptureSuccessData } from "@snapforge/contracts";
import type { JobSnapshot } from "./types.js";

export function artifactData(input: unknown): CaptureSuccessData | null {
  const parsed = captureSuccessDataSchema.safeParse(input);
  if (!parsed.success || !CAPTURE_FORMATS.some((format) => format === parsed.data.format) || parsed.data.bytes <= 0 || parsed.data.width <= 0 || parsed.data.height <= 0 || !parsed.data.cdn_url) return null;
  try {
    const url = new URL(parsed.data.cdn_url);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
  } catch { return null; }
  const data = { ...parsed.data };
  delete data.data_url;
  return data;
}

export function terminalOutcome(snapshot: JobSnapshot): JobSnapshot | null {
  if (snapshot.state !== "completed" && snapshot.state !== "failed") return null;
  const data = snapshot.state === "completed" && snapshot.result?.ok ? artifactData(snapshot.result.data) : null;
  const succeeded = data !== null;
  return {
    ...snapshot,
    state: succeeded ? "completed" : "failed",
    webhook: snapshot.webhook ? { url: snapshot.webhook.url, event: snapshot.webhook.event } : null,
    result: {
      request_id: snapshot.request_id, mode: snapshot.mode, ok: succeeded,
      ...(succeeded ? { data } : { error: snapshot.result?.error ?? {
        code: "render_incomplete", message: "Capture did not produce a downloadable artifact", retriable: true, request_id: snapshot.request_id,
      } }),
      duration_ms: snapshot.result?.duration_ms ?? Math.max(0, Date.now() - snapshot.enqueued_at),
      attempts_made: snapshot.attempts_made, enqueued_at: snapshot.enqueued_at,
      completed_at: snapshot.result?.completed_at ?? Date.now(),
    },
  };
}
