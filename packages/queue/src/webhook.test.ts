import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  dispatchWebhook,
  eventForResult,
  isPrivateWebhookUrl,
  signPayload,
  verifySignature,
  WEBHOOK_EVENT_HEADER,
  WEBHOOK_ID_HEADER,
  SIGNATURE_HEADER,
  WEBHOOK_ATTEMPT_HEADER,
  type WebhookDelivery,
} from "./webhook.js";
import type { CaptureJobResult } from "./types.js";

const SECRET = "whsec_test_secret_1234";

const successResult: CaptureJobResult = {
  request_id: "req_1",
  mode: "async",
  ok: true,
  data: {
    url: "https://example.com",
    final_url: "https://example.com",
    format: "png",
    width: 1280,
    height: 720,
    bytes: 4096,
    duration_ms: 812,
    cached: false,
    blocked_requests: 0,
  },
  duration_ms: 812,
  attempts_made: 1,
  enqueued_at: 1_700_000_000_000,
  completed_at: 1_700_000_000_812,
  worker_id: "worker-1",
};

const webhookConfig = {
  webhookTimeoutMs: 200,
  webhookAttempts: 3,
  webhookBackoffMs: 1,
  webhookAllowPrivateHosts: true,
};

interface CapturedRequest {
  url: string;
  headers: Record<string, string>;
  body: string;
}

function recorder(
  handler: (captured: CapturedRequest, attempt: number) => { ok: boolean; status?: number },
): { fetchImpl: typeof fetch; requests: CapturedRequest[] } {
  const requests: CapturedRequest[] = [];
  const fetchImpl = (async (input: any, init: any) => {
    const captured: CapturedRequest = {
      url: String(input),
      headers: init?.headers ?? {},
      body: String(init?.body ?? ""),
    };
    requests.push(captured);
    const outcome = handler(captured, requests.length);
    const status = outcome.status ?? (outcome.ok ? 204 : 500);
    return {
      ok: outcome.ok,
      status,
      headers: new Headers(),
      text: async () => "",
      json: async () => ({}),
    } as unknown as Response;
  }) as unknown as typeof fetch;

  return { fetchImpl, requests };
}

describe("signPayload / verifySignature", () => {
  it("produces a t= and v1= header", () => {
    const signature = signPayload({ secret: SECRET, body: '{"a":1}', timestamp: 1_700_000_000 });
    assert.match(signature, /^t=1700000000,v1=[0-9a-f]{64}$/);
  });

  it("verifies its own signature", () => {
    const body = '{"a":1}';
    const signature = signPayload({ secret: SECRET, body });
    assert.equal(verifySignature({ secret: SECRET, body, signature }), true);
  });

  it("accepts a fresh signature inside the tolerance window", () => {
    const body = '{"a":1}';
    const signature = signPayload({ secret: SECRET, body, timestamp: Math.floor(Date.now() / 1000) });
    assert.equal(verifySignature({ secret: SECRET, body, signature, toleranceSeconds: 60 }), true);
  });

  it("rejects a tampered body", () => {
    const signature = signPayload({ secret: SECRET, body: '{"a":1}', timestamp: 1_700_000_000 });
    assert.equal(verifySignature({ secret: SECRET, body: '{"a":2}', signature }), false);
  });

  it("rejects a signature made with a different secret", () => {
    const body = '{"a":1}';
    const signature = signPayload({ secret: "other_secret_1234", body, timestamp: 1_700_000_000 });
    assert.equal(verifySignature({ secret: SECRET, body, signature }), false);
  });

  it("rejects a signature outside the tolerance window", () => {
    const body = '{"a":1}';
    const stale = Math.floor(Date.now() / 1000) - 600;
    const signature = signPayload({ secret: SECRET, body, timestamp: stale });
    assert.equal(verifySignature({ secret: SECRET, body, signature, toleranceSeconds: 300 }), false);
  });

  it("rejects malformed signatures", () => {
    assert.equal(verifySignature({ secret: SECRET, body: "x", signature: "garbage" }), false);
    assert.equal(verifySignature({ secret: SECRET, body: "x", signature: "t=abc,v1=zz" }), false);
    assert.equal(verifySignature({ secret: SECRET, body: "x", signature: "v1=only" }), false);
  });
});

