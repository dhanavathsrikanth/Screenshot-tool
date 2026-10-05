import { CustomerPortal } from "@dodopayments/nextjs";
import { auth } from "@clerk/nextjs/server";
import { NextRequest } from "next/server";
import { getBillingState } from "@snapforge/database";

const portal = CustomerPortal({
  bearerToken: process.env.DODO_PAYMENTS_API_KEY ?? "",
  environment: process.env.DODO_PAYMENTS_ENVIRONMENT === "live_mode" ? "live_mode" : "test_mode",
});

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!process.env.DODO_PAYMENTS_API_KEY) return Response.json({ error: "Billing is not configured" }, { status: 503 });
  const { customerId } = await getBillingState(userId);
  if (!customerId) return Response.json({ error: "No Dodo customer is linked to this account yet" }, { status: 404 });
  const url = new URL(request.url);
  url.searchParams.set("customer_id", customerId);
  return portal(new NextRequest(url, { method: "GET", headers: request.headers }));
}
