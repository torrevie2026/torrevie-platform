# TEX Staging Verification

Run this only after the TEX migration branch has been deployed to the new Torrevie SaaS customer portal staging or production-candidate environment. Do not run it against `tex1.torrevie.com`.

## Automated Checks

Required environment variables:

- `TEX_STAGING_BASE_URL` - deployed customer portal base URL, for example `https://app-staging.torrevie.com`
- `CRON_SECRET` - staging or production-candidate cron secret
- `DATABASE_URL` or `POSTGRES_URL` or `SUPABASE_DB_URL` - staging Supabase Postgres connection string
- `TEX_STAGING_ALLOW_REMOTE=1` - explicit acknowledgement that this is a deployed non-local target
- `TORREVIE_DATABASE_SSL=true` when the remote database requires SSL

Command:

```bash
pnpm verify:tex:staging
```

The command verifies:

- `/api/cron/tex/fx-rates` rejects unauthenticated requests with `401`.
- `/api/cron/tex/fx-rates` accepts `Authorization: Bearer $CRON_SECRET` and returns a valid TEX FX cron payload.
- Supabase Storage object RLS prevents cross-tenant select, insert, update, delete, and no-tenant access for tenant-prefixed TEX receipt objects.

The Storage check runs inside a transaction and rolls back its synthetic tenant and object rows.

## Manual Checks

After automated checks pass:

- Sign in to the deployed customer portal with a synthetic TEX-enabled tenant user.
- Open `/en/tex` and confirm the Travel and Expense workspace renders with tenant-scoped dashboard, expenses, trips, finance, reports, people, WhatsApp review, integrations, and settings sections.
- Open `/ar/tex` and confirm RTL layout renders without overlap.
- Upload a synthetic receipt and confirm the stored path follows `tenant/{tenant_id}/tex/receipts/{file_id}.{extension}`.
- Confirm Vercel Cron execution appears in deployment logs after the scheduled production cron window. Vercel cron jobs run on production deployments, so preview deployments require manual authorized endpoint verification.

## Cutover Guardrail

Do not shut down `tex1.torrevie.com` until staging verification passes, migrated data has been reconciled, and business users confirm full TEX operation on the new SaaS platform.
