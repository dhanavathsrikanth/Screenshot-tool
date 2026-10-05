# Dodo Payments setup

The billing dashboard uses `@dodopayments/nextjs` for checkout and customer portal flows. Configure the following values in the app environment:

- `DATABASE_URL` using the Neon pooled connection for app runtime; `DATABASE_URL_DIRECT` for migrations.
- `DODO_PAYMENTS_API_KEY` and `DODO_PAYMENTS_WEBHOOK_KEY` from the Dodo dashboard.
- `DODO_PAYMENTS_ENVIRONMENT` as `test_mode` until live checkout is ready.
- `DODO_PAYMENTS_RETURN_URL` as the absolute dashboard URL to return to after checkout.
- `DODO_PRODUCT_PRO`, `DODO_PRODUCT_SCALE`, and `DODO_PRODUCT_CREDITS_10K`, `DODO_PRODUCT_CREDITS_50K`, `DODO_PRODUCT_CREDITS_250K` as the matching Dodo product IDs. Pro and Scale must be recurring products; credit packs must be one-time products.
- `REDIS_URL` (or `UPSTASH_REDIS_URL`) using the Redis TCP connection already used by the API and worker.

Hosted dashboard captures require this TCP connection and the worker fleet. API and dashboard share account admission: 60 capture attempts per rolling minute and five pending/running captures per account with the default configuration. Production returns a retryable HTTP 503 if admission is unavailable. HTTP 429 responses include `Retry-After`. Set `SNAPFORGE_LOCAL_CAPTURE=1` only in development to explicitly use the local inline adapter; production always uses the queue. See [the shared service migration](../../docs/shared-capture-service.md) for verification and remaining deployment work.

Register `POST https://<dashboard-host>/api/webhook` in Dodo and subscribe to `payment.succeeded`, `subscription.active`, `subscription.renewed`, `subscription.updated`, `subscription.cancelled`, `subscription.expired`, and `subscription.on_hold`. The SDK verifies webhook signatures. One-time credit packs are granted only after a confirmed successful payment, atomically and idempotently in Neon. Subscription events synchronize the plan, status, cancellation-at-period-end flag, and next billing date. A scheduled cancellation keeps the paid plan active until Dodo reports the subscription cancelled or expired. Monthly plan usage is provided by the app's included quota; recurring subscription payments do not add non-expiring prepaid credits.

New API keys created in the dashboard are persisted in Neon using SHA-256 digests; plaintext secrets are returned once and never stored. All keys for a Clerk account share the same purchased credit balance while retaining separate rate limits and concurrency limits.
