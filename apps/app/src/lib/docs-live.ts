import type { DocPage, DocSection } from "./docs-content.js";
import operationInfo from "./docs-operations.json";

export type DocOperation = keyof typeof operationInfo;
export const DOC_OPERATIONS = Object.keys(operationInfo) as readonly DocOperation[];
export interface DocLiveExample {
  operation: DocOperation;
  title: string;
  body?: Record<string, unknown>;
}
export interface DocInvocation {
  operation: DocOperation;
  authentication: "console" | "api-key";
  body?: Record<string, unknown>;
  handle?: string;
  idempotencyKey?: string;
  ifMatch?: string;
}
export interface DocResponse {
  operation: DocOperation;
  status: number;
  elapsed: number;
  headers: Record<string, string>;
  body: unknown;
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function pendingDocJob(body: unknown): string | null {
  const root = object(body);
  const data = object(root?.data);
  if (root?.ok !== true) return null;
  if (typeof data?.job_id === "string") return data.job_id;
  return root.pending === true && typeof root.job_id === "string" ? root.job_id : null;
}

export function waitForDocPoll(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, milliseconds);
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    signal.addEventListener("abort", abort, { once: true });
  });
}

export async function runDocInvocation(input: DocInvocation, apiKey: string, options: {
  signal: AbortSignal;
  follow: boolean;
  onResponse(response: DocResponse): void;
  onStarted?(elapsed: number): void;
  fetchImpl?: typeof fetch;
  sleep?: typeof waitForDocPoll;
}): Promise<void> {
  const send = async (invocation: DocInvocation): Promise<DocResponse> => {
    options.signal.throwIfAborted();
    const started = performance.now();
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (invocation.operation === "capture" && invocation.authentication === "console") headers.accept = "application/x-ndjson";
    if (invocation.authentication === "api-key" && apiKey) headers.authorization = `Bearer ${apiKey}`;
    const response = await (options.fetchImpl ?? fetch)("/api/docs/execute", { method: "POST", headers, body: JSON.stringify(invocation), signal: options.signal, cache: "no-store" });
    if (response.headers.get("content-type")?.startsWith("application/x-ndjson") && response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let pending = "";
      let result: DocResponse | undefined;
      try {
        while (true) {
          const next = await reader.read();
          pending += decoder.decode(next.value, { stream: !next.done });
          let end: number;
          while ((end = pending.indexOf("\n")) !== -1) {
            const line = pending.slice(0, end); pending = pending.slice(end + 1);
            if (!line.trim()) continue;
            const event = object(JSON.parse(line));
            if (event?.type === "started") options.onStarted?.(Math.round(performance.now() - started));
            if (event?.type === "response") {
              if (!Number.isInteger(event.status) || Number(event.status) < 200 || Number(event.status) > 599) throw new Error("Invalid response status");
              result = { operation: invocation.operation, status: Number(event.status), elapsed: Math.round(performance.now() - started), body: event.body,
                headers: Object.fromEntries(Object.entries(object(event.headers) ?? {}).filter((entry): entry is [string, string] => typeof entry[1] === "string")) };
            }
          }
          if (next.done) break;
        }
        if (!result || pending.trim()) throw new Error("Capture response was interrupted");
        options.onResponse(result);
        return result;
      } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
    }
    const raw = await response.text();
    let body: unknown;
    try { body = JSON.parse(raw); } catch { body = raw; }
    const result: DocResponse = { operation: invocation.operation, status: response.status, elapsed: Math.round(performance.now() - started), body,
      headers: Object.fromEntries(["content-type", "x-request-id", "etag", "retry-after", "server-timing", "x-snapforge-interface"].flatMap((name) => { const value = response.headers.get(name); return value ? [[name, value]] : []; })) };
    options.onResponse(result);
    return result;
  };
  let response = await send(input);
  if (!options.follow || input.operation !== "capture" || response.status !== 202) return;
  const handle = pendingDocJob(response.body);
  if (!handle) return;
  const sleep = options.sleep ?? waitForDocPoll;
  while (true) {
    const seconds = Number(response.headers["retry-after"]) || 2;
    await sleep(Math.max(1, Math.min(seconds, 30)) * 1000, options.signal);
    response = await send({ operation: "job", authentication: input.authentication, handle });
    if (response.status === 429 || response.status === 503) continue;
    if (response.status < 200 || response.status >= 300) return;
    const data = object(object(response.body)?.data);
    if (!data || ["completed", "failed"].includes(String(data.state))) return;
  }
}

