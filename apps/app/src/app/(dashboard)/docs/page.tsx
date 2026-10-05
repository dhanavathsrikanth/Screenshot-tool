"use client";

import { useMemo, useState } from "react";
import { Badge, Card, CardHeader, CodeBlock, Input, PageHeader } from "@/components/ui";
import { ERROR_CODES, ERROR_HTTP_STATUS, ERROR_RETRIABILITY } from "@snapforge/contracts";

const ENDPOINTS = [
  { method: "POST", path: "/v1/screenshot", body: "CaptureOptions", note: "Capture now or queue with ?mode=async / sync:false. Retry safely with Idempotency-Key." },
  { method: "GET", path: "/v1/jobs/:id", body: "—", note: "Poll job status and retrieve its final result." },
  { method: "GET", path: "/v1/requests/:key", body: "—", note: "Recover an existing capture after losing its POST response. Requires jobs:read." },
  { method: "GET", path: "/v1/jobs/:id/webhook", body: "—", note: "Check webhook delivery status and its generation ETag." },
  { method: "POST", path: "/v1/jobs/:id/webhook/redeliver", body: "If-Match", note: "Retry a completed notification with its generation ETag. Does not render or charge again." },
  { method: "GET", path: "/v1/health", body: "—", note: "Check whether the capture service is ready. Returns 503 when unavailable." },
] as const;

const PARAMS: [string, string, string][] = [
  ["url", "string", "Required target. Bare hostnames are upgraded to https://."],
  ["device", "string", "Preset name — desktop_hd, iphone_15_pro, pixel_8, ipad_pro_11 and more."],
  ["viewport", "{ width, height, deviceScaleFactor }", "Custom viewport; overrides device dimensions."],
  ["full_page", "boolean", "Capture the full scrollable document instead of the viewport."],
  ["format", "png | jpeg | webp | pdf", "Output encoding. JPEG/WebP honour quality."],
  ["quality", "int 1–100", "Encoder quality for lossy formats."],
  ["wait_until", "load | domcontentloaded | networkidle", "Navigation readiness signal."],
  ["wait_for_idle", "boolean", "Bounded network-quiet settlement with a hard safety timeout."],
  ["wait_for_selector", "string", "Block until a CSS selector resolves."],
  ["fail_if_incomplete", "boolean", "Reject obvious loading shells before delivery. Defaults to true."],
  ["fail_if_content_missing", "string[]", "Require case-insensitive page text. Up to 32 strings, 1–500 characters each."],
  ["fail_if_content_contains", "string[]", "Reject forbidden case-insensitive page text. Up to 32 strings, 1–500 characters each."],
  ["min_capture_height", "positive int", "Reject output below this height in pixels."],
  ["min_capture_bytes", "positive int", "Reject output below this encoded byte size."],
  ["proxy", "{ server, username?, password? }", "Use your own proxy provider, with or without a region."],
  ["cache_ttl", "int seconds", "Bound capture reuse. Zero forces a fresh render."],
  ["delay", "int ms", "Extra settle time after readiness."],
  ["timeout", "int ms", "Hard cap for the whole capture."],
  ["dark_mode", "boolean", "Emulate prefers-color-scheme: dark."],
  ["block_ads", "boolean", "Filter known ad and analytics hosts at the request layer."],
  ["block_cookie_banners", "boolean", "CMP selector catalogue plus shadow-DOM sweep."],
  ["hide_selectors", "string[]", "Visibility hidden before the screenshot."],
  ["remove_selectors", "string[]", "Nodes deleted from the DOM before the screenshot."],
  ["custom_css", "string", "Injected stylesheet."],
  ["custom_js", "string", "Evaluated in page context before settlement."],
];

