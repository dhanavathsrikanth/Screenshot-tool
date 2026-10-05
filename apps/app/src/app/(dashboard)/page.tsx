import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { formatBytes, formatDuration, formatNumber, formatRelative } from "@/lib/format";
import { captureStats, listCaptures } from "@/lib/history";
import { Card, CardHeader, PageHeader, Stat, Badge, EmptyState } from "@/components/ui";
import { Icon } from "@/components/icons";
import { BrandMark } from "@/components/brand";

export const dynamic = "force-dynamic";

const STEPS = [
  { href: "/playground", icon: "play", title: "Make your first capture", body: "Choose a URL, set the viewport, and preview the result." },
  { href: "/api-keys", icon: "key", title: "Connect your application", body: "Create an API key for your screenshot workflow." },
  { href: "/docs", icon: "book", title: "Find the right options", body: "Explore formats, full-page captures, and request examples." },
] as const;

export default async function OverviewPage() {
  const { userId } = await auth();
  if (!userId) return null;
  const [stats, entries] = await Promise.all([captureStats(userId), listCaptures(userId, 6)]);
  return (
    <div className="space-y-7">
      <PageHeader title="Overview" description="Your captures, recent activity, and next steps in one place." action={<Link href="/playground" className="sf-primary-link"><Icon name="plus" />New capture</Link>} />
      <div className="sf-stat-group grid sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Total captures" value={formatNumber(stats.total)} sub="Recorded in your account" icon="play" />
        <Stat label="Success rate" value={stats.total ? `${Math.round(stats.success_rate * 100)}%` : "—"} sub={stats.total ? `${stats.succeeded} succeeded · ${stats.failed} failed` : "Your first capture starts here"} icon="check" />
        <Stat label="p95 capture time" value={stats.p95_ms ? formatDuration(stats.p95_ms) : "—"} sub={stats.avg_ms ? `Average ${formatDuration(stats.avg_ms)}` : "No timing samples yet"} icon="clock" />
        <Stat label="Data delivered" value={formatBytes(stats.bytes)} sub={`${formatNumber(stats.blocked_requests)} unwanted requests filtered`} icon="download" />
      </div>
      <div className="sf-intro flex flex-wrap items-center justify-between gap-5 px-6 py-7">
        <div className="flex items-start gap-4"><BrandMark className="size-11" /><div><h2 className="text-lg font-medium tracking-[-0.4px]">From URL to <span className="sf-gradient-text">ready to share.</span></h2><p className="mt-1 max-w-lg text-[13px] text-ink-3">Fine-tune a screenshot in the playground, then take the same settings into your application.</p></div></div>
        <Link href="/playground" className="inline-flex items-center gap-2 rounded-[8px] border border-line-strong px-3.5 py-2 text-[13px] text-ink-2 hover:bg-raised">Try the playground<Icon name="chevron" className="size-3" /></Link>
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(280px,1fr)]">
        <Card>
          <CardHeader title="Recent captures" description="The latest results in your account" action={<Link href="/logs" className="inline-flex items-center gap-1 text-xs text-ink-2 hover:text-accent-ink">View history<Icon name="chevron" className="size-3" /></Link>} />
          {!entries.length ? <EmptyState icon="crop" title="Your next idea starts with a URL" description="Create a capture to see its preview, file size, and capture time here." action={<Link href="/playground" className="sf-primary-link mt-2"><Icon name="plus" />Create a capture</Link>} /> : <ul className="divide-y divide-line">{entries.map((entry) => <li key={entry.id} className="flex items-center gap-3 px-5 py-4"><span className="flex size-9 shrink-0 items-center justify-center rounded-[8px] border border-line bg-canvas"><Icon name={entry.ok ? "crop" : "alert"} className={`size-4 ${entry.ok ? "text-ink-2" : "text-bad-ink"}`} /></span><div className="min-w-0 flex-1"><p className="truncate text-[13px] text-ink">{entry.url}</p><p className="mt-1 text-[11px] text-ink-3">{entry.ok ? `${entry.width} × ${entry.height} · ${formatBytes(entry.bytes)} · ${formatDuration(entry.duration_ms)}` : entry.code}</p></div><div className="shrink-0 text-right"><Badge tone={entry.ok ? "success" : "danger"}>{entry.ok ? entry.format?.toUpperCase() ?? "Ready" : "Failed"}</Badge><p className="mt-1 text-[10px] text-ink-3">{formatRelative(entry.at)}</p></div></li>)}</ul>}
        </Card>
        <Card><CardHeader title="Get started" description="Build a workflow that fits your application" /><div className="divide-y divide-line px-5">{STEPS.map((step) => <Link key={step.href} href={step.href} className="group flex items-start gap-3 py-5"><Icon name={step.icon} className="mt-0.5 size-4 shrink-0 text-ink-3 group-hover:text-accent-ink" /><div className="flex-1"><p className="text-[13px] font-medium text-ink">{step.title}</p><p className="mt-1 text-xs leading-relaxed text-ink-3">{step.body}</p></div><Icon name="chevron" className="mt-1 size-3 text-ink-3" /></Link>)}</div></Card>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5 text-xs text-ink-3"><p>PNG, JPEG, WebP, or PDF. One workspace for every capture.</p><Link href="/docs" className="inline-flex items-center gap-1 text-ink-2 hover:text-accent-ink">Read the API documentation<Icon name="chevron" className="size-3" /></Link></div>
    </div>
  );
}
