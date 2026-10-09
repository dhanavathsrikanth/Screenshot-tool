import assert from "node:assert/strict";
import test from "node:test";
import { createDocsExecuteHandler, parseDocInvocation } from "./docs-execute.js";
import { DOC_PAGES } from "./docs-content.js";
import { docLiveExamples, docResponseError, responseCapture, runDocInvocation, type DocResponse } from "./docs-live.js";

function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost:3000/api/docs/execute", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
}

test("all runnable capture examples and six HTTP operations are discoverable", () => {
  const examples = DOC_PAGES.flatMap((page) => page.sections.flatMap((section) => docLiveExamples(page, section)));
  assert.deepEqual([...new Set(examples.map((entry) => entry.operation))].sort(), ["capture", "health", "job", "redeliver", "request", "webhook"]);
  assert.ok(examples.filter((entry) => entry.operation === "capture").length >= 15);
  for (const example of examples.filter((entry) => entry.operation === "capture")) assert.doesNotThrow(() => parseDocInvocation({ ...example, authentication: "console" }, "test"));
});

test("capture errors remain visible with response details collapsed", () => {
  assert.equal(docResponseError({ ok: false, error: { message: "Capture unavailable" } }), "Capture unavailable");
  assert.equal(docResponseError({ ok: true, data: { result: { ok: false, error: { message: "Target timed out" } } } }), "Target timed out");
  assert.equal(docResponseError({ ok: true, data: {} }), null);
});

test("console streaming starts before rendering completes and preserves the final failure status", async () => {
  let finish: (response: Response) => void = () => {};
  const rendering = new Promise<Response>((resolve) => { finish = resolve; });
  const handler = createDocsExecuteHandler({ authenticate: async () => "account-a", consoleExecute: async () => rendering });
  const response = await handler(request({ operation: "capture", authentication: "console", body: { url: "https://example.com" } }, { accept: "application/x-ndjson" }));
  assert.equal(response.headers.get("content-type"), "application/x-ndjson");
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  assert.deepEqual(JSON.parse(decoder.decode((await reader.read()).value)), { type: "started" });
  finish(Response.json({ ok: false, error: { message: "Target timed out" } }, { status: 504, headers: { "server-timing": "render;dur=123", "x-request-id": "original-request" } }));
  const result = JSON.parse(decoder.decode((await reader.read()).value));
  assert.equal(result.status, 504);
  assert.equal(result.headers["server-timing"], "render;dur=123");
  assert.equal(result.headers["x-request-id"], "original-request");
  assert.equal(result.body.error.message, "Target timed out");
  assert.equal((await reader.read()).done, true);
});

test("stream cancellation still lets the original capture settle and unauthenticated callers never start", async () => {
  let executed = 0;
  const handler = createDocsExecuteHandler({ authenticate: async () => "account-a", consoleExecute: async () => { executed++; return Response.json({ ok: true }); } });
  const payload = { operation: "capture", authentication: "console", body: { url: "https://example.com" } };
  const response = await handler(request(payload, { accept: "application/x-ndjson" }));
  await response.body!.cancel();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(executed, 1);
  const anonymous = createDocsExecuteHandler({ authenticate: async () => null, consoleExecute: async () => { throw new Error("must not run"); } });
  assert.equal((await anonymous(request(payload, { accept: "application/x-ndjson" }))).status, 401);
});

test("client separates streamed start timing from final output and handles split records", async () => {
  const encoder = new TextEncoder();
  let startCount = 0;
  const responses: DocResponse[] = [];
  const raw = `${JSON.stringify({ type: "started" })}\n${JSON.stringify({ type: "response", status: 200, headers: { "server-timing": "render;dur=90" }, body: { ok: true } })}\n`;
  await runDocInvocation({ operation: "capture", authentication: "console", body: { url: "https://example.com" } }, "", {
    signal: new AbortController().signal, follow: false, onStarted: () => { startCount++; }, onResponse: (response) => responses.push(response),
    fetchImpl: async (_url, init) => {
      assert.equal(new Headers(init?.headers).get("accept"), "application/x-ndjson");
      return new Response(new ReadableStream({ start(controller) {
        for (let index = 0; index < raw.length; index += 7) controller.enqueue(encoder.encode(raw.slice(index, index + 7)));
        controller.close();
      } }), { headers: { "content-type": "application/x-ndjson" } });
    },
  });
  assert.equal(startCount, 1);
  assert.equal(responses.length, 1);
  assert.equal(responses[0].status, 200);
  assert.equal(responses[0].headers["server-timing"], "render;dur=90");
});

