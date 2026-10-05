import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { SnapforgeError } from "@snapforge/contracts";
import {
  classifyErrorMessage,
  looksLikeChallenge,
  toSnapforgeError,
} from "./errors.js";

test("classifyErrorMessage maps crash messages", () => {
  assert.equal(classifyErrorMessage("Target page, browser or context has been closed"), "render_crashed");
  assert.equal(classifyErrorMessage("Protocol error: Target crashed"), "render_crashed");
  assert.equal(classifyErrorMessage("Page crashed"), "render_crashed");
});

test("classifyErrorMessage maps navigation messages", () => {
  assert.equal(classifyErrorMessage("net::ERR_CONNECTION_REFUSED at http://x"), "navigation_failed");
  assert.equal(classifyErrorMessage("getaddrinfo ENOTFOUND example.invalid"), "navigation_failed");
  assert.equal(classifyErrorMessage("Cannot navigate to invalid URL"), "internal_error");
});

test("classifyErrorMessage maps timeout messages", () => {
  assert.equal(classifyErrorMessage("Timeout 30000ms exceeded."), "render_timeout");
  assert.equal(classifyErrorMessage("Timeout 5000ms exceeded. waiting for selector \"#a\""), "render_timeout");
  assert.equal(classifyErrorMessage("Timeout 5000ms exceeded. waiting for content (at least 400 characters)"), "render_timeout");
  assert.equal(classifyErrorMessage("page.waitForSelector: Timeout 3000ms exceeded"), "render_timeout");
});

test("classifyErrorMessage defaults to internal_error", () => {
  assert.equal(classifyErrorMessage("something inexplicable"), "internal_error");
});

test("looksLikeChallenge uses status codes", () => {
  assert.equal(looksLikeChallenge(403, "Welcome", ""), true);
  assert.equal(looksLikeChallenge(429, "Welcome", ""), true);
  assert.equal(looksLikeChallenge(451, "Welcome", ""), true);
  assert.equal(looksLikeChallenge(200, "Welcome", ""), false);
});

test("looksLikeChallenge uses title patterns", () => {
  assert.equal(looksLikeChallenge(200, "Just a moment...", ""), true);
  assert.equal(looksLikeChallenge(200, "Attention Required! | Cloudflare", ""), true);
  assert.equal(looksLikeChallenge(200, "Example Domain", ""), false);
});

test("looksLikeChallenge uses body patterns for error statuses", () => {
  assert.equal(looksLikeChallenge(503, "Service Unavailable", "ray id 7ab1 cloudflare"), true);
  assert.equal(looksLikeChallenge(503, "Service Unavailable", "please try again later"), false);
  assert.equal(looksLikeChallenge(200, "Docs", "cloudflare mentions"), false);
});

test("looksLikeChallenge ignores titles that only mention captcha", () => {
  assert.equal(
    looksLikeChallenge(200, "Cloudflare Turnstile - Easy CAPTCHA Alternative", ""),
    false,
  );
  assert.equal(looksLikeChallenge(200, "Captcha Verification", ""), true);
  assert.equal(looksLikeChallenge(200, "Solve the captcha", ""), true);
});

test("looksLikeChallenge flags bot walls in 200-status bodies", () => {
  assert.equal(
    looksLikeChallenge(200, "Reddit", "Prove your humanity. Complete the challenge below"),
    true,
  );
  assert.equal(looksLikeChallenge(200, "IMDb", "Let's confirm you are human"), true);
  assert.equal(looksLikeChallenge(200, "Docs", "a guide to human centered design"), false);
});

test("toSnapforgeError maps ZodError to invalid_request", () => {
  const schema = z.object({ url: z.string().min(1) });
  const parsed = schema.safeParse({});
  assert.ok(!parsed.success);
  const error = toSnapforgeError(parsed.error, "req_1");
  assert.equal(error.code, "invalid_request");
  assert.equal(error.requestId, "req_1");
  const details = error.details as { issues: { path: string }[] };
  assert.equal(details.issues[0]?.path, "url");
});

test("toSnapforgeError passes SnapforgeError through", () => {
  const original = new SnapforgeError({
    code: "blocked_by_target",
    message: "blocked",
    requestId: "req_2",
  });
  const result = toSnapforgeError(original, "req_other");
  assert.equal(result, original);
});

test("toSnapforgeError merges extraDetails into SnapforgeError", () => {
  const original = new SnapforgeError({
    code: "render_crashed",
    message: "boom",
    requestId: "req_3",
    details: { attempt: 1 },
  });
  const result = toSnapforgeError(original, "req_3", { artifacts: { dom: "<html/>" } });
  assert.notEqual(result, original);
  assert.equal(result.code, "render_crashed");
  assert.deepEqual(result.details, { attempt: 1, artifacts: { dom: "<html/>" } });
});

test("toSnapforgeError classifies raw playwright errors", () => {
  const nav = toSnapforgeError(new Error("net::ERR_NAME_NOT_RESOLVED"), "req_4");
  assert.equal(nav.code, "navigation_failed");
  assert.equal(nav.retriable, true);

  const crash = toSnapforgeError(new Error("Target page, browser or context has been closed"), "req_5");
  assert.equal(crash.code, "render_crashed");

  const unknown = toSnapforgeError("plain string failure", "req_6");
  assert.equal(unknown.code, "internal_error");
  assert.equal(unknown.message, "plain string failure");
});

test("toSnapforgeError keeps extra details and stack", () => {
  const error = toSnapforgeError(new Error("weird"), "req_7", { stage: "nav" });
  assert.equal(error.details?.stage, "nav");
  assert.ok(typeof error.details?.stack === "string");
});
