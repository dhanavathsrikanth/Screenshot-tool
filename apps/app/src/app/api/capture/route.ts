import { auth } from "@clerk/nextjs/server";
import { reserveCapture, settleCapture, recordCapture } from "@snapforge/database";
import { acquireCaptureAdmission } from "@/lib/capture-admission";
import { createCaptureHandler } from "@/lib/capture-handler";
import { createQueuedCaptureHandlers } from "@/lib/capture-queue-handler";
import { getCaptureRuntime, localCaptureEnabled } from "@/lib/capture-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const local = createCaptureHandler({
  authenticate: async () => (await auth()).userId,
  acquire: acquireCaptureAdmission,
  getEngine: async () => (await import("@/lib/engine")).getEngine(),
  reserve: reserveCapture,
  settle: settleCapture,
  record: recordCapture,
});

const queued = createQueuedCaptureHandlers({
  authenticate: async () => (await auth()).userId,
  getService: async () => (await getCaptureRuntime()).service,
});

export async function POST(request: Request) {
  return localCaptureEnabled() ? local(request) : queued.POST(request);
}