test("console execution requires an authenticated account and rejects foreign origins", async () => {
  let called = false;
  const handler = createDocsExecuteHandler({ authenticate: async () => null, consoleExecute: async () => { called = true; return Response.json({ ok: true }); } });
  const payload = { operation: "capture", authentication: "console", body: { url: "https://example.com" } };
  assert.equal((await handler(request(payload))).status, 401);
  assert.equal((await handler(request(payload, { origin: "https://attacker.example" }))).status, 403);
  assert.equal(called, false);
});

test("authenticated console calls preserve ownership and response headers", async () => {
  const handler = createDocsExecuteHandler({ authenticate: async () => "account-a", consoleExecute: async (input, account) => {
    assert.equal(account, "account-a"); assert.equal(input.handle, "job-a");
    return Response.json({ ok: true, data: { generation: 2 } }, { headers: { etag: '"2"' } });
  } });
  const response = await handler(request({ operation: "webhook", authentication: "console", handle: "job-a" }));
  assert.equal(response.status, 200); assert.equal(response.headers.get("etag"), '"2"'); assert.equal(response.headers.get("cache-control"), "no-store");
});

test("the API-key bridge fixes the destination and forwards only documented request data", async () => {
  let calls = 0;
  const handler = createDocsExecuteHandler({ authenticate: async () => null, consoleExecute: async () => { throw new Error("must not run"); }, gatewayBaseUrl: "https://gateway.example", fetchImpl: async (url, init) => {
    calls++; assert.equal(String(url), "https://gateway.example/v1/jobs/job-a/webhook/redeliver"); assert.equal(init?.method, "POST");
    assert.equal(init?.redirect, "manual"); const headers = new Headers(init?.headers);
    assert.equal(headers.get("if-match"), '"2"'); assert.ok(headers.get("authorization")?.startsWith("Bearer sf_live_")); assert.equal(headers.get("cookie"), null);
    return Response.json({ ok: true }, { status: 202, headers: { etag: '"3"', "set-cookie": "must-not-forward" } });
  } });
  const response = await handler(request({ operation: "redeliver", authentication: "api-key", handle: "job-a", ifMatch: '"2"', url: "https://attacker.example", headers: { cookie: "fake" } }, { authorization: "Bearer sf_live_abcdefghijklmnopqrstuvwx" }));
  assert.equal(calls, 1); assert.equal(response.status, 202); assert.equal(response.headers.get("set-cookie"), null); assert.equal(response.headers.get("x-snapforge-interface"), "rest-api");
});

test("invalid paths, ETags, capture bodies, and oversized envelopes fail before dispatch", async () => {
  let called = false;
  const handler = createDocsExecuteHandler({ authenticate: async () => "account-a", consoleExecute: async () => { called = true; return Response.json({ ok: true }); } });
  for (const input of [
    { operation: "unknown", authentication: "console" },
    { operation: "job", authentication: "console", handle: "../../private" },
    { operation: "redeliver", authentication: "console", handle: "job-a", ifMatch: "2" },
    { operation: "capture", authentication: "console", body: { url: "https://example.com", timeout: 999999 } },
    { operation: "capture", authentication: "console", body: { url: "https://example.com", custom_css: "x".repeat(270000) } },
  ]) assert.equal((await handler(request(input))).status, 400);
  assert.equal(called, false);
});

test("API-key requests cannot silently fall back to a signed-in console account", async () => {
  const handler = createDocsExecuteHandler({ authenticate: async () => "account-a", consoleExecute: async () => { throw new Error("must not run"); } });
  assert.equal((await handler(request({ operation: "job", authentication: "api-key", handle: "job-a" }))).status, 401);
  assert.equal((await handler(request({ operation: "job", authentication: "api-key", handle: "job-a" }, { authorization: "Bearer sf_live_abcdefghijklmnopqrstuvwx" }))).status, 503);
});

