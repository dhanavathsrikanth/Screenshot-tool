import { createHmac, timingSafeEqual } from "node:crypto";
import type { QueueConfig } from "./config.js";
import type { CaptureJobResult, WebhookTarget } from "./types.js";

export const SIGNATURE_HEADER = "x-snapforge-signature";
export const WEBHOOK_ID_HEADER = "x-snapforge-job-id";
export const WEBHOOK_EVENT_HEADER = "x-snapforge-event";
export const WEBHOOK_ATTEMPT_HEADER = "x-snapforge-delivery";

export interface WebhookDelivery {
  status: "delivered" | "failed" | "skipped";
  attempts: number;
  statusCode?: number;
  error?: string;
}

export interface SignOptions {
  secret: string;
  body: string;
  timestamp?: number;
}

export function signPayload(options: SignOptions): string {
  const timestamp = options.timestamp ?? Math.floor(Date.now() / 1000);
  const signed = `${timestamp}.${options.body}`;
  const digest = createHmac("sha256", options.secret).update(signed).digest("hex");
  return `t=${timestamp},v1=${digest}`;
}

export function verifySignature(options: SignOptions & { signature: string; toleranceSeconds?: number }): boolean {
  const parsed = parseSignature(options.signature);
  if (!parsed) {
    return false;
  }
  if (options.toleranceSeconds !== undefined) {
    const age = Math.floor(Date.now() / 1000) - parsed.timestamp;
    if (age > options.toleranceSeconds || age < -options.toleranceSeconds) {
      return false;
    }
  }

  const expected = signPayload({
    secret: options.secret,
    body: options.body,
    timestamp: parsed.timestamp,
  });

  const expectedDigest = parseSignature(expected)?.digest ?? "";
  const actualBuffer = Buffer.from(parsed.digest, "utf8");
  const expectedBuffer = Buffer.from(expectedDigest, "utf8");

  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }
  return timingSafeEqual(actualBuffer, expectedBuffer);
}

function parseSignature(signature: string): { timestamp: number; digest: string } | null {
  const parts = signature.split(",");
  let timestamp: number | undefined;
  let digest: string | undefined;

  for (const part of parts) {
    const separator = part.indexOf("=");
    if (separator === -1) {
      continue;
    }
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (key === "t") {
      timestamp = Number(value);
    } else if (key === "v1") {
      digest = value;
    }
  }

  if (timestamp === undefined || !Number.isFinite(timestamp) || digest === undefined || digest === "") {
    return null;
  }
  return { timestamp, digest };
}

const PRIVATE_V4 = /^10\.|^127\.|^169\.254\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./;
const PRIVATE_HOSTNAMES = new Set(["localhost", "localhost.localdomain", "metadata.google.internal"]);

export function isPrivateWebhookUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return true;
  }

  const host = parsed.hostname.toLowerCase();
  if (PRIVATE_HOSTNAMES.has(host) || host.endsWith(".localhost") || host.endsWith(".internal")) {
    return true;
  }
  return PRIVATE_V4.test(host);
}

export function eventForResult(result: CaptureJobResult): string {
  return result.ok ? "capture.completed" : "capture.failed";
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export interface DispatchWebhookOptions {
  target: WebhookTarget;
  result: CaptureJobResult;
  /**
   * The BullMQ job id. A consumer reconciles the callback against
   * `GET /v1/jobs/:id`, so the callback must carry that id rather than the
   * request id, which the two only share when the caller supplied a `jobId`.
   */
  jobId: string;
  config: Pick<
    QueueConfig,
    "webhookTimeoutMs" | "webhookAttempts" | "webhookBackoffMs" | "webhookAllowPrivateHosts"
  >;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

export function webhookBody(event: string, jobId: string, result: CaptureJobResult): string {
  return JSON.stringify({
    event,
    id: jobId,
    job_id: jobId,
    request_id: result.request_id,
    mode: result.mode,
    ok: result.ok,
    data: result.data ?? null,
    error: result.error ?? null,
    duration_ms: result.duration_ms,
    attempts_made: result.attempts_made,
    enqueued_at: result.enqueued_at,
    completed_at: result.completed_at,
  });
}

export async function dispatchWebhook(options: DispatchWebhookOptions): Promise<WebhookDelivery> {
  const { target, result, jobId, config } = options;
  const doFetch = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;

  if (!target.secret) {
    return { status: "skipped", attempts: 0, error: "webhook secret is required" };
  }

  if (!config.webhookAllowPrivateHosts && isPrivateWebhookUrl(target.url)) {
    return { status: "skipped", attempts: 0, error: "webhook url resolves to a private host" };
  }

  const event = target.event ?? eventForResult(result);
  const body = webhookBody(event, jobId, result);

  const maxAttempts = Math.max(1, config.webhookAttempts);
  let lastError: string | undefined;
  let lastStatus: number | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, config.webhookTimeoutMs);

    try {
      const response = await doFetch(target.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          [SIGNATURE_HEADER]: signPayload({ secret: target.secret, body, timestamp: Math.floor(now() / 1000) }),
          [WEBHOOK_ID_HEADER]: jobId,
          [WEBHOOK_EVENT_HEADER]: event,
          [WEBHOOK_ATTEMPT_HEADER]: String(attempt),
        },
        body,
        signal: controller.signal,
        redirect: "error",
      });

      if (response.ok) {
        return { status: "delivered", attempts: attempt, statusCode: response.status };
      }

      lastStatus = response.status;
      lastError = `webhook responded with ${response.status}`;

      if (response.status < 500 && response.status !== 429) {
        return { status: "failed", attempts: attempt, statusCode: response.status, error: lastError };
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    } finally {
      clearTimeout(timer);
    }

    if (attempt < maxAttempts) {
      await sleep(config.webhookBackoffMs * 2 ** (attempt - 1));
    }
  }

  return { status: "failed", attempts: maxAttempts, statusCode: lastStatus, error: lastError };
}
