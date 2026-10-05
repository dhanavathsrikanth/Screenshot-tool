import test from "node:test";
import assert from "node:assert/strict";
import { Semaphore, sleep, truncateText } from "./util.js";

test("sleep resolves after the delay", async () => {
  const started = Date.now();
  await sleep(30);
  assert.ok(Date.now() - started >= 25);
});

test("Semaphore never exceeds its limit", async () => {
  const semaphore = new Semaphore(2);
  let active = 0;
  let maxActive = 0;
  const task = async () => {
    await semaphore.acquire();
    active += 1;
    maxActive = Math.max(maxActive, active);
    await sleep(20);
    active -= 1;
    semaphore.release();
  };

  await Promise.all(Array.from({ length: 6 }, task));
  assert.equal(maxActive, 2);
  assert.equal(active, 0);
  assert.equal(semaphore.inFlight, 0);
});

test("Semaphore hands queued waiters a live slot", async () => {
  const semaphore = new Semaphore(1);
  const order: number[] = [];

  const first = (async () => {
    await semaphore.acquire();
    order.push(1);
    await sleep(30);
    semaphore.release();
  })();
  const second = (async () => {
    await semaphore.acquire();
    order.push(2);
    semaphore.release();
  })();

  await Promise.all([first, second]);
  assert.deepEqual(order, [1, 2]);
  assert.equal(semaphore.inFlight, 0);
});

test("truncateText passes short values through", () => {
  assert.equal(truncateText("hello", 10), "hello");
});

test("truncateText truncates long values with ellipsis", () => {
  const value = "x".repeat(50);
  const result = truncateText(value, 10);
  assert.equal(result.length, 11);
  assert.ok(result.endsWith("…"));
});
