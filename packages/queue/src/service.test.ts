import test from "node:test";
import assert from "node:assert/strict";
import { SnapforgeError } from "@snapforge/contracts";
import { CaptureService, artifactData, type CaptureBilling, type CaptureServiceDependencies } from "./service.js";
import { CaptureQueue } from "./queue.js";
import { CaptureDispatcher } from "./dispatcher.js";
import { resolveQueueConfig } from "./config.js";
import { FakeQueueHost } from "./fakes.js";
import { CaptureAdmissionError } from "./admission.js";
import type { CaptureJobResult } from "./types.js";

const input = { url: "https://example.com" };
const data = { url: input.url, final_url: input.url, format: "png", width: 1280, height: 720, bytes: 123,
  duration_ms: 100, blocked_requests: 0, cached: false, cdn_url: "https://cdn.example.com/capture.png" };

function fixture(overrides: Partial<CaptureServiceDependencies> = {}) {
  const config = resolveQueueConfig({ redisUrl: "redis://localhost:6379" });
  const host = new FakeQueueHost();
  const queue = new CaptureQueue(host, config);
  const calls: string[] = [];
  const held = new Map<string, string>();
  const settlements: boolean[] = [];
  const billing: CaptureBilling = {
    reserveCapture: async (account, id) => { calls.push(`reserve:${account}`); held.set(id, account); return true; },
    linkReservationToJob: async (_, id, job) => { calls.push(`link:${job}`); assert.equal(id, job); },
    reservationForJob: async (account, job) => held.get(job) === account ? job : null,
    settleCapture: async (id, success) => { if (held.delete(id)) settlements.push(success); },
    recordCapture: async () => { calls.push("record"); },
  };
  const deps: CaptureServiceDependencies = {
    queue, dispatcher: new CaptureDispatcher(queue, config), billing,
    admission: { acquireJob: async (account) => { calls.push(`admit:${account}`); }, releaseJob: async () => { calls.push("release"); } },
    newId: () => "stable-job", ...overrides,
  };
  return { service: new CaptureService(deps), deps, host, queue, calls, held, settlements };
}

function complete(job: NonNullable<ReturnType<FakeQueueHost["jobs"]["get"]>>, patch: Partial<CaptureJobResult> = {}) {
  job.setState("completed");
  job.returnvalue = { request_id: job.data.request_id, mode: job.data.mode, ok: true, data, duration_ms: 100,
    attempts_made: 1, enqueued_at: job.timestamp, completed_at: Date.now(), ...patch };
}

test("shared service reserves and links a stable owned job before enqueueing", async () => {
  const f = fixture();
  const reply = await f.service.submit({ accountId: "trusted-account" }, { ...input, billing_account_id: "forged", api_key_id: "forged" }, "request", "async");
  assert.equal(reply.id, "stable-job");
  assert.equal(reply.state, "waiting");
  assert.deepEqual(f.calls, ["admit:trusted-account", "reserve:trusted-account", "link:stable-job"]);
  assert.equal(f.host.added[0].data.billing_account_id, "trusted-account");
  assert.equal(f.host.added[0].data.reservation_id, "stable-job");
  assert.equal(f.host.added[0].opts.jobId, "stable-job");
  assert.equal(f.host.added[0].data.api_key_id, undefined);
  assert.equal(f.host.added[0].data.options.fail_if_incomplete, false);
  assert.equal(f.held.size, 1);
});

test("admission denial still fails closed before reservation or rendering", async () => {
  const f = fixture({ admission: { acquireJob: async () => { throw new CaptureAdmissionError("id", true); }, releaseJob: async () => {} } });
  await assert.rejects(f.service.submit({ accountId: "account" }, input, "request", "async"), CaptureAdmissionError);
  assert.equal(f.host.jobs.size, 0, "no enqueue must reach the queue");
  assert.equal(f.calls.includes("reserve"), false, "no reservation is taken");
  assert.equal(f.calls.includes("release"), false, "admission was never granted, so there is nothing to release");
});

for (const body of [{ ...input, format: "bad" }, async () => { throw new SnapforgeError({ code: "invalid_request", message: "bad JSON", requestId: "request" }); }]) {
  test("invalid requests fail closed without consuming admission, reservation, or render", async () => {
    const f = fixture();
    let billingCalls = 0;
    f.deps.billing.settleCapture = async () => { billingCalls++; };
    await assert.rejects(f.service.submit({ accountId: "account" }, body, "request", "async"), SnapforgeError);
    assert.deepEqual(f.calls, [], "admission is taken only after a valid body parses");
    assert.equal(f.host.jobs.size, 0);
    assert.equal(billingCalls, 0);
  });
}

