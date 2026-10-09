"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Badge, Button, Card, CardHeader, EmptyState, Input, PageHeader, Select } from "@/components/ui";
import { Icon } from "@/components/icons";
import { formatBytes, formatClock, formatNumber } from "@/lib/format";
import type { CaptureLogEntry } from "@/lib/capture";
import { preferenceSnapshot, readPreferences, subscribePreferences } from "@/lib/console-preferences";

interface LogsPayload {
  entries: CaptureLogEntry[];
  stats: { total: number; succeeded: number; failed: number };
}

export default function LogsPage() {
  const [payload, setPayload] = useState<LogsPayload | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | "ok" | "error">("all");
  const [error, setError] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const preferences = useSyncExternalStore(subscribePreferences, preferenceSnapshot, () => null);
  const refreshAutomatically = preferences ? readPreferences().autoRefreshLogs : true;

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/captures", { cache: "no-store" });
      if (!response.ok) throw new Error("Capture history could not be loaded. Please try refreshing.");
      setPayload((await response.json()) as LogsPayload);
      setError("");
    } catch (error) { setError(error instanceof Error ? error.message : "Could not load capture history."); }
  }, []);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      await load();
      if (active && refreshAutomatically) timer = setTimeout(poll, 8_000);
    };
    timer = setTimeout(poll, 0);
    return () => { active = false; clearTimeout(timer); };
  }, [load, refreshAutomatically]);

  const rows = useMemo(() => {
    const entries = payload?.entries ?? [];
    const needle = query.trim().toLowerCase();
    return entries.filter((entry) => {
      if (status === "ok" && !entry.ok) return false;
      if (status === "error" && entry.ok) return false;
      if (!needle) return true;
      return (
        entry.url.toLowerCase().includes(needle) ||
        (entry.code ?? "").toLowerCase().includes(needle) ||
        entry.request_id.toLowerCase().includes(needle)
      );
    });
  }, [payload, query, status]);

  const clear = async () => {
    setClearing(true);
    try {
      const response = await fetch("/api/captures", { method: "DELETE" });
      if (!response.ok) throw new Error("History could not be cleared. Please try again.");
      setConfirmClear(false);
      await load();
    } catch (error) { setError(error instanceof Error ? error.message : "Could not clear history."); }
    finally { setClearing(false); }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Observability"
        title="Capture history"
        description="Persistent capture history with response status, format, and output size."
        action={
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => void load()}>
              <Icon name="refresh" className="size-4" />
              Refresh
            </Button>
            <Button variant="danger" onClick={() => setConfirmClear(true)} disabled={!payload?.entries.length}>
              <Icon name="trash" className="size-4" />
              Clear
            </Button>
          </div>
        }
      />

      {error && <p role="alert" className="rounded-md border border-bad/30 bg-bad/5 p-3 text-sm text-bad-ink">{error}</p>}
      {confirmClear && <Card className="border-bad/40 p-5"><h2 className="text-sm font-medium">Clear capture history?</h2><p className="mt-1 text-[13px] text-ink-3">This removes your recorded history and cannot be undone.</p><div className="mt-4 flex gap-2"><Button variant="danger" disabled={clearing} onClick={() => void clear()}>{clearing ? "Clearing…" : "Clear history"}</Button><Button disabled={clearing} onClick={() => setConfirmClear(false)}>Keep history</Button></div></Card>}

      <Card>
        <CardHeader
          title="Requests"
          description={
            payload
              ? `${formatNumber(payload.stats.succeeded)} succeeded · ${formatNumber(payload.stats.failed)} failed`
              : "Loading…"
          }
          action={
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
              <Input
                value={query}
                placeholder="Filter by url or code"
                spellCheck={false}
                className="min-w-0 flex-1 sm:w-56"
                aria-label="Filter capture history"
                onChange={(event) => setQuery(event.target.value)}
              />
              <Select
                value={status}
                className="w-32"
                aria-label="Filter by capture status"
                onChange={(event) => setStatus(event.target.value as typeof status)}
              >
                <option value="all">All</option>
                <option value="ok">Success</option>
                <option value="error">Failed</option>
              </Select>
            </div>
          }
        />

        {rows.length === 0 ? (
          <EmptyState
            icon="list"
            title={!payload ? "Loading capture history" : payload.entries.length ? "No matching captures" : "No captures yet"}
            description={payload?.entries.length ? "Try a different URL or status filter." : "Create a capture in the playground to see its results here."}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs text-ink-3">
                  <th className="px-5 py-3 font-medium">Time</th>
                  <th className="px-3 py-3 font-medium">Status</th>
                  <th className="px-3 py-3 font-medium">URL</th>
                  <th className="px-3 py-3 font-medium">Format</th>
                  <th className="px-3 py-3 font-medium">Size</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((entry) => (
                  <tr key={entry.id} className="transition-colors hover:bg-raised/40">
                    <td className="px-5 py-3 font-mono text-xs text-ink-3">
                      {formatClock(entry.at)}
                    </td>
                    <td className="px-3 py-3">
                      {entry.ok ? (
                        <Badge tone="success" icon="check">
                          200
                        </Badge>
                      ) : (
                        <Badge tone="danger" icon="alert">
                          {entry.code}
                        </Badge>
                      )}
                    </td>
                    <td className="max-w-[320px] px-3 py-3">
                      <span className="block truncate font-mono text-xs text-ink" title={entry.url}>
                        {entry.url}
                      </span>
                      {!entry.ok && entry.message ? (
                        <span className="mt-0.5 block truncate text-[11px] text-ink-3" title={entry.message}>
                          {entry.message}
                        </span>
                      ) : entry.ok && entry.width ? (
                        <span className="mt-0.5 block text-[11px] text-ink-3">
                          {entry.width}×{entry.height}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-3 font-mono text-xs text-ink-2 uppercase">
                      {entry.format}
                    </td>
                    <td className="px-3 py-3 font-mono text-xs text-ink-2">
                      {entry.bytes ? formatBytes(entry.bytes) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
