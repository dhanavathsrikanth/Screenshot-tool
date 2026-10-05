import { Card, CardHeader, Meter, PageHeader, Stat } from "@/components/ui";
import { Icon, type IconName } from "@/components/icons";
import { BillingButton, CustomerPortalButton } from "@/components/billing-actions";
import { getBillingState } from "@snapforge/database";
import { captureStats } from "@/lib/history";
import { formatBytes, formatNumber } from "@/lib/format";
import { auth } from "@clerk/nextjs/server";

export const dynamic = "force-dynamic";

const PLANS: {
  name: string;
  price: string;
  cadence: string;
  icon: IconName;
  featured?: boolean;
  limits: string[];
}[] = [
  {
    name: "Free",
    price: "$0",
    cadence: "forever",
    icon: "sparkles",
    limits: ["250 successful captures / month", "PNG, JPEG, WebP, and PDF", "Device presets", "Capture history and analytics", "Scoped API keys"],
  },
  {
    name: "Pro",
    price: "$29",
    cadence: "per month",
    icon: "bolt",
    featured: true,
    limits: ["10,000 captures / month", "PNG, JPEG, WebP, and PDF", "Every device preset", "Capture history and analytics", "Webhook notifications"],
  },
  {
    name: "Scale",
    price: "$199",
    cadence: "per month",
    icon: "shield",
    limits: ["100,000 captures / month", "PNG, JPEG, WebP, and PDF", "Every device preset", "Capture history and analytics", "Webhook notifications"],
  },
];

export default async function BillingPage() {
  const { userId } = await auth();
  if (!userId) return null;
  const [stats, billing] = await Promise.all([captureStats(userId), getBillingState(userId)]);
  const used = billing.used;
  const included = billing.included;
  const credits = billing.prepaidCredits;
  const remaining = Math.max(0, included - used) + credits;
  const subscriptionStatus = billing.subscription
    ? `${billing.plan[0]?.toUpperCase()}${billing.plan.slice(1)} plan · ${billing.subscription.cancelAtPeriodEnd ? "ends at period close" : billing.subscription.status}`
    : "Free plan";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Account"
        title="Billing"
        description="Manage your plan, prepaid credits, and payment details. Failed captures never consume credits."
        action={<CustomerPortalButton />}
      />

      <div className="sf-stat-group grid sm:grid-cols-3">
        <Stat
          label="Captures this month"
          value={formatNumber(used)}
          sub={`${formatNumber(included)} included on ${billing.plan[0]?.toUpperCase()}${billing.plan.slice(1)}`}
          icon="play"
        />
        <Stat
          label="Captures available"
          value={formatNumber(remaining)}
          sub={`${formatNumber(Math.max(0, included - used))} included + ${formatNumber(credits)} prepaid`}
          icon="bolt"
        />
        <Stat
          label="Outbound bytes"
          value={formatBytes(stats.bytes)}
          sub={`${formatNumber(stats.blocked_requests)} requests blocked`}
          icon="download"
        />
      </div>

      <Card>
        <CardHeader title="Monthly allowance" description={subscriptionStatus} />
        <div className="space-y-3 p-5">
          <Meter value={included > 0 ? used / included : 0} tone="success" />
          <div className="flex justify-between text-xs text-ink-3">
            <span>{formatNumber(used)} used</span>
            <span>{formatNumber(included)} limit</span>
          </div>
          <p className="border-t border-line pt-3 text-xs text-ink-3">{formatNumber(credits)} prepaid credits available after your monthly allowance is used.</p>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        {PLANS.map((plan) => (
          <Card
            key={plan.name}
            className={`relative flex flex-col p-6 ${plan.featured ? "border-accent/60" : ""}`}
          >
            {plan.featured ? (
              <span className="absolute -top-2.5 right-5 rounded-pill bg-accent px-2.5 py-0.5 text-[11px] font-medium text-n-0">
                Most popular
              </span>
            ) : null}
            <div className="flex items-center gap-2.5">
              <span className="flex size-9 items-center justify-center rounded-md bg-accent/12 text-accent-ink">
                <Icon name={plan.icon} className="size-4" />
              </span>
              <p className="text-sm font-medium text-ink">
                {plan.name}
              </p>
            </div>
            <p className="mt-4 text-[32px] font-medium tracking-[-0.8px] text-ink">
              {plan.price}
              <span className="ml-1.5 text-sm font-normal text-ink-3">{plan.cadence}</span>
            </p>
            <ul className="mt-5 flex-1 space-y-2.5">
              {plan.limits.map((limit) => (
                <li key={limit} className="flex items-start gap-2 text-sm text-ink-2">
                  <Icon name="check" className="mt-0.5 size-3.5 shrink-0 text-ok-ink" />
                  {limit}
                </li>
              ))}
            </ul>
            {plan.name === "Free" ? (
              <p className="mt-6 rounded-md border border-line bg-raised px-3.5 py-2.5 text-center text-sm text-ink-3">Included</p>
            ) : (
              <BillingButton product={plan.name.toLowerCase() as "pro" | "scale"}>Choose {plan.name}</BillingButton>
            )}
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader title="Non-expiring credit packs" description="One-time purchases. Credits stay on your account until used." />
        <div className="grid gap-3 p-5 sm:grid-cols-3">
          {[
            { product: "credits_10k" as const, label: "10,000 credits" },
            { product: "credits_50k" as const, label: "50,000 credits" },
            { product: "credits_250k" as const, label: "250,000 credits" },
          ].map((pack) => (
            <div key={pack.product} className="rounded-md border border-line bg-canvas p-4">
              <p className="font-display text-lg font-semibold text-ink">{pack.label}</p>
              <BillingButton product={pack.product}>Buy credits</BillingButton>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title="Metering model" description="What the billing service will charge for" />
        <div className="grid gap-4 p-5 sm:grid-cols-3">
          {[
            { label: "Unit price", value: "$0.012", note: "per successful capture" },
            { label: "Failed captures", value: "Free", note: "engine errors are never billed" },
            { label: "Quota reached", value: "Paused", note: "add prepaid credits or upgrade to continue" },
          ].map((item) => (
            <div key={item.label} className="rounded-md border border-line bg-canvas px-4 py-3">
              <p className="text-xs text-ink-3">{item.label}</p>
              <p className="mt-1.5 font-display text-lg font-semibold text-ink">{item.value}</p>
              <p className="mt-0.5 text-xs text-ink-3">{item.note}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
