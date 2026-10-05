import test from "node:test";
import assert from "node:assert/strict";
import { captureOptionsSchema } from "@snapforge/contracts";
import { buildPdfOptions, planCapture, readPngSize } from "./formats.js";

function options(input: Record<string, unknown>) {
  return captureOptionsSchema.parse({ url: "https://example.com", ...input });
}

test("planCapture for viewport png produces no clip", () => {
  const plan = planCapture(
    options({}),
    {
      viewportWidth: 1280,
      viewportHeight: 720,
      deviceScaleFactor: 1,
      docWidth: 1280,
      docHeight: 5000,
    },
    24000,
  );
  assert.equal(plan.kind, "screenshot");
  assert.equal(plan.type, "png");
  assert.equal(plan.quality, undefined);
  assert.equal(plan.clip, undefined);
  assert.equal(plan.region.height, 720);
});

test("planCapture for full page clips to the document height", () => {
  const plan = planCapture(
    options({ full_page: true }),
    {
      viewportWidth: 1280,
      viewportHeight: 720,
      deviceScaleFactor: 1,
      docWidth: 1400,
      docHeight: 5000,
    },
    24000,
  );
  assert.ok(plan.clip);
  assert.equal(plan.clip?.height, 5000);
  assert.equal(plan.clip?.width, 1400);
});

test("planCapture caps full page height at maxPageHeight", () => {
  const plan = planCapture(
    options({ full_page: true }),
    {
      viewportWidth: 1280,
      viewportHeight: 720,
      deviceScaleFactor: 1,
      docWidth: 1280,
      docHeight: 999999,
    },
    24000,
  );
  assert.equal(plan.clip?.height, 24000);
});

test("planCapture never clips narrower than the viewport", () => {
  const plan = planCapture(
    options({ full_page: true }),
    {
      viewportWidth: 1280,
      viewportHeight: 720,
      deviceScaleFactor: 1,
      docWidth: 400,
      docHeight: 400,
    },
    24000,
  );
  assert.equal(plan.clip, undefined);
  assert.equal(plan.region.width, 1280);
  assert.equal(plan.region.height, 720);
});

test("planCapture keeps quality for lossy formats only", () => {
  const metrics = {
    viewportWidth: 1280,
    viewportHeight: 720,
    deviceScaleFactor: 1,
    docWidth: 1280,
    docHeight: 720,
  };
  const jpeg = planCapture(options({ format: "jpeg", quality: 60 }), metrics, 24000);
  assert.equal(jpeg.type, "jpeg");
  assert.equal(jpeg.quality, 60);

  const webp = planCapture(options({ format: "webp", quality: 40 }), metrics, 24000);
  assert.equal(webp.type, "webp");
  assert.equal(webp.quality, 40);
});

test("planCapture for pdf ignores clipping", () => {
  const plan = planCapture(
    options({ format: "pdf", full_page: true }),
    {
      viewportWidth: 1280,
      viewportHeight: 720,
      deviceScaleFactor: 1,
      docWidth: 1280,
      docHeight: 9000,
    },
    24000,
  );
  assert.equal(plan.kind, "pdf");
  assert.equal(plan.clip, undefined);
});

test("buildPdfOptions sets print defaults and single page unless full page", () => {
  const metrics = {
    viewportWidth: 800,
    viewportHeight: 600,
    deviceScaleFactor: 1,
    docWidth: 800,
    docHeight: 600,
  };
  const single = buildPdfOptions(options({ format: "pdf" }), metrics);
  assert.equal(single.printBackground, true);
  assert.equal(single.pageRanges, "1");
  assert.equal(single.width, "800px");
  assert.equal(single.height, "600px");
  assert.equal(single.margin.top, "0px");

  const full = buildPdfOptions(options({ format: "pdf", full_page: true }), metrics);
  assert.equal(full.pageRanges, undefined);
});

function pngHeader(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(24);
  buffer.writeUInt8(0x89, 0);
  buffer.write("PNG", 1, "ascii");
  buffer.writeUInt8(0x0d, 4);
  buffer.writeUInt8(0x0a, 5);
  buffer.writeUInt8(0x1a, 6);
  buffer.writeUInt8(0x0a, 7);
  buffer.writeUInt32BE(13, 8);
  buffer.write("IHDR", 12, "ascii");
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

test("readPngSize parses width and height from a png header", () => {
  assert.deepEqual(readPngSize(pngHeader(800, 600)), { width: 800, height: 600 });
});

test("readPngSize rejects non-png and short buffers", () => {
  assert.equal(readPngSize(Buffer.from("not a png at all, really long")), null);
  assert.equal(readPngSize(Buffer.from([0x89, 0x50])), null);
});
