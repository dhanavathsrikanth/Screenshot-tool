import type { CaptureResult } from "./capture.js";

export const CAPTURE_JOB_SESSION_KEY = "snapforge:pending-capture";
export const CAPTURE_REQUEST_SESSION_KEY = "snapforge:pending-request";

export interface CaptureClientOptions {
  fetchImpl?: typeof fetch;
  local?: boolean;
  signal: AbortSignal;
  onProgress(result: CaptureResult): void;
  sleep?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
}

function wait(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const done = () => { signal.removeEventListener("abort", abort); resolve(); };
    const timer = setTimeout(done, milliseconds);
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    signal.addEventListener("abort", abort, { once: true });
  });
}

export async function followCapture(jobId: string, options: CaptureClientOptions, byKey = false): Promise<CaptureResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? wait;
  const url = `/api/capture/${byKey ? "requests" : "jobs"}/${encodeURIComponent(jobId)}`;
  while (true) {
    options.signal.throwIfAborted();
    let response: Response;
    try {
      response = await fetchImpl(url, { cache: "no-store", signal: options.signal });
    } catch {
      options.signal.throwIfAborted();
      await sleep(3000, options.signal);
      continue;
    }
    if (response.status === 429 || response.status === 503) {
      const seconds = Number(response.headers.get("retry-after")) || 3;
      await sleep(Math.min(30, Math.max(1, seconds)) * 1000, options.signal);
      continue;
    }
    const payload = await response.json() as CaptureResult;
    if (!payload || typeof payload.ok !== "boolean" || typeof payload.id !== "string") throw new Error("Capture status temporarily unavailable. Reload to check again.");
    options.onProgress(payload);
    if (!payload.pending) return payload;
    await sleep(payload.state === "active" ? 1000 : 2000, options.signal);
  }
}

export async function startCapture(input: unknown, key: string, options: CaptureClientOptions): Promise<CaptureResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? wait;
  const body = JSON.stringify(input);
  if (options.local) {
    const response = await fetchImpl("/api/capture", { method: "POST", headers: { "content-type": "application/json" },
      body, signal: options.signal });
    const payload = await response.json() as CaptureResult;
    if (!payload || typeof payload.ok !== "boolean" || typeof payload.id !== "string") throw new Error("Invalid capture response");
    return payload;
  }
  const signal = AbortSignal.any([options.signal, AbortSignal.timeout(20000)]);
  for (let attempt = 0; attempt < 3; attempt++) {
    signal.throwIfAborted();
    try {
      const response = await fetchImpl("/api/capture", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": key },
        body, signal });
      const payload = await response.json() as CaptureResult;
      if (!payload || typeof payload.ok !== "boolean" || typeof payload.id !== "string") throw new Error("Invalid capture response");
      if (!payload.ok && typeof payload.error.details?.job_id === "string") return payload;
      if (response.status !== 503 || attempt === 2) return payload;
    } catch (error) {
      options.signal.throwIfAborted();
      signal.throwIfAborted();
      if (attempt === 2) throw error;
    }
    await sleep(Math.min(3000, 1000 * 2 ** attempt), signal);
  }
  throw new Error("Reload to check the existing capture request");
}
