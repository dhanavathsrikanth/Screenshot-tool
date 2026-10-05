import assert from "node:assert/strict";
import http from "node:http";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildBannerRemovalScript, createEngine, createLauncher } from "@snapforge/engine";

const output = process.argv[2];
const reference = process.argv[3];
if (!output) throw new Error("Usage: node scripts/quality-profile.mjs <output-dir> [reference-dir]");
const directory = resolve(output);
mkdirSync(directory, { recursive: true });
const text = "Content for a deterministic quality fixture. ".repeat(40);
const html = (body, head = "") => `<!doctype html><html><head><meta charset="utf-8"><title>Quality fixture</title>${head}</head><body>${body}</body></html>`;
const server = http.createServer((request, response) => {
  const path = new URL(request.url, "http://localhost").pathname;
  if (path === "/image.svg") {
    setTimeout(() => {
      response.writeHead(200, { "content-type": "image/svg+xml", "cache-control": "no-store" });
      response.end('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="280"><rect width="600" height="280" fill="purple"/><circle cx="300" cy="140" r="100" fill="white"/></svg>');
    }, 800);
    return;
  }
  if (path === "/font.ttf") {
    setTimeout(() => {
      response.writeHead(200, { "content-type": "font/ttf", "cache-control": "no-store" });
      response.end(readFileSync(resolve(process.env.WINDIR ?? "C:/Windows", "Fonts", "arial.ttf")));
    }, 1200);
    return;
  }
  if (path === "/stream") {
    response.writeHead(200, { "content-type": "text/plain", "cache-control": "no-store" });
    response.write("Background stream");
    const timer = setTimeout(() => response.end("Complete"), 8000);
    response.on("close", () => clearTimeout(timer));
    return;
  }
  const bodies = {
    "/static": "<h1>Static fixture</h1><p>Short completed document for deterministic screenshot comparison.</p>",
    "/hydration": '<main>Loading</main><script>setTimeout(() => { document.querySelector("main").innerHTML = "<h1>Hydrated fixture</h1><p>" + ' + JSON.stringify(text) + ' + "</p>"; }, 900);</script>',
    "/image": `<h1>Delayed image</h1><p>${text}</p><img width="600" height="280" src="/image.svg">`,
    "/lazy": `<h1>Lazy images</h1><p>${text}</p>` + Array.from({ length: 6 }, (_, i) => `<section style="height:750px"><h2>Section ${i + 1}</h2><img loading="lazy" width="600" height="280" src="/image.svg?index=${i}"></section>`).join(""),
    "/growth": `<main><h1>Growing fixture</h1><p>${text}</p></main><script>setTimeout(() => { const root = document.querySelector("main"); root.insertAdjacentHTML("beforeend", '<div style="height:2000px"></div><h2>Loaded footer</h2><img loading="lazy" width="600" height="280" src="/image.svg">'); }, 900);</script>`,
    "/banner": `<h1>Delayed shadow consent</h1><p>${text}</p><div id="host"></div><script>setTimeout(() => { document.body.style.overflow = "hidden"; document.getElementById("host").attachShadow({mode:"open"}).innerHTML = '<div id="onetrust-banner-sdk" style="position:fixed;inset:0;background:purple">Consent overlay</div>'; }, 700);</script>`,
    "/font": `<h1>Delayed webfont</h1><p>${text}</p><style>@font-face{font-family:FixtureFont;src:url(/font.ttf)}body{font-family:FixtureFont,serif;font-size:20px}</style><script>fetch("/stream");</script>`,
  };
  response.writeHead(200, { "content-type": "text/html", "cache-control": "no-store" });
  response.end(html(bodies[path] ?? bodies["/static"]));
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const engine = createEngine({ maxConcurrentCaptures: 1, autoConcurrency: false });
const rows = [];
try {
  for (const name of ["static", "hydration", "image", "lazy", "growth", "banner", "font"]) {
    const options = { url: `${base}/${name}`, timeout: 30_000, full_page: name === "lazy" || name === "growth", ...(name === "banner" ? { delay: 1200 } : {}) };
    const outcome = await engine.capture(options, { inspectPage: true });
    const delayed = await engine.capture({ ...options, delay: 1800 }, { inspectPage: true });
    assert.deepEqual(outcome.buffer, delayed.buffer, `${name}: optimized pixels must match a longer-settled reference`);
    if (reference && name !== "font") assert.deepEqual(outcome.buffer, readFileSync(resolve(reference, `${name}.png`)), `${name}: pixels changed from baseline`);
    writeFileSync(resolve(directory, `${name}.png`), outcome.buffer);
    const row = { name, timings: outcome.timings, reference_timings: delayed.timings, bytes: outcome.buffer.length, width: outcome.data.width, height: outcome.data.height, identical_pixels: true };
    rows.push(row);
    console.log(JSON.stringify(row));
  }
  const browser = await createLauncher(false).launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(html("<main>" + "<div><span>Fixture content</span></div>".repeat(6000) + "</main>"));
    await page.evaluate(buildBannerRemovalScript(undefined, 60_000));
    const sweep = await page.evaluate(() => {
      const start = performance.now();
      for (let i = 0; i < 20; i++) window.__snapforgeBannerSweep.run();
      return (performance.now() - start) / 20;
    });
    rows.push({ name: "banner-sweep-12000-elements", average_sweep_ms: sweep });
    console.log(JSON.stringify(rows.at(-1)));
  } finally {
    await browser.close();
  }
} finally {
  await engine.close();
  await new Promise((resolve) => server.close(resolve));
  writeFileSync(resolve(directory, "profile.json"), JSON.stringify({ recorded_at: new Date().toISOString(), rows }, null, 2));
}
