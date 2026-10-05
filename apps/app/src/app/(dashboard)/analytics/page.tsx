"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge, Card, CardHeader, EmptyState, Meter, PageHeader, Stat } from "@/components/ui";
import { Icon } from "@/components/icons";
import { formatBytes, formatDuration, formatNumber } from "@/lib/format";
import type { CaptureLogEntry } from "@/lib/capture";

interface StatsPayload {
  stats: {
    total: number;
    succeeded: number;
    failed: number;
    cache_hits: number;
    success_rate: number;
    bytes: number;
    blocked_requests: number;
    p50_ms: number;
    p95_ms: number;
    avg_ms: number;
    by_format: Record<string, number>;
    by_code: Record<string, number>;
  };
  entries: CaptureLogEntry[];
}

export default function AnalyticsPage() {
  const [payload, setPayload] = useState<StatsPayload | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const [response, usageResponse] = await Promise.all([fetch("/api/captures", { cache: "no-store", signal: controller.signal }), fetch("/api/usage", { cache: "no-store", signal: controller.signal })]);
        if (!response.ok || !usageResponse.ok) throw new Error("Analytics are unavailable. We will try again shortly.");
        const [captures, usage] = await Promise.all([response.json() as Promise<StatsPayload>, usageResponse.json() as Promise<{ remaining: number }>]);
        if (!controller.signal.aborted) { setPayload(captures); setRemaining(usage.remaining); setError(""); }
      } catch (error) { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Could not load analytics."); }
      finally { if (!controller.signal.aborted) timer = setTimeout(load, 10_000); }
    };
    void load();
    return () => { controller.abort(); clearTimeout(timer); };
  }, []);

  const stats = payload?.stats;
  const chart = useMemo(() => {
    const entries = payload?.entries ?? [];
    const series = [...entries]
      .filter((entry) => entry.ok)
      .reverse()
      .map((entry) => entry.duration_ms);
    return series;
  }, [payload]);
  const peak = Math.max(1, ...chart);

  const formatMix = Object.entries(stats?.by_format ?? {});
  const codeMix = Object.entries(stats?.by_code ?? {});

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Insights"
        title="Analytics"
        description="Understand your capture activity, performance, and available credits."
      />

      {error && <p role="alert" className="rounded-[8px] border border-warn/30 bg-warn/5 p-3 text-sm text-warn-ink">{error}</p>}
      <div className="sf-stat-group grid sm:grid-cols-2 xl:grid-cols-3">
        <Stat
          label="Requests"
          value={stats ? formatNumber(stats.total) : "—"}
          sub="Recorded captures"
          icon="chart"
        />
        <Stat
          label="Success"
          value={stats?.total ? `${Math.round(stats.success_rate * 100)}%` : "—"}
          sub={stats?.total ? `${stats.failed} failures` : "No samples yet"}
          tone={stats && stats.failed > 0 ? "warning" : "success"}
          icon="check"
        />
        <Stat
          label="p50 / p95"
          value={stats?.succeeded ? `${formatDuration(stats.p50_ms)} / ${formatDuration(stats.p95_ms)}` : "—"}
          sub="Capture completion time"
          icon="clock"
        />
        <Stat
          label="Bytes served"
          value={stats ? formatBytes(stats.bytes) : "—"}
          sub={`${formatNumber(stats?.blocked_requests ?? 0)} requests blocked`}
          icon="download"
        />
        <Stat
          label="Cache hits"
          value={stats ? formatNumber(stats.cache_hits) : "—"}
          sub="Recorded captures"
          icon="refresh"
        />
        <Stat
          label="Credits remaining"
          value={remaining !== null ? formatNumber(remaining) : "—"}
          sub="monthly + prepaid"
          icon="bolt"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader title="Latency" description="Most recent successful captures" />
          {!chart.length ? <EmptyState icon="chart" title={payload ? "No timing samples yet" : "Loading capture activity"} description="Successful captures will appear here with their recorded completion time." /> : <div className="p-5">
            <div className="flex h-40 items-end gap-1.5">
              {chart.map((value, index) => (
                <div
                  key={index}
                  title={`${value} milliseconds`}
                  role="img"
                  aria-label={`Capture ${index + 1}: ${value} milliseconds`}
                  className="group relative flex-1 rounded-t-sm bg-accent/70 transition-colors hover:bg-accent"
                  style={{ height: `${Math.max(6, (value / peak) * 100)}%` }}
                >
                  <span className="pointer-events-none absolute -top-7 left-1/2 hidden -translate-x-1/2 rounded-xs border border-line bg-raised px-1.5 py-0.5 font-mono text-[10px] text-ink-2 group-hover:block">
                    {value} ms
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between text-[11px] text-ink-3">
              <span>oldest</span>
              <span>peak {peak} ms</span>
              <span>newest</span>
            </div>
          </div>}
        </Card>

        <Card>
          <CardHeader title="Format mix" />
          <div className="space-y-3 p-5">
            {formatMix.length === 0 ? (
              <p className="text-sm text-ink-3">No data yet.</p>
            ) : (
              formatMix.map(([format, count]) => (
                <div key={format}>
                  <div className="mb-1.5 flex items-center justify-between text-sm">
                    <span className="font-mono text-xs text-ink-2 uppercase">{format}</span>
                    <span className="text-xs text-ink-3 tabular-nums">{count}</span>
                  </div>
                  <Meter value={count / (stats?.total ?? 1)} />
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Outcome breakdown" description="Recorded results by success and error code" />
        <div className="flex flex-wrap gap-3 p-5">
          {codeMix.length === 0 ? (
            <p className="text-sm text-ink-3">No captures recorded yet.</p>
          ) : (
            codeMix.map(([code, count]) => (
              <span
                key={code}
                className="inline-flex items-center gap-2 rounded-md border border-line bg-canvas px-3 py-2 text-sm"
              >
                <Icon
                  name={code === "success" ? "check" : "alert"}
                  className={`size-4 ${code === "success" ? "text-ok-ink" : "text-bad-ink"}`}
                />
                <span className="font-mono text-xs text-ink-2">{code}</span>
                <Badge tone="neutral">{count}</Badge>
              </span>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
