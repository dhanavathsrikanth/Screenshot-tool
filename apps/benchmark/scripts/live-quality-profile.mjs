import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createEngine } from "@snapforge/engine";
import { SITE_SUITE } from "../dist/src/sites.js";
import { evaluateCapture } from "../dist/src/checks.js";

const site = SITE_SUITE.find((site) => site.id === process.argv[2]);
const output = process.argv[3];
if (!site || !output) throw new Error("Usage: node scripts/live-quality-profile.mjs <site-id> <output-dir>");
const directory = resolve(output);
mkdirSync(directory, { recursive: true });
const prewarmPages = process.argv[4] !== "--no-prewarm";
const engine = createEngine({ maxConcurrentCaptures: 1, autoConcurrency: false, prewarmPages });
const rows = [];
try {
  for (const delay of [site.options?.delay ?? 0, 5000]) {
    const outcome = await engine.capture({ ...site.options, url: site.url, delay }, { inspectPage: true });
    const text = [outcome.inspection?.markdown, outcome.inspection?.accessibleTree].filter(Boolean).join("\n");
    const row = { delay, prewarmPages, data: outcome.data, timings: outcome.timings, failures: evaluateCapture(site, outcome.data, outcome.buffer, text), inspection: outcome.inspection };
    rows.push(row);
    writeFileSync(resolve(directory, `${delay}.${outcome.data.format}`), outcome.buffer);
    console.log(JSON.stringify({ delay, bytes: outcome.data.bytes, height: outcome.data.height, timings: outcome.timings, failures: row.failures }));
  }
} finally {
  await engine.close();
  writeFileSync(resolve(directory, "profile.json"), JSON.stringify(rows, null, 2));
}
