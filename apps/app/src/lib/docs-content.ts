import { captureOptionsSchema, DEVICE_PRESETS, ERROR_CODES, ERROR_HTTP_STATUS, ERROR_RETRIABILITY, REGION_PRESETS } from "@snapforge/contracts";
import type { CaptureOptionsInput } from "@snapforge/contracts";

export interface DocCode { label: string; language: string; code: string }
export interface DocSection {
  id: string;
  title: string;
  paragraphs?: string[];
  bullets?: string[];
  code?: DocCode[];
  table?: { headers: string[]; rows: string[][] };
  note?: { title: string; text: string; caution?: boolean };
  fields?: boolean;
  cards?: { title: string; description: string; href: string; icon: "bolt" | "book" | "device" | "sparkles" | "shield" | "clock" }[];
}
export interface DocPage {
  slug: string;
  title: string;
  description: string;
  group: string;
  icon: "book" | "bolt" | "key" | "device" | "clock" | "shield" | "sparkles" | "sliders" | "download" | "refresh" | "card" | "gear";
  method?: "POST" | "GET";
  endpoint?: string;
  sections: DocSection[];
}

export const DOC_FIELD_HELP = {
  url: ["string · required", "The HTTP(S) page to capture. Bare hostnames are normalized to HTTPS. Hosted capture destinations must resolve to public networks."],
  viewport: ["object", "Custom CSS-pixel dimensions: width 320–3840, height 240–2160, deviceScaleFactor 1–3 (default 2). Optional isMobile and hasTouch default to false. Prefer either a device preset or a custom viewport."],
  device: ["string", "A named device preset. See Devices and viewports for every supported identifier."],
  full_page: ["boolean", "Scroll the document to trigger lazy content and capture the full page, within the renderer's height limit."],
  full_page_algorithm: ["by_sections | native", "Visible sections (default) capture each viewport during one scroll pass, preserving scroll reveals. Native performs lazy-load preparation before a single browser capture."],
  full_page_scroll_delay: ["integer · 0–5000 ms", "Wait after each scroll before image readiness and capture. The renderer default is 400 ms. Increase this for slow reveal animations."],
  full_page_scroll_by: ["integer · 120–2160", "Scroll step in CSS pixels, capped at the visible viewport height. Defaults to 85% of the viewport."],
  reduce_motion: ["boolean", "Default true. Request reduced motion, finish finite visible browser animations, and pause infinite animations and media while capturing each section."],
  format: ["png | jpeg | webp | pdf", "Defaults to WebP for smaller, high-quality image files. Choose PNG for lossless output. PDF dimensions use CSS pixels, including the full document height for full-page output."],
  quality: ["integer · 1–100", "JPEG and WebP encoding quality. Defaults to 90 for clear, compact output. This does not change PNG encoding or PDF output."],
  delay: ["integer · 0–30000 ms", "Extra time after readiness. Prefer a selector wait when you know which content must load."],
  timeout: ["integer · 1000–60000 ms", "Capture timeout budget. Worker scheduling and HTTP response time can add time outside rendering."],
  wait_for_selector: ["string", "Wait for a CSS selector before capturing. Use a selector that represents the content being ready."],
  wait_for_content: ["boolean", "Enable additional content readiness checks for pages with delayed hydration."],
  wait_for_idle: ["boolean", "Wait for a bounded network quiet window and web font readiness. Continuous polling cannot wait forever."],
  wait_until: ["load | domcontentloaded | networkidle", "The navigation readiness event, before additional settlement checks."],
  fail_if_incomplete: ["boolean", "Reject obvious loading shells instead of returning a successful but incomplete capture."],
  fail_if_content_missing: ["string[] · up to 32", "Require case-insensitive text. Each trimmed string must contain 1–500 characters."],
  fail_if_content_contains: ["string[] · up to 32", "Reject forbidden case-insensitive text. Each trimmed string must contain 1–500 characters."],
  min_capture_height: ["positive integer", "Reject captured output smaller than this height in pixels."],
  min_capture_bytes: ["positive integer", "Reject captured output smaller than this encoded byte size."],
  dark_mode: ["boolean", "Emulate prefers-color-scheme: dark. An explicit color_scheme takes precedence."],
  color_scheme: ["light | dark | no-preference", "Explicit browser color-scheme preference."],
  locale: ["string", "Browser locale, such as en-US. Region presets supply a consistent locale and timezone."],
  timezone: ["string", "IANA timezone, such as Asia/Kolkata."],
  user_agent: ["string", "Override the browser User-Agent for the capture."],
  region: ["string", "A supported region identifier. It sets locale/timezone and the expected egress country; it does not supply a proxy."],
  proxy: ["object", "Bring your own proxy: server is required; username, password, and bypass are optional. Use a proxy in your chosen region."],
  verify_egress: ["boolean", "Verify region-targeted egress. Keep this enabled when the capture must come from a particular country."],
  block_ads: ["boolean", "Filter known advertising request hosts."],
  block_cookie_banners: ["boolean", "Remove known consent interfaces using CMP selectors and shadow-DOM scanning. Unknown banners may need custom selectors."],
  block_chats: ["boolean", "Hide supported chat widgets, including HubSpot and Intercom, throughout capture. Set false to retain them."],
  block_trackers: ["boolean", "Filter known analytics and tracking request hosts."],
  selector: ["string", "Capture a particular CSS-selected element instead of the whole page. Element targeting supports image formats; combining it with PDF returns unsupported_option."],
  hide_selectors: ["string[]", "Hide matching elements while keeping their layout space."],
  remove_selectors: ["string[]", "Remove matching elements from the DOM; surrounding content can reflow."],
  custom_css: ["string", "Inject a stylesheet before capture."],
  custom_js: ["string", "Run JavaScript in the target page before settlement. Supply only code you intend to execute."],
  headers: ["record<string, string>", "Additional HTTP request headers. Keep credentials server-side."],
  sync: ["boolean", "Try the synchronous fast path. Even sync requests can return HTTP 202; always support job polling."],
  cache_ttl: ["nonnegative integer · seconds", "Maximum acceptable cache age. Zero forces a new render. This does not define artifact retention or signed-link expiry."],
  store: ["boolean", "Engine storage preference. Hosted workers still store deliverable artifacts; this is not a switch to return hosted screenshot bytes inline."],
} satisfies Record<keyof CaptureOptionsInput, [string, string]>;

const defaults = captureOptionsSchema.parse({ url: "https://example.com" });
export const DOC_FIELDS = Object.entries(DOC_FIELD_HELP).map(([name, [type, description]]) => ({
  name, type, description,
  default: name === "url" ? "Required" : name in defaults ? JSON.stringify(defaults[name as keyof typeof defaults]) : "Optional",
}));

const json = (value: unknown): DocCode[] => [{ label: "JSON", language: "json", code: JSON.stringify(value, null, 2) }];
const command = (code: string): DocCode[] => [{ label: "cURL", language: "bash", code }];
export const CAPTURE_EXAMPLE = { url: "https://example.com", format: "png", full_page: true } as const;
const captureCurl = `curl -X POST "$SNAPFORGE_API_URL/v1/screenshot" \\
  -H "Authorization: Bearer $SNAPFORGE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: example-capture-001" \\
  -d '${JSON.stringify(CAPTURE_EXAMPLE, null, 2)}'`;
