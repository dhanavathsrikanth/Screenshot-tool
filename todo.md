# Snapforge: Next-Gen Screenshot API Platform

> Workspace UI redesigned 2026-10-05: Xem-inspired inset layout, Geist typography, persistent sidebar rail, accessible mobile navigation and search, consistent page controls, and working browser capture preferences. Hostinger tokens remain the branding source of truth. Production build and all 42 dashboard capture regressions pass. [Design decisions and previews](docs/workspace-ui-redesign.md). This does not close the latency or deployment gates.

> Remaining market-gap execution plan: [todo1.md](todo1.md). It breaks the follow-up into customer outcomes, implementation tickets, performance safeguards, and evidence-based release gates.

> Implemented 2026-10-03: the first P0 dashboard hotfix adds public-network enforcement, shared account admission, cleanup checks, and usable PDF download data. [Verification and deployment requirements](docs/dashboard-boundary-fix.md). The worker migration follows below; automatic settlement remains open.

> Follow-up implemented 2026-10-03: API and dashboard now call a shared capture service, use account-wide admission, link reservations before enqueueing, and deliver worker artifact URLs. The playground restores accepted jobs after reload. [Verification and remaining lifecycle work](docs/shared-capture-service.md). Automatic settlement without polling and production deployment remain open.

## Master Product & Engineering Roadmap (Clean Slate)

> Next gap implemented 2026-10-03: one terminal finalizer commits billing, retained results, history, and pending slot cleanup together. A background API consumer handles completion events and bounded restart/outage recovery without customer polling. [Verification and rollout requirements](docs/automatic-capture-settlement.md). Nine PostgreSQL scenarios pass on an isolated branch; Redis TCP verification, main-branch migration/deployment, durable enqueue recovery, and webhook outbox remain open. This supersedes the settlement limitation in the earlier implementation notes above.

> Next gap implemented 2026-10-04: durable enqueue recovery now commits a credit reservation, account/job link, and encrypted submission intent together. Restart recovery checks the same job ID and serializes with finalization; expired account leases regain capacity before missing work is queued. [Verification and rollout requirements](docs/durable-enqueue-recovery.md). Six new PostgreSQL scenarios and live Redis admission Lua checks pass. Main-branch migration/deployment, real BullMQ outage verification, request idempotency, and webhook delivery remain open; this supersedes the enqueue limitation above.

> Reliability follow-up verified 2026-10-05: account-scoped request idempotency and independent encrypted webhook delivery are implemented. Matching HTTP retries reuse the original job; conflicting requests return 409. Callback delivery no longer occupies rendering workers, and manual redelivery does not render or charge again. All 19 PostgreSQL scenarios, API/dashboard regressions, and the dashboard production build pass. [Implementation and rollout requirements](docs/request-retries-and-webhook-delivery.md). Three unchanged full live runs pass 27/27 eligible sites each, with three access blocks and p50 8.383–9.618s. Seven controlled pixel fixtures pass. The additional 80% latency target, main migration/deployment, real BullMQ outage verification, and managed proxy access remain open. [Measurements](apps/benchmark/results/reliability-release.md). This supersedes the outstanding idempotency/webhook notes above and the earlier latest-gate status below.

> **North Star**: Build the most reliable, stealthy, and developer-friendly screenshot API on the market, purpose-built for both modern engineering teams and autonomous AI agents (MCP-native).
>
> **Core Moats vs. Incumbents (ScreenshotOne, Urlbox, ApiFlash)**:
> 1. **Zero-Quota-Deduction on Failure**: If a render fails, times out, or crashes on our end, the user is **never** billed.
> 2. **Stealth & Anti-Bot Native**: Out-of-the-box evasion against Cloudflare, DataDome, and modern bot hurdles.
> 3. **Perfect Full-Page Fidelity**: Automated lazy-load triggering, sticky element suppression, and complete cookie banner annihilation.
> 4. **Native AI Agent Engine (MCP)**: First-class Model Context Protocol integration so AI agents can inspect web pages natively with structured, token-efficient envelopes.
> 5. **Developer-First Pricing via Dodo Payments**: Non-expiring credit packs + recurring developer tiers with seamless global checkout.

---

## 🛠️ System Architecture