describe("isPrivateWebhookUrl", () => {
  it("flags loopback, private ranges, and internal hostnames", () => {
    assert.equal(isPrivateWebhookUrl("http://127.0.0.1/hook"), true);
    assert.equal(isPrivateWebhookUrl("http://localhost:3000/hook"), true);
    assert.equal(isPrivateWebhookUrl("http://10.1.2.3/hook"), true);
    assert.equal(isPrivateWebhookUrl("http://172.16.5.4/hook"), true);
    assert.equal(isPrivateWebhookUrl("http://192.168.1.9/hook"), true);
    assert.equal(isPrivateWebhookUrl("http://169.254.169.254/hook"), true);
    assert.equal(isPrivateWebhookUrl("http://metadata.google.internal/hook"), true);
    assert.equal(isPrivateWebhookUrl("http://app.localhost/hook"), true);
  });

  it("flags non-http schemes", () => {
    assert.equal(isPrivateWebhookUrl("file:///etc/passwd"), true);
    assert.equal(isPrivateWebhookUrl("gopher://example.com"), true);
  });

  it("permits public https hosts", () => {
    assert.equal(isPrivateWebhookUrl("https://hooks.example.com/capture"), false);
    assert.equal(isPrivateWebhookUrl("https://172.32.0.1/hook"), false);
  });
});

describe("eventForResult", () => {
  it("maps success and failure to distinct events", () => {
    assert.equal(eventForResult(successResult), "capture.completed");
    assert.equal(eventForResult({ ...successResult, ok: false }), "capture.failed");
  });
});

