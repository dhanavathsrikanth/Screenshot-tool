import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import sharp from "sharp";
import { writeFile } from "node:fs/promises";
import { createEngine } from "./engine.js";

test("late HubSpot chat widgets stay out of full-page captures and can be retained explicitly", { timeout: 60_000 }, async (t) => {
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html" });
    response.end('<html><body style="margin:0;background:rgb(103,61,230);width:800px"><main style="height:1600px">Complete page with ordinary content</main><script>let added=false;addEventListener("scroll",()=>{if(scrollY>800&&!added){added=true;setTimeout(()=>{const widget=document.createElement("div");widget.id="hubspot-messages-iframe-container";widget.style="position:fixed;bottom:0;right:0;width:200px;height:120px;background:white";widget.textContent="Late chat popup";document.body.append(widget)},100)})</script></body></html>');
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const engine = createEngine({ stealth: false, maxConcurrentCaptures: 1, autoConcurrency: false });
  t.after(async () => { await engine.close(); await new Promise<void>((resolve) => server.close(() => resolve())); });
  const options = { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, viewport: { width: 800, height: 500 }, full_page: true, timeout: 20_000, cache_ttl: 0, block_cookie_banners: false };
  const hidden = await engine.capture(options, { inspectPage: true });
  const retained = await engine.capture({ ...options, block_chats: false }, { inspectPage: true });
  await writeFile(".qa/hubspot/chat-retained.png", retained.buffer);
  console.log(retained.data, retained.inspection?.markdown);
  const pixel = async (buffer: Buffer) => Array.from(await sharp(buffer).extract({ left: 1500, top: 3150, width: 1, height: 1 }).removeAlpha().raw().toBuffer());
  assert.deepEqual(await pixel(hidden.buffer), [103, 61, 230]);
  assert.deepEqual(await pixel(retained.buffer), [255, 255, 255]);
  assert.doesNotMatch(hidden.inspection?.markdown ?? "", /Late chat popup/);
  assert.match(retained.inspection?.markdown ?? "", /Late chat popup/);
  assert.equal(hidden.data.height, 3200);
  assert.equal(retained.data.height, 3200);
});