```
                       ┌────────────────────────────────────────┐
                       │          Clients & Consumers           │
                       │   Developers • AI Agents (MCP) • Web   │
                       └───────────────────┬────────────────────┘
                                           │
                    ┌──────────────────────┴──────────────────────┐
                    ▼                                             ▼
          [ apps/app & apps/web ]                          [ apps/api ]
       Dashboard, Live Playground &                      Edge REST API
             Marketing Pages                             (Hono Gateway)
                    │                                             │
                    │                                      (Auth & Quota)
                    │                                             │
                    │                                             ▼
                    │                                    [ BullMQ + Redis ]
                    │                                   Distributed Queue
                    │                                             │
                    └──────────────────────┬──────────────────────┘
                                           ▼
                                    [ apps/worker ]
                              Browser Renderer Fleet
                                (packages/engine)
                            Playwright + Stealth Context
                                           │
                         ┌─────────────────┴─────────────────┐
                         ▼                                   ▼
                [ Cloudflare R2 ]                  [ Postgres + Dodo ]
             Object Storage & CDN                Credits, Keys & Billing
```

---

## 📋 The 8 Actionable Build Chunks

### 🧱 Chunk 1: Foundation & Strict Type Contracts (`packages/contracts`)
*Establish the unified type system and schema that governs the API, engine, workers, SDKs, and MCP server.*

- [x] **1.1 Workspace Setup**: Monorepo scaffolding with modern workspace tooling (`pnpm` + TypeScript monorepo).
- [x] **1.2 Capture Options Schema (Zod)**:
  - Input URLs (validation, protocol normalization).
  - Viewport & device presets (Desktop, iPhone, Pixel, iPad).
  - Output formats (`png`, `jpeg`, `webp`, `pdf`) and quality settings (1-100).
  - Timing & Settlement (`timeout`, `delay`, `wait_for_selector`, `wait_for_idle`).
  - Page modifiers (`full_page`, `dark_mode`, `block_ads`, `block_cookie_banners`, `hide_selectors`, `custom_css`, `custom_js`).
- [x] **1.3 Error Taxonomy & Output Envelopes**:
  - Stable machine-readable error codes: `invalid_request`, `unauthorized`, `quota_exceeded`, `render_timeout`, `navigation_failed`, `blocked_by_target`, `render_crashed`.
  - Standardized response envelope: `{ ok: boolean, data?: { url, bytes, format, width, height, duration_ms }, error?: { code, message, retriable, request_id } }`.

---

### 🚀 Chunk 2: Core Headless Capture Engine (`packages/engine`)
*The pure, dependency-isolated rendering engine. No HTTP, no database—just input options in, high-fidelity image out.*

- [x] **2.1 Playwright Lifecycle & Context Pooling**:
  - Context isolation per capture to guarantee zero state leakage (cookies, local storage).
  - Memory leak prevention: context recycling and automated zombie process termination.
- [x] **2.2 Stealth & Anti-Bot Evasion Layer**:
  - Integrated `playwright-extra` + stealth plugin.
  - Fingerprint masking: custom User-Agent, platform spoofing, WebGL vendor masking, hardware concurrency, and canvas noise.
- [x] **2.3 Smart Settlement Engine**:
  - Hybrid wait strategy: network idle fallback with safety timeouts (avoids hanging on infinite websockets/polling).
  - Web font readiness verification (`document.fonts.ready`).
- [x] **2.4 Full-Page Stitching & Lazy-Load Trigger**:
  - Viewport-incremental scroll algorithm that trips all `IntersectionObserver` triggers.
  - Sticky / fixed header de-duplication (prevents repeated headers from tiling across full-page captures).
  - Infinite-scroll bounding logic.
- [x] **2.5 Cookie Banner & Interstitial Annihilation**:
  - Curated selector-based and CSS-injection removal of top CMP banners (OneTrust, Cookiebot, Quantcast, Klaro).
  - Cosmetic ad & tracking request filtering.
- [x] **2.6 Output Format Pipeline**:
  - Direct buffer generation for PNG, JPEG, WebP, and multi-page PDF generation.
  - Failure artifacts: automatic DOM dump + error trace captured on crash.

---

### ⚡ Chunk 3: Queue, Worker Fleet & Storage (`apps/worker`, `packages/storage`)
*Industrial-grade task distribution capable of handling sudden concurrency spikes without server crashes.*

- [x] **3.1 Distributed Job Queue**:
  - BullMQ + Redis integration for job scheduling, retries, and worker orchestration.
  - Dual-mode execution: **Sync Fast-Path** (<2s low latency) vs **Async Queue** (with webhook callback on completion).
