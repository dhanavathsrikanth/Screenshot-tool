"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Icon } from "@/components/icons";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Input,
  Label,
  PageHeader,
  Range,
  Select,
  Textarea,
  Toggle,
} from "@/components/ui";
import {
  buildCurl,
  buildMcpConfig,
  buildPython,
  buildQueryCurl,
  buildTypeScript,
  DEFAULT_STATE,
  effectiveViewport,
  toCaptureOptions,
  type PlaygroundState,
} from "@/lib/playground";
import type { CaptureResult } from "@/lib/capture";
import { CAPTURE_JOB_SESSION_KEY, CAPTURE_REQUEST_SESSION_KEY, followCapture, startCapture } from "@/lib/capture-client";
import { PreviewPanel } from "./preview-panel";
import { CodeTabs } from "./code-tabs";
import { DEFAULT_PREFS, preferenceSnapshot, readPreferences, subscribePreferences } from "@/lib/console-preferences";

const DEVICES = [
  { key: "desktop_standard", label: "Desktop 1280×720" },
  { key: "desktop_hd", label: "Desktop HD 1920×1080" },
  { key: "desktop_2k", label: "Desktop 2K 2560×1440" },
  { key: "desktop_4k", label: "Desktop 4K 3840×2160" },
  { key: "iphone_15_pro", label: "iPhone 15 Pro" },
  { key: "iphone_15_pro_max", label: "iPhone 15 Pro Max" },
  { key: "pixel_8", label: "Pixel 8" },
  { key: "ipad_pro_11", label: "iPad Pro 11″" },
  { key: "custom", label: "Custom viewport" },
];

const SNIPPETS = ["curl", "typescript", "python", "mcp"] as const;

