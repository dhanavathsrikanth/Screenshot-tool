import { auth } from "@clerk/nextjs/server";
import { createQueuedCaptureHandlers } from "@/lib/capture-queue-handler";
import { getCaptureRuntime } from "@/lib/capture-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const handlers = createQueuedCaptureHandlers({ authenticate: async () => (await auth()).userId,
  getService: async () => (await getCaptureRuntime()).service });
export async function GET(request: Request, context: { params: Promise<{ key: string }> }) {
  return handlers.GET_REQUEST(request, (await context.params).key);
}
