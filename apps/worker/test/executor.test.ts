import test from "node:test";
import assert from "node:assert/strict";
import { SnapforgeError, type CaptureOptions, type CaptureSuccessData } from "@snapforge/contracts";
import { createWorkerExecutor } from "../src/executor.js";

/** Minimal stand-in for `SnapforgeEngine.capture`. Only the surface the executor touches. */
class FakeEngine {
  readonly calls: Array<{ input: unknown; options?: unknown }> = [];
  readonly errors: Error[] = [];
  readonly outcomes: CaptureOutcome[] = [];

  setOutcomes(outcomes: CaptureOutcome[]): void {
    this.outcomes.length = 0;
    this.outcomes.push(...outcomes);
  }

  setErrors(errors: Error[]): void {
    this.errors.length = 0;
    this.errors.push(...errors);
  }

  capture = async (input: unknown): Promise<CaptureOutcome> => {
    this.calls.push({ input });
    const nextError = this.errors.shift();
    if (nextError) throw nextError;
    const next = this.outcomes.shift();
    if (!next) throw new Error("FakeEngine has no more outcomes queued");
    return next;
  };
}

interface FakeStoreCall {
  options: CaptureOptions;
  data: CaptureSuccessData;
  buffer: Buffer;
}

class FakeStore {
  readonly calls: FakeStoreCall[] = [];
  readonly responses: CaptureSuccessData[] = [];
  readonly errors: Error[] = [];

  setResponses(responses: CaptureSuccessData[]): void {
    this.responses.length = 0;
    this.responses.push(...responses);
  }

  setErrors(errors: Error[]): void {
    this.errors.length = 0;
    this.errors.push(...errors);
  }

  save = async (
    options: CaptureOptions,
    data: CaptureSuccessData,
    buffer: Buffer,
  ): Promise<CaptureSuccessData> => {
    this.calls.push({ options, data, buffer });
    const nextError = this.errors.shift();
    if (nextError) throw nextError;
    const next = this.responses.shift();
    if (!next) throw new Error("FakeStore has no more responses queued");
    return next;
  };
}

interface CaptureOutcome {
  data: CaptureSuccessData;
  buffer: Buffer;
}

const OPTIONS: CaptureOptions = { url: "https://example.com/", cache_ttl: 60 } as unknown as CaptureOptions;

const DATA: CaptureSuccessData = {
  url: "https://example.com/",
  final_url: "https://example.com/",
  format: "png",
  width: 1280,
  height: 720,
  duration_ms: 250,
  bytes: 4,
  blocked_requests: 0,
  cached: false,
  cdn_url: "https://cdn.example.com/fixture.png",
};

function logger() {
  const events: Array<{ level: string; message: string; fields?: Record<string, unknown> }> = [];
  const fn = (
    level: "debug" | "info" | "warn" | "error",
    message: string,
    fields?: Record<string, unknown>,
  ) => {
    events.push({ level, message, ...(fields ? { fields } : {}) });
  };
  return Object.assign(fn, { events });
}

test("executor forwards capture options to the engine", async () => {
  const engine = new FakeEngine();
  const store = new FakeStore();
  const log = logger();
  const executor = createWorkerExecutor({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    engine: engine as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    store: store as any,
    logger: log,
  });

  engine.setOutcomes([{ data: DATA, buffer: Buffer.from("abcd") }]);
  store.setResponses([{ ...DATA, cdn_url: "https://cdn/x.png" }]);

  const context = {
    workerId: "worker-1",
    attempt: 1,
    signal: new AbortController().signal,
    updateProgress: async () => undefined,
  };
  const outcome = await executor(OPTIONS, context);

  assert.equal(engine.calls.length, 1, "engine.capture was invoked exactly once");
  assert.equal(engine.calls[0].input, OPTIONS, "engine received the original options object");
  assert.equal(outcome.data.cdn_url, "https://cdn/x.png", "executor returns the store response");
  assert.equal(store.calls.length, 1, "store.save was invoked exactly once");
  assert.equal(store.calls[0].options, OPTIONS);
  assert.equal(store.calls[0].buffer.toString(), "abcd");
  assert.equal(store.calls[0].data, DATA);
});

