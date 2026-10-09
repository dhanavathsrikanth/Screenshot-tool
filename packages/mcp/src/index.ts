import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SnapforgeError } from "@snapforge/contracts";
import { createEngine, type SnapforgeEngine } from "@snapforge/engine";
import { z } from "zod";

const imageFormatSchema = z.enum(["png", "jpeg", "webp"]);

const commonSchema = {
  url: z.string().min(1).describe("HTTP or HTTPS page URL to capture."),
  width: z.number().int().min(320).max(3840).optional().describe("Viewport width in CSS pixels."),
  height: z.number().int().min(240).max(2160).optional().describe("Viewport height in CSS pixels."),
  full_page: z.boolean().optional().describe("Capture the full scrollable page."),
  format: imageFormatSchema.optional().describe("Image format. Defaults to WebP for smaller, high-quality files; choose PNG for lossless output."),
  quality: z.number().int().min(1).max(100).optional().describe("JPEG or WebP quality, from 1 to 100. Defaults to 90."),
  timeout: z.number().int().min(1000).max(60000).optional().describe("Navigation timeout in milliseconds."),
  delay: z.number().int().min(0).max(30000).optional().describe("Extra wait after the page settles, in milliseconds."),
  dark_mode: z.boolean().optional().describe("Emulate a dark color scheme."),
};

const commonInputSchema = z.object(commonSchema);

function captureOptions(input: z.infer<typeof commonInputSchema>, selector?: string) {
  return {
    url: input.url,
    ...(input.width !== undefined || input.height !== undefined
      ? { viewport: { width: input.width ?? 1280, height: input.height ?? 720 } }
      : {}),
    full_page: input.full_page ?? false,
    format: input.format ?? "webp",
    quality: input.quality ?? 90,
    timeout: input.timeout ?? 30000,
    delay: input.delay ?? 0,
    dark_mode: input.dark_mode ?? false,
    ...(selector ? { selector } : {}),
  };
}

const remediation: Record<string, string> = {
  invalid_request: "Check the URL, selector, and option limits, then retry.",
  unsupported_option: "Remove the unsupported option or choose a supported image format.",
  render_timeout: "Increase timeout or retry the page after it finishes loading.",
  render_incomplete: "Wait for the required content or a ready selector, then retry the capture.",
  navigation_failed: "Confirm the page is reachable and try again.",
  blocked_by_target: "The target rejected automated access; retry later or use an allowed page.",
  target_error: "The target returned a server error; retry later.",
  render_crashed: "Retry once; if it repeats, reduce capture size or report the request ID.",
  egress_unavailable: "Check network access and retry.",
  egress_mismatch: "Use an egress proxy in the requested region or remove region targeting.",
  internal_error: "Retry once; if it repeats, report the request ID.",
};

function errorResult(error: unknown) {
  if (error instanceof SnapforgeError) {
    const envelope = error.toEnvelope();
    const nextStep = remediation[envelope.code] ?? "Check the request and retry if appropriate.";
    return {
      isError: true as const,
      content: [{
        type: "text" as const,
        text: `${envelope.code}: ${envelope.message}\nTry: ${nextStep}${envelope.request_id ? `\nrequest_id: ${envelope.request_id}` : ""}`,
      }],
    };
  }
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: "internal_error: Capture failed unexpectedly.\nTry: Retry once; if it repeats, inspect the server logs." }],
  };
}

function imageContent(buffer: Buffer, format: "png" | "jpeg" | "webp") {
  return {
    type: "image" as const,
    data: buffer.toString("base64"),
    mimeType: `image/${format}`,
  };
}

function captureSummary(outcome: Awaited<ReturnType<SnapforgeEngine["capture"]>>) {
  const { data } = outcome;
  return JSON.stringify({
    url: data.url,
    final_url: data.final_url,
    format: data.format,
    width: data.width,
    height: data.height,
    bytes: data.bytes,
    duration_ms: data.duration_ms,
    blocked_requests: data.blocked_requests,
  });
}

export function createSnapforgeMcpServer(engine: SnapforgeEngine = createEngine()) {
  const server = new McpServer({ name: "snapforge", version: "0.1.0" });

  server.registerTool("take_screenshot", {
    description: "Capture a web page and return the image plus compact capture metadata.",
    inputSchema: commonSchema,
  }, async (input) => {
    try {
      const options = captureOptions(input);
      const outcome = await engine.capture(options);
      return {
        content: [
          { type: "text", text: captureSummary(outcome) },
          imageContent(outcome.buffer, outcome.data.format as "png" | "jpeg" | "webp"),
        ],
      };
    } catch (error) {
      return errorResult(error);
    }
  });

  server.registerTool("inspect_page", {
    description: "Capture a page, extract readable Markdown, and return its accessible DOM snapshot.",
    inputSchema: commonSchema,
  }, async (input) => {
    try {
      const outcome = await engine.capture(captureOptions(input), { inspectPage: true });
      return {
        content: [
          { type: "text", text: `Capture: ${captureSummary(outcome)}\n\n## Readable page content\n${outcome.inspection?.markdown || "(No readable text found.)"}\n\n## Accessible DOM\n${outcome.inspection?.accessibleTree || "(No accessible tree available.)"}` },
          imageContent(outcome.buffer, outcome.data.format as "png" | "jpeg" | "webp"),
        ],
      };
    } catch (error) {
      return errorResult(error);
    }
  });

  server.registerTool("capture_element", {
    description: "Capture one visible CSS-selected element and return its viewport bounding box.",
    inputSchema: {
      ...commonSchema,
      selector: z.string().min(1).describe("CSS selector for the element to capture."),
    },
  }, async ({ selector, ...input }) => {
    try {
      const outcome = await engine.capture(captureOptions(input, selector), { includeSelectorBox: true });
      return {
        content: [
          { type: "text", text: `${captureSummary(outcome)}\nselector: ${selector}\nbounding_box_css_pixels: ${JSON.stringify(outcome.inspection?.selectorBox ?? null)}` },
          imageContent(outcome.buffer, outcome.data.format as "png" | "jpeg" | "webp"),
        ],
      };
    } catch (error) {
      return errorResult(error);
    }
  });

  return server;
}
