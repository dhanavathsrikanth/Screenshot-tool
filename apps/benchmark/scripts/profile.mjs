import http from "node:http";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createEngine } from "@snapforge/engine";

const output = process.argv[2];
if (!output) throw new Error("Usage: node scripts/profile.mjs <output.json> [url ...]");
const server = http.createServer((req, res) => {
  res.setHeader("content-type", "text/html");
  const body = req.url === "/hydration"
    ? '<main id="content">Loading</main><script>setTimeout(() => { document.getElementById("content").innerHTML = "<h1>Hydrated fixture</h1><p>" + "Hydrated content. ".repeat(60) + "</p>"; }, 900);</script>'
    : "<h1>Example Domain</h1><p>This domain is for use in documentation examples without needing permission.</p>";
  res.end(`<!doctype html><html><head><title>Performance fixture</title></head><body>${body}</body></html>`);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const engine = createEngine({ maxConcurrentCaptures: 1, autoConcurrency: false });
const results = [];
try {
  const targets = [
    ...Array.from({ length: 3 }, (_, index) => ({ id: `static-${index + 1}`, url: base })),
    { id: "hydration", url: `${base}/hydration` },
    ...process.argv.slice(3).map((url) => ({ id: url, url })),
  ];
  for (const target of targets) {
    try {
      const outcome = await engine.capture({ url: target.url, timeout: 45_000 }, { inspectPage: true });
      const row = {
        ...target, ok: true, timings: outcome.timings, bytes: outcome.buffer.length,
        width: outcome.data.width, height: outcome.data.height,
        text: outcome.inspection?.markdown,
      };
      results.push(row);
      console.log(JSON.stringify(row));
    } catch (error) {
      const row = { ...target, ok: false, code: error.code, message: error.message, timings: error.details?.timings };
      results.push(row);
      console.log(JSON.stringify(row));
    }
  }
} finally {
  await engine.close();
  await new Promise((resolve) => server.close(resolve));
  const path = resolve(output);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({ recorded_at: new Date().toISOString(), results }, null, 2));
}
if (results.some((row) => !row.ok)) process.exitCode = 1;