test("executor re-throws engine errors so the queue can decide retry policy", async () => {
  const engine = new FakeEngine();
  const store = new FakeStore();
  const log = logger();
  const executor = createWorkerExecutor({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    engine: engine as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    store: store as any,
    logger: log,
  });

  const failure = new Error("renderer exploded");
  engine.setErrors([failure]);

  const context = {
    workerId: "worker-1",
    attempt: 1,
    signal: new AbortController().signal,
    updateProgress: async () => undefined,
  };

  await assert.rejects(executor(OPTIONS, context), /renderer exploded/);
  assert.equal(store.calls.length, 0, "store.save was skipped when the engine failed");
  assert.ok(
    log.events.some((event) => event.level === "warn" && event.message === "worker job failed at engine"),
    "the failure was logged at warn level",
  );
});

test("executor propagates store.save errors so the job is not silently lost", async () => {
  const engine = new FakeEngine();
  const store = new FakeStore();
  const log = logger();
  const executor = createWorkerExecutor({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    engine: engine as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    store: store as any,
    logger: log,
  });

  engine.setOutcomes([{ data: DATA, buffer: Buffer.from("abcd") }]);
  const storeFailure = new Error("bucket rejected");
  store.setErrors([storeFailure]);

  const context = {
    workerId: "worker-1",
    attempt: 1,
    signal: new AbortController().signal,
    updateProgress: async () => undefined,
  };

  await assert.rejects(executor(OPTIONS, context), /bucket rejected/);
});

test("executor respects the abort signal forwarded by the queue", async () => {
  const engine = new FakeEngine();
  const store = new FakeStore();
  const executor = createWorkerExecutor({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    engine: engine as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    store: store as any,
  });

  const controller = new AbortController();
  controller.abort();

  engine.capture = async () => {
    throw controller.signal.reason ?? new Error("aborted");
  };

  const context = {
    workerId: "worker-1",
    attempt: 1,
    signal: controller.signal,
    updateProgress: async () => undefined,
  };

  await assert.rejects(executor(OPTIONS, context));
  assert.equal(store.calls.length, 0);
});

test("a cached capture is delivered without uploading it again", async () => {
  const engine = new FakeEngine();
  const store = new FakeStore();
  engine.setOutcomes([{ data: { ...DATA, cached: true }, buffer: Buffer.from("abcd") }]);
  const executor = createWorkerExecutor({ engine: engine as never, store: store as never });
  const result = await executor(OPTIONS, { workerId: "cache-worker", attempt: 1, signal: new AbortController().signal, updateProgress: async () => {} });
  assert.equal(result.data.cached, true);
  assert.equal(store.calls.length, 0);
});

test("an incomplete render is never persisted", async () => {
  const engine = new FakeEngine();
  const store = new FakeStore();
  engine.setErrors([new SnapforgeError({ code: "render_incomplete", message: "Loading shell", requestId: "quality" })]);
  const executor = createWorkerExecutor({ engine: engine as never, store: store as never });
  await assert.rejects(executor(OPTIONS, { workerId: "quality-worker", attempt: 1, signal: new AbortController().signal, updateProgress: async () => {} }), (error: unknown) => error instanceof SnapforgeError && error.code === "render_incomplete");
  assert.equal(store.calls.length, 0);
});

test("storage without a delivery URL cannot produce a billable successful capture", async () => {
  const engine = new FakeEngine();
  const store = new FakeStore();
  const { cdn_url: _url, ...undelivered } = DATA;
  engine.setOutcomes([{ data: undelivered, buffer: Buffer.from("abcd") }]);
  store.setResponses([undelivered]);
  const executor = createWorkerExecutor({ engine: engine as never, store: store as never });
  await assert.rejects(executor(OPTIONS, { workerId: "delivery-worker", attempt: 1, signal: new AbortController().signal, updateProgress: async () => {} }), /delivery URL is unavailable/);
});
