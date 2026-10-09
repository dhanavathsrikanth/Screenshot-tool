# Developer documentation

The public documentation lives at `/docs` in the Next.js app. It uses a dedicated Mintlify-inspired layout, the shared Hostinger brand tokens, and no dashboard or sign-in requirement.

## Content and navigation

Edit `src/lib/docs-content.ts` to add or update a page. Each entry supplies its slug, navigation group, title, description, and structured sections. Navigation, full-text search, page outlines, previous/next links, Markdown exports, and the `/llms.txt` index use that same source.

The capture parameter reference derives defaults from `@snapforge/contracts`. Its description map covers every schema field. Device and region tables also come from the contracts package. Update the relevant guide when changing an API endpoint or capture behavior.

The route `src/app/(documentation)/docs/[[...slug]]/page.tsx` prerenders the registered pages and rejects unknown slugs. `/docs/markdown/{slug}` returns their Markdown content; `/docs/markdown` returns the introduction. Only docs and the agent index are public; console and API authentication remain governed by the existing proxy and API handlers.

## Presentation

The components in `src/components/docs` implement the shell, article sections, and code blocks. `docs.module.css` contains their responsive styling and uses only shared brand tokens for colors.

Search supports Ctrl/Cmd+K, arrow navigation, Enter, and Escape. Code samples have keyboard-accessible language tabs and copy buttons. Mobile navigation collapses into a menu, and wide reference tables scroll within the article.

## Live requests

The “Try it” controls beside HTTP and capture examples open a request panel. Capture panels show only the website URL and output format, with PNG, JPEG, WebP, and PDF derived from `CAPTURE_FORMATS`. Captures use the signed-in console session, generate request keys internally, and follow accepted jobs automatically. Additional example parameters remain intact without showing authentication, idempotency, or JSON controls. PDF captures request all pages and omit incompatible element targeting. Opening an example restores its URL, format, and parameters. Response metadata stays behind “Response details,” while failures remain visible. Other API operations retain their authentication and identifier inputs.

Completed images have a preview and download. `docs-pdf-preview.tsx` lazily loads Mozilla PDF.js and its bundled local worker for PDF results. Every PDF page has a scrollable canvas preview; nearby pages render on demand instead of decoding the entire document immediately. Resizing recalculates page width, and unloading cancels rendering and destroys the document. Preview failures preserve the download action. Artifact hosts must allow CORS for remote PDF previews.

Console mode uses the signed-in account and existing capture service, admission, and billing. Development-only local mode supports direct captures; async jobs and callbacks require worker-backed mode. The console response shape is labeled separately from the REST API.

API-key mode for other API operations forwards the documented method and path to the server-configured `SNAPFORGE_API_URL`, with the developer’s key. Set that variable to the trusted gateway origin in the app's runtime environment to enable REST execution. Keys stay in component memory and are never persisted in browser storage. The bridge accepts only the operation allowlist in `docs-operations.json`, bounds request bodies, rejects cross-origin requests, does not follow redirects, and forwards only the permitted headers. The route is excluded from proxy-level sign-in redirection so API-key callers can use it, but its handler enforces the chosen authentication mode.

## Capture latency

The console and docs share `capture-runtime-handler.ts`. Docs reuse the account identity already verified by their route rather than repeating the sign-in check. In local development, browser preparation overlaps credit reservation. Billing settlement and history still finish before a successful response. Connection pooling retains idle connections for two minutes by default; `DATABASE_POOL_IDLE_TIMEOUT_MS` can tune this per deployment, and idle connection errors are handled without crashing the process.

Local responses expose `Server-Timing` for authentication, admission, browser preparation, reservation, rendering, settlement, history, and total handler time. Capture metadata labels cache hits. These measurements distinguish cached output from fresh rendering. The sub-500 ms completed-capture target is not achieved: target-page rendering and remote transactional billing take seconds in this environment. The production path already submits asynchronously and polls the existing durable job; its acknowledgment is not the completed artifact and must be measured separately. Deploy near the database with ready workers before claiming an acknowledgment SLO.

The capture runner requests an NDJSON stream from the internal docs bridge. After request validation and sign-in verification, the bridge flushes a `started` record before waiting for capture, then emits the actual capture status, headers, and body in a final `response` record. “Started” is not durable job acceptance or a finished artifact. The UI measures first feedback and completed output independently. Cancelling the stream stops waiting; the original capture continues its normal billing settlement. API-key operations and non-streaming callers retain ordinary JSON responses. The browser measured an initial start response of 100 ms after the route was compiled; cold development compilation and deployment/network variation can exceed 500 ms.

`docs-live.ts` discovers capture payloads from the content examples and supplies client execution and polling. Response samples and installation/configuration commands remain reference content; the browser runner executes HTTP requests, not arbitrary shell or application code. The MCP element example offers a capture-engine preview; a full MCP connection still runs through the documented stdio client setup.

## Verification

Run the app's production build and lint checks. The `docs-content.test.ts` checks schema coverage and defaults, internal page links, unique anchors, Markdown parity, error-code coverage, and the correct handling of artifact URLs and queued captures in examples.

The 2026-10-05 browser check rendered a two-page `python.org/doc/` PDF and verified both canvases and internal scrolling. The complete request took 17,483 ms: the handler reported 8,876 ms reserving credits (including connection setup), 6,388 ms rendering, 1,240 ms settlement, and 613 ms history. Browser preparation took 7,870 ms concurrently with reservation. A later 16-page PDF was also previewed and scrolled through to its final page. These are development measurements, not a production SLO or proof of a fresh-render speed improvement.

Build tests before running them:

```sh
pnpm --filter @snapforge/app run test:build
pnpm --filter @snapforge/app run test
```