export const CAPTURE_CODE: DocCode[] = [
  { label: "cURL", language: "bash", code: captureCurl },
  { label: "Node.js", language: "javascript", code: `const response = await fetch(
  process.env.SNAPFORGE_API_URL + "/v1/screenshot",
  {
    method: "POST",
    headers: {
      Authorization: "Bearer " + process.env.SNAPFORGE_API_KEY,
      "Content-Type": "application/json",
      "Idempotency-Key": "example-capture-001",
    },
    body: JSON.stringify({
      url: "https://example.com",
      format: "png",
      full_page: true,
    }),
  },
);
const result = await response.json();
if (!response.ok || !result.ok) throw new Error(result.error?.message);
if (response.status === 202) {
  console.log("Poll this job:", result.data.poll_url);
} else {
  console.log("Download:", result.data.cdn_url);
}` },
  { label: "Python", language: "python", code: `import json
import os
from urllib.request import Request, urlopen
from urllib.error import HTTPError

request = Request(
    os.environ["SNAPFORGE_API_URL"] + "/v1/screenshot",
    data=json.dumps({
        "url": "https://example.com",
        "format": "png",
        "full_page": True,
    }).encode(),
    headers={
        "Authorization": "Bearer " + os.environ["SNAPFORGE_API_KEY"],
        "Content-Type": "application/json",
        "Idempotency-Key": "example-capture-001",
    },
    method="POST",
)
try:
    with urlopen(request, timeout=90) as response:
        result = json.load(response)
        field = "poll_url" if response.status == 202 else "cdn_url"
        print(result["data"][field])
except HTTPError as error:
    print(json.load(error)["error"])` },
];

const completedResponse = {
  ok: true, request_id: "req_example", data: {
    url: "https://example.com", final_url: "https://example.com/", format: "png", width: 1280, height: 720,
    bytes: 35482, duration_ms: 9949, cached: false, blocked_requests: 0,
    cdn_url: "https://your-artifact-host.example/captures/example.png",
  },
};

