"use client";

import { Icon } from "./icons";
import { IPhone17ProMax } from "./apple-iphone-17-pro";
import { PdfPreview } from "./pdf-preview";
import styles from "./preview-panel.module.css";
import { Badge, Card } from "./ui";
import type { CaptureResult } from "@/lib/capture";
import { DEVICE_PRESETS } from "@snapforge/contracts";

export function PreviewPanel({
  result,
  pending,
  device,
  localCapture = false,
}: {
  result: CaptureResult | null;
  pending: boolean;
  device: string;
  localCapture?: boolean;
}) {
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
      <Card className="min-h-[420px] overflow-hidden bg-canvas">
        <div className="min-h-[420px]" aria-hidden="true" />
      </Card>
    );
  }

  if (!result.ok) {
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
        </div>
      </Card>
    );
  }

  const { metrics, image } = result;
  const isPdf = metrics.format === "pdf";
  const fileExtension = metrics.format === "jpeg" ? "jpg" : metrics.format;
  const deviceScaleFactor = isPdf ? 1 : metrics.render_diagnostics?.device_scale_factor ?? 1;
  const previewWidth = metrics.width / deviceScaleFactor;
  const preset = DEVICE_PRESETS[device];
  const isIphone17ProMax = device === "iphone_17_pro_max";
  const deviceFrame = !preset?.viewport.isMobile || isIphone17ProMax
    ? null
    : device.startsWith("iphone")
      ? "iphoneFrame"
      : device.startsWith("ipad") || preset.viewport.width >= 700
        ? "tabletFrame"
        : "androidFrame";

  const renderedImage = image ? (
    isPdf ? (
      <PdfPreview src={image} width={previewWidth} />
    ) : (
      <img src={image} alt="Rendered screenshot preview" className="block h-auto w-full" />
    )
  ) : null;

  return (
    <div className="mx-auto w-full max-w-full" style={{ width: previewWidth }}>
      <div className={styles.preview}>
        {image ? (
          <div className={styles.actions}>
            <a
              href={image}
              download={`snapforge-${metrics.width}x${metrics.height}.${fileExtension}`}
              aria-label="Save capture"
              className="inline-flex items-center gap-2 rounded-md border border-line bg-surface px-3 py-2 text-xs font-medium text-ink shadow-sm transition-colors hover:border-line-strong"
            >
              <Icon name="download" className="size-3.5" />
              Save
            </a>
          </div>
        ) : null}
        {isIphone17ProMax ? (
          <IPhone17ProMax>
            {renderedImage}
          </IPhone17ProMax>
        ) : deviceFrame ? (
          <div className={`${styles.deviceFrame} ${styles[deviceFrame]}`}>
            <span className={styles.deviceButton} aria-hidden="true" />
            <div className={styles.deviceStatusBar} aria-hidden="true">
              <span className={styles.deviceTime}>9:41</span>
              <span className={styles.deviceIsland} />
              <span className={styles.deviceIndicators}>
                <span className={styles.signal} />
                <span className={styles.battery} />
              </span>
            </div>
            <div className={styles.deviceScreen}>
              {renderedImage}
            </div>
            <div className={styles.deviceHomeBar} aria-hidden="true">
              <span />
            </div>
          </div>
        ) : (
          <div className={styles.browserWindow}>
            <div className={styles.browserBar} aria-hidden="true">
              <span className={styles.closeDot} />
              <span className={styles.minimizeDot} />
              <span className={styles.maximizeDot} />
            </div>
            <div className={styles.browserScreen}>
              {isPdf ? renderedImage : (
                <div className="max-h-[720px] overflow-auto">
                  <div className="sf-checkerboard w-full">{renderedImage}</div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
