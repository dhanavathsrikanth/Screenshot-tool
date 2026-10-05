import test from "node:test";
import assert from "node:assert/strict";
import { followCapture, startCapture } from "./capture-client.js";

test("local captures use the full capture signal without queue acceptance timeout or idempotency headers", async () => {
  const controller = new AbortController();
  const result = await startCapture({ url: "https://example.com" }, "", {
    local: true, signal: controller.signal, onProgress: () => {},
    fetchImpl: async (url, init) => {
      assert.equal(url, "/api/capture");
      assert.equal(init?.signal, controller.signal);
      assert.equal(new Headers(init?.headers).get("idempotency-key"), null);
      return Response.json({ ok: true, id: "local-capture", at: 1, metrics: {}, image: "data:image/png;base64,aQ==" });
    },
  });
  assert.equal(result.ok, true);
});

test("local captures never repeat a POST after a lost response or a service error", async () => {
  for (const lostResponse of [true, false]) {
    let calls = 0;
    const capturing = startCapture({}, "", { local: true, signal: new AbortController().signal, onProgress: () => {},
      fetchImpl: async () => {
        calls++;
        if (lostResponse) throw new Error("Response lost");
        return Response.json({ ok: false, id: "local-capture", at: 1, error: { code: "internal_error" } }, { status: 503 });
      },
    });
    if (lostResponse) await assert.rejects(capturing, /Response lost/);
    else assert.equal((await capturing).ok, false);
    assert.equal(calls, 1);
  }
});

test("refresh recovery only polls the existing handle; it never sends another POST", async () => {
  const calls: string[] = [];
  const seen: string[] = [];
  const values = [
    { ok: true, pending: true, id: "job", job_id: "job", state: "waiting", at: 1 },
    { ok: true, pending: true, id: "job", job_id: "job", state: "active", at: 1 },
    { ok: true, id: "job", metrics: {}, image: "https://cdn.example.com/image.png", at: 2 },
  ];
  const result = await followCapture("job", {
    signal: new AbortController().signal, sleep: async () => {},
    fetchImpl: async (url, options) => { assert.equal(options?.method, undefined); calls.push(String(url)); return Response.json(values.shift()); },
    onProgress: (value) => { seen.push(value.pending ? value.state : "ready"); },
  });
  assert.equal(result.pending, undefined);
  assert.deepEqual(seen, ["waiting", "active", "ready"]);
  assert.deepEqual(calls, Array(3).fill("/api/capture/jobs/job"));
});

test("lost POST responses retry with the same key and identical body within a bounded attempt count", async () => {
  const requests: RequestInit[] = [];
  const response = { ok: true, pending: true, id: "job", job_id: "job", state: "waiting", at: 1 };
  const result = await startCapture({ url: "https://example.com" }, "same-key", { signal: new AbortController().signal,
    onProgress: () => {}, sleep: async () => {}, fetchImpl: async (_, init) => {
      requests.push(init!); if (requests.length < 3) throw new Error("HTTP reply lost"); return Response.json(response, { status: 202 });
    } });
  assert.equal(result.id, "job");
  assert.equal(requests.length, 3);
  assert.ok(requests.every((init) => new Headers(init.headers).get("idempotency-key") === "same-key" && init.body === requests[0].body));
});

test("permanent conflicts and recoverable job handles do not send another POST", async () => {
  for (const details of [undefined, { job_id: "original-job" }]) {
    let calls = 0;
    const payload = { ok: false, id: "http-request", at: 1, error: { code: details ? "egress_unavailable" : "idempotency_conflict",
      retriable: Boolean(details), message: "Retry status lookup", request_id: "http-request", details } };
    await startCapture({}, "key", { signal: new AbortController().signal, onProgress: () => {},
      fetchImpl: async () => { calls++; return Response.json(payload, { status: details ? 503 : 409 }); } });
    assert.equal(calls, 1);
  }
});

test("reload after total POST response loss recovers through its saved request key without submitting", async () => {
  const calls: string[] = [];
  const result = await followCapture("saved-key", { signal: new AbortController().signal, sleep: async () => {}, onProgress: () => {},
    fetchImpl: async (url, init) => { calls.push(String(url)); assert.equal(init?.method, undefined);
      return Response.json({ ok: false, id: "job", at: 1, error: { code: "render_timeout" } }); } }, true);
  assert.equal(result.id, "job"); assert.deepEqual(calls, ["/api/capture/requests/saved-key"]);
});

test("transient service errors and rate limits respect backoff without submitting", async () => {
  const waits: number[] = [];
  const responses = [new Response("{}", { status: 503 }), new Response("{}", { status: 429, headers: { "retry-after": "7" } }),
    Response.json({ ok: false, id: "job", at: 2, error: { code: "render_timeout" } })];
  const result = await followCapture("job", { signal: new AbortController().signal, onProgress: () => {},
    sleep: async (milliseconds) => { waits.push(milliseconds); }, fetchImpl: async () => responses.shift()! });
  assert.equal(result.ok, false);
  assert.deepEqual(waits, [3000, 7000]);
});

test("leaving the page cancels polling without cancelling or resubmitting the worker job", async () => {
  const controller = new AbortController();
  let calls = 0;
  const watching = followCapture("job", { signal: controller.signal, onProgress: () => {},
    fetchImpl: async () => { calls++; controller.abort(); throw new Error("network interrupted"); } });
  await assert.rejects(watching);
  assert.equal(calls, 1);
});

test("lost network response is retried as a status GET", async () => {
  let calls = 0;
  await followCapture("job", { signal: new AbortController().signal, onProgress: () => {}, sleep: async () => {},
    fetchImpl: async () => { if (++calls === 1) throw new Error("offline"); return Response.json({ ok: false, id: "job", at: 1, error: {} }); } });
  assert.equal(calls, 2);
});
