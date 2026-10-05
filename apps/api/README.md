# Snapforge API Gateway

The Hono gateway listens on `0.0.0.0:8787` by default. Configure `PORT`, `HOST`, `DATABASE_URL`, and `REDIS_URL` for deployment. The gateway uses Neon Postgres as the source of truth for API keys, account ownership, capture history, monthly usage, prepaid credits, and capture reservations. Runtime queries use Neon’s pooled URL.

BullMQ requires Redis TCP for Lua scripts, pub/sub, and blocking queue operations. For Upstash, use the connection string from **Connect → TCP** in `UPSTASH_REDIS_URL` or `REDIS_URL`. REST credentials cannot replace the TCP URL.

API keys are created and revoked through the dashboard and stored in Postgres as SHA-256 digests; plaintext values are returned only once. Monthly allowances and prepaid credits are reserved transactionally. Successful captures consume a reservation; failed captures refund it. Unfinished reservations are reclaimed after 24 hours. The gateway caches authenticated API key records for five seconds, so revocation takes effect within that window.

## Endpoints

- `POST /v1/screenshot` accepts a capture-options JSON object. Add `?mode=async` or send `{"sync":false,...}` for queued mode. Sync requests return a capture envelope on completion or `202` with a polling URL when the 2-second fast path expires.
- `GET /v1/jobs/:id` polls a job and returns its result envelope when complete. Keys need `jobs:read`.
- `GET /v1/health` reports Redis, Neon database, worker, and queue readiness.

Requests use `Authorization: Bearer sf_live_...`. Rate limits default to 60 requests per key per minute, and each key can have five queued or running captures. Rate-limited responses include `Retry-After`.

Error responses use `{ "ok": false, "request_id": "...", "error": { "code", "message", "retriable", "request_id" } }`.
