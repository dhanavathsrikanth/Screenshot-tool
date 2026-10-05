import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { captureOptionsSchema, captureWebhookSchema, type CaptureWebhook } from "@snapforge/contracts";
import type { CaptureDispatcher } from "./dispatcher.js";
import type { CaptureQueue } from "./queue.js";
import type { CaptureLifecycleJob } from "./settlement.js";
import type { CaptureMode } from "./types.js";

const intentSchema = z.object({
  accountId: z.string().min(1), jobId: z.string().min(1), apiKeyId: z.string().min(1).optional(),
  mode: z.enum(["sync", "async"]), enqueuedAt: z.number().int().nonnegative(), options: captureOptionsSchema,
  webhook: captureWebhookSchema.optional(),
});

export type CaptureSubmissionIntent = z.infer<typeof intentSchema>;
export interface CaptureSubmissionMetadata extends CaptureLifecycleJob {
  apiKeyId?: string;
  mode: CaptureMode;
  enqueuedAt: number;
  acknowledged: boolean;
}
export interface SealedCaptureSubmission extends Omit<CaptureSubmissionMetadata, "acknowledged"> {
  ciphertext: string;
  requestFingerprint?: string;
  webhookCiphertext?: string;
}
export interface CaptureSubmissionRepository {
  reserveSubmission(input: SealedCaptureSubmission): Promise<boolean>;
  pendingSubmission(accountId: string, jobId: string, apiKeyId?: string): Promise<CaptureSubmissionMetadata | null>;
  claimPendingSubmissions(limit: number): Promise<CaptureLifecycleJob[]>;
  dispatchSubmission(jobId: string, deliver: (input: SealedCaptureSubmission) => Promise<void>): Promise<boolean>;
  existingRequest?(accountId: string, jobId: string): Promise<{ fingerprint: string; apiKeyId?: string } | null>;
}
export interface CaptureSubmissionCodec {
  seal(input: CaptureSubmissionIntent): string;
  open(input: SealedCaptureSubmission): CaptureSubmissionIntent;
  sealWebhook(target: CaptureWebhook, identity: CaptureLifecycleJob): string;
  openWebhook(ciphertext: string, identity: CaptureLifecycleJob): CaptureWebhook;
}

const maximumPlaintextBytes = 384 * 1024;
const maximumCiphertextBytes = 512 * 1024 + 128;

export function createCaptureSubmissionCodec(key: string, previousKeys: string[] = []): CaptureSubmissionCodec {
  const keys = new Map<string, Buffer>();
  const ids = [key, ...previousKeys].map((encoded) => {
    if (!/^[A-Za-z0-9+/]{43}=$/.test(encoded)) throw new Error("Capture intent encryption requires a base64 encoded 32-byte key");
    const bytes = Buffer.from(encoded, "base64");
    if (bytes.length !== 32) throw new Error("Capture intent encryption requires a base64 encoded 32-byte key");
    const id = createHash("sha256").update(bytes).digest("hex").slice(0, 16);
    keys.set(id, bytes);
    return id;
  });
  const aad = (input: CaptureLifecycleJob, purpose = "capture") => Buffer.from(JSON.stringify(purpose === "capture"
    ? [input.accountId, input.jobId] : [input.accountId, input.jobId, purpose]));
  const encrypt = (value: unknown, identity: CaptureLifecycleJob, purpose: string) => {
    const plaintext = Buffer.from(JSON.stringify(value));
    if (plaintext.length > maximumPlaintextBytes) throw new Error("Capture submission exceeds the retained intent limit");
    const nonce = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", keys.get(ids[0])!, nonce);
    cipher.setAAD(aad(identity, purpose));
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return [ids[0], nonce.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
  };
  const decrypt = (ciphertext: string, identity: CaptureLifecycleJob, purpose: string): unknown => {
    if (ciphertext.length > maximumCiphertextBytes) throw new Error("Invalid capture submission intent");
    const parts = ciphertext.split(".");
    if (parts.length !== 4 || parts.slice(1).some((part) => !/^[A-Za-z0-9_-]+$/.test(part))) throw new Error("Invalid capture submission intent");
    const bytes = keys.get(parts[0]);
    if (!bytes) throw new Error("Capture submission encryption key is unavailable");
    const nonce = Buffer.from(parts[1], "base64url");
    const tag = Buffer.from(parts[2], "base64url");
    if (nonce.length !== 12 || tag.length !== 16) throw new Error("Invalid capture submission intent");
    const decipher = createDecipheriv("aes-256-gcm", bytes, nonce);
    decipher.setAAD(aad(identity, purpose));
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(Buffer.from(parts[3], "base64url")), decipher.final()]);
    if (plaintext.length > maximumPlaintextBytes) throw new Error("Invalid capture submission intent");
    return JSON.parse(plaintext.toString("utf8"));
  };
  return {
    seal(input) {
      const parsed = intentSchema.parse(input);
      return encrypt(parsed, parsed, "capture");
    },
    open(input) {
      const parsed = intentSchema.parse(decrypt(input.ciphertext, input, "capture"));
      if (parsed.accountId !== input.accountId || parsed.jobId !== input.jobId || parsed.apiKeyId !== input.apiKeyId ||
        parsed.mode !== input.mode || parsed.enqueuedAt !== input.enqueuedAt) throw new Error("Capture submission metadata does not match");
      return parsed;
    },
    sealWebhook: (target, identity) => encrypt(captureWebhookSchema.parse(target), identity, "webhook"),
    openWebhook: (ciphertext, identity) => captureWebhookSchema.parse(decrypt(ciphertext, identity, "webhook")),
  };
}

export function captureSubmissionCodecFromEnv(env: NodeJS.ProcessEnv = process.env): CaptureSubmissionCodec {
  return createCaptureSubmissionCodec(env.CAPTURE_INTENT_ENCRYPTION_KEY?.trim() ?? "",
    env.CAPTURE_INTENT_PREVIOUS_KEYS?.split(",").map((key) => key.trim()).filter(Boolean) ?? []);
}

export async function deliverCaptureSubmission(jobId: string, deps: {
  submissions: CaptureSubmissionRepository;
  codec: CaptureSubmissionCodec;
  queue: Pick<CaptureQueue, "getJob">;
  dispatcher: Pick<CaptureDispatcher, "dispatch">;
  admission?: { recoverJob?(accountId: string, jobId: string): Promise<void> };
}): Promise<boolean> {
  return deps.submissions.dispatchSubmission(jobId, async (sealed) => {
    const existing = await deps.queue.getJob(jobId);
    if (existing) {
      if (existing.data.billing_account_id !== sealed.accountId || existing.data.reservation_id !== jobId ||
        existing.data.api_key_id !== sealed.apiKeyId || existing.data.request_id !== jobId || existing.data.mode !== sealed.mode ||
        existing.data.enqueued_at !== sealed.enqueuedAt) throw new Error("Existing capture job identity does not match");
      return;
    }
    const intent = deps.codec.open(sealed);
    await deps.admission?.recoverJob?.(sealed.accountId, jobId);
    await deps.dispatcher.dispatch({
      jobId, requestId: jobId, accountId: intent.accountId, reservationId: jobId, apiKeyId: intent.apiKeyId,
      mode: intent.mode, options: intent.options, enqueuedAt: intent.enqueuedAt, waitForCompletion: false,
    });
  });
}
