import test from "node:test";
import assert from "node:assert/strict";
import { startWorkerRuntime } from "../src/main.js";

test("worker waits for browser initialization before accepting jobs", async () => {
  const calls: string[] = [];
  let ready: (() => void) | undefined;
  const initialized = new Promise<void>((resolve) => { ready = resolve; });
  const started = startWorkerRuntime({
    engine: { warm: async () => { calls.push("warming"); await initialized; calls.push("ready"); } },
    worker: { start: async () => { calls.push("accepting"); } },
    close: async () => { calls.push("closed"); },
  });
  assert.deepEqual(calls, ["warming"]);
  ready!();
  await started;
  assert.deepEqual(calls, ["warming", "ready", "accepting"]);
});

test("failed initialization cleans up and never accepts a capture job", async () => {
  const failure = new Error("Browser launch failed");
  let accepting = false;
  let closed = false;
  await assert.rejects(startWorkerRuntime({
    engine: { warm: async () => { throw failure; } },
    worker: { start: async () => { accepting = true; } },
    close: async () => { closed = true; },
  }), (error) => error === failure);
  assert.equal(accepting, false);
  assert.equal(closed, true);
});

test("readiness is published after warmup and withdrawn when the worker stops", async () => {
  const calls: string[] = [];
  await startWorkerRuntime({
    engine: { warm: async () => { calls.push("warm"); } },
    worker: { start: async () => { calls.push("run"); } },
    heartbeat: { start: async () => { calls.push("ready"); }, close: async () => { calls.push("not-ready"); } },
    close: async () => {},
  });
  assert.deepEqual(calls, ["warm", "run", "ready", "not-ready"]);
});
