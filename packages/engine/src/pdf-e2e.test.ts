import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createEngine } from "./engine.js";

test("full-page PDF prepares below-fold content and preserves the screen layout", { timeout: 60_000 }, async (t) => {
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html" });
    response.end(`<!doctype html><html><head><title>PDF quality fixture</title>
      <style>body{margin:0;font-family:Arial}section{height:600px;padding:24px;box-sizing:border-box}h1{font-size:32px}img{width:160px;height:80px}@media print{main{display:none}}</style></head>
      <body><main><section><h1>Screen layout PDF</h1><p>Screen images with a complete page.</p></section>
      <section><h2>Middle section</h2><p>Content remains in the document.</p></section>
      <section id="lazy"><h2 id="status">Waiting for scroll</h2><img alt="Loaded illustration"></section>
      <footer>Complete document footer</footer></main><script>
      const observer = new IntersectionObserver(entries => {
        if (!entries.some(entry => entry.isIntersecting)) return;
        document.querySelector('#status').textContent = 'Below-fold content loaded';
        document.querySelector('img').src = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="80"><rect width="160" height="80" fill="purple"/><text x="10" y="45" fill="white">Loaded image</text></svg>');
        observer.disconnect();
      });
      observer.observe(document.querySelector('#lazy'));
      </script></body></html>`);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const engine = createEngine({ stealth: false, maxConcurrentCaptures: 1, autoConcurrency: false });
  t.after(async () => { await engine.close(); await new Promise<void>((resolve) => server.close(() => resolve())); });
  const result = await engine.capture({
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    viewport: { width: 800, height: 600 },
    format: "pdf",
    full_page: true,
    cache_ttl: 0,
    timeout: 20_000,
    fail_if_content_missing: ["Below-fold content loaded", "Complete document footer"],
  }, { inspectPage: true });
  assert.equal(result.buffer.subarray(0, 5).toString(), "%PDF-");
  assert.ok(result.buffer.length > 10_000);
  assert.match(result.inspection?.markdown ?? "", /Below-fold content loaded/);
  assert.equal(result.data.width, 800);
  assert.equal(result.data.height, 1818);
  if (process.env.SNAPFORGE_PDF_QA_DIR) {
    await mkdir(process.env.SNAPFORGE_PDF_QA_DIR, { recursive: true });
    await writeFile(join(process.env.SNAPFORGE_PDF_QA_DIR, "quality-fixture.pdf"), result.buffer);
  }
});
