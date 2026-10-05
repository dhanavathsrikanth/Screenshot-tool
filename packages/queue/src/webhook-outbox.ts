import { Resolver } from "node:dns/promises";
import { request } from "node:https";
import { BlockList, isIP } from "node:net";
import { captureWebhookSchema, type CaptureWebhook } from "@snapforge/contracts";
import type { CaptureJobResult } from "./types.js";
import type { CaptureSubmissionCodec } from "./submission.js";
import { eventForResult, signPayload, webhookBody } from "./webhook.js";

export interface WebhookClaim {
  id: string; jobId: string; accountId: string; ciphertext: string; result: CaptureJobResult;
  token: string; attempt: number; generation: number;
}
export interface WebhookStatus { id: string; state: "pending" | "delivered" | "failed"; attempts: number; generation: number; statusCode: number | null }
export interface WebhookAttempt { delivered: boolean; retry: boolean; statusCode?: number }
export interface WebhookOutboxRepository {
  claim(limit: number, maxAttempts: number, leaseSeconds: number): Promise<WebhookClaim[]>;
  complete(claim: WebhookClaim, outcome: WebhookAttempt, nextAttemptAt: Date): Promise<void>;
  status(accountId: string, jobId: string, apiKeyId?: string): Promise<WebhookStatus | null>;
  redeliver(accountId: string, jobId: string, generation: number, apiKeyId?: string): Promise<boolean>;
}

const blocked = new BlockList();
for (const [address, prefix] of [["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16],
  ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4]] as const) {
  blocked.addSubnet(address, prefix, "ipv4");
}
blocked.addSubnet("2001::", 23, "ipv6");
blocked.addSubnet("2001:db8::", 32, "ipv6");
blocked.addSubnet("2002::", 16, "ipv6");
const globalV6 = new BlockList();
globalV6.addSubnet("2000::", 3, "ipv6");

export function isPublicWebhookAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !blocked.check(address, "ipv4");
  return family === 6 && globalV6.check(address, "ipv6") && !blocked.check(address, "ipv6");
}

export class WebhookDestinationError extends Error {}
interface Address { address: string; family: 4 | 6 }
export interface WebhookTransport {
  resolve(hostname: string): Promise<Address[]>;
  send(url: URL, address: Address, body: string, headers: Record<string, string>, signal: AbortSignal): Promise<number>;
}
const transport: WebhookTransport = {
  async resolve(hostname) {
    const literal = hostname.replace(/^\[|\]$/g, "");
    const family = isIP(literal);
    if (family === 4 || family === 6) return [{ address: literal, family }];
    const resolver = new Resolver({ timeout: 1000, tries: 1 });
    const [v4, v6] = await Promise.all([resolver.resolve4(hostname).catch(() => []), resolver.resolve6(hostname).catch(() => [])]);
    return [...v4.map((address) => ({ address, family: 4 as const })), ...v6.map((address) => ({ address, family: 6 as const }))];
  },
  send(url, address, body, headers, signal) {
    return new Promise((resolve, reject) => {
      const outgoing = request(url, { method: "POST", headers, signal, agent: false, family: address.family,
        lookup: (_hostname, _options, callback) => callback(null, address.address, address.family),
      }, (response) => { const status = response.statusCode ?? 0; response.destroy(); resolve(status); });
      outgoing.on("error", reject);
      outgoing.end(body);
    });
  },
};

export async function sendWebhookAttempt(claim: WebhookClaim, target: CaptureWebhook, timeoutMs = 10000,
  client: WebhookTransport = transport): Promise<WebhookAttempt> {
  captureWebhookSchema.parse(target);
  const signal = AbortSignal.timeout(timeoutMs);
  const url = new URL(target.url);
  const addresses = await client.resolve(url.hostname);
  if (!addresses.length) throw new Error("Webhook DNS unavailable");
  if (addresses.some((address) => !isPublicWebhookAddress(address.address))) throw new WebhookDestinationError("Webhook destination is not public");
  signal.throwIfAborted();
  const event = eventForResult(claim.result);
  const body = JSON.stringify({ ...JSON.parse(webhookBody(event, claim.jobId, claim.result)), delivery_id: claim.id, delivery_generation: claim.generation });
  const statusCode = await client.send(url, addresses[0], body, {
    "content-type": "application/json", "content-length": String(Buffer.byteLength(body)),
    "x-snapforge-signature": signPayload({ secret: target.secret, body }), "x-snapforge-job-id": claim.jobId,
    "x-snapforge-event": event, "x-snapforge-delivery-id": claim.id,
    "x-snapforge-generation": String(claim.generation), "x-snapforge-delivery": String(claim.attempt),
  }, signal);
  return { delivered: statusCode >= 200 && statusCode < 300, retry: statusCode === 429 || statusCode >= 500 || statusCode === 0, statusCode };
}

export class WebhookDeliveryConsumer {
  private running = false;
  private timer?: ReturnType<typeof setTimeout>;
  private active?: Promise<void>;
  private readonly counters = { delivered: 0, failed: 0, errors: 0 };
  constructor(private readonly repo: WebhookOutboxRepository, private readonly codec: CaptureSubmissionCodec,
    private readonly options: { send?: typeof sendWebhookAttempt; logger?: (message: string, fields: Record<string, unknown>) => void;
      intervalMs?: number; maxAttempts?: number; timeoutMs?: number } = {}) {}
  stats() { return { ...this.counters, active: Boolean(this.active) }; }
  start(): void { if (!this.running) { this.running = true; this.schedule(0); } }
  private schedule(delay: number): void {
    if (!this.running) return;
    this.timer = setTimeout(() => {
      void this.reconcile().catch(() => { this.counters.errors++; }).finally(() => this.schedule(this.options.intervalMs ?? 1000));
    }, delay);
    this.timer.unref();
  }
  reconcile(): Promise<void> {
    this.active ??= this.batch().finally(() => { this.active = undefined; });
    return this.active;
  }
  private async batch(): Promise<void> {
    const maxAttempts = Math.min(10, Math.max(1, this.options.maxAttempts ?? 5));
    const claims = await this.repo.claim(4, maxAttempts, 120);
    await Promise.all(claims.map(async (claim) => {
      let outcome: WebhookAttempt;
      try {
        const target = this.codec.openWebhook(claim.ciphertext, claim);
        outcome = await (this.options.send ?? sendWebhookAttempt)(claim, target, Math.min(10000, this.options.timeoutMs ?? 10000));
      } catch (error) { outcome = { delivered: false, retry: !(error instanceof WebhookDestinationError) }; }
      outcome.retry = !outcome.delivered && outcome.retry && claim.attempt < maxAttempts;
      const next = new Date(Date.now() + Math.min(3600000, 1000 * 2 ** Math.min(claim.attempt, 12)) + Math.floor(Math.random() * 1000));
      try {
        await this.repo.complete(claim, outcome, next);
        if (outcome.delivered) this.counters.delivered++;
        else if (!outcome.retry) this.counters.failed++;
      } catch { this.counters.errors++; }
    }));
    if (claims.length) this.options.logger?.("Webhook delivery recovery", this.stats());
  }
  async close(): Promise<void> { this.running = false; clearTimeout(this.timer); await this.active; }
}
