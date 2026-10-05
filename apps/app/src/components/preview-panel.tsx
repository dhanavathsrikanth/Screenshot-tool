"use client";

import { useState, useSyncExternalStore } from "react";
import { Icon } from "./icons";
import { Badge, Button, Card } from "./ui";
import { formatBytes, formatDuration } from "@/lib/format";
import type { CaptureResult } from "@/lib/capture";
import { preferenceSnapshot, readPreferences, subscribePreferences } from "@/lib/console-preferences";

export function PreviewPanel({
  result,
  pending,
  localCapture = false,
}: {
  result: CaptureResult | null;
  pending: boolean;
  localCapture?: boolean;
}) {
  const [zoom, setZoom] = useState<"fit" | "actual">("fit");
  const [showDetails, setShowDetails] = useState(false);
  const preferenceVersion = useSyncExternalStore(subscribePreferences, preferenceSnapshot, () => null);
  const showFiltered = preferenceVersion ? readPreferences().showBlockedRequests : true;

  if (pending || result?.pending) {
    const job = result?.pending ? result : null;
    return (
      <Card className="flex min-h-[420px] flex-col items-center justify-center gap-3 p-10 text-center">
        <span className="relative flex size-11 items-center justify-center">
          <span className="absolute size-11 animate-ping rounded-pill bg-accent/25" />
          <span className="relative flex size-9 items-center justify-center rounded-pill bg-accent/20 text-accent-ink">
            <Icon name="sparkles" className="size-4" />
          </span>
        </span>
        <p className="font-display text-sm font-semibold text-ink">{localCapture || job?.state === "active" ? "Rendering" : "Queued"}</p>
        <p className="max-w-xs text-sm text-ink-3">
          {localCapture ? "Preparing your capture. Keep this page open until it finishes." : job?.state === "active" ? "Preparing a complete capture. You can reload this page and check its progress." : "Your capture is waiting to start. You can reload this page without submitting it again."}
        </p>
      </Card>
    );
  }

  if (!result) {
    return (
      <Card className="overflow-hidden">
        <div className="flex h-12 items-center gap-2 border-b border-line px-5"><Icon name="eye" className="size-4 text-ink-3" /><h2 className="text-[13px] font-medium">Preview</h2><span className="ml-auto text-[11px] text-ink-3">Ready when you are</span></div>
        <div className="flex min-h-[380px] flex-col items-center justify-center gap-3 p-8 text-center">
          <div aria-hidden="true" className="mb-3 w-52 overflow-hidden rounded-[10px] border border-line-strong bg-canvas"><div className="flex h-7 items-center gap-1 border-b border-line px-3">{[1, 2, 3].map((dot) => <span key={dot} className="size-1 rounded-full bg-line-strong" />)}<span className="ml-2 h-2 w-24 rounded-full bg-surface" /></div><div className="space-y-3 p-5"><div className="h-2 w-16 rounded-full bg-p-600/40" /><div className="h-3 w-32 rounded bg-raised" /><div className="h-2 w-28 rounded bg-surface" /><div className="grid grid-cols-3 gap-2 pt-2">{[1, 2, 3].map((item) => <div key={item} className="h-10 rounded border border-line bg-surface" />)}</div></div></div>
          <p className="text-sm font-medium text-ink">Your capture will appear here</p>
          <p className="max-w-xs text-[13px] leading-relaxed text-ink-3">Set your URL and select Capture to create a screenshot you can preview and download.</p>
          <p className="mt-2 text-[11px] text-ink-3">Keyboard shortcut <kbd className="ml-1 rounded border border-line px-1.5 py-0.5 font-mono">Ctrl / ⌘ Enter</kbd></p>
        </div>
      </Card>
    );
  }

  if (!result.ok) {
    const artifacts = result.error.details?.artifacts as
      | { dom?: string; url?: string; error?: string }
      | undefined;

    return (
      <Card className="min-h-[420px] p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Badge tone="danger" icon="alert">
              {result.error.code}
            </Badge>
            <p className="mt-3 font-display text-base font-semibold text-ink">
              {result.error.message}
            </p>
            <p className="mt-1 font-mono text-xs text-ink-3">
              request {result.error.request_id} · {result.error.retriable ? "retriable" : "terminal"}
            </p>
          </div>
          <Button variant="ghost" onClick={() => setShowDetails((value) => !value)}>
            <Icon name="list" className="size-4" />
            {showDetails ? "Hide" : "Details"}
          </Button>
        </div>
        {showDetails ? (
          <pre className="mt-4 max-h-72 overflow-auto rounded-md border border-line bg-canvas p-3 font-mono text-[11px] leading-relaxed text-ink-2">
            {JSON.stringify(
              artifacts ?? result.error.details ?? { request_id: result.error.request_id },
              null,
              2,
            )}
          </pre>
        ) : null}
      </Card>
    );
  }

  const { metrics, image } = result;
  const isPdf = metrics.format === "pdf";

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="success" icon="check">
            {metrics.format}
          </Badge>
          <Badge tone="neutral" icon="crop">
            {metrics.width}×{metrics.height}
          </Badge>
          <Badge tone="neutral">{formatBytes(metrics.bytes)}</Badge>
          <Badge tone="accent" icon="clock">
            {formatDuration(metrics.duration_ms)}
          </Badge>
          {showFiltered && metrics.blocked_requests > 0 ? (
            <Badge tone="info" icon="shield">
              {metrics.blocked_requests} blocked
            </Badge>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setZoom((value) => (value === "fit" ? "actual" : "fit"))}
            className="rounded-md border border-line bg-raised px-2.5 py-1.5 text-xs text-ink-2 transition-colors hover:text-ink"
          >
            {zoom === "fit" ? "Actual size" : "Fit"}
          </button>
          {image ? (
            <a
              href={image}
              target="_blank"
              rel="noopener noreferrer"
              download={`snapforge-${metrics.width}x${metrics.height}.${metrics.format === "jpeg" ? "jpg" : metrics.format}`}
              className="inline-flex items-center gap-2 rounded-md border border-line bg-raised px-2.5 py-1.5 text-xs text-ink-2 transition-colors hover:text-ink"
            >
              <Icon name="download" className="size-3.5" />
              Save
            </a>
          ) : null}
        </div>
      </div>

      <div className="sf-checkerboard max-h-[620px] overflow-auto bg-canvas p-4">
        {isPdf ? (
          <div className="flex min-h-[320px] flex-col items-center justify-center gap-2 text-center">
            <Icon name="book" className="size-6 text-ink-3" />
            <p className="font-display text-sm font-semibold text-ink">PDF rendered</p>
            <p className="text-sm text-ink-3">
              {metrics.width}×{metrics.height}pt · {formatBytes(metrics.bytes)}
            </p>
            <p className="max-w-xs text-xs text-ink-3">
              Select Save to download and open your PDF.
            </p>
          </div>
        ) : zoom === "fit" ? (
          <img
            src={image}
            alt={`Capture of ${metrics.final_url}`}
            className="mx-auto block max-w-full rounded-md border border-line shadow-2xl"
          />
        ) : (
          <img
            src={image}
            alt={`Capture of ${metrics.final_url} at actual size`}
            className="mx-auto block rounded-md border border-line"
            style={{ width: metrics.width, maxWidth: "none" }}
          />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-line px-5 py-3 font-mono text-[11px] text-ink-3">
        <span className="truncate">{metrics.final_url}</span>
        <span>{metrics.width}×{metrics.height}</span>
        <span>{metrics.bytes.toLocaleString()} bytes</span>
        <span>{metrics.duration_ms} ms</span>
      </div>
    </Card>
  );
}
