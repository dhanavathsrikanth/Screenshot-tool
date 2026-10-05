import { auth } from "@clerk/nextjs/server";
import { getCaptureRuntime } from "@/lib/capture-service";
import { createQueuedCaptureHandlers } from "@/lib/capture-queue-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

const handlers = createQueuedCaptureHandlers({
  authenticate: async () => (await auth()).userId,
  getService: async () => (await getCaptureRuntime()).service,
});

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return handlers.GET(request, (await context.params).id);
}
