import { reserveCapture, settleCapture, recordCapture } from "@snapforge/database";
import { acquireCaptureAdmission } from "@/lib/capture-admission";
import { createCaptureHandler } from "@/lib/capture-handler";
import { createQueuedCaptureHandlers } from "@/lib/capture-queue-handler";
import { getCaptureRuntime, localCaptureEnabled } from "@/lib/capture-service";

const localDependencies = {
  acquire: acquireCaptureAdmission,
  getEngine: async () => (await import("@/lib/engine")).getEngine(),
  prepare: async () => { await (await import("@/lib/engine")).prepareEngine(); },
  reserve: reserveCapture,
  settle: settleCapture,
  record: recordCapture,
};

export async function captureForAccount(request: Request, authenticate: () => Promise<string | null>) {
  return localCaptureEnabled()
    ? createCaptureHandler({ ...localDependencies, authenticate })(request)
    : createQueuedCaptureHandlers({ authenticate, getService: async () => (await getCaptureRuntime()).service }).POST(request);
}
