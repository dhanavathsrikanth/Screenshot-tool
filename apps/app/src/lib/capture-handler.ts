import { randomUUID } from "node:crypto";
import { CAPTURE_MIME_TYPES, captureOptionsSchema, SnapforgeError } from "@snapforge/contracts";
import type { CaptureFormat } from "@snapforge/contracts";
import type { SnapforgeEngine } from "@snapforge/engine";
import { CaptureAdmissionError, type CaptureLease } from "@snapforge/queue";
import type { CaptureLogEntry, CaptureResult } from "./capture.js";

export const MAX_CAPTURE_REQUEST_BYTES = 256 * 1024;
const localCaptureOptionsSchema = captureOptionsSchema.extend({
  fail_if_incomplete: captureOptionsSchema.shape.fail_if_incomplete.removeDefault().default(true),
});

export interface CaptureHandlerDependencies {
  authenticate(): Promise<string | null>;
  acquire(accountId: string, requestId: string): Promise<CaptureLease>;
  getEngine(): Promise<Pick<SnapforgeEngine, "capture">>;
  prepare?(): Promise<void>;
  reserve(accountId: string, requestId: string): Promise<boolean>;
  settle(requestId: string, succeeded: boolean): Promise<void>;
  record(accountId: string, entry: CaptureLogEntry): Promise<void>;
}

async function readBody(request: Request, requestId: string): Promise<unknown> {
  const invalid = (message: string) => new SnapforgeError({ code: "invalid_request", message, requestId });
  if (Number(request.headers.get("content-length")) > MAX_CAPTURE_REQUEST_BYTES) {
    throw invalid("Capture request is too large");
  }
  if (!request.body) throw invalid("Request body must be valid JSON");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > MAX_CAPTURE_REQUEST_BYTES) {
        void reader.cancel().catch(() => undefined);
        throw invalid("Capture request is too large");
      }
      chunks.push(next.value);
    }
    return JSON.parse(Buffer.concat(chunks, bytes).toString("utf8"));
  } catch (error) {
    if (error instanceof SnapforgeError) throw error;
    throw invalid("Request body must be valid JSON");
  } finally {
    reader.releaseLock();
  }
}

function formatOf(format: string): CaptureFormat {
  return format === "jpeg" || format === "webp" || format === "pdf" ? format : "png";
}

export function createCaptureHandler(deps: CaptureHandlerDependencies) {
  return async function POST(request: Request): Promise<Response> {
    const id = randomUUID();
    const at = Date.now();
    const requestId = `req_${id}`;
    const headers = new Headers({ "x-request-id": requestId, "cache-control": "no-store" });
    const timings: Record<string, number> = {};
    let response: Response | undefined;
    const measure = async <T>(name: string, action: () => Promise<T>): Promise<T> => {
      const started = performance.now();
      try { return await action(); } finally { timings[name] = performance.now() - started; }
    };
    let accountId: string | null = null;
    let admission: CaptureLease | undefined;
    let reserved = false;
    let delivered = false;
    let url = "(missing url)";
    let format: CaptureFormat = "webp";
    try {
      accountId = await measure("auth", () => deps.authenticate());
      if (!accountId) return response = Response.json({ error: "unauthorized" }, { status: 401, headers });
      admission = await measure("admission", () => deps.acquire(accountId!, requestId));
      const parsed = localCaptureOptionsSchema.safeParse(await readBody(request, requestId));
      if (!parsed.success) throw new SnapforgeError({
        code: "invalid_request",
        message: "Capture options are invalid",
        requestId,
      });
      url = parsed.data.url;
      format = parsed.data.format;
      const preparing = deps.prepare ? measure("warmup", () => deps.prepare!()).catch(() => undefined) : undefined;
      reserved = await measure("reservation", () => deps.reserve(accountId!, requestId));
      if (!reserved) throw new SnapforgeError({
        code: "quota_exceeded",
        message: "Monthly free captures and prepaid credits are exhausted",
        requestId,
      });
      await preparing;
      const engine = await measure("engine", () => deps.getEngine());
      const { data, buffer } = await measure("render", () => engine.capture(parsed.data));
      if (buffer.length === 0) throw new SnapforgeError({
        code: "render_incomplete",
        message: "Capture did not produce a downloadable artifact",
        requestId,
      });
      format = formatOf(data.format);
      const metrics = {
        url: data.url,
        final_url: data.final_url,
        format,
        width: data.width,
        height: data.height,
        bytes: data.bytes,
        duration_ms: data.duration_ms,
        blocked_requests: data.blocked_requests,
        cached: data.cached,
        render_diagnostics: data.render_diagnostics,
      };
      response = Response.json({
        ok: true,
        metrics,
        image: `data:${CAPTURE_MIME_TYPES[format]};base64,${buffer.toString("base64")}`,
        id,
        at,
      } satisfies CaptureResult, { headers });
      await measure("settlement", () => deps.settle(requestId, true));
      delivered = true;
      await measure("history", () => deps.record(accountId!, {
        id, at, ok: true, cached: data.cached, url: data.url, format,
        width: data.width, height: data.height, bytes: data.bytes,
        duration_ms: data.duration_ms, blocked_requests: data.blocked_requests,
        code: null, message: null, request_id: requestId,
      })).catch(() => { console.warn("Capture history write failed", { requestId }); });
      return response;
    } catch (error) {
      const failure = error instanceof SnapforgeError
        ? { ...error.toEnvelope(), request_id: requestId }
        : { code: "internal_error", message: "Capture temporarily unavailable", retriable: true, request_id: requestId };
      if (reserved && !delivered) {
        await deps.settle(requestId, false).catch(() => { console.warn("Capture reservation release failed", { requestId }); });
      }
      if (reserved && accountId) {
        await deps.record(accountId, {
          id, at, ok: false, url, format, width: null, height: null, bytes: 0,
          duration_ms: Date.now() - at, blocked_requests: 0, code: failure.code,
          message: failure.message, request_id: requestId,
        }).catch(() => { console.warn("Capture failure history write failed", { requestId }); });
      }
      const status = error instanceof CaptureAdmissionError ? error.httpStatus
        : error instanceof SnapforgeError ? error.statusCode : 502;
      if (error instanceof CaptureAdmissionError) headers.set("retry-after", String(error.retryAfterSeconds));
      return response = Response.json({ ok: false, error: failure, id, at } satisfies CaptureResult, { status, headers });
    } finally {
      await measure("release", async () => { await admission?.release(); }).catch(() => { console.warn("Capture admission release failed", { requestId }); });
      response?.headers.set("server-timing", [...Object.entries(timings), ["total", Date.now() - at]].map(([name, duration]) => `${name};dur=${Number(duration).toFixed(1)}`).join(", "));
    }
  };
}