export default function DocsPage() {
  const [query, setQuery] = useState("");
  const filteredParams = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return PARAMS.filter((row) => row.join(" ").toLowerCase().includes(needle));
  }, [query]);
  const filteredEndpoints = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return ENDPOINTS.filter((endpoint) => Object.values(endpoint).join(" ").toLowerCase().includes(needle));
  }, [query]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Reference"
        title="Documentation"
        description="Explore supported endpoints, request options, and error responses."
        action={<a className="text-sm text-accent-ink underline-offset-4 hover:underline" href="/llms.txt">Agent spec · llms.txt</a>}
      />

      <Card>
        <CardHeader title="Quickstart" description="Capture a page in one request" />
        <div className="space-y-4 p-5">
          <CodeBlock>
            {`curl -X POST https://api.snapforge.dev/v1/screenshot \\
  -H "Authorization: Bearer $SNAPFORGE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "url": "example.com",
    "device": "desktop_hd",
    "full_page": true,
    "format": "webp",
    "quality": 82,
    "block_cookie_banners": true
  }'`}
          </CodeBlock>
          <div className="flex flex-wrap items-center gap-3 text-sm text-ink-3">
            <Badge tone="success" icon="check">
              200 · data.url signed for {3600}s
            </Badge>
            <Badge tone="neutral">Retry safely with Idempotency-Key</Badge>
            <Badge tone="neutral">Failed captures consume no credits</Badge>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Endpoints" />
          <div className="px-5 pb-3">
            <Input aria-label="Search endpoints and parameters" value={query} placeholder="Search API reference" onChange={(event) => setQuery(event.target.value)} />
          </div>
          <ul className="divide-y divide-line">
            {filteredEndpoints.map((endpoint) => (
              <li key={endpoint.path} className="px-5 py-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={endpoint.method === "GET" ? "info" : "accent"}>{endpoint.method}</Badge>
                  <code className="break-all font-mono text-xs text-ink">{endpoint.path}</code>
                  <span className="ml-auto font-mono text-[11px] text-ink-3">{endpoint.body}</span>
                </div>
                <p className="mt-1.5 text-sm text-ink-3">{endpoint.note}</p>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader title="Error taxonomy" description="Stable codes — branch on these, not on messages" />
          <div className="max-h-[420px] overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-surface">
                <tr className="border-b border-line text-xs text-ink-3">
                  <th className="px-5 py-2.5 font-medium">Code</th>
                  <th className="px-3 py-2.5 font-medium">HTTP</th>
                  <th className="px-5 py-2.5 font-medium">Retriable</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {ERROR_CODES.map((code) => (
                  <tr key={code}>
                    <td className="px-5 py-2.5 font-mono text-xs text-ink-2">{code}</td>
                    <td className="px-3 py-2.5 font-mono text-xs text-ink-3">
                      {ERROR_HTTP_STATUS[code]}
                    </td>
<td className="px-5 py-2.5">
                    <Badge tone={ERROR_RETRIABILITY[code] ? "neutral" : "warning"}>
                      {ERROR_RETRIABILITY[code] ? "yes" : "no"}
                    </Badge>
                  </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Parameters" description="Choose what to capture and how to render it" />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-ink-3">
                <th className="px-5 py-3 font-medium">Field</th>
                <th className="px-3 py-3 font-medium">Type</th>
                <th className="px-5 py-3 font-medium">Behaviour</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filteredParams.map(([field, type, note]) => (
                <tr key={field} className="transition-colors hover:bg-raised/40">
                  <td className="px-5 py-2.5 font-mono text-xs text-accent-ink">{field}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-ink-3">{type}</td>
                  <td className="px-5 py-2.5 text-ink-2">{note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {filteredParams.length === 0 && filteredEndpoints.length === 0 ? <p className="text-sm text-ink-3">No API reference matches “{query}”.</p> : null}

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { title: "Rate limits", body: "120 requests/min per key, burst 30. 429 carries Retry-After." },
          { title: "Storage", body: "Objects live 1 hour by default; pass cache_ttl to extend up to 30 days." },
          { title: "Webhooks", body: "job.completed and job.failed POST the job payload to your endpoint." },
        ].map((item) => (
          <Card key={item.title} className="p-5">
            <p className="font-display text-sm font-semibold text-ink">{item.title}</p>
            <p className="mt-1.5 text-sm text-ink-3">{item.body}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
