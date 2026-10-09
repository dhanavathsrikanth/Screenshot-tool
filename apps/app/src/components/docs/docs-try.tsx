"use client";

import Image from "next/image";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { CAPTURE_FORMATS, type CaptureFormat } from "@snapforge/contracts";
import { createContext, useContext, useEffect, useId, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { PdfPreview } from "../pdf-preview";
import { DOC_OPERATION_INFO, docResponseError, pendingDocJob, printableDocResponse, responseCapture, runDocInvocation, type DocInvocation, type DocLiveExample, type DocResponse } from "@/lib/docs-live";
import styles from "./docs.module.css";

const TryContext = createContext<((example: DocLiveExample) => void) | null>(null);

export function DocsTryButton({ example }: { example: DocLiveExample }) {
  const open = useContext(TryContext);
  return <button type="button" className={styles.tryButton} onClick={() => open?.(example)} title={example.title} aria-label={`Try it: ${example.title}`}><Icon name="play" /><span>{example.operation === "webhook" ? "Try GET" : example.operation === "redeliver" ? "Try POST" : "Try it"}</span></button>;
}

export function DocsTryProvider({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const controller = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const [example, setExample] = useState<DocLiveExample | null>(null);
  const [authentication, setAuthentication] = useState<DocInvocation["authentication"]>("console");
  const [apiKey, setApiKey] = useState("");
  const [website, setWebsite] = useState("");
  const [format, setFormat] = useState<CaptureFormat>("webp");
  const [details, setDetails] = useState(false);
  const [handle, setHandle] = useState("");
  const [key, setKey] = useState("");
  const [etag, setEtag] = useState("");
  const [lastJob, setLastJob] = useState("");
  const [lastKey, setLastKey] = useState("");
  const [lastEtag, setLastEtag] = useState("");
  const [busy, setBusy] = useState(false);
  const [startedIn, setStartedIn] = useState<number | null>(null);
  const [tab, setTab] = useState<"request" | "response">("request");
  const [responses, setResponses] = useState<DocResponse[]>([]);
  const [selectedResponse, setSelectedResponse] = useState(0);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => () => { sequence.current++; controller.current?.abort(); }, []);

  function resetCapture(next: DocLiveExample) {
    const { url, format: outputFormat } = next.body ?? {};
    setWebsite(typeof url === "string" ? url : "https://example.com");
    setFormat(CAPTURE_FORMATS.includes(outputFormat as CaptureFormat) ? outputFormat as CaptureFormat : "png");
  }

  function open(next: DocLiveExample) {
    sequence.current++;
    controller.current?.abort();
    setExample(next);
    resetCapture(next);
    setHandle(next.operation === "request" ? lastKey : lastJob);
    setKey(`docs-${crypto.randomUUID()}`);
    setEtag(lastEtag);
    setResponses([]); setSelectedResponse(0); setError(""); setCopied(false); setBusy(false); setStartedIn(null); setDetails(false); setTab("request");
    dialog.current?.showModal();
  }

  function stop() {
    sequence.current++;
    controller.current?.abort();
    setBusy(false);
    setError("Stopped waiting. The capture may still finish.");
  }

  async function send() {
    if (!example || busy) return;
    let parsed: Record<string, unknown> | undefined;
    if (example.operation === "capture") parsed = { ...example.body, url: website.trim(), format, ...(format === "pdf" ? { full_page: true, selector: undefined } : {}) };
    const input: DocInvocation = { operation: example.operation, authentication: example.operation === "capture" ? "console" : authentication, body: parsed, handle, idempotencyKey: key, ifMatch: etag };
    const attempt = ++sequence.current;
    controller.current = new AbortController();
    setBusy(true); setError(""); setResponses([]); setSelectedResponse(0); setCopied(false); setStartedIn(null); setTab("response");
    if (example.operation === "capture") setLastKey(key);
    let count = 0;
    try {
      await runDocInvocation(input, example.operation === "capture" ? "" : apiKey.trim(), { signal: AbortSignal.any([controller.current.signal, AbortSignal.timeout(120000)]), follow: true,
        onStarted(elapsed) { if (sequence.current === attempt) setStartedIn(elapsed); },
        onResponse(response) {
          if (sequence.current !== attempt) return;
          setResponses((previous) => [...previous, response]);
          setSelectedResponse(count++);
          const job = pendingDocJob(response.body);
          if (job && example.operation === "capture") setLastJob(job);
          if (response.headers.etag) setLastEtag(response.headers.etag);
        },
      });
    } catch {
      if (sequence.current === attempt) setError("The response was interrupted or the two-minute wait ended. Use the same key to recover accepted work before sending another capture.");
    } finally { if (sequence.current === attempt) setBusy(false); }
  }

  const info = example ? DOC_OPERATION_INFO[example.operation] : DOC_OPERATION_INFO.capture;
  const response = responses[selectedResponse];
  const capture = responseCapture(response?.body);
  const responseError = docResponseError(response?.body);
  const activeJob = pendingDocJob(response?.body);
  const isCapture = example?.operation === "capture";
  const needsKey = !isCapture && authentication === "api-key" && example?.operation !== "health";
  const canSend = isLoaded && ((!isCapture && authentication === "api-key") || isSignedIn) && (!needsKey || apiKey.trim().length > 0) && (!info.handle || handle.trim().length > 0) && (example?.operation !== "redeliver" || etag.length > 0) && (!isCapture || website.trim().length > 0);
  const endpoint = info.endpoint.replace("{id}", handle || "{id}").replace("{key}", handle || "{key}");

  return <TryContext.Provider value={open}>{children}
    <dialog ref={dialog} className={styles.tryDialog} aria-labelledby={`${id}-title`} onClose={() => { if (controller.current && busy) stop(); }} onClick={(event) => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
      <div className={styles.tryHeader}><div><span className={styles.liveBadge}><i />Live request</span><h2 id={`${id}-title`}>{example?.title ?? "Try an example"}</h2></div><button type="button" onClick={() => dialog.current?.close()} aria-label="Close live request"><Icon name="x" /></button></div>
      <div className={styles.tryEndpoint}><span className={styles.method}>{info.method}</span><code>{endpoint}</code></div>
      <div className={styles.tryTabs} role="tablist" aria-label="Live request views">{(["request", "response"] as const).map((value) => <button key={value} id={`${id}-${value}-tab`} type="button" role="tab" aria-selected={tab === value} aria-controls={`${id}-${value}-panel`} tabIndex={tab === value ? 0 : -1} onClick={() => setTab(value)} onKeyDown={(event) => {
        if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) { event.preventDefault(); const next = event.key === "Home" ? "request" : event.key === "End" ? "response" : value === "request" ? "response" : "request"; setTab(next); document.getElementById(`${id}-${next}-tab`)?.focus(); }
      }}>{value === "request" ? "Request" : isCapture ? "Preview" : "Response"}{value === "response" && responses.length > 0 && <span>{responses.length}</span>}</button>)}</div>
      <div className={styles.tryScroll}>
        <div id={`${id}-request-panel`} role="tabpanel" aria-labelledby={`${id}-request-tab`} hidden={tab !== "request"}>
          <form id={`${id}-form`} onSubmit={(event) => { event.preventDefault(); void send(); }}>
            {example?.operation === "capture" && <>
              <label className={styles.tryField} htmlFor={`${id}-website`}><span>Website URL</span><input id={`${id}-website`} type="text" inputMode="url" value={website} onChange={(event) => { setWebsite(event.target.value); setKey(`docs-${crypto.randomUUID()}`); }} placeholder="https://example.com" autoComplete="url" spellCheck={false} disabled={busy} required /></label>
              <label className={styles.tryField} htmlFor={`${id}-format`}><span>Output format</span><select id={`${id}-format`} value={format} onChange={(event) => { setFormat(event.target.value as CaptureFormat); setKey(`docs-${crypto.randomUUID()}`); }} disabled={busy}>{CAPTURE_FORMATS.map((value) => <option key={value} value={value}>{value.toUpperCase()}</option>)}</select></label>
            </>}
            {!isCapture && <><label className={styles.tryField} htmlFor={`${id}-auth`}><span>Authentication</span><select id={`${id}-auth`} value={authentication} disabled={busy} onChange={(event) => setAuthentication(event.target.value as DocInvocation["authentication"])}><option value="console">Console session</option><option value="api-key">API key</option></select></label>
            {authentication === "console" ? <p className={styles.tryHint}>{isLoaded && !isSignedIn ? <><Link href="/sign-in">Sign in</Link> to use your console account, or choose API key.</> : "Uses your signed-in account and the console capture service. Its response format can differ from the REST API."}</p> : <><p className={styles.tryHint}>Sends the documented REST request to this site’s configured API gateway. Your key stays in memory for this docs session.</p>{needsKey && <label className={styles.tryField} htmlFor={`${id}-key`}><span>API key</span><input id={`${id}-key`} type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="sf_live_…" autoComplete="off" spellCheck={false} disabled={busy} /></label>}</>}
            </>}
            {info.handle && <label className={styles.tryField} htmlFor={`${id}-handle`}><span>{info.handle}</span><input id={`${id}-handle`} value={handle} onChange={(event) => setHandle(event.target.value)} placeholder={example?.operation === "request" ? "Your original request key" : "The job ID returned by a capture"} autoComplete="off" spellCheck={false} disabled={busy} required /></label>}
            {example?.operation === "redeliver" && <><label className={styles.tryField} htmlFor={`${id}-etag`}><span>If-Match</span><input id={`${id}-etag`} value={etag} onChange={(event) => setEtag(event.target.value)} placeholder={'"0"'} autoComplete="off" spellCheck={false} disabled={busy} required /></label><p className={styles.tryHint}>Use the quoted ETag from delivery status. Redelivery sends the existing callback again.</p></>}
            {isCapture && isLoaded && !isSignedIn && <p className={styles.tryHint}><Link href="/sign-in">Sign in to capture</Link></p>}
          </form>
        </div>
        <div id={`${id}-response-panel`} role="tabpanel" aria-labelledby={`${id}-response-tab`} hidden={tab !== "response"}>
          {responses.length > 0 ? <>
            {(!isCapture || responses.length > 1) && <label className={styles.tryField} htmlFor={`${id}-history`}><span>Request history</span><select id={`${id}-history`} value={selectedResponse} onChange={(event) => { setSelectedResponse(Number(event.target.value)); setCopied(false); }}>{responses.map((item, index) => <option key={index} value={index}>{index + 1}. {DOC_OPERATION_INFO[item.operation].method} {DOC_OPERATION_INFO[item.operation].endpoint} · HTTP {item.status}</option>)}</select></label>}
            <div className={styles.responseMeta}><span className={response.status >= 400 ? styles.responseFailure : styles.responseSuccess}>HTTP {response.status}</span>{startedIn !== null && <span>Started {startedIn.toLocaleString()} ms</span>}<span>{startedIn !== null ? capture ? "Ready " : "Response " : ""}{response.elapsed.toLocaleString()} ms</span>{!isCapture && <span>{response.headers["x-snapforge-interface"] === "rest-api" ? "REST API" : "Console"}</span>}{(!isCapture || details) && <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(JSON.stringify(response.body, null, 2)); setCopied(true); } catch { setError("Select the response text to copy it."); } }}><Icon name={copied ? "check" : "copy"} />{copied ? "Copied" : "Copy response"}</button>}</div>
            {capture && <div className={styles.livePreview}><div><strong>{capture.format === "pdf" ? "PDF preview" : "Capture preview"}</strong><a href={capture.artifact} download={`capture.${capture.format}`} target="_blank" rel="noopener noreferrer"><Icon name="download" />Download {capture.format.toUpperCase()}</a></div>{capture.format === "pdf" ? <PdfPreview key={`${selectedResponse}-${response.headers["x-request-id"] ?? "preview"}`} src={capture.artifact} /> : <Image src={capture.artifact} alt="Screenshot returned by this live capture" width={1280} height={720} unoptimized />}</div>}
            {isCapture && <button type="button" className={styles.tryAdvancedToggle} aria-expanded={details} aria-controls={`${id}-details`} onClick={() => setDetails(!details)}>Response details<Icon name="chevron" /></button>}
            <div id={`${id}-details`} hidden={isCapture && !details}>
              <dl className={styles.responseHeaders}>{Object.entries(response.headers).filter(([name]) => ["x-request-id", "etag", "retry-after", "server-timing"].includes(name)).map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value}</dd></div>)}</dl>
              <pre className={styles.liveJson} tabIndex={0}><code>{printableDocResponse(response.body)}</code></pre>
            </div>
            {activeJob && !busy && example?.operation === "capture" && <button type="button" className={styles.trySecondary} onClick={() => open({ operation: "job", title: "Check the accepted job" })}><Icon name="refresh" />Check job status</button>}
          </> : <div className={styles.responseEmpty}><Icon name={busy ? "clock" : "play"} /><strong>{busy ? "Capturing website…" : "Your preview will appear here"}</strong>{busy && startedIn !== null && <p role="status">Request started in {startedIn.toLocaleString()} ms</p>}</div>}
        </div>
        {busy && responses.length > 0 && <p className={styles.tryProgress} role="status"><Icon name="clock" />Following the accepted job…</p>}
        {responseError && <div className={styles.tryError} role="alert"><Icon name="alert" /><p>{responseError}</p></div>}
        {error && <div className={styles.tryError} role="alert"><Icon name="alert" /><p>{error}</p></div>}
        <span className={styles.srOnly} role="status">{copied ? "Response copied" : ""}</span>
      </div>
      <div className={styles.tryFooter}>{busy ? <><span>Capturing…</span><button type="button" className={styles.trySecondary} onClick={stop}>Stop waiting</button></> : <><span>{isCapture ? "1 credit on success" : "Live API request"}</span><button type="submit" form={`${id}-form`} disabled={!canSend} className={styles.trySend}><Icon name="play" />{info.label}</button></>}</div>
    </dialog>
  </TryContext.Provider>;
}
