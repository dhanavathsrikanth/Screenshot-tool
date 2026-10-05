import type { CaptureSuccessData } from "@snapforge/contracts";
import type { CaptureOutcome } from "@snapforge/engine";

/** Craft a buffer with a valid PNG signature and IHDR dimensions but arbitrary size. */
export function makePng(width: number, height: number, byteLength: number): Buffer {
  const buffer = Buffer.alloc(Math.max(byteLength, 24));
  buffer[0] = 0x89;
  buffer[1] = 0x50;
  buffer[2] = 0x4e;
  buffer[3] = 0x47;
  buffer.write("IHDR", 12, "ascii");
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

export function makeData(partial: Partial<CaptureSuccessData> = {}): CaptureSuccessData {
  return {
    url: "https://example.com",
    final_url: "https://example.com",
    format: "png",
    width: 1280,
    height: 720,
    bytes: 0,
    duration_ms: 100,
    cached: false,
    blocked_requests: 0,
    ...partial,
  };
}

export interface OutcomeParts {
  width?: number;
  height?: number;
  byteLength?: number;
  format?: CaptureSuccessData["format"];
  finalUrl?: string;
  markdown?: string;
}

export function makeOutcome(parts: OutcomeParts = {}): CaptureOutcome {
  const width = parts.width ?? 1280;
  const height = parts.height ?? 720;
  const format = parts.format ?? "png";
  const buffer =
    format === "png"
      ? makePng(width, height, parts.byteLength ?? 50_000)
      : Buffer.alloc(parts.byteLength ?? 50_000, 0x41);
  const data = makeData({
    width,
    height,
    format,
    bytes: buffer.length,
    final_url: parts.finalUrl ?? "https://example.com",
  });
  return {
    data,
    buffer,
    ...(parts.markdown !== undefined
      ? { inspection: { markdown: parts.markdown, accessibleTree: "" } }
      : {}),
  };
}
