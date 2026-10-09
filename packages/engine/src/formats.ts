import type { Page } from "playwright";
import type { CaptureOptions, RenderDiagnostics } from "@snapforge/contracts";

export interface PageMetrics {
  viewportWidth: number;
  viewportHeight: number;
  deviceScaleFactor: number;
  docWidth: number;
  docHeight: number;
}

export interface CapturePlan {
  kind: "screenshot" | "pdf";
  type?: "png" | "jpeg" | "webp";
  quality?: number;
  clip?: { x: number; y: number; width: number; height: number };
  region: { width: number; height: number };
}

export function planCapture(
  options: CaptureOptions,
  metrics: PageMetrics,
  maxPageHeight: number,
): CapturePlan {
  if (options.format === "pdf") {
    const pdfHeight = options.full_page
      ? Math.min(Math.max(metrics.viewportHeight, metrics.docHeight), maxPageHeight)
      : metrics.viewportHeight;
    return {
      kind: "pdf",
      region: { width: metrics.viewportWidth, height: pdfHeight },
    };
  }

  const type = options.format === "jpeg" ? "jpeg" : options.format === "webp" ? "webp" : "png";
  const quality =
    type === "png" ? undefined : Math.min(100, Math.max(1, options.quality));

  const region = options.full_page
    ? {
        width: Math.max(metrics.viewportWidth, Math.min(metrics.docWidth, 3840)),
        height: Math.min(
          Math.max(metrics.viewportHeight, metrics.docHeight),
          maxPageHeight,
        ),
      }
    : { width: metrics.viewportWidth, height: metrics.viewportHeight };

  const needsClip =
    region.width !== metrics.viewportWidth || region.height !== metrics.viewportHeight;

  return {
    kind: "screenshot",
    type,
    quality,
    clip: needsClip ? { x: 0, y: 0, width: region.width, height: region.height } : undefined,
    region,
  };
}

export function buildPdfOptions(
  options: CaptureOptions,
  metrics: PageMetrics,
  maxPageHeight = 24_000,
) {
  const heightPx = options.full_page
    ? Math.min(Math.max(metrics.viewportHeight, metrics.docHeight), maxPageHeight)
    : metrics.viewportHeight;
  return {
    printBackground: true,
    preferCSSPageSize: false,
    margin: { top: "0px", right: "0px", bottom: "0px", left: "0px" },
    width: `${metrics.viewportWidth}px`,
    height: `${heightPx}px`,
    scale: 1,
    pageRanges: "1",
  };
}

export function readPngSize(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.length < 24) return null;
  if (
    buffer[0] !== 0x89 ||
    buffer[1] !== 0x50 ||
    buffer[2] !== 0x4e ||
    buffer[3] !== 0x47
  ) {
    return null;
  }
  if (buffer.toString("ascii", 12, 16) !== "IHDR") return null;
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

export interface CaptureOutput {
  buffer: Buffer;
  width: number;
  height: number;
  diagnostics?: RenderDiagnostics;
}

export async function captureOutput(
  page: Page,
  plan: CapturePlan,
  options: CaptureOptions,
  metrics: PageMetrics,
  maxPageHeight = 24_000,
): Promise<CaptureOutput> {
  const dsf = metrics.deviceScaleFactor;

  if (plan.kind === "pdf") {
    await page.addStyleTag({ content: ":root { -webkit-print-color-adjust: exact; print-color-adjust: exact; }" });
    const buffer = await page.pdf(buildPdfOptions(options, metrics, maxPageHeight));
    return {
      buffer: buffer as unknown as Buffer,
      width: plan.region.width,
      height: plan.region.height,
    };
  }

  const shotOptions = {
    type: plan.type,
    quality: plan.quality,
    ...(plan.clip ? { clip: plan.clip, fullPage: true as const } : {}),
    animations: "disabled" as const,
    caret: "hide" as const,
    scale: "device" as const,
  };

  let buffer: Buffer;
  try {
    buffer = (await page.screenshot(shotOptions)) as unknown as Buffer;
  } catch (firstError) {
    if (!plan.clip) throw firstError;
    buffer = (await page.screenshot({
      ...shotOptions,
      clip: undefined,
      fullPage: true,
    })) as unknown as Buffer;
  }

  let width = Math.round(plan.region.width * dsf);
  let height = Math.round(plan.region.height * dsf);

  if (plan.type === "png") {
    const dims = readPngSize(buffer);
    if (dims) {
      width = dims.width;
      height = dims.height;
    }
  }

  return { buffer, width, height };
}
