import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import type { Redis } from "ioredis";
import { CaptureQueue, createCaptureSubmissionCodec, type CaptureDispatcher, type CaptureJobView, type CaptureJobPayload, type SealedCaptureSubmission } from "@snapforge/queue";
import { createGateway, type GatewayDependencies } from "./gateway.js";

function fixture(workers = 1, paused = false) {
  const jobs = new Map<string, CaptureJobView>();
  const settlements: boolean[] = [];
  const reservations = new Set<string>();
  const calls: string[] = [];
  let state = "completed";
  let failure: CaptureJobPayload["last_error"];
  const redis = { ping: async () => "PONG", eval: async () => [1, 0], zrem: async () => 1 } as unknown as Redis;
  const queue = { depth: async () => ({ paused }), getJob: async (id: string) => jobs.get(id), snapshot: async (id: string) => {
    const job = jobs.get(id);
    if (!job) return null;
    return { id, state, mode: job.data.mode, request_id: id, progress: state === "completed" ? 100 : 10,
      attempts_made: 1, attempt_budget: 3, enqueued_at: job.timestamp, webhook: null, result: job.returnvalue };
  } } as unknown as CaptureQueue;
  const database: NonNullable<GatewayDependencies["database"]> = {
    ping: async () => {},
    findApiKeyByHash: async () => ({ id: "key-a", billing_account_id: "account", active: true, scopes: ["screenshot:write", "jobs:read"] }),
    reserveCapture: async (_, id) => { reservations.add(id); calls.push("reserve"); return true; },
    linkReservationToJob: async (_, id, job) => { assert.equal(id, job); calls.push("link"); },
    reservationForJob: async (_, id) => reservations.has(id) ? id : null,
    settleCapture: async (id, success) => { if (reservations.delete(id)) settlements.push(success); },
    recordCapture: async () => { calls.push("record"); },
  };
  const dispatcher = { dispatch: async (request) => {
    calls.push("dispatch");
    const id = request.jobId!;
    const data: CaptureJobPayload = { request_id: id, mode: request.mode, options: request.options,
      api_key_id: request.apiKeyId, billing_account_id: request.accountId, reservation_id: request.reservationId,
      enqueued_at: request.enqueuedAt ?? Date.now(), attempt_budget: 3 };
    const job: CaptureJobView = { id, data, opts: {}, attemptsMade: 1, timestamp: Date.now(), progress: 100,
      getState: async () => state, updateProgress: async () => {}, returnvalue: state === "completed" || state === "failed" ? {
        request_id: id, mode: request.mode, ok: !failure,
        ...(failure ? { error: failure } : { data: { url: request.options.url, final_url: request.options.url, format: request.options.format,
          width: 1280, height: 720, bytes: 100, duration_ms: 100, blocked_requests: 0, cached: false, cdn_url: "https://cdn.example.com/capture.pdf" } }),
        enqueued_at: Date.now(), completed_at: Date.now(), duration_ms: 100, attempts_made: 1,
      } : undefined };
    jobs.set(id, job);
    return { settled: Boolean(job.returnvalue), job_id: id, state, mode: request.mode, result: job.returnvalue };
  } } as CaptureDispatcher;
  const deps: GatewayDependencies = { redis, queue, dispatcher, readyWorkers: async () => workers, database };
  return { deps, jobs, settlements, calls, setState: (value: string) => { state = value; }, setFailure: (value: typeof failure) => { failure = value; state = "failed"; } };
}

const headers = { authorization: "Bearer sf_live_gateway_fixture_123456789", "content-type": "application/json" };
const capture = (app: ReturnType<typeof createGateway>, body: unknown = { url: "https://example.com" }) => app.request("/v1/screenshot", { method: "POST", headers, body: JSON.stringify(body) });

for (const [workers, paused, expected] of [[0, false, 503], [1, false, 200], [1, true, 503]] as const) {
  test(`health with ${workers} workers and paused=${paused}`, async () => {
    const f = fixture(workers, paused);
    assert.equal((await createGateway(f.deps).request("/v1/health")).status, expected);
  });
}

