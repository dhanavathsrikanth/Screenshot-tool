import test from "node:test";
import assert from "node:assert/strict";
import { captureRequestSchema, captureWebhookSchema, idempotencyKeySchema } from "./request.js";

test("public requests preserve callback configuration without accepting credentials in its URL", () => {
  const webhook = { url: "https://receiver.example.com/callback", secret: "long-test-secret-value" };
  assert.deepEqual(captureRequestSchema.parse({ url: "example.com", webhook }).webhook, webhook);
  for (const url of ["not a URL", "http://receiver.example.com/", "https://user:password@receiver.example.com/",
    "https://receiver.example.com:8443/", "https://receiver.example.com/#fragment"]) {
    assert.equal(captureWebhookSchema.safeParse({ ...webhook, url }).success, false);
  }
  assert.equal(captureWebhookSchema.safeParse({ ...webhook, secret: "short" }).success, false);
  for (const key of ["", "contains spaces", "a".repeat(129), "line\nbreak"]) assert.equal(idempotencyKeySchema.safeParse(key).success, false);
});
