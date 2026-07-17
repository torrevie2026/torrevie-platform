# TEX Supabase To Neon Migration

TEX will follow the CRM backend pattern:

- Neon Postgres via `@neondatabase/serverless`.
- Server-only database access through `server/db.js`.
- Cookie/JWT auth through `server/auth.js`.
- Vercel API gateway at `api/[...route].js`.
- Browser code calls `/api/...` instead of using Supabase directly.
- Database schema is tracked in `db/schema.sql`.

## Migration Order

1. Create Neon project/database for `tex1.torrevie.com`.
2. Apply `db/schema.sql` to a disposable Neon branch.
3. Port seed/reference data from Supabase migrations:
   - countries
   - currency pegs
   - default expense categories
4. Migrate auth:
   - Supabase `auth.users` + `profiles` becomes `app_users`.
   - Passwords must be reset or imported only if a secure hash migration path is available.
   - Use `tex_session` cookie, matching CRM style.
5. Replace frontend Supabase client calls with `/api` calls module by module:
   - auth/bootstrap
   - companies/settings
   - employees/teams/org chart
   - trips/trip legs
   - expenses/new/list/edit/approve
   - finance review
   - reports
   - notifications
   - audit log
6. Replace Supabase Storage:
   - receipts
   - company logos
   - choose CRM-compatible storage target before cutover.
7. Replace Supabase Edge Functions with API routes:
   - invite user
   - delete user
   - reset password
   - parse receipt
   - fetch FX rates
   - send WhatsApp
   - Wappfly/UltraMsg webhooks
8. Remove Supabase dependency and environment variables only after all calls have moved.

## Setup Commands

The repository now includes the same style of repeatable backend setup used for CRM:

```bash
npm run neon:create
npm run db:apply
npm run db:seed-admin
```

`npm run neon:create` requires `NEON_API_KEY`. It creates the Neon project and database using:

- `NEON_PROJECT_NAME`, default `torrevie-tex`
- `NEON_DATABASE_NAME`, default `tex`
- `NEON_BRANCH_NAME`, default `main`
- optional `NEON_ORG_ID`
- optional `NEON_REGION_ID`

`npm run db:apply` requires `DATABASE_URL` and applies `db/schema.sql`.

`npm run db:seed-admin` requires `DATABASE_URL`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD`; it creates or updates the first super admin and default expense categories for the seed company.

The initial GCC currency baseline can be safely re-applied with:

```bash
npm run db:seed-currency
```

Current baseline:

- Company base currency: `AED`
- Country configs: `AE`, `SA`, `BH`, `KW`, `OM`, and `QA`
- Fixed USD pegs: `AED`, `SAR`, `BHD`, `OMR`, and `QAR`
- `KWD` is seeded as a GCC country/currency config, but not as a fixed USD peg.

## Required Production Variables

- `DATABASE_URL`
- `AUTH_SECRET`
- `APP_URL=https://tex1.torrevie.com`
- email provider variables
- OCR/receipt parser variables
- WhatsApp/Wappfly variables
- FX API variables

## Current State

The Neon backend boundary has been added, and `db/schema.sql` now models the TEX domain directly:

- companies and app users
- user-company memberships for multi-company access and GUI switching
- employee/team hierarchy
- trips and trip legs
- expenses, spend policies, budgets, and categories
- FX/reference tables
- notifications and audit log
- email send/suppression/unsubscribe tracking
- ERP/per diem configuration

The Vercel project `torrevie/torrevie-tex` has been created, Neon has been provisioned through Vercel Marketplace, and the TEX schema has been applied to the new Neon database. Deployment details are tracked in [`VERCEL_DEPLOYMENT.md`](./VERCEL_DEPLOYMENT.md).

The frontend still uses Supabase. This is intentional so the app remains buildable while the backend is migrated in small, reviewable commits.

The People employee manager selector, employee list, employee create/update, and employee active/inactive toggle now use the Neon API. Manager options are read from `app_users` and `user_company_memberships`, not Supabase `profiles`.

The browser Supabase SDK has been removed from active dependencies. Remaining legacy module calls are routed through a local no-network compatibility shim so production does not contact old Supabase REST, Realtime, Storage, Auth, or Edge Function endpoints while those modules are migrated to `/api/...`.

Settings company profile load/save and Admin/People user invitation flows now use Neon API routes. Invite manager options are sourced from `app_users` and `user_company_memberships` so users with access to the selected company appear even when it is not their default company.

No Neon credentials are stored in this repository.
