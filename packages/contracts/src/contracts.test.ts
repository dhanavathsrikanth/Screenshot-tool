import assert from "node:assert/strict";
import test from "node:test";
import { captureOptionsSchema } from "./options.js";
import { SnapforgeError, ERROR_HTTP_STATUS } from "./errors.js";
import { DEVICE_PRESETS } from "./presets.js";

test("captureOptionsSchema normalizes URLs without protocol", () => {
  const result = captureOptionsSchema.parse({
    url: "example.com/test",
  });
  assert.equal(result.url, "https://example.com/test");
  assert.equal(result.format, "png");
  assert.equal(result.timeout, 30000);
  assert.equal(result.block_ads, true);
  assert.equal(result.block_cookie_banners, true);
  assert.equal(result.wait_for_idle, true);
  assert.equal(result.dark_mode, false);
});

test("captureOptionsSchema accepts spec page modifiers and settlement flags", () => {
  const result = captureOptionsSchema.parse({
    url: "https://example.com",
    wait_for_idle: false,
    dark_mode: true,
    full_page: true,
    hide_selectors: [".banner"],
    custom_css: "body { margin: 0 }",
    custom_js: "window.__snapped = true",
  });
  assert.equal(result.wait_for_idle, false);
  assert.equal(result.dark_mode, true);
  assert.equal(result.full_page, true);
  assert.deepEqual(result.hide_selectors, [".banner"]);
  assert.equal(result.custom_css, "body { margin: 0 }");
  assert.equal(result.custom_js, "window.__snapped = true");
});

test("captureOptionsSchema rejects invalid URLs", () => {
  assert.throws(() => {
    captureOptionsSchema.parse({ url: "not-a-valid-domain" });
  });
});

test("SnapforgeError generates standard error envelope", () => {
  const err = new SnapforgeError({
    code: "render_timeout",
    message: "Page took longer than 30s to settle",
    requestId: "req_test_123",
  });

  assert.equal(err.statusCode, ERROR_HTTP_STATUS.render_timeout);
  assert.equal(err.retriable, true);

  const envelope = err.toEnvelope();
  assert.equal(envelope.code, "render_timeout");
  assert.equal(envelope.request_id, "req_test_123");
  assert.equal(envelope.retriable, true);
});

test("device presets have valid viewports", () => {
  assert.ok(DEVICE_PRESETS.desktop_hd);
  assert.equal(DEVICE_PRESETS.desktop_hd.viewport.width, 1920);
  assert.equal(DEVICE_PRESETS.desktop_hd.viewport.height, 1080);
});

test("capture quality requirements are bounded and incomplete renders are retriable", () => {
  const options = captureOptionsSchema.parse({ url: "https://example.com", fail_if_content_missing: ["Report"], min_capture_height: 4000 });
  assert.equal(options.fail_if_incomplete, true);
  assert.throws(() => captureOptionsSchema.parse({ url: "https://example.com", fail_if_content_missing: [""] }));
  assert.throws(() => captureOptionsSchema.parse({ url: "https://example.com", min_capture_bytes: -1 }));
  const error = new SnapforgeError({ code: "render_incomplete", message: "Loading shell", requestId: "quality" });
  assert.equal(error.statusCode, 502);
  assert.equal(error.retriable, true);
});