export const DOC_OPERATION_INFO = { ...operationInfo } as const;

export function docLiveExamples(page: DocPage, section: DocSection): DocLiveExample[] {
  if (section.id === "delivery-status" && page.slug === "api/webhooks") return [
    { operation: "webhook", title: "Inspect webhook delivery" },
    { operation: "redeliver", title: "Redeliver webhook" },
  ];
  if (section.id === "check-health") return [{ operation: "health", title: "Check service health" }];
  if (section.id === "bearer-key" || (page.slug === "api/jobs" && section.id === "poll")) return [{ operation: "job", title: "Look up a capture job" }];
  if (section.id === "lost-response") return [{ operation: "request", title: "Recover a capture request" }];
  for (const sample of section.code ?? []) {
    let candidate: unknown;
    try {
      if (sample.language === "json") candidate = JSON.parse(sample.code);
      else if (sample.label === "cURL") {
        const match = /-d '({[\s\S]*?})'/.exec(sample.code);
        if (match) candidate = JSON.parse(match[1]);
      }
    } catch { continue; }
    if (candidate && typeof candidate === "object" && !Array.isArray(candidate) && "url" in candidate && typeof candidate.url === "string") {
      const body = { ...candidate } as Record<string, unknown>;
      if (sample.code.includes("?mode=async")) body.sync = false;
      return [{ operation: "capture", title: page.slug === "mcp" ? "Try the element capture" : section.title, body }];
    }
  }
  return [];
}

export function responseCapture(body: unknown): { artifact: string; format: string; jobId?: string } | null {
  if (!body || typeof body !== "object") return null;
  const root = body as Record<string, unknown>;
  const data = root.data && typeof root.data === "object" ? root.data as Record<string, unknown> : root;
  const result = data.result && typeof data.result === "object" ? data.result as Record<string, unknown> : null;
  const capture = result?.data && typeof result.data === "object" ? result.data as Record<string, unknown> : data;
  if (root.ok === false || result?.ok === false) return null;
  const artifact = capture.cdn_url ?? root.artifact_url ?? root.image;
  const metrics = root.metrics as Record<string, unknown> | undefined;
  const format = String(capture.format ?? metrics?.format ?? "webp");
  if (typeof artifact !== "string" || !["png", "jpeg", "webp", "pdf"].includes(format)) return null;
  const inline = /^data:(image\/(png|jpeg|webp)|application\/pdf);base64,[A-Za-z0-9+/=]+$/.test(artifact);
  try {
    const url = new URL(artifact);
    if (!inline && (url.username || url.password || !["https:", "http:"].includes(url.protocol))) return null;
  } catch { return null; }
  return { artifact, format, jobId: typeof data.id === "string" ? data.id : undefined };
}

export function docResponseError(body: unknown): string | null {
  const root = object(body);
  const result = object(object(root?.data)?.result);
  const error = object(root?.ok === false ? root.error : result?.ok === false ? result.error : null);
  return typeof error?.message === "string" ? error.message : null;
}

export function printableDocResponse(body: unknown): string {
  return JSON.stringify(body, (_key, value: unknown) => typeof value === "string" && value.startsWith("data:") && value.length > 256 ? `${value.slice(0, value.indexOf(",") + 1)}[inline artifact; see preview]` : value, 2) ?? String(body);
}
