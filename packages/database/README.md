# Snapforge database

Snapforge stores account profiles, API keys (SHA-256 hashes only), capture history, usage reservations, monthly usage, Dodo subscriptions, webhook idempotency, and prepaid capture credits in Neon Postgres.

Runtime services use the pooled `DATABASE_URL`. Set `DATABASE_URL_DIRECT` to Neon’s direct connection URL for schema migrations. Keep both values private and configure them in the deployment environment as well as local `.env`.

Use `sslmode=verify-full` in both Neon connection URLs to explicitly verify the server certificate and hostname. This preserves node-postgres's current TLS behavior without the SSL mode alias deprecation warning.

## Schema changes

Edit `src/schema.ts`, then generate and review a migration:

```sh
pnpm --filter @snapforge/database run db:generate
```

Apply migrations to an explicitly selected Neon branch using the Neon migration workflow. For local or self-managed Postgres, `pnpm --filter @snapforge/database run db:migrate` uses the configured direct URL.

## Capture accounting

The database is the source of truth for quotas shared by the dashboard and public API. A capture first reserves one unit in a transaction; success consumes the reservation and failures release it. Reservations older than 24 hours are reclaimed during the account’s next reservation attempt. The included monthly limits are 250 for Free, 10,000 for Pro, and 100,000 for Scale. Prepaid credits are used after included monthly usage and are refunded on failed captures.

Free accounts can create up to three active API keys. Secret key values are returned once and only their SHA-256 digests are persisted.