describe("dispatchWebhook", () => {
  it("posts a signed completion payload with routing headers", async () => {
    const { fetchImpl, requests } = recorder(() => ({ ok: true, status: 200 }));

    const delivery = await dispatchWebhook({
      target: { url: "https://hooks.example.com/capture", secret: SECRET },
      result: successResult,
      jobId: "job_1",
      config: webhookConfig,
      fetchImpl,
    });

    assert.equal(delivery.status, "delivered");
    assert.equal(delivery.attempts, 1);
    assert.equal(requests.length, 1);

const sent = requests[0];
    assert.equal(sent.headers["content-type"], "application/json");
    assert.equal(sent.headers[WEBHOOK_ID_HEADER], "job_1");
    assert.equal(sent.headers[WEBHOOK_EVENT_HEADER], "capture.completed");
    assert.equal(sent.headers[WEBHOOK_ATTEMPT_HEADER], "1");
    assert.match(sent.headers[SIGNATURE_HEADER], /^t=\d+,v1=[0-9a-f]{64}$/);

    const body = JSON.parse(sent.body);
    assert.equal(body.event, "capture.completed");
    assert.equal(body.job_id, "job_1");
    assert.equal(body.id, "job_1");
    assert.equal(body.request_id, "req_1", "the request id stays available for idempotency keys");
    assert.equal(body.ok, true);
    assert.equal(body.data.width, 1280);
    assert.equal(
      verifySignature({ secret: SECRET, body: sent.body, signature: sent.headers[SIGNATURE_HEADER] }),
      true,
    );
  });

  it("skips delivery when no secret is configured", async () => {
    const { fetchImpl, requests } = recorder(() => ({ ok: true }));
    const delivery = await dispatchWebhook({
      target: { url: "https://hooks.example.com/capture" },
      result: successResult,
      jobId: "job_1",
      config: webhookConfig,
      fetchImpl,
    });

    assert.equal(delivery.status, "skipped");
    assert.equal(requests.length, 0);
  });

  it("refuses to call a private host unless explicitly allowed", async () => {
    const { fetchImpl, requests } = recorder(() => ({ ok: true }));
    const delivery = await dispatchWebhook({
      target: { url: "http://169.254.169.254/hook", secret: SECRET },
      result: successResult,
      jobId: "job_1",
      config: { ...webhookConfig, webhookAllowPrivateHosts: false },
      fetchImpl,
    });

    assert.equal(delivery.status, "skipped");
    assert.match(delivery.error ?? "", /private host/);
    assert.equal(requests.length, 0);
  });

  it("retries 5xx responses and succeeds on a later attempt", async () => {
    const { fetchImpl, requests } = recorder((_c, attempt) =>
      attempt < 3 ? { ok: false, status: 503 } : { ok: true, status: 200 },
    );

    const delivery = await dispatchWebhook({
      target: { url: "https://hooks.example.com/capture", secret: SECRET },
      result: successResult,
      jobId: "job_1",
      config: webhookConfig,
      fetchImpl,
    });

    assert.equal(delivery.status, "delivered");
    assert.equal(delivery.attempts, 3);
    assert.equal(requests.length, 3);
    assert.equal(requests[2].headers[WEBHOOK_ATTEMPT_HEADER], "3");
  });

  it("does not retry a 4xx response", async () => {
    const { fetchImpl, requests } = recorder(() => ({ ok: false, status: 400 }));

    const delivery = await dispatchWebhook({
      target: { url: "https://hooks.example.com/capture", secret: SECRET },
      result: successResult,
      jobId: "job_1",
      config: webhookConfig,
      fetchImpl,
    });

    assert.equal(delivery.status, "failed");
    assert.equal(delivery.attempts, 1);
    assert.equal(delivery.statusCode, 400);
    assert.equal(requests.length, 1);
  });

  it("treats 429 as retryable", async () => {
    const { fetchImpl, requests } = recorder((_c, attempt) =>
      attempt < 2 ? { ok: false, status: 429 } : { ok: true, status: 200 },
    );

    const delivery = await dispatchWebhook({
      target: { url: "https://hooks.example.com/capture", secret: SECRET },
      result: successResult,
      jobId: "job_1",
      config: webhookConfig,
      fetchImpl,
    });

    assert.equal(delivery.status, "delivered");
    assert.equal(requests.length, 2);
  });

  it("retries thrown transport errors up to the attempt budget", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      throw new Error("ECONNRESET");
    }) as unknown as typeof fetch;

    const delivery = await dispatchWebhook({
      target: { url: "https://hooks.example.com/capture", secret: SECRET },
      result: successResult,
      jobId: "job_1",
      config: webhookConfig,
      fetchImpl,
    });

    assert.equal(calls, 3);
    assert.equal(delivery.status, "failed");
    assert.match(delivery.error ?? "", /ECONNRESET/);
  });

  it("aborts a hanging endpoint after the timeout", async () => {
    const deliveries: WebhookDelivery[] = [];
    const fetchImpl = ((_input: any, init: any) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => reject(new Error("aborted")));
      })) as unknown as typeof fetch;

    deliveries.push(
      await dispatchWebhook({
        target: { url: "https://hooks.example.com/capture", secret: SECRET },
        result: successResult,
        jobId: "job_1",
        config: { ...webhookConfig, webhookAttempts: 1, webhookTimeoutMs: 20 },
        fetchImpl,
      }),
    );

    assert.equal(deliveries[0].status, "failed");
    assert.match(deliveries[0].error ?? "", /aborted/);
  });

  it("honours an explicit event override", async () => {
    const { fetchImpl, requests } = recorder(() => ({ ok: true }));

    await dispatchWebhook({
      target: { url: "https://hooks.example.com/capture", secret: SECRET, event: "capture.failed" },
      result: successResult,
      jobId: "job_1",
      config: webhookConfig,
      fetchImpl,
    });

    assert.equal(requests[0].headers[WEBHOOK_EVENT_HEADER], "capture.failed");
  });

  it("normalises an absent data field to explicit null", async () => {
    const { fetchImpl, requests } = recorder(() => ({ ok: true }));

    await dispatchWebhook({
      target: { url: "https://hooks.example.com/capture", secret: SECRET },
      result: {
        ...successResult,
        ok: false,
        data: undefined,
        error: { code: "render_timeout", message: "slow", retriable: true, request_id: "req_1" },
      },
      jobId: "job_9",
      config: webhookConfig,
      fetchImpl,
    });

    const body = JSON.parse(requests[0].body);
    assert.equal(body.data, null, "an absent field must serialise as explicit null, never a missing key");
    assert.equal(body.error.code, "render_timeout");
    assert.equal(body.job_id, "job_9");
    assert.equal(body.request_id, "req_1");
  });
});
