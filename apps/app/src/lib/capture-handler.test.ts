import test from "node:test";
import assert from "node:assert/strict";
import { SnapforgeError } from "@snapforge/contracts";
import type { CaptureOutcome } from "@snapforge/engine";
import { createCaptureHandler, MAX_CAPTURE_REQUEST_BYTES, type CaptureHandlerDependencies } from "./capture-handler.js";
import { CaptureAdmissionError, MemoryCaptureAdmission } from "./capture-admission.js";

const outcome: CaptureOutcome = {
  data: { url: "https://example.com/", final_url: "https://example.com/", format: "png", width: 1280,
    height: 720, bytes: 3, duration_ms: 100, blocked_requests: 0, cached: false },
  buffer: Buffer.from("png"),
};

function harness(overrides: Partial<CaptureHandlerDependencies> = {}) {
  const calls: Array<{ name: string; args: unknown[] }> = [];
  const track = (name: string, ...args: unknown[]) => { calls.push({ name, args }); };
  const deps: CaptureHandlerDependencies = {
    authenticate: async () => "authenticated-user",
    acquire: async (...args) => { track("acquire", ...args); return { release: async () => { track("release"); } }; },
    getEngine: async () => ({ capture: async (input) => { track("capture", input); return outcome; } }),
    reserve: async (...args) => { track("reserve", ...args); return true; },
    settle: async (...args) => { track("settle", ...args); },
    record: async (...args) => { track("record", ...args); },
    ...overrides,
  };
  return { calls, POST: createCaptureHandler(deps) };
}

function request(body: unknown = { url: "https://example.com" }): Request {
  return new Request("https://snapforge.test/api/capture", { method: "POST", body: JSON.stringify(body) });
}

test("unauthenticated captures never reach admission, credits, or rendering", async () => {
  const { POST, calls } = harness({ authenticate: async () => null });
  assert.equal((await POST(request())).status, 401);
  assert.deepEqual(calls, []);
});

for (const limited of [true, false]) test(`admission ${limited ? "limit" : "outage"} returns retry advice before body or billing`, async () => {
  const { POST, calls } = harness({ acquire: async (_, id) => { throw new CaptureAdmissionError(id, limited, 7); } });
  const response = await POST(new Request("https://snapforge.test", { method: "POST", body: "invalid JSON" }));
  assert.equal(response.status, limited ? 429 : 503);
  assert.equal(response.headers.get("retry-after"), "7");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal((await response.json()).error.request_id, response.headers.get("x-request-id"));
  assert.deepEqual(calls, []);
});

for (const body of ["invalid JSON", JSON.stringify({ url: "https://example.com", format: "bad" }), "x".repeat(MAX_CAPTURE_REQUEST_BYTES + 1)]) {
  test(`invalid input (${body.length} bytes) releases admission without reserving credits`, async () => {
    const { POST, calls } = harness();
    const response = await POST(new Request("https://snapforge.test", { method: "POST", body }));
    assert.equal(response.status, 400);
    assert.deepEqual(calls.map((call) => call.name), ["acquire", "release"]);
  });
}

test("declared oversized request is rejected without consuming its stream", async () => {
  const { POST, calls } = harness();
  const input = request();
  input.headers.set("content-length", String(MAX_CAPTURE_REQUEST_BYTES + 1));
  assert.equal((await POST(input)).status, 400);
  assert.equal(input.bodyUsed, false);
  assert.deepEqual(calls.map((call) => call.name), ["acquire", "release"]);
});

