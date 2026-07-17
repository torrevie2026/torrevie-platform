# TEX Migration Plan

Repository target: `https://github.com/abousim/Torrevie_TEX`

Production domain target: `tex1.torrevie.com`

Database target: Neon Postgres, matching the CRM architecture.

Supabase project currently referenced locally during transition: `nbuilebrjptbbogcfqdh`

## Current Local Baseline

- The local folder is not currently a Git checkout.
- `git` and `gh` are not available in the current shell.
- GitHub URL returned `404` when checked anonymously, so the repository is likely private or requires authenticated access.
- Frontend build, lint, and tests are passing as of the first migration baseline.
- `npm audit` still reports dependency vulnerabilities; `xlsx` has no available audit fix.

## Phase 1 - Repository Trace And Upload

Goal: move all TEX work into `abousim/Torrevie_TEX` with a clean, reviewable commit history.

Actions:

1. Install or expose Git in the working environment.
2. Authenticate GitHub access for `abousim/Torrevie_TEX`.
3. Convert the current local folder into a Git working tree or clone the GitHub repository into a clean folder.
4. Copy the current TEX source into the Git checkout, excluding generated and local-only files:
   - Exclude `node_modules/`
   - Exclude `dist/`
   - Exclude `.env`
   - Exclude local IDE/cache files
5. Commit the first migration baseline:
   - Package rename to `tex-expense-platform`
   - README replacement
   - route lazy-loading
   - Vite manual chunking
   - lint hard-error cleanup
   - migration plan
6. Push to GitHub.
7. Keep every future change in small commits with a clear prefix:
   - `migration:`
   - `db:`
   - `deploy:`
   - `security:`
   - `ui:`
   - `fix:`
   - `docs:`

## Phase 2 - Database Migration Plan

Goal: migrate TEX from Supabase to Neon Postgres, matching the CRM backend pattern before promotion to `tex1.torrevie.com`.

Current migration coverage:

- Core tenant tables: `companies`, `profiles`, `employees`, `teams`, `team_members`
- Expense workflow: `expenses`, `expense_categories`, `spend_policies`, `budgets`, `audit_log`
- Travel workflow: `trips`, `trip_legs`
- Finance/reference data: `country_configs`, `currency_pegs`, `fx_rates`, `per_diem_rates`, `erp_connections`
- Notifications and email queue: `notifications`, `email_send_log`, `email_send_state`, `suppressed_emails`, `email_unsubscribe_tokens`
- Storage buckets and policies: `receipts`, `company-logos`
- Functions/RPC: tenant helpers, profile admin helpers, manager/approval helpers, email queue helpers, WhatsApp/Wappfly lookup/update helpers
- Edge functions: auth email hook, email queue processing, user invitation/deletion/reset, receipt parsing, FX rates, WhatsApp/webhooks, demo provisioning

Neon migration actions:

1. Create a Neon project/database for `tex1.torrevie.com`.
2. Configure `DATABASE_URL`, `AUTH_SECRET`, and `APP_URL`.
3. Apply `db/schema.sql` to a disposable Neon branch.
4. Port reference/seed data from Supabase migrations.
5. Replace Supabase Auth with CRM-style JWT cookie sessions in `server/auth.js`.
6. Replace browser-side Supabase calls with `/api/...` calls, one module at a time.
7. Move Supabase Edge Functions into API routes.
8. Replace Supabase Storage for receipts and company logos with the CRM-approved storage target.
9. Verify all authorization rules in API handlers with role-based test users:
   - super admin
   - company admin
   - finance
   - manager
   - coordinator
   - employee
10. Verify file privacy:
   - receipts must be company-scoped
   - company logos must be company-scoped
   - signed URL usage must work in layout and company profile
11. Configure required production secrets:
   - email provider secrets
   - receipt parsing/OCR secrets if applicable
   - WhatsApp/Wappfly provider secrets
   - FX API key if used
12. Run smoke tests for:
    - onboarding company creation
    - login/session refresh
    - expense creation
    - receipt upload/parse
    - manager approval
    - finance payment
    - reports export
    - notifications
    - WhatsApp/webhook flows
13. Capture a production rollback plan:
    - database backup before cutover
    - known-good deployment artifact
    - DNS rollback target
    - API deployment rollback target

## Phase 3 - Application Hardening

Goal: remove Lovable-era technical debt before production cutover.

Actions:

1. Replace or isolate `xlsx`, because npm audit reports vulnerabilities with no fix available.
2. Run `npm audit fix` in a branch and verify no breaking behavior.
3. Resolve remaining lint warnings in batches:
   - typed API results
   - hook dependency arrays
   - shadcn fast-refresh export warnings
4. Add focused tests for critical workflows:
   - auth/profile loading
   - tenant switching
   - expense validation
   - duplicate detection
   - offline sync
   - approval/payment state transitions
5. Confirm PWA/service worker behavior does not cache stale production builds.

## Phase 4 - Deployment To tex1.torrevie.com

Goal: deploy TEX to `tex1.torrevie.com` with stable environment variables and rollback.

Actions:

1. Select hosting target, matching the CRM deployment pattern.
2. Configure production environment variables:
   - `DATABASE_URL`
   - `AUTH_SECRET`
   - `APP_URL=https://tex1.torrevie.com`
3. Build production artifact with `npm run build`.
4. Upload/deploy the artifact to the hosting target.
5. Configure DNS:
   - create/update `tex1.torrevie.com`
   - verify SSL certificate issuance
   - verify HTTP to HTTPS redirect
6. Verify production routes:
   - `/login`
   - `/dashboard`
   - `/expenses`
   - `/expenses/new`
   - `/finance-review`
   - `/trips`
   - `/employees`
   - `/reports`
   - `/settings`
   - `/admin`
7. Confirm auth email links include `https://tex1.torrevie.com`.
8. Run production smoke tests with seeded or controlled tenant data.

## Phase 5 - GitHub Trace Standard

Every migration step should leave a visible trace in GitHub:

- One branch per workstream.
- One pull request per milestone.
- Commit messages must explain intent and risk.
- Database changes must include migration SQL plus a note in this file or a release note.
- Deployment changes must include the target domain and verification result.
- Secrets must never be committed.

Suggested branches:

- `migration/baseline`
- `migration/neon-database`
- `security/dependency-hardening`
- `deploy/tex1-production`
- `qa/production-smoke-tests`

Suggested first commit:

```text
migration: establish TEX baseline and deployment plan
```

## Open Decisions

- Confirm whether GitHub repository access is private and how authentication will be provided.
- Confirm whether `nbuilebrjptbbogcfqdh` remains the production Supabase project.
- Confirm the hosting provider used for `tex1.torrevie.com`.
- Confirm whether CRM deployment scripts or DNS patterns should be copied exactly.
- Confirm production email, WhatsApp, OCR, and FX provider credentials.