test("API uses shared service with reservation linking before dispatch and artifact delivery", async () => {
  const f = fixture();
  const response = await capture(createGateway(f.deps), { url: "https://example.com", format: "pdf", accountId: "forged" });
  assert.equal(response.status, 200);
  assert.match((await response.json() as { data: { cdn_url: string } }).data.cdn_url, /^https:/);
  assert.deepEqual(f.calls, ["reserve", "link", "dispatch", "record"]);
  assert.deepEqual(f.settlements, [true]);
  assert.equal([...f.jobs.values()][0].data.billing_account_id, "account");
});

test("incomplete capture refunds credits through the shared finalization path", async () => {
  const f = fixture();
  f.setFailure({ code: "render_incomplete", message: "Loading shell", retriable: true, request_id: "worker" });
  const response = await capture(createGateway(f.deps));
  assert.equal(response.status, 502);
  assert.equal((await response.json() as { error: { code: string } }).error.code, "render_incomplete");
  assert.deepEqual(f.settlements, [false]);
});

test("pending capture returns a job handle and keeps the reservation", async () => {
  const f = fixture();
  f.setState("active");
  const response = await capture(createGateway(f.deps));
  assert.equal(response.status, 202);
  const body = await response.json() as { data: { job_id: string; poll_url: string } };
  assert.ok(body.data.job_id);
  assert.equal(body.data.poll_url, `/v1/jobs/${body.data.job_id}`);
  assert.deepEqual(f.settlements, []);
});

test("API job polling rejects another account without billing side effects", async () => {
  const f = fixture();
  f.setState("active");
  const app = createGateway(f.deps);
  await capture(app);
  const id = [...f.jobs.keys()][0];
  f.jobs.get(id)!.data.billing_account_id = "other-account";
  const response = await app.request(`/v1/jobs/${id}`, { headers });
  assert.equal(response.status, 400);
  assert.deepEqual(f.settlements, []);
});

test("API account admission precedes parsing and does not reserve when denied", async () => {
  const f = fixture();
  f.deps.redis = { eval: async () => [0, 7] } as unknown as Redis;
  const response = await capture(createGateway(f.deps));
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "7");
  assert.deepEqual(f.calls, []);
});

test("API rejects oversized streamed bodies before credits or dispatch", async () => {
  const f = fixture();
  const response = await createGateway(f.deps).request("/v1/screenshot", { method: "POST", headers, body: "x".repeat(262145) });
  assert.equal(response.status, 400);
  assert.deepEqual(f.calls, []);
});

test("missing write scope and unauthorized requests cannot dispatch", async () => {
  const f = fixture();
  f.deps.database!.findApiKeyByHash = async () => ({ id: "key", active: true, scopes: [] });
  const app = createGateway(f.deps);
  assert.equal((await capture(app)).status, 403);
  assert.equal((await app.request("/v1/screenshot", { method: "POST", body: "{}" })).status, 401);
  assert.deepEqual(f.calls, []);
});

test("API returns a durable 202 job handle during an enqueue outage and protects its polling route", async () => {
  const f = fixture();
  f.deps.submissionCodec = createCaptureSubmissionCodec(randomBytes(32).toString("base64"));
  let row: SealedCaptureSubmission | undefined;
  f.deps.database!.submissions = {
    reserveSubmission: async (input) => { row = input; f.calls.push("durable-reserve"); return true; },
    dispatchSubmission: async (_, deliver) => { await deliver(row!); return true; },
    claimPendingSubmissions: async () => [],
    pendingSubmission: async (account, id, key) => row && row.accountId === account && row.jobId === id && row.apiKeyId === key
      ? { accountId: account, jobId: id, apiKeyId: key, mode: row.mode, enqueuedAt: row.enqueuedAt, acknowledged: false } : null,
  };
  f.deps.dispatcher.dispatch = async () => { throw new Error("enqueue unavailable"); };
  const app = createGateway(f.deps);
  const response = await capture(app, { url: "https://example.com", headers: { authorization: "Bearer private-request-header" } });
  assert.equal(response.status, 202);
  const body = await response.json() as { data: { job_id: string; poll_url: string } };
  assert.equal(body.data.job_id, row!.jobId);
  assert.deepEqual(f.calls, ["durable-reserve"]);
  assert.deepEqual(f.settlements, []);
  f.deps.queue.getJob = async () => { throw new Error("Redis unavailable"); };
  const poll = await app.request(body.data.poll_url, { headers });
  assert.equal(poll.status, 200);
  const payload = await poll.text();
  assert.equal(payload.includes("ciphertext"), false);
  assert.equal(payload.includes("private-request-header"), false);
  f.deps.database!.findApiKeyByHash = async () => ({ id: "key-b", billing_account_id: "account", active: true, scopes: ["jobs:read"] });
  assert.equal((await app.request(body.data.poll_url, { headers: { authorization: "Bearer sf_live_another_fixture_987654321" } })).status, 400);
});