export const DOC_PAGES: DocPage[] = [
  {
    slug: "", title: "Introduction", group: "Get started", icon: "book",
    description: "Capture websites as images and PDFs. Integrate through the REST API, explore rendering options, or connect your AI agent with MCP.",
    sections: [
      { id: "what-is-snapforge", title: "What is Snapforge?", paragraphs: ["Snapforge renders websites in a real Chromium browser and turns them into PNG, JPEG, WebP, or PDF output. Capture a viewport, an entire page, or one element, with controls for devices, timing, filtering, and localization.", "Use the REST API in your application, explore options in the playground, or give an AI agent visual access through the local MCP server. Captures run in isolated browser contexts so one request does not inherit another request’s cookies or storage."], note: { title: "Only successful captures consume credits", text: "A capture reserves credit while it runs. Successful completion commits the charge; terminal failures release the reservation. Safe HTTP retries can reuse one capture with an Idempotency-Key." } },
      { id: "start-building", title: "Start building", cards: [
        { title: "Your first screenshot", description: "Create a key, make a request, and download the result.", href: "/docs/quickstart", icon: "bolt" },
        { title: "API reference", description: "Endpoints, response shapes, and every capture parameter.", href: "/docs/api/screenshot", icon: "book" },
        { title: "Capture guides", description: "Get the right framing, timing, and page content.", href: "/docs/guides/full-page", icon: "device" },
        { title: "MCP for AI agents", description: "Screenshots, readable Markdown, and element captures.", href: "/docs/mcp", icon: "sparkles" },
      ] },
      { id: "capture-workflow", title: "One request. A complete capture.", paragraphs: ["Send a URL and your rendering options. The API returns either a completed result (HTTP 200) or an accepted job (HTTP 202). Poll the job or receive a signed webhook when rendering finishes. Download the artifact from cdn_url."], code: CAPTURE_CODE },
      { id: "choose-your-workflow", title: "Choose your workflow", table: { headers: ["Workflow", "Use it when", "Start here"], rows: [
        ["REST API", "Your app or backend needs downloadable captures.", "[Capture endpoint](/docs/api/screenshot)"],
        ["Playground", "You want to preview options and generate request snippets.", "[Open playground](/playground)"],
        ["MCP server", "An agent needs an image, page text, or an element bounding box.", "[MCP setup](/docs/mcp)"],
      ] } },
      { id: "expectations", title: "What to expect", paragraphs: ["Capture time depends on the target page, selected options, browser startup, and queue load. The sync fast path waits up to two seconds by default, then returns a job handle; this is an acceptance budget, not a promise that every page renders in two seconds.", "Some websites reject automated browsers. Stealth and page filters improve compatibility but do not guarantee access through anti-bot or authentication walls. Use pages you are permitted to access, and handle the stable error codes in your integration."] },
    ],
  },
  {
    slug: "quickstart", title: "Your first screenshot", group: "Get started", icon: "bolt",
    description: "Go from an API key to a downloadable capture with one request.",
    sections: [
      { id: "create-key", title: "1. Create an API key", paragraphs: ["Open [API keys](/api-keys) in your console. Create a key with screenshot:write and jobs:read permissions. Copy the secret immediately: it is shown once. Keep it in your backend environment, never in browser code or a public repository."] },
      { id: "configure-environment", title: "2. Set your connection details", paragraphs: ["Use the base URL of your deployed Snapforge gateway. The URL below is a placeholder; replace it with the API address provided for your environment. The console’s /api/capture route uses session authentication and is not the public REST API."], code: [{ label: "Terminal", language: "bash", code: `export SNAPFORGE_API_URL="https://your-snapforge-api.example"
export SNAPFORGE_API_KEY="sf_live_replace_with_your_key"` }], note: { title: "Trying it locally?", text: "The API gateway defaults to port 8787 and requires Redis TCP, a running worker, storage, and database configuration. The console also supports explicit local capture mode. See [Local development](/docs/local-development)." } },
      { id: "make-request", title: "3. Capture a page", paragraphs: ["This request captures the full page as a PNG. Use a unique Idempotency-Key for each intended capture, and reuse the same key only when retrying that exact request."], code: CAPTURE_CODE },
      { id: "read-response", title: "4. Read the response", paragraphs: ["A completed request returns HTTP 200 with capture metadata and an artifact URL. data.url is the original target URL; download the image from data.cdn_url. The example below illustrates the response shape; measurements and URLs vary per request."], code: json(completedResponse) },
      { id: "handle-accepted", title: "5. Handle accepted jobs", paragraphs: ["HTTP 202 means your capture was accepted and is still running. Follow data.poll_url using the same API base URL and a key with jobs:read. Poll until data.state is completed or failed. On completion, the artifact is in data.result.data.cdn_url; on failure, inspect data.result.error."], code: json({ ok: true, request_id: "req_example", data: { job_id: "job_example", state: "waiting", poll_url: "/v1/jobs/job_example" } }), note: { title: "Always handle both 200 and 202", text: "A sync request can still return a job handle. See [Async captures](/docs/api/jobs) for the full job response and polling example." } },
    ],
  },
  {
    slug: "authentication", title: "Authentication", group: "Get started", icon: "key",
    description: "Create scoped API keys and keep capture access on your server.",
    sections: [
      { id: "bearer-key", title: "Bearer authentication", paragraphs: ["Send your key in the Authorization header for protected /v1 endpoints. The current gateway accepts keys beginning with sf_live_. Missing, invalid, or revoked keys return unauthorized (401). The health endpoint is public."], code: command(`curl "$SNAPFORGE_API_URL/v1/jobs/job_example" \\
  -H "Authorization: Bearer $SNAPFORGE_API_KEY"`) },
      { id: "permissions", title: "Permissions by endpoint", table: { headers: ["Action", "Required scope"], rows: [["POST /v1/screenshot", "screenshot:write"], ["GET /v1/jobs/{id}", "jobs:read"], ["GET /v1/requests/{key}", "jobs:read"], ["GET /v1/jobs/{id}/webhook", "jobs:read"], ["POST /v1/jobs/{id}/webhook/redeliver", "screenshot:write"], ["GET /v1/health", "No API key"]] }, paragraphs: ["Keys can also contain screenshot:read and webhooks:write scopes, but those scopes do not replace the permissions above. Job and delivery lookup are checked against the owning account and API key."] },
      { id: "key-lifecycle", title: "Key lifecycle", bullets: ["Give each integration a descriptive label and only the permissions it needs.", "Store the secret in your backend environment or secrets manager.", "Rotate a key by creating a replacement, updating your integration, and revoking the old key.", "The gateway caches authentication briefly (five seconds by default), so revocation may not be visible immediately.", "Free accounts support up to three active API keys."] },
      { id: "account-limits", title: "One account, shared capacity", paragraphs: ["Multiple keys do not multiply your account’s capture quota or pending-job capacity. See [Usage and limits](/docs/billing) for credit and rate-limit behavior."] },
    ],
  },
  {
    slug: "api/screenshot", title: "Create a capture", group: "API reference", icon: "device", method: "POST", endpoint: "/v1/screenshot",
    description: "Render a public web page and receive an artifact or a job handle.",
    sections: [
      { id: "request", title: "Request", paragraphs: ["Send application/json with a required url and optional capture parameters. The screenshot:write scope is required. Request bodies are bounded to 256 KiB. Set ?mode=async or sync: false to skip waiting for the sync fast path."], code: CAPTURE_CODE },
      { id: "headers", title: "Request headers", table: { headers: ["Header", "Purpose"], rows: [["Authorization", "Required. Bearer API key with screenshot:write."], ["Content-Type", "application/json"], ["Idempotency-Key", "Recommended. 1–128 letters, digits, periods, underscores, or hyphens."], ["X-Request-Id", "Optional tracing identifier: 1–100 word characters, periods, or hyphens."]] } },
      { id: "body", title: "Capture parameters", paragraphs: ["[Capture options](/docs/api/options) documents every field, its default, and its limits. For a callback, also include webhook: { url, secret }; see [Webhooks](/docs/api/webhooks)."], code: json({ ...CAPTURE_EXAMPLE, device: "desktop_hd", block_cookie_banners: true, timeout: 30000 }) },
      { id: "success", title: "200 · Capture completed", paragraphs: ["The response is JSON, not raw image bytes. Download from data.cdn_url. data.url and data.final_url identify the target before and after navigation. Image dimensions are output pixels; PDF metadata reports the configured CSS-pixel viewport dimensions. cached indicates capture reuse, and blocked_requests counts filtered requests."], code: json(completedResponse) },
      { id: "accepted", title: "202 · Capture accepted", paragraphs: ["Rendering continues independently of the HTTP connection. Poll the job URL; an accepted response is not evidence that the artifact is ready."], code: json({ ok: true, request_id: "req_example", data: { job_id: "job_example", state: "waiting", poll_url: "/v1/jobs/job_example" } }) },
      { id: "failures", title: "Error responses", paragraphs: ["Errors contain ok: false, request_id, and error with a stable code and retriable flag. Validation errors return 400, auth errors 401/403, limits 429, and render failures use their specific error status. Unexpected availability failures can return 503. See [Errors and recovery](/docs/errors)."], note: { title: "POST is the supported capture method", text: "The current gateway implements POST /v1/screenshot. A GET capture endpoint and signed capture URLs are not implemented; do not integrate against the playground’s signed-GET example." } },
    ],
  },
  {
    slug: "api/options", title: "Capture options", group: "API reference", icon: "sliders",
    description: "Every rendering parameter, with defaults drawn from the shared capture contract.",
    sections: [
      { id: "using-options", title: "Using capture options", paragraphs: ["Only url is required. Send options as JSON to [POST /v1/screenshot](/docs/api/screenshot). Defaults below come directly from the capture schema. Optional fields are omitted unless you supply them. Times use milliseconds except cache_ttl, which uses seconds."], note: { title: "Start small", text: "Choose a device or viewport, an output format, and a readiness condition. Add page modifications only when your target needs them." } },
      { id: "parameters", title: "Parameter reference", fields: true },
      { id: "webhook-option", title: "Webhook option", paragraphs: ["The REST request additionally accepts webhook.url (a public HTTPS URL on port 443, up to 2048 characters) and webhook.secret (16–256 characters). URL credentials and fragments are rejected. See [Webhooks](/docs/api/webhooks) for delivery and signature verification."] },
    ],
  },
  {
    slug: "api/jobs", title: "Async captures & jobs", group: "API reference", icon: "clock", method: "GET", endpoint: "/v1/jobs/{id}",
    description: "Submit without waiting, track rendering, and retrieve the final result.",
    sections: [
      { id: "submit", title: "Submit an async capture", paragraphs: ["Use ?mode=async or sync: false on the capture endpoint. Store the returned job_id before leaving the page or acknowledging your own workflow."], code: command(`curl -X POST "$SNAPFORGE_API_URL/v1/screenshot?mode=async" \\
  -H "Authorization: Bearer $SNAPFORGE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: async-example-001" \\
  -d '{"url":"https://example.com","full_page":true}'`) },
      { id: "states", title: "Job states", table: { headers: ["State", "Meaning"], rows: [["waiting / prioritized", "Accepted and waiting for a worker."], ["active", "A worker is rendering the capture."], ["delayed", "A retry is scheduled; the job is not terminal."], ["completed", "Rendering succeeded. Read result.data."], ["failed", "All capture attempts finished unsuccessfully. Read result.error."]] } },
      { id: "poll", title: "Poll the existing job", paragraphs: ["GET /v1/jobs/{id} requires jobs:read. HTTP 200 means the lookup succeeded; check data.state and data.result.ok to learn whether the capture itself succeeded. Avoid tight polling loops. Back off on transient failures and honor Retry-After on 429."], code: [{ label: "Node.js", language: "javascript", code: `async function waitForCapture(jobId, signal) {
  while (true) {
    signal.throwIfAborted();
    const response = await fetch(
      process.env.SNAPFORGE_API_URL + "/v1/jobs/" + encodeURIComponent(jobId),
      { headers: { Authorization: "Bearer " + process.env.SNAPFORGE_API_KEY }, signal },
    );
    if (response.status === 429 || response.status === 503) {
      const seconds = Number(response.headers.get("Retry-After")) || 3;
      await new Promise(resolve => setTimeout(resolve, Math.min(30, Math.max(1, seconds)) * 1000));
      continue;
    }
    const payload = await response.json();
    if (!response.ok || !payload.ok) throw new Error(payload.error?.message);
    if (["completed", "failed"].includes(payload.data.state)) {
      return payload.data.result;
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}
const result = await waitForCapture("job_example", AbortSignal.timeout(120000));
if (!result.ok) throw new Error(result.error.message);
console.log(result.data.cdn_url);` }] },
      { id: "completed-job", title: "Completed job response", code: json({ ok: true, request_id: "poll_example", data: { id: "job_example", state: "completed", mode: "async", request_id: "req_example", progress: null, attempts_made: 1, attempt_budget: 3, enqueued_at: 1791158400000, webhook: null, result: { request_id: "req_example", mode: "async", ok: true, data: completedResponse.data, duration_ms: 9949, attempts_made: 1, enqueued_at: 1791158400000, completed_at: 1791158409949 } } }) },
      { id: "retention", title: "Keep your result", paragraphs: ["Job results and failed-job records are retained for 24 hours by default; deployments can configure that retention. Persist the capture you need in your own storage. Job retention, cache age, and artifact link expiry are separate concerns."] },
    ],
  },
  {
    slug: "api/retries", title: "Idempotency & retries", group: "API reference", icon: "refresh", method: "GET", endpoint: "/v1/requests/{key}",
    description: "Recover lost responses and retry safely without creating a second capture.",
    sections: [
      { id: "use-a-key", title: "Choose one key per capture", paragraphs: ["Send Idempotency-Key with the first POST. Keys accept 1–128 letters, numbers, periods, underscores, and hyphens. Generate a new key for a new intended capture; reuse the original key only for HTTP retries of the same capture.", "Matching requests reuse the original job and credit reservation. Changing capture options, execution mode, webhook details, or key ownership produces idempotency_conflict (409). A completed retry returns the original result while it remains retained."], code: command(captureCurl) },
      { id: "lost-response", title: "Recover a lost response", paragraphs: ["If a POST times out or its response is lost, look up the request by its saved key. This requires jobs:read and returns a job snapshot with the same shape as GET /v1/jobs/{id}. Do not generate a new key to resolve an uncertain submission."], code: command(`curl "$SNAPFORGE_API_URL/v1/requests/example-capture-001" \\
  -H "Authorization: Bearer $SNAPFORGE_API_KEY"`) },
      { id: "recovery-handle", title: "Use recovery handles", paragraphs: ["An egress_unavailable response can include error.details.job_id when the submission outcome is being recovered. Save that handle and poll its status. Do not assume every HTTP failure means nothing was accepted."], note: { title: "Separate retrying HTTP from rendering again", text: "The same idempotency key reuses the original capture, including its terminal failure. To intentionally render again after a failed capture, use a new key after checking the original job." } },
      { id: "backoff", title: "Retry with backoff", bullets: ["Honor Retry-After for rate limits.", "Use bounded exponential backoff with jitter for transient network and service errors.", "Do not retry invalid requests, permission failures, or idempotency conflicts unchanged.", "Check error.retriable and any job handle before deciding what to repeat."] },
    ],
  },
  {
    slug: "api/webhooks", title: "Webhooks", group: "API reference", icon: "bolt",
    description: "Receive signed capture results without polling or holding a connection open.",
    sections: [
      { id: "when-to-use", title: "When to use a webhook", paragraphs: ["Use a callback when captures run asynchronously, take longer than the HTTP acceptance window, or feed a backend workflow. Your endpoint can store the result, attach the artifact to a report, or notify your user as soon as the capture reaches a terminal state. For an occasional capture where the response completes immediately, the response itself may be enough. Local inline capture mode does not run the durable webhook delivery service."], bullets: ["Submit asynchronously and let your application continue doing other work.", "Avoid frequent status polling for batches or long-running captures.", "Handle terminal failures through the same integration path as successes."] },
      { id: "subscribe", title: "Attach a completion callback", paragraphs: ["Add webhook to POST /v1/screenshot. Use a public HTTPS endpoint on port 443 and a secret of 16–256 characters. Keep the secret in server-side configuration. Prefer an Idempotency-Key so a lost HTTP response can be recovered without creating another capture; resend the same request and key if you retry acceptance."], code: command(`curl -X POST "$SNAPFORGE_API_URL/v1/screenshot?mode=async" \\
  -H "Authorization: Bearer $SNAPFORGE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: monthly-report-2026-10" \\
  -d '{"url":"https://example.com","full_page":true,"webhook":{"url":"https://your-app.example/webhooks/snapforge","secret":"replace-with-a-long-random-secret"}}'`) },
      { id: "events", title: "Events and delivery", paragraphs: ["The event is capture.completed when rendering succeeds and capture.failed when the capture reaches a terminal failure. Intermediate renderer retries do not send callbacks. The signed JSON body includes id and job_id, request_id, ok, data or error, timing and attempt metadata, plus delivery_id and delivery_generation.", "Delivery is at least once. Retry attempts for one generation keep the same delivery_id and generation but have a fresh signature timestamp and an increasing X-Snapforge-Delivery attempt number. Deduplicate by the pair (delivery_id, delivery_generation), persist that decision, and return a 2xx response only after your receiver has safely accepted the event. If your handler triggers work in another system, record an inbox/deduplication row and your own outbox entry in one database transaction, then process that outbox asynchronously.", "The delivery service retries network errors, HTTP 429, and HTTP 5xx up to five attempts by default, with exponential delay and jitter. Other non-2xx statuses fail without repeated attempts. Redirects are not followed; configure the final HTTPS URL. Callback failure does not change capture success, rerender the page, or charge again."], code: json({ event: "capture.completed", id: "job_example", job_id: "job_example", request_id: "req_example", mode: "async", ok: true, data: { url: "https://example.com", cdn_url: "https://artifacts.example/capture.png", format: "png", width: 2560, height: 1440, bytes: 48210, duration_ms: 1840 }, error: null, duration_ms: 1840, attempts_made: 1, enqueued_at: 1791158400000, completed_at: 1791158401840, delivery_id: "wh-job_example", delivery_generation: 0 }), table: { headers: ["Header", "Meaning"], rows: [["X-Snapforge-Signature", "t=<Unix timestamp>,v1=<HMAC-SHA256 hex digest>"], ["X-Snapforge-Job-Id", "Capture job ID"], ["X-Snapforge-Event", "capture.completed or capture.failed"], ["X-Snapforge-Delivery-Id", "Stable delivery identifier across automatic retries"], ["X-Snapforge-Generation", "Redelivery generation; changes after manual redelivery"], ["X-Snapforge-Delivery", "Attempt number within the generation"]] } },
      { id: "verify-signature", title: "Verify the signature", paragraphs: ["Verify the raw request body before parsing JSON. Compute HMAC-SHA256 over timestamp + '.' + rawBody, using your webhook secret. Compare digests in constant time and reject timestamps outside your chosen tolerance. This Node.js example uses five minutes."], code: [{ label: "Node.js", language: "javascript", code: `import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyWebhook(rawBody, signature, secret) {
  const match = /^t=(\\d+),v1=([a-f0-9]{64})$/.exec(signature ?? "");
  if (!match) return false;
  const age = Math.floor(Date.now() / 1000) - Number(match[1]);
  if (Math.abs(age) > 300) return false;
  const expected = createHmac("sha256", secret)
    .update(match[1] + "." + rawBody)
    .digest();
  const actual = Buffer.from(match[2], "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}` }] },
      { id: "receive-once", title: "Accept each delivery once", paragraphs: ["After verifying the signature, parse the JSON and persist the notification before acknowledging it. The delivery pair is the idempotency key: automatic retries share it, while an explicit manual redelivery uses a new generation. Back this insert with a unique database constraint. If handling the event triggers slow work or another service, atomically insert both an inbox row and your own outbox row, then return 204 and process the outbox asynchronously. A duplicate insert is already accepted and should also return 2xx."], code: [{ label: "Node.js handler", language: "javascript", code: `export async function POST(request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-snapforge-signature");
  const secret = process.env.SNAPFORGE_WEBHOOK_SECRET;
  if (!secret || !verifyWebhook(rawBody, signature, secret)) {
    return new Response("Invalid signature", { status: 401 });
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  if (!["capture.completed", "capture.failed"].includes(event.event)) {
    return new Response("Unsupported event", { status: 400 });
  }
  if (typeof event.delivery_id !== "string" || !Number.isInteger(event.delivery_generation) || event.delivery_generation < 0) {
    return new Response("Invalid delivery identity", { status: 400 });
  }

  const key = event.delivery_id + ":" + event.delivery_generation;
  // Implement this with a unique key and one transaction that stores the
  // event plus any app-owned outbox work.
  await persistInboxAndOutboxOnce(key, event);
  return new Response(null, { status: 204 });
}` }] },
      { id: "delivery-status", title: "Inspect and redeliver", paragraphs: ["GET /v1/jobs/{id}/webhook requires jobs:read and returns pending, delivered, or failed, with attempts and generation. Use it to investigate a callback that did not reach your service; the callback URL and secret are never returned. Its ETag represents the current generation. POST /v1/jobs/{id}/webhook/redeliver requires screenshot:write and an If-Match header containing that exact ETag, including quotes. Redelivery is available after a delivery reaches delivered or failed, returns 202, and does not render or bill again. A stale generation or an already-pending delivery returns 409; up to three manual redeliveries are allowed."], code: command(`curl -i "$SNAPFORGE_API_URL/v1/jobs/job_example/webhook" \\
  -H "Authorization: Bearer $SNAPFORGE_API_KEY"

# Use the ETag returned above, including its quotes.
curl -X POST "$SNAPFORGE_API_URL/v1/jobs/job_example/webhook/redeliver" \\
  -H "Authorization: Bearer $SNAPFORGE_API_KEY" \\
  -H 'If-Match: "0"'`) },
    ],
  },
  {
    slug: "api/health", title: "Service health", group: "API reference", icon: "shield", method: "GET", endpoint: "/v1/health",
    description: "Check whether the API’s capture dependencies are ready.",
    sections: [
      { id: "check-health", title: "Readiness check", paragraphs: ["This public endpoint returns 200 when Redis, the configured database, and at least one recently initialized worker are ready and the queue is unpaused. It returns 503 otherwise. No API key is required."], code: command(`curl "$SNAPFORGE_API_URL/v1/health"`) },
      { id: "diagnostics", title: "Response fields", table: { headers: ["Field", "Description"], rows: [["ok", "Overall readiness."], ["data.redis", "ready or unavailable."], ["data.database", "Configured database readiness, when available."], ["data.worker_ready", "A ready worker is available and the queue is unpaused."], ["data.ready_workers", "Number of recent ready worker heartbeats."], ["data.queue", "Queue counts and paused status."], ["data.settlement / data.webhooks", "Background settlement and callback counters when configured."]] } },
      { id: "unavailable", title: "When captures are unavailable", paragraphs: ["Check database connectivity and migrations, Redis TCP credentials, storage configuration, and running workers. A Redis REST URL alone cannot run the job queue. For the console’s explicit local mode, see [Local development](/docs/local-development)."] },
    ],
  },
  {
    slug: "guides/full-page", title: "Full-page & element captures", group: "Capture guides", icon: "device",
    description: "Choose a viewport, capture a full document, or isolate a component.",
    sections: [
      { id: "viewport", title: "Capture the visible viewport", paragraphs: ["The default capture is a 1280 × 720 CSS-pixel viewport with full_page: false. Choose a [device preset](/docs/guides/devices) or provide viewport dimensions to match your layout."] },
      { id: "full-page", title: "Capture a full page", paragraphs: ["Set full_page: true. The engine scrolls incrementally to trigger lazy content and avoids repeating fixed or sticky headers. Infinite-scroll pages are bounded by the renderer’s configured height limit; a full-page capture is not an unbounded archive."], code: json({ url: "https://example.com", full_page: true, device: "desktop_hd", wait_for_idle: true }) },
      { id: "element", title: "Capture one element", paragraphs: ["Use selector for a focused screenshot and wait_for_selector to wait for that element to appear. A missing or unusable selector fails the capture. Element image captures are useful for product cards, dashboards, and previews."], code: json({ url: "https://example.com", selector: "main", wait_for_selector: "main", format: "png" }) },
      { id: "validate", title: "Check the result", paragraphs: ["Inspect width, height, bytes, and final_url after completion. If a target hydrates late, use [Waiting and readiness](/docs/guides/waiting) and [Quality checks](/docs/guides/quality) rather than increasing delay blindly."] },
    ],
  },
  {
    slug: "guides/devices", title: "Devices & viewports", group: "Capture guides", icon: "device",
    description: "Match desktop, phone, and tablet layouts with predictable browser emulation.",
    sections: [
      { id: "presets", title: "Device presets", paragraphs: ["Supply the exact preset identifier in device. Presets configure viewport size, scale, touch/mobile behavior, and a device User-Agent where defined."], table: { headers: ["Identifier", "Viewport", "Scale", "Mobile"], rows: Object.entries(DEVICE_PRESETS).map(([id, preset]) => [id, `${preset.viewport.width} × ${preset.viewport.height}`, String(preset.viewport.deviceScaleFactor ?? 1), preset.viewport.isMobile ? "Yes" : "No"]) } },
      { id: "custom-viewport", title: "Custom dimensions", paragraphs: ["A custom viewport accepts width 320–3840, height 240–2160, deviceScaleFactor 1–3, isMobile, and hasTouch. The nested defaults are 1280, 720, 2, false, and false. Desktop presets also use 2× resolution; mobile presets retain their native scale. Prefer one approach per request to make emulation predictable."], code: json({ url: "https://example.com", viewport: { width: 1440, height: 900, deviceScaleFactor: 2, isMobile: false, hasTouch: false } }) },
      { id: "pixel-size", title: "CSS pixels and output pixels", paragraphs: ["A higher device scale produces a denser image. Do not assume the image dimensions equal the CSS viewport dimensions; use the returned metadata. Full-page and element captures can also change the output height or framing."] },
    ],
  },
  {
    slug: "guides/formats", title: "Images & PDFs", group: "Capture guides", icon: "download",
    description: "Choose an output format and download artifacts correctly.",
    sections: [
      { id: "formats", title: "Choose a format", table: { headers: ["Format", "Use it for", "Quality setting"], rows: [["webp", "Recommended default for compact, high-quality delivery.", "1–100; default 90"], ["png", "Lossless UI, text, and visual comparison.", "Not applied"], ["jpeg", "Photographic previews and broad compatibility.", "1–100; default 90"], ["pdf", "A viewport document or one continuous full-page capture.", "Not applied"]] } },
      { id: "pdf", title: "Create a PDF", paragraphs: ["Set format: pdf to use the PDF pipeline. With full_page: true, the default by_sections algorithm loads and captures overlapping visible viewports during one scroll pass. Lossless slices form one continuous PDF page with screen colors and zero margins. Desktop slices use 2× resolution by default. Section PDF text is image-based; viewport PDFs and the optional native algorithm retain selectable text. The playground shows a scrollable preview with a Save action.", "Tune full_page_scroll_delay for slow reveals, full_page_scroll_by for smaller steps, and reduce_motion to control animation handling. PDF dimensions are CSS pixels. Infinite pages are bounded at 24,000 CSS pixels by default; render_diagnostics.truncated indicates that limit. Scrolling that runs out of time or steps returns an error. Combining PDF with selector element targeting returns unsupported_option."], code: json({ url: "https://example.com", format: "pdf", full_page: true, full_page_algorithm: "by_sections", full_page_scroll_delay: 400, reduce_motion: true, timeout: 60000, block_cookie_banners: true }) },
      { id: "download", title: "Download the artifact", paragraphs: ["For a completed REST response use data.cdn_url. For a completed polled job use data.result.data.cdn_url. The target URL fields are not download URLs. Signed links expire according to storage configuration, so download and persist long-lived assets yourself."], code: command(`curl -L "$CAPTURE_ARTIFACT_URL" -o capture.png`) },
      { id: "inline", title: "Local and MCP output", paragraphs: ["Explicit console local mode returns an inline data URL for its preview. MCP returns an image content block for PNG, JPEG, or WebP; it does not expose PDF as an MCP image. These interfaces have different response shapes from the hosted REST API."] },
    ],
  },
  {
    slug: "guides/waiting", title: "Waiting & readiness", group: "Capture guides", icon: "clock",
    description: "Capture the content you need after navigation, fonts, and page hydration settle.",
    sections: [
      { id: "default-settlement", title: "Default settlement", paragraphs: ["Navigation defaults to load, and wait_for_idle defaults to true. After navigation, the engine checks font readiness and waits for a bounded network-quiet window so sites with continuous requests do not hang forever. timeout defaults to 30000 ms and accepts up to 60000 ms."] },
      { id: "selector", title: "Wait for a useful selector", paragraphs: ["Choose a selector that appears only when your important content is ready. Waiting for body usually tells you very little about an app’s hydration state."], code: json({ url: "https://your-site.example/report", wait_for_selector: "[data-report-ready]", wait_for_content: true, timeout: 45000 }) },
      { id: "navigation-events", title: "Navigation events", table: { headers: ["wait_until", "Behavior"], rows: [["domcontentloaded", "Wait for the initial DOM; additional content checks can still follow."], ["load", "Wait for the load event."], ["networkidle", "Wait for Playwright's navigation network-idle condition, followed by bounded settlement."]] } },
      { id: "delay", title: "Use delay deliberately", paragraphs: ["delay adds 0–30000 ms after readiness. Use it for a known animation or timer, and combine it with a selector or content guard when possible. Extra delay adds latency and does not guarantee that an authentication or bot wall disappears."] },
    ],
  },
  {
    slug: "guides/quality", title: "Quality checks", group: "Capture guides", icon: "shield",
    description: "Reject loading shells and missing content before a capture becomes a successful result.",
    sections: [
      { id: "loading-shells", title: "Incomplete content", paragraphs: ["The shared REST capture schema defaults fail_if_incomplete to false. Set it to true to reject obvious loading shells; the console sends it enabled by default. Keep the guard enabled for production captures, and turn it off only when you intentionally want to capture a loading state."] },
      { id: "text-checks", title: "Required and forbidden text", paragraphs: ["fail_if_content_missing requires the listed text, and fail_if_content_contains rejects the listed text. Matching is case-insensitive. Each array accepts up to 32 strings, with 1–500 characters per trimmed string."], code: json({ url: "https://your-site.example/report", wait_for_selector: "main", fail_if_content_missing: ["Monthly report"], fail_if_content_contains: ["Something went wrong", "Please sign in"] }) },
      { id: "size-checks", title: "Output thresholds", paragraphs: ["min_capture_height and min_capture_bytes accept positive integers. They catch unexpectedly small or empty output, but a byte threshold alone cannot prove visual correctness."], code: json({ url: "https://example.com", full_page: true, min_capture_height: 600, min_capture_bytes: 10000 }) },
      { id: "failure", title: "Handle a failed quality check", paragraphs: ["Persistent quality failures return render_incomplete (502). They do not produce successful billing or cache storage. Check readiness conditions, selectors, and the target’s actual content before starting a new capture."] },
    ],
  },
  {
    slug: "guides/customization", title: "Page customization", group: "Capture guides", icon: "sliders",
    description: "Filter banners and trackers, adjust appearance, and control the DOM before capture.",
    sections: [
      { id: "filters", title: "Content filters", paragraphs: ["block_ads, block_trackers, block_cookie_banners, and block_chats default to true. Request filtering prevents known ad, analytics, and chat requests; consent-interface removal uses known CMP selectors and shadow-DOM scanning. These are best-effort filters rather than a promise that every target has no banners."] },
      { id: "hide-remove", title: "Hide or remove elements", paragraphs: ["hide_selectors preserves layout space by hiding matches. remove_selectors deletes nodes and can reflow the page. Use the first for stable comparison; use the second when surrounding content should close the gap."], code: json({ url: "https://example.com", hide_selectors: [".chat-widget"], remove_selectors: [".promotion-banner"], custom_css: "* { animation: none !important; transition: none !important; }" }) },
      { id: "appearance", title: "Appearance and locale", paragraphs: ["Set dark_mode: true or an explicit color_scheme. You can also supply locale, timezone, and user_agent. Region-based emulation is documented separately in [Regions and proxies](/docs/guides/regions)."] },
      { id: "javascript", title: "Custom JavaScript and headers", paragraphs: ["custom_js executes in the target page before settlement. Use it to prepare a known target state. headers supplies additional HTTP headers. Keep any target credentials on your server and avoid logging request bodies that contain them."], code: json({ url: "https://your-site.example", custom_js: "document.documentElement.dataset.capture = 'true';", headers: { "X-Capture-Preview": "true" } }) },
    ],
  },
  {
    slug: "guides/caching", title: "Caching & storage", group: "Capture guides", icon: "refresh",
    description: "Reuse acceptable captures and distinguish cache age from artifact lifetime.",
    sections: [
      { id: "cache-age", title: "Control capture reuse", paragraphs: ["cache_ttl defaults to 3600 seconds. A positive value allows reuse of compatible capture results within that age. Set zero to request a fresh render. A shorter TTL cannot extend an existing capture’s original validity window."], code: json({ url: "https://example.com", format: "webp", cache_ttl: 300 }) },
      { id: "cache-metadata", title: "Read cache metadata", paragraphs: ["Completed capture data includes cached. Cache compatibility is derived from the target and capture options; changing rendering options can require a different capture. A cached successful capture still goes through account admission and capture accounting; do not assume cache hits are free."] },
      { id: "separate-lifetimes", title: "Three different lifetimes", table: { headers: ["Lifetime", "Controls"], rows: [["cache_ttl", "How old an existing capture may be when reused."], ["Job retention", "How long a result can be looked up; default 24 hours."], ["Artifact delivery link", "How long a signed URL can be used; determined by storage configuration."]] }, note: { title: "Persist important output", text: "Download an artifact while the link is valid. cache_ttl does not configure object deletion or guarantee that a delivery URL remains valid." } },
    ],
  },
  {
    slug: "guides/regions", title: "Regions & proxies", group: "Capture guides", icon: "device",
    description: "Use consistent locale emulation with a proxy in the region you need.",
    sections: [
      { id: "region-targeting", title: "A region needs the right egress", paragraphs: ["region chooses a locale, timezone, and expected country. It does not move the renderer’s network connection by itself. Supply a proxy in that country when your renderer’s own egress differs. Snapforge accepts your proxy configuration; a managed proxy subscription is not bundled here."], code: json({ url: "https://example.com", region: "us", proxy: { server: "http://proxy.your-provider.example:8000", username: "your-proxy-user", password: "your-proxy-password" }, verify_egress: true }) },
      { id: "supported-regions", title: "Supported regions", table: { headers: ["Region", "Country", "Locale", "Timezone"], rows: Object.entries(REGION_PRESETS).map(([id, region]) => [id, region.name, region.locale, region.timezone]) } },
      { id: "verification", title: "Egress verification", paragraphs: ["verify_egress defaults to true. A mismatch can return egress_mismatch; an unreachable egress check can return egress_unavailable. Choose a matching proxy or remove the region requirement. A proxy can also be supplied without a region."] },
      { id: "network-policy", title: "Public-network destinations", paragraphs: ["Hosted workers restrict target, redirect, resource, WebSocket, and proxy destinations to public networks. Loopback URLs, private services, and metadata endpoints are not valid hosted capture targets. A proxy does not bypass this policy or guarantee access to a target’s bot protections."] },
    ],
  },
  {
    slug: "errors", title: "Errors & recovery", group: "Resources", icon: "shield",
    description: "Branch on stable error codes and recover without losing track of accepted work.",
    sections: [
      { id: "envelope", title: "Error envelope", paragraphs: ["Treat error.code as the machine-readable identifier. Messages explain the failure but can change. Preserve request_id for troubleshooting. Read error.retriable and any details.job_id before choosing whether to retry a POST or poll existing work."], code: json({ ok: false, request_id: "req_example", error: { code: "render_timeout", message: "Capture timed out", retriable: true, request_id: "req_example" } }) },
      ...ERROR_CODES.map((code) => ({ id: code, title: code, paragraphs: [`HTTP ${ERROR_HTTP_STATUS[code]} · Retriable by default: ${ERROR_RETRIABILITY[code] ? "yes" : "no"}. ${errorHelp(code)}`] })),
      { id: "status-notes", title: "HTTP status and recovery", paragraphs: ["Unexpected availability failures may use 503 even when the envelope code is internal_error. Account concurrency failures can return 429 with Retry-After. A polled job lookup can return HTTP 200 while its nested result reports a failed capture. Inspect the envelope and job state, not only the HTTP status."] },
    ],
  },
  {
    slug: "billing", title: "Usage & limits", group: "Resources", icon: "card",
    description: "Understand reservations, successful capture charges, and shared account limits.",
    sections: [
      { id: "capture-accounting", title: "How credits work", paragraphs: ["A new capture reserves one unit while it runs. Successful completion consumes the reservation; terminal failure releases it. Included monthly quota is used first, followed by prepaid credits. Matching idempotent HTTP retries reuse the original capture. Webhook redelivery does not render or charge again."] },
      { id: "plans", title: "Configured monthly allowances", table: { headers: ["Plan", "Included captures"], rows: [["Free", "250 per month"], ["Pro", "10,000 per month"], ["Scale", "100,000 per month"]] }, paragraphs: ["Prepaid pack sizes are 10,000, 50,000, and 250,000 credits. The billing system stores these as a balance without an expiry field. Check the [Billing console](/billing) for configured products, current prices, and checkout availability; this reference does not promise live paid-plan availability."] },
      { id: "rate-limits", title: "Rate and concurrency limits", paragraphs: ["The current gateway defaults to 60 requests per minute for its configured request limiter. New capture admission also uses a shared account limit of 60 attempts per rolling minute and five pending/running jobs. Deployments can configure limits. Multiple keys do not increase the account admission allowance.", "A 429 response may include Retry-After in seconds. Wait before retrying. quota_exceeded means available credit is exhausted; rate_limited means request or concurrency capacity is temporarily exhausted."], note: { title: "Avoid hard-coding plan concurrency", text: "The configured concurrency limit is separate from the billing plan’s included credit allowance. Use actual response headers and deployment configuration." } },
      { id: "usage-console", title: "Inspect your usage", paragraphs: ["Use [Analytics](/analytics) for usage and [Capture history](/logs) for results. Reservation and terminal billing happen on the server; closing the playground does not cancel an accepted worker job."] },
    ],
  },
  {
    slug: "mcp", title: "MCP for AI agents", group: "Resources", icon: "sparkles",
    description: "Give an MCP client screenshots, readable page content, and precise element captures.",
    sections: [
      { id: "tools", title: "Available tools", table: { headers: ["Tool", "Returns"], rows: [["take_screenshot", "An MCP image block and compact capture metadata."], ["inspect_page", "An image, readable Markdown, and a bounded accessibility snapshot."], ["capture_element", "An element image and its CSS-pixel viewport bounding box."]] }, paragraphs: ["The current @snapforge/mcp server runs locally over stdio and uses the capture engine directly. It does not call the hosted REST gateway or use its API key. Supported MCP image formats are PNG, JPEG, and WebP."] },
      { id: "build", title: "Build from the repository", paragraphs: ["Run these commands from your Snapforge checkout. The package publication status is not assumed; this setup uses the repository’s built entry point."], code: [{ label: "Terminal", language: "bash", code: `pnpm install
pnpm --filter @snapforge/contracts run build
pnpm --filter @snapforge/engine run build
pnpm --filter @snapforge/mcp run build
pnpm --filter @snapforge/engine exec playwright install chromium` }] },
      { id: "connect", title: "Connect an MCP client", paragraphs: ["Add this configuration to a stdio-compatible MCP client. Replace the file path with the absolute path to your checkout and use an available Node executable."], code: json({ mcpServers: { snapforge: { command: "node", args: ["/absolute/path/to/snapforge/packages/mcp/dist/main.js"], env: { SNAPFORGE_MCP_CONCURRENCY: "2" } } } }) },
      { id: "tool-inputs", title: "Capture inputs", paragraphs: ["Common tool inputs include url, width, height, full_page, format, quality, timeout, delay, and dark_mode. capture_element additionally takes selector. The local MCP default allows two concurrent captures; SNAPFORGE_MCP_CONCURRENCY changes that limit. Errors return a stable code and a short suggested next step."], code: json({ url: "https://example.com", selector: "main", format: "png" }) },
      { id: "agent-docs", title: "Docs for agents", paragraphs: ["Use [llms.txt](/llms.txt) for the compact product index. Each documentation page also has a Markdown version linked above its title, so agents can read the same source content without parsing the interface."] },
    ],
  },
  {
    slug: "local-development", title: "Local development", group: "Resources", icon: "gear",
    description: "Choose local inline rendering or the complete worker-backed API stack.",
    sections: [
      { id: "console-mode", title: "Console with local capture", paragraphs: ["For an explicit development-only workflow, set SNAPFORGE_LOCAL_CAPTURE=1 in apps/app/.env.local, then start the console. This uses the local engine and returns inline image data. It still requires the configured database and its migrations for account credit accounting. A production runtime ignores this switch."], code: [{ label: "Terminal", language: "bash", code: `# apps/app/.env.local
SNAPFORGE_LOCAL_CAPTURE=1

# From the repository root
pnpm --filter @snapforge/app dev` }], note: { title: "Local captures are direct requests", text: "Keep the playground open while a local capture completes. Durable job polling, idempotent queue recovery, and webhook delivery belong to worker-backed mode." } },
      { id: "worker-stack", title: "Worker-backed API", paragraphs: ["Configure a PostgreSQL DATABASE_URL, a direct migration URL, Redis TCP, encrypted capture-intent settings, and worker object storage. REST-only Redis credentials cannot run BullMQ. Use the same queue name, prefix, database, and Redis instance across the API, dashboard, and worker."], bullets: ["DATABASE_URL for runtime queries and DATABASE_URL_DIRECT for reviewed migrations.", "REDIS_URL or UPSTASH_REDIS_URL for Redis TCP connectivity.", "CAPTURE_INTENT_ENCRYPTION_KEY for persisted encrypted submission data.", "STORAGE_BUCKET, STORAGE_ACCESS_KEY_ID, and STORAGE_SECRET_ACCESS_KEY for worker storage; configure endpoint/account/region as appropriate.", "Playwright Chromium installed for the renderer."], code: [{ label: "Terminal", language: "bash", code: `pnpm -r run build

# In separate terminals, with runtime environment loaded:
pnpm --filter @snapforge/worker run start
pnpm --filter @snapforge/api run start
pnpm --filter @snapforge/app dev` }] },
      { id: "addresses", title: "Local addresses", table: { headers: ["Service", "Default address"], rows: [["Console and playground", "http://localhost:3000"], ["Public API gateway", "http://localhost:8787"], ["Gateway readiness", "http://localhost:8787/v1/health"]] }, paragraphs: ["Set SNAPFORGE_API_URL to the gateway URL for local REST examples. Your capture target must still be a public website; the worker’s network policy rejects private and loopback targets."] },
      { id: "troubleshoot", title: "Troubleshoot service unavailable", bullets: ["Check whether your console is in explicit local mode or queue mode.", "Apply reviewed repository migrations to the intended database before starting capture services.", "Check Redis TCP connectivity and a running, initialized worker.", "Check storage delivery URLs and credentials.", "Call the health endpoint and inspect server logs with the request ID."] },
    ],
  },
];

