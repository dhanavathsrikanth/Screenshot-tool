import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { createEngine, nullCaptureCache } from "@snapforge/engine";
import { CaptureCache, CaptureStore, MemoryCacheBackend, type StorageClient } from "@snapforge/storage";
import { CaptureDispatcher, CaptureQueue, CaptureService, CaptureWorker, resolveQueueConfig,
  type CaptureJobView, type CaptureQueueHost, type JobState } from "@snapforge/queue";
import { createWorkerExecutor } from "../src/executor.js";

test("shared service delivers real PNG and PDF browser output through artifact links", { timeout: 60_000 }, async (t) => {
  const objects = new Map<string, { buffer: Buffer; contentType: string }>();
  const server = http.createServer((request, response) => {
    if (request.url?.startsWith("/artifacts/")) {
      const object = objects.get(decodeURIComponent(request.url.slice("/artifacts/".length)));
      if (!object) { response.writeHead(404); response.end(); return; }
      response.setHeader("content-type", object.contentType);
      response.end(object.buffer);
    } else {
      response.setHeader("content-type", "text/html");
      response.end("<!doctype html><html><head><title>Delivery fixture</title></head><body><main><h1>Capture delivery test</h1><p>Complete content for PNG and PDF artifact verification.</p></main></body></html>");
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const storage: StorageClient = {
    bucket: "fixture",
    put: async (key, buffer, contentType) => { objects.set(key, { buffer, contentType }); return { objectKey: key, bytes: buffer.length, contentType }; },
    urlFor: async (key) => `${base}/artifacts/${encodeURIComponent(key)}`,
    get: async (key) => objects.get(key)?.buffer ?? null,
    head: async (key) => { const object = objects.get(key); return object ? { bytes: object.buffer.length, contentType: object.contentType, custom: {} } : null; },
    exists: async (key) => objects.has(key), delete: async (key) => { objects.delete(key); },
  };
  const engine = createEngine({ stealth: false, allowPrivateNetwork: true, autoConcurrency: false, maxConcurrentCaptures: 1 }, nullCaptureCache);
  t.after(async () => { await engine.close(); await new Promise<void>((resolve) => server.close(() => resolve())); });
  const config = resolveQueueConfig({ redisUrl: "redis://localhost:6379", attempts: 1 });
  const jobs = new Map<string, CaptureJobView>();
  const states = new Map<string, JobState>();
  const host: CaptureQueueHost = {
    add: async (_, payload, opts) => {
      const id = opts.jobId!;
      states.set(id, "waiting");
      const job: CaptureJobView = { id, data: payload, opts, attemptsMade: 0, timestamp: Date.now(), progress: 0, returnvalue: undefined,
        getState: async () => states.get(id)!, updateProgress: async (value) => { job.progress = value; },
        updateData: async (data) => { job.data = data; } };
      jobs.set(id, job);
      return job;
    },
    getJob: async (id) => jobs.get(id), getJobCounts: async () => ({}), isPaused: async () => false,
    remove: async (id) => { jobs.delete(id); }, close: async () => {},
  };
  const queue = new CaptureQueue(host, config);
  const store = new CaptureStore({ storage, cache: new CaptureCache(new MemoryCacheBackend()) });
  const worker = new CaptureWorker({ run: async () => {}, close: async () => {} }, config, createWorkerExecutor({ engine, store }));
  const dispatcher = new CaptureDispatcher(queue, config, { waitUntilFinished: async (job) => {
    states.set(job.id!, "active");
    job.returnvalue = await worker.process(job);
    states.set(job.id!, "completed");
    return job.returnvalue;
  } });
  const reserved = new Map<string, string>();
  const settlements: boolean[] = [];
  const service = new CaptureService({ queue, dispatcher,
    admission: { acquireJob: async () => {}, releaseJob: async () => {} },
    billing: {
      reserveCapture: async (account, id) => { reserved.set(id, account); return true; },
      linkReservationToJob: async (_, id, job) => { assert.equal(id, job); },
      reservationForJob: async (account, id) => reserved.get(id) === account ? id : null,
      settleCapture: async (id, success) => { if (reserved.delete(id)) settlements.push(success); }, recordCapture: async () => {},
    },
  });
  for (const format of ["png", "pdf"] as const) {
    const snapshot = await service.submit({ accountId: "fixture-account" }, {
      url: base, format, cache_ttl: 0, store: true, timeout: 10_000,
      viewport: { width: 320, height: 240 }, fail_if_content_missing: ["Capture delivery test"],
    }, `request-${format}`, "sync");
    assert.equal(snapshot.state, "completed");
    const data = snapshot.result?.data;
    assert.ok(data?.cdn_url);
    assert.equal(data.data_url, undefined);
    const response = await fetch(data.cdn_url);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(response.status, 200);
    assert.equal(bytes.length, data.bytes);
    if (format === "png") {
      assert.deepEqual(bytes.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      assert.equal(bytes.readUInt32BE(16), 320);
      assert.equal(bytes.readUInt32BE(20), 240);
    } else {
      assert.equal(response.headers.get("content-type"), "application/pdf");
      assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
    }
    await assert.rejects(service.lookup({ accountId: "another-account" }, snapshot.id, "other"), /Job not found/);
  }
  assert.deepEqual(settlements, [true, true]);
});
