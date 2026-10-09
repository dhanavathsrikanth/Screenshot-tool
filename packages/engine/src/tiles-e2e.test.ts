import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream } from "pdf-lib";
import { chromium } from "playwright";
import { captureOptionsSchema, SnapforgeError } from "@snapforge/contracts";
import { createEngine } from "./engine.js";
import { scrollThrough } from "./fullpage.js";
import { captureTiles } from "./tiles.js";

const config = { maxPageHeight: 24_000, maxScrollSteps: 80, scrollSettleMs: 140, maxPinnedElements: 120, timeoutMs: 10_000 };

test("scroll capture preserves reveal animations, lazy media, and delayed growth at 2x", { timeout: 120_000 }, async (t) => {
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html" });
    response.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Scroll capture fixture</title>
      <style>html{scroll-behavior:smooth;scroll-snap-type:y mandatory}body{margin:0;background:white;font-family:Arial}section{height:500px;box-sizing:border-box;scroll-snap-align:start;padding:80px 40px}.reveal{opacity:0;transition:opacity 1s}.visible{opacity:1;background:rgb(103,61,230);color:white}header{position:fixed;top:0;left:0;right:0;height:30px;background:white;color:rgb(103,61,230);z-index:5}img{width:120px;height:80px}</style></head>
      <body><header>One header</header><main><p id="scrollEvidence" style="position:absolute;top:30px">Upward scrolls: 0</p><section class="reveal"><h1>Top reveal</h1></section><section class="reveal"><h2>Middle reveal</h2></section>
      <section class="reveal"><h2>Lazy media</h2><img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='80'%3E%3C/svg%3E" data-src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='80'%3E%3Crect width='120' height='80' fill='white'/%3E%3C/svg%3E"></section>
      <section class="reveal" id="bottom"><h2>Initial bottom</h2></section></main><script>
      let grown = false;
      let lastY = 0;
      let upwardScrolls = 0;
      window.addEventListener('scroll', () => {
        if (scrollY < lastY) document.querySelector('#scrollEvidence').textContent = 'Upward scrolls: ' + (++upwardScrolls);
        lastY = scrollY;
      });
      const observer = new IntersectionObserver(entries => {
        for (const entry of entries) {
          entry.target.classList.toggle('visible', entry.isIntersecting);
          if (entry.target.id === 'bottom' && entry.isIntersecting && !grown) {
            grown = true;
            setTimeout(() => {
              const section = document.createElement('section');
              section.className = 'reveal';
              section.innerHTML = '<h2>Delayed footer</h2>';
              document.querySelector('main').append(section);
              observer.observe(section);
            }, 300);
          }
        }
      }, {threshold:0.15});
      document.querySelectorAll('section').forEach(el => observer.observe(el));
      </script></body></html>`);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const engine = createEngine({ stealth: false, maxConcurrentCaptures: 1, autoConcurrency: false });
  t.after(async () => { await engine.close(); await new Promise<void>((resolve) => server.close(() => resolve())); });
  const options = { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, viewport: { width: 800, height: 500 }, full_page: true, cache_ttl: 0, timeout: 20_000 };
  const png = await engine.capture(options, { inspectPage: true });
  assert.match(png.inspection?.markdown ?? "", /Upward scrolls: 1/);
  assert.equal(png.data.render_diagnostics?.stopped_reason, "bottom");
  assert.equal(png.data.width, 1600);
  assert.equal(png.data.height, 5000);
  const { data, info } = await sharp(png.buffer).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixel = (x: number, y: number) => Array.from(data.subarray((y * info.width + x) * info.channels, (y * info.width + x) * info.channels + 3));
  for (const y of [300, 1300, 2300, 3300, 4300]) {
    assert.deepEqual(pixel(1400, y), [103, 61, 230], `revealed section at ${y} must be visible`);
  }
  assert.deepEqual(pixel(100, 2400), [255, 255, 255], "lazy data-src must replace the transparent placeholder");
  assert.deepEqual(pixel(10, 10), [255, 255, 255], "fixed header appears at the top");
  assert.deepEqual(pixel(10, 1700), [103, 61, 230], "fixed header does not repeat after scrolling");

  const pdf = await engine.capture({ ...options, format: "pdf" });
  const document = await PDFDocument.load(pdf.buffer);
  assert.equal(document.getPageCount(), 1);
  assert.equal(pdf.data.width, 800);
  assert.equal(pdf.data.height, 2500);
  assert.deepEqual(document.getPage(0).getSize(), { width: 600, height: 1875 });
  const objects = document.getPage(0).node.Resources()!.lookup(PDFName.of("XObject"), PDFDict);
  const images = objects.values().map((ref) => document.context.lookup(ref));
  assert.ok(images.length >= 5);
  for (const image of images) {
    assert.ok(image instanceof PDFRawStream);
    assert.equal(image.dict.lookup(PDFName.of("Width"), PDFNumber).asNumber(), 1600);
  }
  if (process.env.SNAPFORGE_PDF_QA_DIR) {
    await mkdir(process.env.SNAPFORGE_PDF_QA_DIR, { recursive: true });
    await writeFile(join(process.env.SNAPFORGE_PDF_QA_DIR, "scroll-quality.png"), png.buffer);
    await writeFile(join(process.env.SNAPFORGE_PDF_QA_DIR, "scroll-quality.pdf"), pdf.buffer);
  }
});

test("scroll capture bounds, cleanup, and fractional device scaling", { timeout: 120_000 }, async (t) => {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const context = await browser.newContext({ viewport: { width: 412, height: 600 }, deviceScaleFactor: 2.625 });
  const page = await context.newPage();
  await page.setContent('<html style="scroll-behavior:smooth"><body style="margin:0"><main style="height:2500px">Fractional scale content</main></body></html>');
  const options = captureOptionsSchema.parse({ url: "https://example.com", full_page: true });
  const output = await captureTiles(page, options, { ...config, maxPageHeight: 2000 }, 2.625, "fractional");
  assert.equal(output.width, 1082);
  assert.equal(output.height, 5250);
  assert.equal(output.diagnostics?.truncated, true);
  assert.equal(await page.evaluate(() => scrollY), 0);
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior), "smooth");
  await assert.rejects(captureTiles(page, options, { ...config, maxScrollSteps: 1 }, 2.625, "bounded"), (error: unknown) => error instanceof SnapforgeError && error.code === "render_incomplete");
  const timedOut = await scrollThrough(page, { ...config, timeoutMs: 0 });
  assert.equal(timedOut.stopped_reason, "timeout");
  assert.equal(await page.evaluate(() => scrollY), 0);

  const pdf = await captureTiles(page, { ...options, format: "pdf" }, { ...config, maxPageHeight: 24_000 }, 2.625, "pdf");
  assert.equal((await PDFDocument.load(pdf.buffer)).getPageCount(), 1);

  const mobile = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, isMobile: true });
  const mobilePage = await mobile.newPage();
  await mobilePage.setContent('<html><body style="margin:0;height:3000px">Mobile layout without a viewport meta tag</body></html>');
  const mobileViewport = await sharp(await mobilePage.screenshot({ scale: "device" })).metadata();
  const mobileHeight = await mobilePage.evaluate(() => innerHeight);
  const mobileOutput = await captureTiles(mobilePage, options, config, 2.625, "mobile");
  assert.equal(mobileOutput.width, mobileViewport.width);
  assert.equal(mobileOutput.height, Math.round(3000 * mobileViewport.height! / mobileHeight));

  await page.setViewportSize({ width: 412, height: 2160 });
  await page.setContent('<html><body style="margin:0;height:24000px">Tall PDF footer</body></html>');
  const tall = await captureTiles(page, { ...options, format: "pdf" }, { ...config, timeoutMs: 40_000, allowStatic: true }, 2.625, "tall");
  const tallDocument = await PDFDocument.load(tall.buffer);
  assert.equal(tall.height, 24000);
  assert.equal(tall.diagnostics?.truncated, false);
  assert.equal(tallDocument.getPageCount(), 1);
  assert.equal(tallDocument.getPage(0).node.lookup(PDFName.of("UserUnit"), PDFNumber).asNumber(), 2);
  assert.equal(tallDocument.getPage(0).getHeight(), 9000);
});

test("section capture keeps the visible frame of infinite animations and restores playback", { timeout: 30_000 }, async (t) => {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 800, height: 500 }, deviceScaleFactor: 2 });
  await page.setContent(`<html><style>body{margin:0}main{height:1000px;background:rgb(103,61,230);animation:reveal 10s infinite}@keyframes reveal{0%,4%{opacity:0}5%,100%{opacity:1}}</style><body><main>Animated content</main></body></html>`);
  await page.waitForTimeout(650);
  const options = captureOptionsSchema.parse({ url: "https://example.com", full_page: true });
  const output = await captureTiles(page, options, config, 2, "infinite");
  const pixel = await sharp(output.buffer).extract({ left: 1400, top: 300, width: 1, height: 1 }).removeAlpha().raw().toBuffer();
  assert.deepEqual(Array.from(pixel), [103, 61, 230]);
  assert.equal(await page.evaluate(() => document.getAnimations()[0].playState), "running");
  assert.equal(output.diagnostics?.algorithm, "by_sections");
  assert.equal(output.diagnostics?.device_scale_factor, 2);
});

test("fixed footers appear at the bottom once and shadow headers do not repeat", { timeout: 30_000 }, async (t) => {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 800, height: 500 }, deviceScaleFactor: 2 });
  await page.setContent('<html><body style="margin:0;background:rgb(103,61,230)"><main style="height:1600px">Complete page</main><footer style="position:fixed;bottom:0;height:150px;width:100%;background:white">Footer</footer><div id="host"></div></body></html>');
  await page.evaluate(() => { document.querySelector("#host")!.attachShadow({ mode: "open" }).innerHTML = '<header style="position:fixed;top:0;height:30px;width:100%;background:white">Shadow header</header>'; });
  const output = await captureTiles(page, captureOptionsSchema.parse({ url: "https://example.com", full_page: true }), config, 2, "fixed");
  const pixel = async (top: number) => Array.from(await sharp(output.buffer).extract({ left: 1400, top, width: 1, height: 1 }).removeAlpha().raw().toBuffer());
  assert.deepEqual(await pixel(10), [255, 255, 255]);
  assert.deepEqual(await pixel(800), [103, 61, 230]);
  assert.deepEqual(await pixel(1710), [103, 61, 230]);
  assert.deepEqual(await pixel(3100), [255, 255, 255]);
  assert.equal(await page.locator("footer").evaluate((element) => (element as HTMLElement).style.visibility), "");
});

test("navigation that becomes fixed after scrolling does not repeat", { timeout: 30_000 }, async (t) => {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 800, height: 500 }, deviceScaleFactor: 2 });
  await page.setContent('<html><body style="margin:0;background:rgb(103,61,230)"><nav style="height:40px;width:100%;background:white">Navigation</nav><main style="height:1600px">Complete page</main><script>addEventListener("scroll",()=>{document.querySelector("nav").style.position=scrollY>0?"fixed":"static";document.querySelector("nav").style.top="0";document.querySelector("main").style.paddingTop=scrollY>0?"40px":"0"})</script></body></html>');
  const output = await captureTiles(page, captureOptionsSchema.parse({ url: "https://example.com", full_page: true }), config, 2, "dynamic-nav");
  const pixel = async (top: number) => Array.from(await sharp(output.buffer).extract({ left: 1400, top, width: 1, height: 1 }).removeAlpha().raw().toBuffer());
  assert.deepEqual(await pixel(10), [255, 255, 255]);
  assert.deepEqual(await pixel(860), [103, 61, 230]);
  assert.equal(await page.locator("nav").evaluate((element) => (element as HTMLElement).style.visibility), "");
});
