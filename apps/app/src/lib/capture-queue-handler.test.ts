import test from "node:test";
import assert from "node:assert/strict";
import { captureOptionsSchema, SnapforgeError } from "@snapforge/contracts";
import type { JobSnapshot } from "@snapforge/queue";
import { createQueuedCaptureHandlers, dashboardCaptureResult } from "./capture-queue-handler.js";

const snapshot: JobSnapshot = { id: "job", state: "waiting", mode: "async", request_id: "job", progress: 0,
  attempts_made: 0, attempt_budget: 3, enqueued_at: Date.now(), webhook: null };

test("queued dashboard authentication precedes all service work", async () => {
  let used = false;
  const handlers = createQueuedCaptureHandlers({ authenticate: async () => null, getService: async () => { used = true; throw new Error(); } });
  assert.equal((await handlers.POST(new Request("https://app.test", { method: "POST", body: "{}" }))).status, 401);
  assert.equal(used, false);
});

test("dashboard submits verified account identity and always uses worker async dispatch", async () => {
  const handlers = createQueuedCaptureHandlers({ authenticate: async () => "authenticated", getService: async () => ({
    submit: async (identity, read, _, mode, key) => {
      assert.deepEqual(identity, { accountId: "authenticated" });
      assert.equal(mode, "async");
      assert.equal(key, "dashboard-retry-key");
      assert.equal(typeof read, "function");
      assert.equal(captureOptionsSchema.parse(await (read as () => Promise<unknown>)()).url, "https://example.com");
      return snapshot;
    }, lookup: async () => { throw new Error("not used"); },
  }) });
  const response = await handlers.POST(new Request("https://app.test", { method: "POST", headers: { "idempotency-key": "dashboard-retry-key" }, body: JSON.stringify({ url: "https://example.com", accountId: "forged" }) }));
  assert.equal(response.status, 202);
  const body = await response.json();
  assert.equal(body.pending, true);
  assert.equal(body.poll_url, "/api/capture/jobs/job");
  assert.equal(response.headers.get("cache-control"), "no-store");
});

for (const format of ["png", "pdf"]) test(`${format} dashboard delivery uses artifact URL without inline bytes`, () => {
  const url = `https://cdn.example.com/capture.${format}`;
  const result = dashboardCaptureResult({ ...snapshot, state: "completed", result: { request_id: "job", mode: "async", ok: true,
    data: { url: "https://example.com", final_url: "https://example.com", format, width: 1280, height: 720, bytes: 100,
      duration_ms: 100, cached: false, blocked_requests: 0, cdn_url: url },
    duration_ms: 100, attempts_made: 1, enqueued_at: snapshot.enqueued_at, completed_at: Date.now() } });
  assert.ok(result.ok && !result.pending);
  assert.equal(result.image, url);
  assert.equal(result.artifact_url, url);
});

test("ownership failure is safely returned by the dashboard polling route", async () => {
  const handlers = createQueuedCaptureHandlers({ authenticate: async () => "other-account", getService: async () => ({
    submit: async () => snapshot, lookup: async (identity, id, requestId) => {
      assert.equal(identity.accountId, "other-account"); assert.equal(id, "victim-job");
      throw new SnapforgeError({ code: "invalid_request", message: "Job not found", requestId });
    },
  }) });
  const response = await handlers.GET(new Request("https://app.test"), "victim-job");
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.message, "Job not found");
});

test("queue startup failure returns 503 with no local-render fallback or secrets", async () => {
  const handlers = createQueuedCaptureHandlers({ authenticate: async () => "account", getService: async () => { throw new Error("private Redis credentials"); } });
  const response = await handlers.POST(new Request("https://app.test", { method: "POST", body: "{}" }));
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /private Redis credentials/);
});

for (const [code, status] of [["render_timeout", 504], ["blocked_by_target", 451], ["invalid_request", 400]] as const) {
  test(`dashboard terminal ${code} preserves the shared error status`, async () => {
    const failed: JobSnapshot = { ...snapshot, state: "failed", result: {
      request_id: "job", mode: "async", ok: false, error: { code, message: "Capture failed", retriable: false, request_id: "job" },
      duration_ms: 100, attempts_made: 1, enqueued_at: snapshot.enqueued_at, completed_at: Date.now(),
    } };
    const handlers = createQueuedCaptureHandlers({ authenticate: async () => "account", getService: async () => ({
      submit: async () => failed, lookup: async () => failed,
    }) });
    assert.equal((await handlers.GET(new Request("https://app.test"), "job")).status, status);
  });
}
