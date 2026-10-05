import { Webhooks } from "@dodopayments/nextjs";
import { findSubscriptionOwner, recordDodoEvent } from "@snapforge/database";
import { productForId } from "@/lib/billing";

type EventData = {
  payment_id?: string;
  subscription_id?: string | null;
  product_id?: string;
  status?: string;
  cancel_at_next_billing_date?: boolean;
  next_billing_date?: string | null;
  customer?: { customer_id?: string };
  metadata?: Record<string, unknown> | null;
  product_cart?: Array<{ product_id: string; quantity: number }> | null;
};

function readPayload(payload: unknown) {
  const event = payload as { data?: EventData; timestamp?: Date | string; type?: string };
  return { data: event.data ?? {}, timestamp: String(event.timestamp ?? ""), type: event.type ?? "" };
}

async function handleSubscription(payload: unknown, fallbackStatus: string) {
  const { data, timestamp, type } = readPayload(payload);
  const subscriptionId = data.subscription_id;
  if (!subscriptionId) return;
  const product = productForId(data.product_id);
  const metadataUserId = data.metadata?.snapforge_user_id;
  const userId = typeof metadataUserId === "string" ? metadataUserId : await findSubscriptionOwner(subscriptionId);
  if (!userId) return;
  const scheduledToCancel = data.cancel_at_next_billing_date === true;
  const status = scheduledToCancel && (type === "subscription.cancelled" || fallbackStatus === "cancelled")
    ? "active"
    : fallbackStatus;
  await recordDodoEvent({
    eventId: `${type || fallbackStatus}:${subscriptionId}:${timestamp}:${data.status ?? ""}:${scheduledToCancel}`,
    eventType: type || `subscription.${fallbackStatus}`,
    userId,
    customerId: data.customer?.customer_id,
    subscriptionId,
    productId: product?.id ?? data.product_id,
    product: product?.kind === "subscription" ? product : undefined,
    subscriptionStatus: status,
    cancelAtPeriodEnd: scheduledToCancel,
    currentPeriodEnd: data.next_billing_date ? new Date(data.next_billing_date) : undefined,
  });
}

const webhookKey = process.env.DODO_PAYMENTS_WEBHOOK_KEY;
const webhookHandler = webhookKey ? Webhooks({
  webhookKey,
  onPaymentSucceeded: async (payload) => {
    const { data } = readPayload(payload);
    const userId = data.metadata?.snapforge_user_id;
    const item = data.product_cart?.[0];
    const product = item && productForId(item.product_id);
    if (typeof userId !== "string" || !data.payment_id || !product) return;
    await recordDodoEvent({ eventId: `payment:${data.payment_id}`, eventType: "payment.succeeded", userId,
      customerId: data.customer?.customer_id, subscriptionId: data.subscription_id ?? undefined,
      productId: item.product_id,
      product: product.kind === "credits" ? { ...product, credits: product.credits * Math.max(1, item.quantity) } : undefined });
  },
  onSubscriptionActive: async (payload) => {
    await handleSubscription(payload, "active");
  },
  onSubscriptionRenewed: async (payload) => handleSubscription(payload, "active"),
  onSubscriptionUpdated: async (payload) => {
    const { data } = readPayload(payload);
    await handleSubscription(payload, data.status ?? "active");
  },
  onSubscriptionExpired: async (payload) => handleSubscription(payload, "expired"),
  onSubscriptionOnHold: async (payload) => handleSubscription(payload, "on_hold"),
  onSubscriptionCancelled: async (payload) => {
    await handleSubscription(payload, "cancelled");
  },
}) : null;

export async function POST(request: Request) {
  if (!webhookHandler) return Response.json({ error: "Webhook is not configured" }, { status: 503 });
  return webhookHandler(request as Parameters<typeof webhookHandler>[0]);
}