test("reservation-link failure refunds before any enqueue", async () => {
  const f = fixture();
  f.deps.billing.linkReservationToJob = async () => { throw new Error("database outage"); };
  await assert.rejects(f.service.submit({ accountId: "account" }, input, "request", "async"));
  assert.equal(f.host.jobs.size, 0);
  assert.deepEqual(f.settlements, [false]);
  assert.equal(f.calls.at(-1), "release");
});

test("confirmed enqueue failure refunds the reservation and slot", async () => {
  const f = fixture({ dispatcher: { dispatch: async () => { throw new Error("enqueue unavailable"); } } });
  await assert.rejects(f.service.submit({ accountId: "account" }, input, "request", "async"));
  assert.deepEqual(f.settlements, [false]);
  assert.equal(f.calls.at(-1), "release");
});

test("lost enqueue acknowledgement recovers the original job without a second render or refund", async () => {
  const f = fixture();
  const actual = f.deps.dispatcher;
  f.deps.dispatcher = { dispatch: async (request) => { await actual.dispatch(request); throw new Error("lost acknowledgement"); } };
  const result = await f.service.submit({ accountId: "account" }, input, "request", "async");
  assert.equal(result.id, "stable-job");
  assert.equal(f.host.added.length, 1);
  assert.deepEqual(f.settlements, []);
  assert.equal(f.calls.includes("release"), false);
});

test("ambiguous enqueue retains reservation and returns its recoverable handle", async () => {
  const f = fixture({ dispatcher: { dispatch: async () => { throw new Error("unknown enqueue outcome"); } },
    queue: { getJob: async () => { throw new Error("Redis outage"); }, snapshot: async () => null } });
  await assert.rejects(f.service.submit({ accountId: "account" }, input, "request", "async"), (error: unknown) => {
    assert.ok(error instanceof SnapforgeError);
    assert.equal(error.code, "egress_unavailable");
    assert.equal(error.details?.job_id, "stable-job");
    return true;
  });
  assert.deepEqual(f.settlements, []);
  assert.equal(f.calls.includes("release"), false);
});

test("accepted job lookup outage preserves its handle and reservation", async () => {
  const f = fixture();
  f.deps.queue.snapshot = async () => { throw new Error("status transport failed"); };
  await assert.rejects(f.service.submit({ accountId: "account" }, input, "request", "async"), (error: unknown) => {
    assert.ok(error instanceof SnapforgeError);
    assert.equal(error.details?.job_id, "stable-job");
    return true;
  });
  assert.equal(f.host.added.length, 1);
  assert.equal(f.held.size, 1);
  assert.deepEqual(f.settlements, []);
});

test("ownership rejects other accounts and other API keys before result lookup or settlement", async () => {
  const f = fixture();
  await f.service.submit({ accountId: "account", apiKeyId: "key-a" }, input, "request", "async");
  complete(f.host.jobs.get("stable-job")!);
  for (const identity of [{ accountId: "other" }, { accountId: "account", apiKeyId: "key-b" }]) {
    await assert.rejects(f.service.lookup(identity, "stable-job", "read"), /Job not found/);
  }
  assert.deepEqual(f.settlements, []);
  assert.equal(f.calls.includes("record"), false);
  assert.equal((await f.service.lookup({ accountId: "account" }, "stable-job", "read")).result?.ok, true);
});

test("terminal success returns an artifact, strips inline bytes, and settlement is idempotent", async () => {
  const f = fixture();
  await f.service.submit({ accountId: "account" }, input, "request", "async");
  complete(f.host.jobs.get("stable-job")!, { data: { ...data, data_url: "data:image/png;base64,secret" } });
  const result = await f.service.lookup({ accountId: "account" }, "stable-job", "read");
  assert.equal(result.result?.data?.cdn_url, data.cdn_url);
  assert.equal(result.result?.data?.data_url, undefined);
  await f.service.lookup({ accountId: "account" }, "stable-job", "read-again");
  assert.deepEqual(f.settlements, [true]);
  assert.equal(f.calls.at(-1), "release");
});