- [x] **3.2 Concurrency & Worker Health Control**:
  - CPU-aware worker thread scaling.
  - Job isolation: crashing renderers restart immediately without impacting adjacent jobs.
- [x] **3.3 Storage Tier (Cloudflare R2)**:
  - S3-compatible client for storing captured screenshots with pre-signed CDN delivery URLs.
  - Smart cache layer: `sha256(canonical(options) + target_url)` with configurable cache TTL (prevents duplicate rendering costs).
  - Cold-cache rehydration: full response envelope mirrored as S3 user-defined `Metadata`, so a metadata-cache eviction no longer forces a re-render — a single `HEAD` + `GET` recovers the same envelope from the bucket.

---

### 🛡️ Chunk 4: Public API Gateway & Metering (`apps/api`)
*Edge-ready REST API built with Hono to handle high-throughput public traffic.*

- [x] **4.1 API Gateway Routes**:
  - `POST /v1/screenshot` (sync / async toggle).
  - `GET /v1/jobs/:id` (polling status).
  - `GET /v1/health` (worker readiness & queue depth).
- [x] **4.2 Auth & API Key Verification**:
  - Fast Bearer API key validation with Redis caching.
- [x] **4.3 Fair-Quota Metering (Competitive Advantage)**:
  - Atomic credit reservation and release.
  - **The Golden Rule**: Credit is permanently consumed **only** upon successful 200 delivery. Errors, timeouts, and bot rejections auto-refund immediately.
- [x] **4.4 Rate Limiting & Concurrency Throttling**:
  - Per-key burst limits with proper `Retry-After` headers and 429 envelopes.

---

### 💳 Chunk 5: Dodo Payments Integration (Monetization Engine)
*Clean, global payment infrastructure utilizing the pre-configured Next.js Dodo Payments setup.*

- [x] **5.1 Dodo Payments Configuration**:
  - Setup Dodo SDK with API keys, webhook signing secrets, and test/live environment switches.
- [x] **5.2 Product Tiers & Pricing Model**:
  - **Tier 1: Free Tier** (e.g., 250 requests/month for developers to test).
  - **Tier 2: Subscription Plans** (Pro & Scale plans with higher concurrency and priority queues).
  - **Tier 3: Non-Expiring Credit Packs** (e.g., 10k, 50k, 250k screenshots that never expire—a major differentiator).
- [x] **5.3 Webhook Handling**:
  - Secure webhook endpoint for `payment.succeeded` and Dodo subscription lifecycle events, with signature verification and idempotent processing.
  - Automatic prepaid credit top-ups for one-time credit packs after confirmed payment; recurring plans grant the configured monthly included quota.
- [x] **5.4 Customer Billing Portal**:
  - One-click redirection to Dodo Payments portal for subscription management, card updates, and invoices.

---

### 🤖 Chunk 6: AI Agent Layer (Official MCP Server)
*Position Snapforge as the primary visual sensory engine for LLMs and AI coding assistants.*

- [x] **6.1 Model Context Protocol (MCP) Server**:
  - Package `@snapforge/mcp` providing ready-to-run tools for Claude Desktop, Cursor, and agent frameworks.
- [x] **6.2 Agent-Specific Tools**:
  - `take_screenshot`: Fast visual capture with base64 / image return.
  - `inspect_page`: Captures screenshot + extracts clean readability markdown and accessible DOM tree.
  - `capture_element`: Pinpoints a specific CSS selector or element bbox.
- [x] **6.3 Token-Optimized Error Responses**:
  - Low-token error payloads with clear remediation suggestions for autonomous agents.

---

### 💻 Chunk 7: Developer Dashboard & Live Playground (`apps/app`)
*A sleek, dark-themed command center where users test, generate code, and monitor usage.*

> **Branding constraint**: all UI must consume the tokens in `packages/brand` (the Hostinger
> palette, primary `#673DE6`). No raw hex literals in components. See `AGENTS.md`.

- [x] **7.0 Brand Token Integration (`packages/brand`)**:
  - Token package is in place. Consume via `@snapforge/brand` in TS and the `--sf-*`
    CSS custom properties from `@snapforge/brand/tokens.css` in components.
