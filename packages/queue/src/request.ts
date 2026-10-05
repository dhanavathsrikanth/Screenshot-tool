import { SnapforgeError } from "@snapforge/contracts";

export const MAX_CAPTURE_REQUEST_BYTES = 256 * 1024;

export async function readCaptureRequest(request: Request, requestId: string): Promise<unknown> {
  const invalid = (message: string) => new SnapforgeError({ code: "invalid_request", message, requestId });
  if (Number(request.headers.get("content-length")) > MAX_CAPTURE_REQUEST_BYTES) throw invalid("Capture request is too large");
  if (!request.body) throw invalid("Request body must be valid JSON");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > MAX_CAPTURE_REQUEST_BYTES) {
        void reader.cancel().catch(() => undefined);
        throw invalid("Capture request is too large");
      }
      chunks.push(next.value);
    }
    return JSON.parse(Buffer.concat(chunks, bytes).toString("utf8"));
  } catch (error) {
    if (error instanceof SnapforgeError) throw error;
    throw invalid("Request body must be valid JSON");
  } finally {
    reader.releaseLock();
  }
}