test("legacy API-key jobs settle against the verified account", async () => {
  const f = fixture();
  await f.service.submit({ accountId: "account", apiKeyId: "key-a" }, input, "request", "async");
  const job = f.host.jobs.get("stable-job")!;
  delete job.data.billing_account_id;
  delete job.data.reservation_id;
  complete(job);
  const result = await f.service.lookup({ accountId: "account", apiKeyId: "key-a" }, "stable-job", "read");
  assert.equal(result.result?.ok, true);
  assert.deepEqual(f.settlements, [true]);
});

for (const artifact of [undefined, "", "javascript:alert(1)", "data:application/pdf;base64,bad"]) {
  test(`undeliverable completed jobs (${artifact ?? "missing URL"}) are refunded`, async () => {
    const f = fixture();
    await f.service.submit({ accountId: "account" }, input, "request", "async");
    complete(f.host.jobs.get("stable-job")!, { data: { ...data, cdn_url: artifact } });
    const result = await f.service.lookup({ accountId: "account" }, "stable-job", "read");
    assert.equal(result.state, "failed");
    assert.equal(result.result?.error?.code, "render_incomplete");
    assert.deepEqual(f.settlements, [false]);
  });
}

test("intermediate retries do not settle; failed jobs preserve structured capture errors", async () => {
  const f = fixture();
  await f.service.submit({ accountId: "account" }, input, "request", "async");
  const job = f.host.jobs.get("stable-job")!;
  job.data.last_error = { code: "render_incomplete", message: "Loading shell", retriable: true, request_id: "stable-job" };
  job.setState("delayed");
  assert.equal((await f.service.lookup({ accountId: "account" }, "stable-job", "read")).state, "delayed");
  assert.deepEqual(f.settlements, []);
  job.setState("failed");
  const result = await f.service.lookup({ accountId: "account" }, "stable-job", "read");
  assert.equal(result.result?.error?.code, "render_incomplete");
  assert.deepEqual(f.settlements, [false]);
});

test("billing failure cannot release a possibly unsettled terminal job", async () => {
  const f = fixture();
  await f.service.submit({ accountId: "account" }, input, "request", "async");
  complete(f.host.jobs.get("stable-job")!);
  f.deps.billing.settleCapture = async () => { throw new Error("database unavailable"); };
  await assert.rejects(f.service.lookup({ accountId: "account" }, "stable-job", "read"));
  assert.equal(f.calls.includes("release"), false);
});

test("PDF artifacts pass the same delivery validation as images", () => {
  assert.equal(artifactData({ ...data, format: "pdf", cdn_url: "https://cdn.example.com/capture.pdf" })?.format, "pdf");
  assert.equal(artifactData({ ...data, bytes: 0 }), null);
  assert.equal(artifactData({ ...data, width: 0 }), null);
  assert.equal(artifactData({ ...data, format: "html" }), null);
});

test("sync waiter failures cannot settle a still-active worker job", async () => {
  const f = fixture();
  f.deps.dispatcher = new CaptureDispatcher(f.queue, resolveQueueConfig({ redisUrl: "redis://localhost:6379" }), {
    waitUntilFinished: async (job) => { f.host.jobs.get(job.id!)!.setState("active"); throw new Error("event transport failed"); },
  });
  assert.equal((await f.service.submit({ accountId: "account" }, input, "request", "sync")).state, "active");
  assert.deepEqual(f.settlements, []);
});

import { HotCache } from "./hot-cache.js";
import { captureOptionsSchema } from "@snapforge/contracts";

test("hot-cache hit returns the cached artifact synchronously without admitting or charging", async () => {
  const hotCache = new HotCache();
  const f = fixture({ hotCache });
  hotCache.set(captureOptionsSchema.parse({ ...input, cache_ttl: 120 }), data);

  const reply = await f.service.submit({ accountId: "account" }, { ...input, cache_ttl: 120 }, "request", "async");
  assert.equal(reply.state, "completed");
  assert.equal(reply.result?.ok, true);
  assert.equal(reply.result?.data?.cached, true);
  assert.equal(reply.result?.data?.cdn_url, data.cdn_url);
  assert.equal(reply.result?.worker_id, "hot-cache");
  assert.equal(f.host.added.length, 0, "no enqueue on cache hit");
  assert.deepEqual(f.calls, [], "no admission, no reservation, no link");
  assert.equal(f.settlements.length, 0);
});

test("hot-cache miss falls through to the normal reserve + dispatch path", async () => {
  const hotCache = new HotCache();
  const f = fixture({ hotCache });
  const reply = await f.service.submit({ accountId: "account" }, input, "request", "async");
  assert.equal(reply.state, "waiting");
  assert.equal(f.host.added.length, 1);
  assert.deepEqual(f.calls.slice(0, 3), ["admit:account", "reserve:account", "link:stable-job"]);
});