export function getDoc(slug: string) { return DOC_PAGES.find((page) => page.slug === slug); }
export function docHref(slug: string) { return slug ? `/docs/${slug}` : "/docs"; }

export function docMarkdown(page: DocPage): string {
  const lines = [`# ${page.title}`, "", page.description, ""];
  if (page.endpoint) lines.push(`\`${page.method} ${page.endpoint}\``, "");
  for (const section of page.sections) {
    lines.push(`## ${section.title}`, "", ...(section.paragraphs ?? []).flatMap((text) => [text, ""]));
    if (section.note) lines.push(`> **${section.note.title}** ${section.note.text}`, "");
    if (section.bullets) lines.push(...section.bullets.map((text) => `- ${text}`), "");
    if (section.cards) lines.push(...section.cards.map((card) => `- [${card.title}](${card.href}): ${card.description}`), "");
    if (section.table) lines.push(`| ${section.table.headers.join(" | ")} |`, `| ${section.table.headers.map(() => "---").join(" | ")} |`, ...section.table.rows.map((row) => `| ${row.map((cell) => cell.replaceAll("|", "\\|")).join(" | ")} |`), "");
    if (section.fields) for (const field of DOC_FIELDS) lines.push(`### ${field.name}`, "", `Type: ${field.type}. Default: ${field.default}.`, "", field.description, "");
    for (const sample of section.code ?? []) lines.push(`### ${sample.label}`, "", `\`\`\`${sample.language}`, sample.code, "```", "");
  }
  return lines.join("\n");
}