test("success uses authenticated identity, preserves options and output, and releases its lease", async () => {
  const { POST, calls } = harness();
  const response = await POST(request({ url: "https://example.com", accountId: "forged-user", min_capture_bytes: 3 }));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.image, "data:image/png;base64,cG5n");
  assert.equal(body.metrics.duration_ms, 100);
  assert.deepEqual(calls.map((call) => call.name), ["acquire", "reserve", "capture", "settle", "record", "release"]);
  for (const name of ["acquire", "reserve", "record"]) assert.equal(calls.find((call) => call.name === name)?.args[0], "authenticated-user");
  const options = calls.find((call) => call.name === "capture")?.args[0] as Record<string, unknown>;
  assert.equal(options.min_capture_bytes, 3);
  assert.equal(options.fail_if_incomplete, true);
  assert.equal(options.accountId, undefined);
  assert.equal(calls.find((call) => call.name === "settle")?.args[1], true);
});

test("PDF success provides bytes to the existing download action", async () => {
  const pdf = Buffer.from("%PDF-1.7\n");
  const { POST } = harness({ getEngine: async () => ({ capture: async () => ({ ...outcome, data: { ...outcome.data, format: "pdf", bytes: pdf.length }, buffer: pdf }) }) });
  const response = await POST(request({ url: "https://example.com", format: "pdf" }));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.image, `data:application/pdf;base64,${pdf.toString("base64")}`);
});

for (const code of ["invalid_request", "render_incomplete", "render_timeout"] as const) {
  test(`${code} refunds reserved credits and releases admission`, async () => {
    const { POST, calls } = harness({ getEngine: async () => ({ capture: async () => { throw new SnapforgeError({ code, message: "Capture rejected", requestId: "engine-id" }); } }) });
    const response = await POST(request());
    assert.equal(response.status, code === "invalid_request" ? 400 : code === "render_timeout" ? 504 : 502);
    assert.equal((await response.json()).error.request_id, response.headers.get("x-request-id"));
    assert.equal(calls.find((call) => call.name === "settle")?.args[1], false);
    assert.equal(calls.at(-1)?.name, "release");
  });
}

test("empty output cannot be charged as a successful capture", async () => {
  const { POST, calls } = harness({ getEngine: async () => ({ capture: async () => ({ ...outcome, buffer: Buffer.alloc(0) }) }) });
  assert.equal((await POST(request())).status, 502);
  assert.equal(calls.find((call) => call.name === "settle")?.args[1], false);
  assert.equal(calls.at(-1)?.name, "release");
});

test("quota rejection frees admission without settling or rendering", async () => {
  const { POST, calls } = harness({ reserve: async () => false });
  assert.equal((await POST(request())).status, 429);
  assert.deepEqual(calls.map((call) => call.name), ["acquire", "release"]);
});

test("billing outage releases admission and hides internal exception details", async () => {
  const { POST, calls } = harness({ reserve: async () => { throw new Error("secret connection credentials"); } });
  const response = await POST(request());
  assert.equal(response.status, 502);
  assert.doesNotMatch(await response.text(), /secret connection credentials/);
  assert.equal(calls.at(-1)?.name, "release");
});

test("history outage cannot turn a completed, charged capture into a failure", async () => {
  const { POST, calls } = harness({ record: async () => { throw new Error("history unavailable"); } });
  assert.equal((await POST(request())).status, 200);
  assert.deepEqual(calls.filter((call) => call.name === "settle").map((call) => call.args[1]), [true]);
  assert.equal(calls.at(-1)?.name, "release");
});

test("parallel requests share one account allowance and recover after completion", async () => {
  const admission = new MemoryCaptureAdmission({ concurrency: 1 });
  let finish!: (value: CaptureOutcome) => void;
  let started!: () => void;
  const entered = new Promise<void>((resolve) => { started = resolve; });
  const first = harness({ acquire: (account, id) => admission.acquire(account, id), getEngine: async () => ({ capture: async () => { started(); return new Promise((resolve) => { finish = resolve; }); } }) });
  const second = harness({ acquire: (account, id) => admission.acquire(account, id) });
  const pending = first.POST(request());
  await entered;
  assert.equal((await second.POST(request())).status, 429);
  assert.deepEqual(second.calls, []);
  finish(outcome);
  assert.equal((await pending).status, 200);
  assert.equal((await second.POST(request())).status, 200);
});
