import type { CaptureSuccessData } from "@snapforge/contracts";
import { readPngSize } from "@snapforge/engine";
import type { BenchmarkSite } from "./sites.js";

export interface CheckFailure {
  check: string;
  message: string;
}

export const DEFAULT_MIN_BYTES = 6_000;
export const DEFAULT_MIN_BITS_PER_PIXEL = 0.05;
export const DEFAULT_MIN_WIDTH = 1_280;
export const DEFAULT_MIN_HEIGHT = 500;

function matchesAny(haystack: string, needles: readonly string[]): string | null {
  const text = haystack.toLowerCase();
  for (const needle of needles) {
    if (text.includes(needle.toLowerCase())) return needle;
  }
  return null;
}

function hasFormatSignature(buffer: Buffer, format: string): boolean {
  switch (format) {
    case "png":
      return (
        buffer.length >= 8 &&
        buffer[0] === 0x89 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x4e &&
        buffer[3] === 0x47
      );
    case "jpeg":
      return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    case "webp":
      return (
        buffer.length >= 12 &&
        buffer.toString("ascii", 0, 4) === "RIFF" &&
        buffer.toString("ascii", 8, 12) === "WEBP"
      );
    case "pdf":
      return buffer.length >= 5 && buffer.toString("ascii", 0, 5) === "%PDF-";
    default:
      return false;
  }
}

/**
 * Evaluate the visual correctness contract for one capture. `text` is the
 * extracted page text (markdown + accessible tree, concatenated); pass
 * `undefined` to skip the text assertions (for example when the runner was
 * started with `--no-inspect`).
 */
export function evaluateCapture(
  site: BenchmarkSite,
  data: CaptureSuccessData,
  buffer: Buffer,
  text: string | undefined,
): CheckFailure[] {
  const checks = site.checks;
  const failures: CheckFailure[] = [];

  if (!hasFormatSignature(buffer, data.format)) {
    failures.push({
      check: "format_signature",
      message: `Buffer does not start with a ${data.format} signature`,
    });
  }

  if (data.format === "png") {
    const dims = readPngSize(buffer);
    if (!dims) {
      failures.push({
        check: "png_header",
        message: "PNG header is missing or unreadable",
      });
    } else if (dims.width !== data.width || dims.height !== data.height) {
      failures.push({
        check: "dimension_consistency",
        message: `PNG header ${dims.width}x${dims.height} disagrees with envelope ${data.width}x${data.height}`,
      });
    }
  }

  const minWidth = checks.minWidth ?? DEFAULT_MIN_WIDTH;
  const minHeight = checks.minHeight ?? DEFAULT_MIN_HEIGHT;
  if (data.width < minWidth) {
    failures.push({
      check: "min_width",
      message: `Width ${data.width} is below the minimum ${minWidth}`,
    });
  }
  if (data.height < minHeight) {
    failures.push({
      check: "min_height",
      message: `Height ${data.height} is below the minimum ${minHeight}`,
    });
  }
  if (checks.maxHeight !== undefined && data.height > checks.maxHeight) {
    failures.push({
      check: "max_height",
      message: `Height ${data.height} exceeds the ceiling ${checks.maxHeight} (runaway page growth)`,
    });
  }

  const minBytes = checks.minBytes ?? DEFAULT_MIN_BYTES;
  if (buffer.length < minBytes) {
    failures.push({
      check: "min_bytes",
      message: `Only ${buffer.length} bytes (minimum ${minBytes}) — likely blank or failed render`,
    });
  }

  if (data.format !== "pdf" && data.width > 0 && data.height > 0) {
    const bpp = (buffer.length * 8) / (data.width * data.height);
    const minBpp = checks.minBitsPerPixel ?? DEFAULT_MIN_BITS_PER_PIXEL;
    if (bpp < minBpp) {
      failures.push({
        check: "bits_per_pixel",
        message: `${bpp.toFixed(3)} bits/pixel is below ${minBpp} — capture looks blank`,
      });
    }
  }

  if (checks.forbidFinalUrl) {
    const hit = matchesAny(data.final_url, checks.forbidFinalUrl);
    if (hit) {
      failures.push({
        check: "final_url",
        message: `final_url contains "${hit}": ${data.final_url}`,
      });
    }
  }

  if (text !== undefined) {
    for (const needle of checks.expectText ?? []) {
      if (!text.toLowerCase().includes(needle.toLowerCase())) {
        failures.push({
          check: "expect_text",
          message: `Expected text "${needle}" was not found on the page`,
        });
      }
    }
    for (const needle of checks.forbidText ?? []) {
      if (text.toLowerCase().includes(needle.toLowerCase())) {
        failures.push({
          check: "forbid_text",
          message: `Forbidden text "${needle}" is still present on the page`,
        });
      }
    }
  }

  return failures;
}
