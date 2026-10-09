import { randomUUID } from "node:crypto";
import { captureRequestSchema, idempotencyKeySchema, SnapforgeError } from "@snapforge/contracts";
import { readCaptureRequest } from "@snapforge/queue";
import type { DocInvocation } from "./docs-live.js";
import operationInfo from "./docs-operations.json";

export interface DocsExecuteDependencies {
  authenticate(): Promise<string | null>;
  consoleExecute(input: DocInvocation, accountId: string, request: Request, requestId: string): Promise<Response>;
  gatewayBaseUrl?: string;
  fetchImpl?: typeof fetch;
}

export function parseDocInvocation(value: unknown, requestId: string): DocInvocation {
  const invalid = (message: string): never => { throw new SnapforgeError({ code: "invalid_request", message, requestId }); };
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid("Request must be an object");
  const input = value as Record<string, unknown>;
  if (typeof input.operation !== "string" || !Object.keys(operationInfo).includes(input.operation)) return invalid("Choose a documented operation");
  if (input.authentication !== "console" && input.authentication !== "api-key") return invalid("Choose console or API-key authentication");
  const operation = input.operation as DocInvocation["operation"];
  const parsed: DocInvocation = { operation, authentication: input.authentication };
  if (operationInfo[operation].handle) {
    if (typeof input.handle !== "string" || !/^[A-Za-z0-9._-]{1,128}$/.test(input.handle)) return invalid("Enter a valid job ID or idempotency key");
    parsed.handle = input.handle;
  }
  if (operation === "capture") {
    if (!captureRequestSchema.safeParse(input.body).success) return invalid("Capture options are invalid; check the parameter reference");
    parsed.body = input.body as Record<string, unknown>;
    if (input.idempotencyKey !== undefined && input.idempotencyKey !== "") {
      if (!idempotencyKeySchema.safeParse(input.idempotencyKey).success) return invalid("Idempotency key must contain 1–128 letters, digits, periods, underscores, or hyphens");
      parsed.idempotencyKey = input.idempotencyKey as string;
    }
  }
  if (operation === "redeliver") {
    if (typeof input.ifMatch !== "string" || !/^"\d{1,3}"$/.test(input.ifMatch)) return invalid('If-Match must be the quoted ETag from delivery status, such as "0"');
    parsed.ifMatch = input.ifMatch;
  }
  return parsed;
}

export function createDocsExecuteHandler(deps: DocsExecuteDependencies) {
  return async function POST(request: Request): Promise<Response> {
    const requestId = randomUUID();
    const headers = new Headers({ "cache-control": "no-store", "x-request-id": requestId });
    try {
      const origin = request.headers.get("origin");
      if (origin && origin !== new URL(request.url).origin) return Response.json({ ok: false, error: { code: "forbidden", message: "Send live requests from the documentation site" } }, { status: 403, headers });
      const input = parseDocInvocation(await readCaptureRequest(request, requestId), requestId);
      headers.set("x-snapforge-interface", input.authentication === "api-key" ? "rest-api" : "console");
      if (input.authentication === "console") {
        const accountId = await deps.authenticate();
        if (!accountId) return Response.json({ ok: false, error: { code: "unauthorized", message: "Sign in to run with your console account, or use an API key" } }, { status: 401, headers });
        if (input.operation === "capture" && request.headers.get("accept") === "application/x-ndjson") {
          let closed = false;
          const encoder = new TextEncoder();
          const stream = new ReadableStream<Uint8Array>({
            start(controller) {
              const emit = (value: unknown) => { if (!closed) controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`)); };
              emit({ type: "started" });
              void Promise.resolve().then(() => deps.consoleExecute(input, accountId, request, requestId)).then(async (response) => {
                const raw = await response.text();
                let body: unknown;
                try { body = JSON.parse(raw); } catch { body = raw; }
                emit({ type: "response", status: response.status, headers: { ...Object.fromEntries(["content-type", "x-request-id", "etag", "retry-after", "server-timing"].flatMap((name) => {
                  const value = response.headers.get(name); return value ? [[name, value]] : [];
                })), "x-snapforge-interface": "console" }, body });
              }).catch((error: unknown) => {
                const known = error instanceof SnapforgeError;
                emit({ type: "response", status: known ? error.statusCode : 503, headers: { "x-request-id": requestId, "x-snapforge-interface": "console" }, body: { ok: false,
                  error: known ? error.toEnvelope() : { code: "internal_error", message: "Capture temporarily unavailable", retriable: true } } });
              }).finally(() => { if (!closed) { closed = true; controller.close(); } });
            },
            cancel() { closed = true; },
          });
          headers.set("content-type", "application/x-ndjson");
          headers.set("x-content-type-options", "nosniff");
          headers.set("x-accel-buffering", "no");
          return new Response(stream, { headers });
        }
        const response = await deps.consoleExecute(input, accountId, request, requestId);
        const resultHeaders = new Headers(response.headers);
        resultHeaders.set("cache-control", "no-store");
        if (!resultHeaders.has("x-request-id")) resultHeaders.set("x-request-id", requestId);
        resultHeaders.set("x-snapforge-interface", "console");
        return new Response(response.body, { status: response.status, headers: resultHeaders });
      }
      const authorization = request.headers.get("authorization") ?? "";
      if (input.operation !== "health" && !/^Bearer sf_live_[A-Za-z0-9_-]{20,}$/.test(authorization)) {
        return Response.json({ ok: false, error: { code: "unauthorized", message: "Enter a valid sf_live_ API key" } }, { status: 401, headers });
      }
      const configured = deps.gatewayBaseUrl?.trim();
      if (!configured) return Response.json({ ok: false, error: { code: "internal_error", message: "API-key testing requires a configured SNAPFORGE_API_URL. Use your console session to try captures here.", retriable: false } }, { status: 503, headers });
      const base = new URL(configured);
      if (!["https:", "http:"].includes(base.protocol) || base.username || base.password || base.search || base.hash) throw new Error("Invalid gateway configuration");
      const endpoint = operationInfo[input.operation].endpoint.replace("{id}", encodeURIComponent(input.handle ?? "")).replace("{key}", encodeURIComponent(input.handle ?? ""));
      const target = new URL(endpoint, base);
      const outgoing = new Headers({ "content-type": "application/json", "x-request-id": requestId });
      if (input.operation !== "health") outgoing.set("authorization", authorization);
      if (input.idempotencyKey) outgoing.set("idempotency-key", input.idempotencyKey);
      if (input.ifMatch) outgoing.set("if-match", input.ifMatch);
      const response = await (deps.fetchImpl ?? fetch)(target, { method: operationInfo[input.operation].method, headers: outgoing,
        body: input.operation === "capture" ? JSON.stringify(input.body) : undefined, redirect: "manual", cache: "no-store", signal: AbortSignal.any([request.signal, AbortSignal.timeout(120000)]) });
      for (const name of ["content-type", "x-request-id", "etag", "retry-after"]) {
        const value = response.headers.get(name);
        if (value) headers.set(name, value);
      }
      headers.set("x-snapforge-interface", "rest-api");
      return new Response(response.body, { status: response.status, headers });
    } catch (error) {
      const known = error instanceof SnapforgeError;
      return Response.json({ ok: false, request_id: requestId, error: known ? error.toEnvelope() : { code: "internal_error", message: "Live request could not reach the capture service. Check service health before retrying.", retriable: true } }, { status: known ? error.statusCode : 503, headers });
    }
  };
}
