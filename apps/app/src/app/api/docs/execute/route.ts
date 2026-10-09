import { auth } from "@clerk/nextjs/server";
import { webhookDeliveries } from "@snapforge/database";
import { SnapforgeError } from "@snapforge/contracts";
import { createDocsExecuteHandler } from "@/lib/docs-execute";
import { getCaptureRuntime, localCaptureEnabled } from "@/lib/capture-service";
import { captureForAccount } from "@/lib/capture-runtime-handler";
import { GET as health } from "@/app/api/health/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export const POST = createDocsExecuteHandler({
  authenticate: async () => (await auth()).userId,
  gatewayBaseUrl: process.env.SNAPFORGE_API_URL,
  async consoleExecute(input, accountId, request, requestId) {
    if (input.operation === "health") return health();
    if (localCaptureEnabled() && (input.operation !== "capture" || input.body?.webhook || input.body?.sync === false)) {
      throw new SnapforgeError({ code: "unsupported_option", message: "Async jobs, request recovery, and webhooks require worker-backed capture or the API-key runner. Local mode supports direct captures.", requestId });
    }
    if (input.operation === "capture") {
      const headers = new Headers({ "content-type": "application/json" });
      if (input.idempotencyKey) headers.set("idempotency-key", input.idempotencyKey);
      return captureForAccount(new Request(new URL("/api/capture", request.url), { method: "POST", headers, body: JSON.stringify(input.body), signal: request.signal }), async () => accountId);
    }
    if (input.operation === "job" || input.operation === "request") {
      const service = (await getCaptureRuntime()).service;
      const snapshot = input.operation === "request" ? await service.lookupRequest({ accountId }, input.handle!, requestId) : await service.lookup({ accountId }, input.handle!, requestId);
      return Response.json({ ok: true, request_id: requestId, data: snapshot });
    }
    if (input.operation === "webhook") {
      const status = await webhookDeliveries.status(accountId, input.handle!);
      if (!status) throw new SnapforgeError({ code: "invalid_request", message: "No webhook delivery found for this account and job", requestId });
      return Response.json({ ok: true, data: status }, { headers: { etag: `"${status.generation}"` } });
    }
    if (!await webhookDeliveries.redeliver(accountId, input.handle!, Number(input.ifMatch!.slice(1, -1)))) {
      throw new SnapforgeError({ code: "idempotency_conflict", message: "Delivery generation changed, delivery is pending, or redelivery is unavailable. Refresh delivery status.", requestId });
    }
    return Response.json({ ok: true, data: { job_id: input.handle, state: "pending" } }, { status: 202 });
  },
});
