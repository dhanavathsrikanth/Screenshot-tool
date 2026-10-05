import assert from "node:assert/strict";
import http from "node:http";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createEngine } from "@snapforge/engine";

const output = process.argv[2];
if (!output) throw new Error("Usage: node scripts/warm-profile.mjs <output.json>");
const server = http.createServer((request, response) => {
  response.writeHead(200, { "content-type": "text/html", "cache-control": "no-store" });
  response.end("<!doctype html><html><head><title>Warm worker fixture</title></head><body><h1>Static fixture</h1><p>A fresh capture after worker initialization, with no image cache.</p></body></html>");
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const engine = createEngine({ maxConcurrentCaptures: 1, autoConcurrency: false });
const start = performance.now();
const report = { initialized_ms: 0, captures: [] };
try {
  await engine.warm();
  report.initialized_ms = Math.round(performance.now() - start);
  let pixels;
  for (let i = 0; i < 3; i++) {
    const outcome = await engine.capture({ url: `http://127.0.0.1:${server.address().port}`, timeout: 30_000 });
    assert.equal(outcome.data.cached, false);
    if (pixels) assert.deepEqual(outcome.buffer, pixels);
    pixels = outcome.buffer;
    const row = { capture: i + 1, timings: outcome.timings, bytes: pixels.length, cached: false };
    report.captures.push(row);
    console.log(JSON.stringify(row));
  }
} finally {
  await engine.close();
  await new Promise((resolve) => server.close(resolve));
  mkdirSync(dirname(resolve(output)), { recursive: true });
  writeFileSync(resolve(output), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ initialized_ms: report.initialized_ms }));
}