export function Playground({ localCapture = false }: { localCapture?: boolean }) {
  const [customState, setState] = useState<PlaygroundState | null>(null);
  const preferenceVersion = useSyncExternalStore(subscribePreferences, preferenceSnapshot, () => null);
  const prefs = preferenceVersion ? readPreferences() : DEFAULT_PREFS;
  const state = useMemo(() => customState ?? { ...DEFAULT_STATE, device: prefs.defaultDevice, format: prefs.defaultFormat, fullPage: prefs.fullPageByDefault }, [customState, prefs.defaultDevice, prefs.defaultFormat, prefs.fullPageByDefault]);
  const [result, setResult] = useState<CaptureResult | null>(null);
  const [pending, setPending] = useState(false);
  const [snippet, setSnippet] = useState<(typeof SNIPPETS)[number]>("curl");
  const [copied, setCopied] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const active = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    const prefs = readPreferences();
    setState({ ...DEFAULT_STATE, device: prefs.defaultDevice, format: prefs.defaultFormat, fullPage: prefs.fullPageByDefault });
  }, []);

  const patch = useCallback((next: Partial<PlaygroundState>) => {
    setState((previous) => {
      const prefs = readPreferences();
      return { ...(previous ?? { ...DEFAULT_STATE, device: prefs.defaultDevice, format: prefs.defaultFormat, fullPage: prefs.fullPageByDefault }), ...next };
    });
  }, []);

  const viewport = useMemo(() => effectiveViewport(state), [state]);
  const options = useMemo(() => toCaptureOptions(state), [state]);

  const code = useMemo(() => {
    switch (snippet) {
      case "curl":
        return buildCurl(state);
      case "typescript":
        return buildTypeScript(state);
      case "python":
        return buildPython(state);
      case "mcp":
        return buildMcpConfig(state);
    }
  }, [snippet, state]);

  const queryCode = useMemo(() => buildQueryCurl(state), [state]);

  const watch = useCallback(async (jobId: string, controller: AbortController) => {
    const payload = await followCapture(jobId, { signal: controller.signal, onProgress: setResult });
    if (!payload.pending) {
      sessionStorage.removeItem(CAPTURE_JOB_SESSION_KEY);
      if (payload.id === jobId) sessionStorage.removeItem(CAPTURE_REQUEST_SESSION_KEY);
    }
    return payload;
  }, []);

  useEffect(() => {
    if (localCapture) return () => { active.current?.abort(); active.current = null; };
    const controller = new AbortController();
    const restore = async () => {
      const jobId = sessionStorage.getItem(CAPTURE_JOB_SESSION_KEY);
      const requestKey = sessionStorage.getItem(CAPTURE_REQUEST_SESSION_KEY);
      if (!jobId && !requestKey) return;
      active.current = controller;
      setPending(true);
      try {
        if (jobId) await watch(jobId, controller);
        else {
          const recovered = await followCapture(requestKey!, { signal: controller.signal, onProgress: setResult }, true);
          if (recovered.ok || recovered.error.code !== "invalid_request") sessionStorage.removeItem(CAPTURE_REQUEST_SESSION_KEY);
        }
      }
      catch { if (!controller.signal.aborted) setResult({ ok: false, id: jobId ?? requestKey!, at: Date.now(), error: {
        code: "internal_error", message: "Reload to check your existing capture again.", retriable: true, request_id: jobId ?? requestKey!,
      } }); }
      finally { if (!controller.signal.aborted) { active.current = null; setPending(false); } }
    };
    void restore();
    return () => { controller.abort(); active.current?.abort(); active.current = null; };
  }, [localCapture, watch]);

  const run = useCallback(async () => {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setPending(true);
    setCopied(false);
    try {
      if (localCapture) {
        setResult(await startCapture(options, "", { signal: controller.signal, onProgress: setResult, local: true }));
        return;
      }
      const existingJob = sessionStorage.getItem(CAPTURE_JOB_SESSION_KEY);
      if (existingJob) { await watch(existingJob, controller); return; }
      const requestKey = sessionStorage.getItem(CAPTURE_REQUEST_SESSION_KEY) ?? crypto.randomUUID();
      sessionStorage.setItem(CAPTURE_REQUEST_SESSION_KEY, requestKey);
      const payload = await startCapture(options, requestKey, { signal: controller.signal, onProgress: setResult });
      setResult(payload);
      const jobId = payload.pending ? payload.job_id : !payload.ok && typeof payload.error.details?.job_id === "string" ? payload.error.details.job_id : null;
      if (jobId) {
        sessionStorage.setItem(CAPTURE_JOB_SESSION_KEY, jobId);
        await watch(jobId, controller);
      }
      else if (payload.ok || (!payload.error.retriable && payload.error.code !== "idempotency_conflict")) sessionStorage.removeItem(CAPTURE_REQUEST_SESSION_KEY);
    } catch (error) {
      if (controller.signal.aborted) return;
      setResult({
        ok: false,
        id: "local",
        at: Date.now(),
        error: {
          code: "internal_error",
          message: error instanceof Error ? error.message : String(error),
          retriable: true,
          request_id: "local",
        },
      });
    } finally {
      if (!controller.signal.aborted) { active.current = null; setPending(false); }
    }
  }, [localCapture, options, watch]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        void run();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [run]);

  const copy = useCallback(async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }, [code]);

  return (
    <div className="space-y-6">
      <PageHeader title="Capture playground" description="Start with a URL. Adjust the details, preview the result, and copy your request." action={
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="neutral" icon="device">
            {viewport.width}×{viewport.height}
            {viewport.deviceScaleFactor > 1 ? ` @${viewport.deviceScaleFactor}x` : ""}
          </Badge>
          <Button variant="ghost" onClick={reset} disabled={pending}>
            <Icon name="refresh" className="size-4" />
            Reset
          </Button>
          <Button variant="primary" onClick={() => void run()} disabled={pending}>
            <Icon name="play" className="size-4" />
            {pending ? "Capturing…" : "Capture"}
          </Button>
        </div>
      } />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card>
            <CardHeader title="Target" description="What to render" />
            <div className="space-y-4 p-5">
              <div className="space-y-1.5">
                <Label htmlFor="url">URL</Label>
                <Input
                  id="url"
                  value={state.url}
                  spellCheck={false}
                  placeholder="example.com/pricing"
                  onChange={(event) => patch({ url: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="device">Device preset</Label>
                <Select
                  id="device"
                  value={state.device}
                  onChange={(event) => patch({ device: event.target.value })}
                >
                  {DEVICES.map((device) => (
                    <option key={device.key} value={device.key}>
                      {device.label}
                    </option>
                  ))}
                </Select>
              </div>
              {state.device === "custom" ? (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="width">Width</Label>
                    <Input
                      id="width"
                      type="number"
                      min={320}
                      max={3840}
                      value={state.customWidth}
                      onChange={(event) => patch({ customWidth: Number(event.target.value) })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="height">Height</Label>
                    <Input
                      id="height"
                      type="number"
                      min={240}
                      max={2160}
                      value={state.customHeight}
                      onChange={(event) => patch({ customHeight: Number(event.target.value) })}
                    />
                  </div>
                </div>
              ) : null}
            </div>
          </Card>

          <Card>
            <CardHeader title="Output" description="Format and framing" />
            <div className="space-y-4 p-5">
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-ink-2">Format</p>
                <div className="grid grid-cols-4 gap-1.5">
                  {(["png", "jpeg", "webp", "pdf"] as const).map((format) => (
                    <button
                      key={format}
                      type="button"
                      onClick={() => patch({ format })}
                      aria-pressed={state.format === format}
                      className={`rounded-md border px-2 py-2 font-mono text-xs uppercase transition-colors ${
                        state.format === format
                          ? "border-accent bg-accent/12 text-accent-ink"
                          : "border-line bg-canvas text-ink-3 hover:border-line-strong hover:text-ink-2"
                      }`}
                    >
                      {format}
                    </button>
                  ))}
                </div>
              </div>
              {state.format !== "png" ? (
                <div className="space-y-1.5">
                  <Label hint="1–100">Quality</Label>
                  <Range
                    label="Image quality"
                    value={state.quality}
                    min={1}
                    max={100}
                    onChange={(quality) => patch({ quality })}
                  />
                </div>
              ) : null}
              <Toggle
                checked={state.fullPage}
                onChange={(fullPage) => patch({ fullPage })}
                label="Full page"
                description="Include content below the initial viewport."
              />
              <Toggle
                checked={state.darkMode}
                onChange={(darkMode) => patch({ darkMode })}
                label="Dark mode"
                description="Emulate prefers-color-scheme: dark"
              />
            </div>
          </Card>

          <Card>
            <CardHeader title="Timing" description="Settlement strategy" />
            <div className="space-y-4 p-5">
              <div className="space-y-1.5">
                <Label htmlFor="waitUntil">Wait until</Label>
                <Select
                  id="waitUntil"
                  value={state.waitUntil}
                  onChange={(event) =>
                    patch({ waitUntil: event.target.value as PlaygroundState["waitUntil"] })
                  }
                >
                  <option value="networkidle">Network quiet (recommended)</option>
                  <option value="load">Page loaded</option>
                  <option value="domcontentloaded">Document ready</option>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="selector">Wait for selector</Label>
                <Input
                  id="selector"
                  value={state.waitForSelector}
                  spellCheck={false}
                  placeholder="#app-root .hydrated"
                  onChange={(event) => patch({ waitForSelector: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label hint="ms">Delay</Label>
                <Range
                  label="Capture delay in milliseconds"
                  value={state.delay}
                  min={0}
                  max={10000}
                  step={100}
                  suffix=" ms"
                  onChange={(delay) => patch({ delay })}
                />
              </div>
              <div className="space-y-1.5">
                <Label hint="ms">Timeout</Label>
                <Range
                  label="Capture timeout in milliseconds"
                  value={state.timeout}
                  min={1000}
                  max={60000}
                  step={1000}
                  suffix=" ms"
                  onChange={(timeout) => patch({ timeout })}
                />
              </div>
              <Toggle
                checked={state.waitForIdle}
                onChange={(waitForIdle) => patch({ waitForIdle })}
                label="Wait for idle"
                description="Allow network activity and fonts to settle."
              />
            </div>
          </Card>

          <Card>
            <CardHeader title="Blocking" description="Cleanliness filters" />
            <div className="space-y-2 p-5">
              <Toggle
                checked={state.blockCookieBanners}
                onChange={(blockCookieBanners) => patch({ blockCookieBanners })}
                label="Hide cookie banners"
                description="Remove supported cookie consent overlays."
              />
              <Toggle
                checked={state.blockAds}
                onChange={(blockAds) => patch({ blockAds })}
                label="Block ad networks"
                description="Filter requests to known advertising services."
              />
              <Toggle
                checked={state.blockTrackers}
                onChange={(blockTrackers) => patch({ blockTrackers })}
                label="Block trackers"
                description="Analytics, pixels, session replay"
              />
            </div>
          </Card>

          <Card>
            <button
              type="button"
              onClick={() => setAdvanced((value) => !value)}
              className="flex w-full items-center justify-between px-5 py-4 text-left"
              aria-expanded={advanced}
            >
              <span>
                <span className="block text-sm font-medium text-ink">
                  Advanced
                </span>
                <span className="mt-1 block text-sm text-ink-3">
                  Hide elements or add custom CSS and JavaScript.
                </span>
              </span>
              <Icon
                name={advanced ? "x" : "sliders"}
                className="size-4 shrink-0 text-ink-3"
              />
            </button>
            {advanced ? (
              <div className="space-y-4 border-t border-line p-5">
                <div className="space-y-1.5">
                  <Label hint="comma or newline separated">Hide selectors</Label>
                  <Input
                    value={state.hideSelectors}
                    spellCheck={false}
                    placeholder=".sticky-header, #newsletter-modal"
                    onChange={(event) => patch({ hideSelectors: event.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label hint="comma or newline separated">Remove selectors</Label>
                  <Input
                    value={state.removeSelectors}
                    spellCheck={false}
                    placeholder="iframe[src*='doubleclick']"
                    onChange={(event) => patch({ removeSelectors: event.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Custom CSS</Label>
                  <Textarea
                    rows={4}
                    value={state.customCss}
                    spellCheck={false}
                    placeholder="body { background: var(--sf-color-neutral-0); }"
                    onChange={(event) => patch({ customCss: event.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Custom JS</Label>
                  <Textarea
                    rows={4}
                    value={state.customJs}
                    spellCheck={false}
                    placeholder="document.querySelectorAll('[data-test]').forEach(el => el.click())"
                    onChange={(event) => patch({ customJs: event.target.value })}
                  />
                </div>
              </div>
            ) : null}
          </Card>
        </div>

        <div className="min-w-0 space-y-4">
          <PreviewPanel result={result} pending={pending} localCapture={localCapture} />

          <Card>
            <CardHeader
              title="Code"
              description="Copy the exact request this form will send"
              action={
                <Button variant="ghost" onClick={() => void copy()}>
                  <Icon name={copied ? "check" : "copy"} className="size-4" />
                  {copied ? "Copied" : "Copy"}
                </Button>
              }
            />
            <CodeTabs
              tabs={SNIPPETS.map((key) => ({
                key,
                label: key === "curl" ? "cURL" : key === "typescript" ? "TypeScript" : key === "python" ? "Python" : "MCP",
              }))}
              active={snippet}
              onChange={setSnippet}
              code={code}
            />
            {snippet === "curl" ? (
              <div className="border-t border-line p-5">
                <p className="mb-2 text-xs font-medium text-ink-3">
                  Or as a signed GET
                </p>
                <pre className="overflow-x-auto rounded-md border border-line bg-canvas p-3 font-mono text-[11px] leading-relaxed text-ink-2">
                  {queryCode}
                </pre>
              </div>
            ) : null}
          </Card>
        </div>
      </div>
    </div>
  );
}