test("capture forwarding preserves the payload and original idempotency key", async () => {
  const body = { url: "https://example.com", format: "webp", full_page: true };
  const handler = createDocsExecuteHandler({ authenticate: async () => null, consoleExecute: async () => { throw new Error("must not run"); }, gatewayBaseUrl: "https://gateway.example", fetchImpl: async (url, init) => {
    assert.equal(String(url), "https://gateway.example/v1/screenshot");
    assert.equal(new Headers(init?.headers).get("idempotency-key"), "original-key");
    assert.deepEqual(JSON.parse(String(init?.body)), body);
    return Response.json({ ok: true, data: { job_id: "job-a" } }, { status: 202 });
  } });
  const response = await handler(request({ operation: "capture", authentication: "api-key", body, idempotencyKey: "original-key" }, { authorization: "Bearer sf_live_abcdefghijklmnopqrstuvwx" }));
  assert.equal(response.status, 202);
});

test("health checks need no API key and do not forward authorization to the public endpoint", async () => {
  const handler = createDocsExecuteHandler({ authenticate: async () => null, consoleExecute: async () => { throw new Error("must not run"); }, gatewayBaseUrl: "https://gateway.example", fetchImpl: async (url, init) => {
    assert.equal(String(url), "https://gateway.example/v1/health"); assert.equal(init?.method, "GET");
    assert.equal(new Headers(init?.headers).get("authorization"), null);
    return Response.json({ ok: true });
  } });
  assert.equal((await handler(request({ operation: "health", authentication: "api-key" }, { authorization: "must-not-forward" }))).status, 200);
});

test("automatic following sends one capture and polls the same job through transient read failures", async () => {
  const inputs: { operation: string; handle?: string }[] = [];
  const responses: DocResponse[] = [];
  const fixtures = [
    Response.json({ ok: true, data: { job_id: "job-a", state: "waiting" } }, { status: 202 }),
    Response.json({ ok: false }, { status: 503 }),
    Response.json({ ok: true, data: { id: "job-a", state: "active" } }),
    Response.json({ ok: true, data: { id: "job-a", state: "completed", result: { ok: true, data: { cdn_url: "https://cdn.example/a.png", format: "png" } } } }),
  ];
  await runDocInvocation({ operation: "capture", authentication: "api-key", body: { url: "https://example.com" }, idempotencyKey: "same-key" }, "sf_live_abcdefghijklmnopqrstuvwx", {
    signal: new AbortController().signal, follow: true, onResponse: (response) => responses.push(response), sleep: async () => {}, fetchImpl: async (_url, init) => { inputs.push(JSON.parse(String(init?.body))); return fixtures.shift()!; },
  });
  assert.deepEqual(inputs.map((input) => input.operation), ["capture", "job", "job", "job"]);
  assert.ok(inputs.slice(1).every((input) => input.handle === "job-a"));
  assert.equal(responses.length, 4); assert.equal(responseCapture(responses.at(-1)?.body)?.artifact, "https://cdn.example/a.png");
});

test("failed captures and unsafe artifact URLs cannot become previews", () => {
  assert.equal(responseCapture({ ok: false, image: "https://cdn.example/error.png" }), null);
  assert.equal(responseCapture({ ok: true, data: { format: "png", cdn_url: "javascript:alert(1)" } }), null);
  assert.equal(responseCapture({ ok: true, data: { format: "png", cdn_url: "https://user:pass@example.com/" } }), null);
  assert.equal(responseCapture({ ok: true, data: { result: { ok: false, data: { format: "png", cdn_url: "https://cdn.example/error.png" } } } }), null);
});

test("an uncertain capture submission is not automatically sent twice", async () => {
  let calls = 0;
  await assert.rejects(runDocInvocation({ operation: "capture", authentication: "console", body: { url: "https://example.com" }, idempotencyKey: "original" }, "", {
    signal: new AbortController().signal, follow: true, onResponse: () => {}, fetchImpl: async () => { calls++; throw new Error("response lost"); },
  }));
  assert.equal(calls, 1);
});
