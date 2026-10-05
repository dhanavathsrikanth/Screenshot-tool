import { createHash } from "node:crypto";
import { SnapforgeError } from "@snapforge/contracts";

export function idempotentJobId(accountId: string, key: string): string {
  return `idem-${createHash("sha256").update(JSON.stringify([accountId, key])).digest("hex")}`;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)
    .sort(([first], [second]) => first.localeCompare(second)).map(([key, item]) => [key, canonical(item)]));
  return value;
}

export function captureRequestFingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

export class CaptureRequestConflictError extends SnapforgeError {
  constructor(requestId: string) {
    super({ code: "idempotency_conflict", message: "This Idempotency-Key was already used for another capture request or credential", requestId });
  }
}