function errorHelp(code: (typeof ERROR_CODES)[number]): string {
  const help: Record<(typeof ERROR_CODES)[number], string> = {
  invalid_request: "Validate the URL, body, selector, and numeric limits. Missing or expired job handles can also produce this code.",
  idempotency_conflict: "Reuse the original request unchanged, or use a new key for a new intended capture. For callback redelivery, fetch the latest ETag.",
  unauthorized: "Check that the Bearer API key is present, valid, and active.",
  forbidden: "Check the required scope and ownership of the requested job.",
  quota_exceeded: "Check monthly allowance and prepaid credits; unchanged retries do not create more credit.",
  rate_limited: "Honor Retry-After and reduce request rate or concurrent jobs.",
  render_timeout: "Use an appropriate readiness selector, reduce unnecessary waits, or raise timeout within the supported range.",
  render_incomplete: "Required content or output thresholds were not met. Check target content and readiness conditions.",
  navigation_failed: "Check whether the target resolves and loads from the renderer’s network.",
  blocked_by_target: "The target rejected automated access. Use an allowed target or access method; repeated requests do not guarantee access.",
  target_error: "The target returned an error response. Inspect it and retry only after the underlying issue is resolved.",
  render_crashed: "Try again with reduced dimensions or full-page height. Preserve request_id if the crash repeats.",
  internal_error: "Check service readiness. Retry with the same key after a transient failure, and preserve any existing job handle.",
  unsupported_option: "Remove the unsupported combination or choose a supported output format.",
  egress_unavailable: "Egress or submission recovery is unavailable. Poll details.job_id when present before submitting more work.",
  egress_mismatch: "Use a proxy in the requested country or remove the region requirement.",
  };
  return help[code];
}
