import { randomUUID } from "node:crypto";
import { ERROR_HTTP_STATUS, SnapforgeError } from "@snapforge/contracts";
import { CaptureAdmissionError, readCaptureRequest, type CaptureService, type JobSnapshot } from "@snapforge/queue";
import type { CaptureResult } from "./capture.js";

export interface QueuedCaptureDependencies {
  authenticate(): Promise<string | null>;
  getService(): Promise<Pick<CaptureService, "submit" | "lookup"> & Partial<Pick<CaptureService, "lookupRequest">>>;
}

export function dashboardCaptureResult(snapshot: JobSnapshot): CaptureResult {
  const id = snapshot.id;
  const at = snapshot.result?.completed_at ?? snapshot.enqueued_at;
  if ((snapshot.state === "completed" || snapshot.state === "failed") && snapshot.result) {
    const data = snapshot.result.data;
    if (snapshot.result.ok && data?.cdn_url) return { ok: true, id, at, metrics: {
      url: data.url, final_url: data.final_url, format: data.format as "png" | "jpeg" | "webp" | "pdf",
      width: data.width, height: data.height, bytes: data.bytes, duration_ms: data.duration_ms, blocked_requests: data.blocked_requests,
    }, image: data.cdn_url, artifact_url: data.cdn_url };
    return { ok: false, id, at, error: snapshot.result.error ?? {
      code: "render_incomplete", message: "Capture did not produce a downloadable artifact", retriable: true, request_id: snapshot.request_id,
    } };
  }
  return { ok: true, pending: true, id, at, job_id: id, state: snapshot.state,
    progress: snapshot.progress, poll_url: `/api/capture/jobs/${encodeURIComponent(id)}` };
}

export function createQueuedCaptureHandlers(deps: QueuedCaptureDependencies) {
  const handle = async (request: Request, jobId?: string, byKey = false): Promise<Response> => {
    const requestId = randomUUID();
    const headers = new Headers({ "cache-control": "no-store", "x-request-id": requestId });
    try {
      const accountId = await deps.authenticate();
      if (!accountId) return Response.json({ error: "unauthorized" }, { status: 401, headers });
      const service = await deps.getService();
      const identity = { accountId };
      const snapshot = jobId
        ? byKey && service.lookupRequest ? await service.lookupRequest(identity, jobId, requestId) : await service.lookup(identity, jobId, requestId)
        : await service.submit(identity, () => readCaptureRequest(request, requestId), requestId, "async", request.headers.get("idempotency-key") ?? undefined);
      const payload = dashboardCaptureResult(snapshot);
      const pending = payload.ok && "pending" in payload;
      return Response.json(payload, { status: pending ? 202 : payload.ok ? 200 : ERROR_HTTP_STATUS[snapshot.result?.error?.code ?? "render_incomplete"], headers });
    } catch (error) {
      if (error instanceof CaptureAdmissionError) headers.set("retry-after", String(error.retryAfterSeconds));
      return Response.json({ ok: false, id: requestId, at: Date.now(), error: error instanceof SnapforgeError
        ? { ...error.toEnvelope(), request_id: requestId }
        : { code: "internal_error", message: "Capture service temporarily unavailable", retriable: true, request_id: requestId } },
        { status: error instanceof CaptureAdmissionError ? error.httpStatus : error instanceof SnapforgeError ? error.statusCode : 503, headers });
    }
  };
  return { POST: (request: Request) => handle(request), GET: (request: Request, jobId: string) => handle(request, jobId),
    GET_REQUEST: (request: Request, key: string) => handle(request, key, true) };
}