- [x] **7.1 Interactive Capture Playground**:
  - Visual controls for every parameter (device, viewport, full-page, delay, ad blocking).
  - Real-time side-by-side preview with latency, dimensions, and image size metrics.
  - Tabbed code generator: instant copyable snippets for `cURL`, `TypeScript`, `Python`, and `MCP config`.
- [x] **7.2 API Key Management**:
  - Create, revoke, label, and roll API keys with granular permission scopes.
- [x] **7.3 Analytics & Logs Viewer**:
  - Visual breakdown of requests, cache hits, error distributions, and remaining credits.
- [x] **7.4 Documentation & Agent Specs**:
  - Interactive API reference + machine-readable `llms.txt` spec.

---

### 🏆 Chunk 8: The 30-Site "Gauntlet" Benchmark & Quality Gate
*The proving ground that demonstrates superiority over competitors before launch.*

- [x] **8.1 The Test Suite**:
  - 10 Easy Sites (Static, standard blogs, simple documentation).
  - 10 Moderate Sites (Heavy SPAs, dynamic hydration, lazy-loaded product grids like Amazon/Shopify).
  - 10 Hard Sites (Aggressive cookie dialogs, Cloudflare Turnstile, infinite-scroll social feeds, complex fixed navbars).
- [x] **8.2 Automated Quality Runner**:
  - Benchmarking script measuring success rate, p50/p95 latency, and visual correctness.
  - Exit Gate: **≥95% pass rate** before production rollout.
  - *Status (three latest full runs, verified 2026-10-05):* **Gate PASS (exit 0)** in all three — 27/27 eligible sites pass, success across all 30 sites is 90%, with Reddit, IMDb, and Stack Overflow reported separately as access blocks under the existing policy. Four concurrent fresh captures, text checks, assertions, and retries are unchanged. p50 values are 9.618s, 8.904s, and 8.383s; p95 values are 23.073s, 15.877s, and 15.245s. Allbirds, Dribbble, Spotify, and YouTube pass each run. The 2026-10-03 failed run and 2026-10-02 passing reference remain retained. All seven controlled fixtures match longer-settled pixel references. The additional 80% target of p50 1.7354s from the prior 8.677s reference is not achieved; rollout remains unvalidated. [Evidence](apps/benchmark/results/reliability-release.md).
  - *Latency fixes:* capture phase timings now include pool waiting, browser/session startup, navigation, settlement, scrolling, screenshot output, inspection, failures, and cleanup in JSON and Markdown reports. `autoConcurrency: false` now honors the configured slot count instead of silently applying host throttling. Completed static documents skip unnecessary content and growth waits; script-driven hydration, custom JavaScript, and explicit content waits retain their guards. See `apps/benchmark/results/latency-fix.md` for measurements and validation.
  - *Further latency work:* parallel font/network settlement with readiness rechecks, native selector banner scanning, adaptive static scrolling, and memory-aware preparation of fresh isolated pages are implemented. Workers initialize browsers before accepting jobs. The earlier live gate failed, and its single-browser recheck passed four of five sites while Spotify remained a loading shell. Those historical results remain in `apps/benchmark/results/latency-round2.md`. The 2026-10-05 verification above supersedes their latest-gate status; it does not establish the additional 80% performance target.
  - *Market-readiness follow-up (2026-10-03):* runtime loading-shell and optional content/output checks now reject incomplete captures before storage and successful billing. Standalone proxies are applied correctly. Workers consult a TTL-validated capture store before rendering, require a delivery URL, publish health heartbeats, and restrict public capture destinations. Screenshot delivery headers require revalidation. Seven image fixtures still match their references; a new Spotify-only check passes at 23.890s, without replacing the failed full gate. Production deployment, managed proxy service, sustained load targets, and live billing verification remain open. See `docs/market-readiness.md`.
  - *Solved (from ScreenshotOne Playwright guides):* challenge-detector false positive on captcha-titled pages; honest `blocked_by_target` for Reddit/IMDb bot walls; `wait_for_content` hydration wait (Spotify); auto content-guard for blank renders (Stack Overflow); post-scroll network-idle + image wait and document growth-wait before full-page scroll (Dribbble).

---

## 🎯 Immediate First Step: Phase 1 Kickoff
1. Initialize the monorepo root structure cleanly.
2. Build `packages/contracts` with all Zod schemas and error definitions.
3. Build the pure capture engine in `packages/engine` and verify on the first 5 test sites.