test("webhook-bearing submit bypasses the hot cache", async () => {
  const hotCache = new HotCache();
  const f = fixture({ hotCache });
  hotCache.set(captureOptionsSchema.parse({ ...input, cache_ttl: 120 }), data);

  const webhook = { url: "https://hook.example.com", secret: "a-very-strong-shared-secret-key" };
  await assert.rejects(
    f.service.submit({ accountId: "account" }, { ...input, cache_ttl: 120, webhook }, "request", "async"),
    (error: unknown) => error instanceof SnapforgeError && error.code === "unsupported_option",
  );
  assert.equal(f.host.added.length, 0, "webhook requests must not bypass durable delivery");
});

test("durable submission mode bypasses the hot cache", async () => {
  const hotCache = new HotCache();
  const submissionCodec = {
    seal: () => "cipher",
    open: () => ({ accountId: "account", apiKeyId: undefined, jobId: "stable-job", mode: "async" as const, enqueuedAt: Date.now(), options: captureOptionsSchema.parse({ ...input, cache_ttl: 120 }), webhook: undefined }),
    sealWebhook: () => "cipher",
    openWebhook: () => ({ url: "https://hook.example.com", secret: "a-very-strong-shared-secret-key" }),
  };
  const billingWithSubmissions = {
    reserveCapture: async () => true,
    settleCapture: async () => undefined,
    linkReservationToJob: async () => undefined,
    reservationForJob: async () => null,
    recordCapture: async () => undefined,
    submissions: {
      reserveSubmission: async () => true,
      dispatchSubmission: async () => true,
      claimPendingSubmissions: async () => [],
      pendingSubmission: async () => null,
      existingRequest: async () => null,
    },
  };
  const f = fixture({ hotCache, billing: billingWithSubmissions, submissionCodec });
  hotCache.set(captureOptionsSchema.parse({ ...input, cache_ttl: 120 }), data);

  await assert.rejects(
    f.service.submit({ accountId: "account" }, { ...input, cache_ttl: 120 }, "request", "async"),
    (error: unknown) => error instanceof SnapforgeError && error.code === "egress_unavailable",
    "durable submission paths run through the queue, not the hot cache, so acknowledge fails when the fake queue has no job",
  );
  assert.notEqual(f.calls.at(0), undefined, "durable path must run even with a hot cache hit available");
  assert.equal(f.calls.includes("release"), false, "durable submissions keep admission until recovery confirms the job");
});

test("lookup populates the hot cache after a successful finalize", async () => {
  const hotCache = new HotCache();
  const f = fixture({ hotCache });
  await f.service.submit({ accountId: "account" }, input, "request", "async");
  complete(f.host.jobs.get("stable-job")!);

  assert.equal(hotCache.size, 0);
  await f.service.lookup({ accountId: "account" }, "stable-job", "read");
  assert.equal(hotCache.size, 1);
  assert.equal(hotCache.get(captureOptionsSchema.parse(input))?.cdn_url, data.cdn_url);
});

test("lookup does not populate the hot cache on failed captures", async () => {
  const hotCache = new HotCache();
  const f = fixture({ hotCache });
  await f.service.submit({ accountId: "account" }, input, "request", "async");
  const job = f.host.jobs.get("stable-job")!;
  job.setState("failed");
  job.returnvalue = { request_id: "stable-job", mode: job.data.mode, ok: false,
    error: { code: "render_timeout", message: "navigation exceeded 15000ms", retriable: true, request_id: "stable-job" },
    duration_ms: 15_000, attempts_made: 3, enqueued_at: job.timestamp, completed_at: Date.now() };
  await f.service.lookup({ accountId: "account" }, "stable-job", "read");
  assert.equal(hotCache.size, 0);
});

test("hot-cache hit is reusable across requests for the same options", async () => {
  const hotCache = new HotCache();
  const f = fixture({ hotCache });
  const options = captureOptionsSchema.parse({ ...input, cache_ttl: 60 });
  hotCache.set(options, data);

  const first = await f.service.submit({ accountId: "account" }, { ...input, cache_ttl: 60 }, "request-1", "async");
  const second = await f.service.submit({ accountId: "account" }, { ...input, cache_ttl: 60 }, "request-2", "async");
  assert.equal(first.state, "completed");
  assert.equal(second.state, "completed");
  assert.equal(f.host.added.length, 0);
});