test("HTTP idempotency replays and request-key recovery use the original account job", async () => {
  const f = fixture();
  f.deps.redis.eval = (async (script: string) => script.includes("return {") ? [1, 0] : 1) as unknown as Redis["eval"];
  f.deps.submissionCodec = createCaptureSubmissionCodec(randomBytes(32).toString("base64"));
  f.setState("waiting");
  const rows = new Map<string, SealedCaptureSubmission>();
  f.deps.database!.submissions = {
    existingRequest: async (account, id) => {
      const row = rows.get(id);
      return row?.accountId === account ? { fingerprint: row.requestFingerprint!, apiKeyId: row.apiKeyId } : null;
    },
    reserveSubmission: async (input) => { rows.set(input.jobId, input); f.calls.push("durable-reserve"); return true; },
    dispatchSubmission: async (id, deliver) => { await deliver(rows.get(id)!); return true; },
    claimPendingSubmissions: async () => [], pendingSubmission: async () => null,
  };
  const app = createGateway(f.deps);
  const retryHeaders = { ...headers, "idempotency-key": "http-lost-response" };
  const post = (body: unknown) => app.request("/v1/screenshot?mode=async", { method: "POST", headers: retryHeaders, body: JSON.stringify(body) });
  const original = await post({ url: "https://example.com", format: "png" });
  assert.equal(original.status, 202);
  const id = (await original.json() as { data: { job_id: string } }).data.job_id;
  assert.equal((await post({ url: "https://example.com", format: "png" })).status, 202);
  assert.deepEqual(f.calls, ["durable-reserve", "dispatch"]);
  assert.equal(f.jobs.size, 1);
  assert.equal((await post({ url: "https://changed.example.com" })).status, 409);
  const restored = await app.request("/v1/requests/http-lost-response", { headers });
  assert.equal(restored.status, 200);
  assert.equal((await restored.json() as { data: { id: string } }).data.id, id);
  f.jobs.get(id)!.data.billing_account_id = "another-account";
  assert.equal((await app.request("/v1/requests/http-lost-response", { headers })).status, 400);
  assert.deepEqual(f.settlements, []);
});

test("HTTP callback status and manual redelivery require ownership, scope, and the current ETag", async () => {
  const f = fixture();
  let generation = 0;
  let pending = false;
  f.deps.webhooks = {
    claim: async () => [], complete: async () => {},
    status: async (account, id, key) => account === "account" && id === "job" && key === "key-a"
      ? { id: "wh-job", state: "failed", attempts: 5, generation, statusCode: 500 } : null,
    redeliver: async (account, id, expected, key) => {
      if (account !== "account" || id !== "job" || key !== "key-a" || expected !== generation || pending) return false;
      generation++; pending = true; return true;
    },
  };
  const app = createGateway(f.deps);
  const status = await app.request("/v1/jobs/job/webhook", { headers });
  assert.equal(status.status, 200);
  assert.equal(status.headers.get("etag"), '"0"');
  assert.equal((await app.request("/v1/jobs/victim/webhook", { headers })).status, 400);
  const url = "/v1/jobs/job/webhook/redeliver";
  assert.equal((await app.request(url, { method: "POST", headers })).status, 400);
  const replay = () => app.request(url, { method: "POST", headers: { ...headers, "if-match": '"0"' } });
  assert.equal((await replay()).status, 202);
  assert.equal((await replay()).status, 409);
  assert.deepEqual(f.calls, []);
  assert.deepEqual(f.settlements, []);
  f.deps.database!.findApiKeyByHash = async () => ({ id: "read-only", billing_account_id: "account", active: true, scopes: ["jobs:read"] });
  const restricted = createGateway(f.deps);
  assert.equal((await restricted.request(url, { method: "POST", headers: { ...headers, "if-match": '"1"' } })).status, 403);
});
