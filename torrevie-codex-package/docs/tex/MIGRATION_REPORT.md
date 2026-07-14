# TEX Migration Report

Date: 2026-07-14

## Scope

TEX is being migrated into the canonical Torrevie SaaS Platform. The standalone source bundle remains reference-only at `apps/customer-portal/app/[locale]/tex/_migration-source` until verification is complete.

## Binding Decisions

- TEX lives inside `apps/customer-portal/app/[locale]/tex`.
- TEX API routes live under `apps/customer-portal/app/api/tex`.
- TEX domain logic lives in `apps/customer-portal/lib/tex.ts`, `apps/customer-portal/lib/tex-api.ts`, and `apps/customer-portal/lib/tex-ai.ts`.
- Root Supabase migrations and tests are canonical.
- Neon, Vite standalone deployment, and `tex1.torrevie.com` are not migration targets.
- Source auth, custom JWT cookies, standalone admin flows, and source company tenancy are replaced by shared Torrevie auth, tenant context, roles, permissions, subscriptions, and RLS.

## Source Bundle Inventory

The source bundle includes:

- Vite React application pages for dashboard, expenses, new expense, trips, finance review, employees, reports, settings, onboarding, auth, admin, and notifications.
- Source database tables for `companies`, `app_users`, memberships, expenses, trips, trip legs, receipt files, budgets, policies, notifications, email queue state, WhatsApp submissions, FX, per diem, ERP connections, salary payments, and driver advances.
- Supabase Edge Functions for auth email hooks, user administration, receipt parsing, FX rates, email queue processing, demo provisioning, and WhatsApp/webhook providers.
- Later Neon migration scripts and a source migration plan that are rejected for the platform migration because they conflict with the modular monolith and shared Supabase architecture.

## Current Platform Coverage

Already present in the Torrevie Platform:

- Root TEX schema/RLS migration with tenant-scoped `tex_*` tables.
- Root tenant-isolation coverage in `supabase/tests/tex_schema.sql`.
- TEX permission keys in `packages/permissions` and `supabase/seed.sql`.
- TEX domain logic for bootstrap data, expenses, receipt upload/OCR, duplicate handling, trips, trip legs, route estimates, finance review, payment marking, webhook submission recording, and WhatsApp receipt processing.
- Data migration script `scripts/migrate-tex-data.mjs` for moving legacy TEX data into platform tenant tables.

## This Pass

Completed platform migration checkpoints so far:

- Replaced the disabled App Router TEX API shim with a shared-auth, shared-tenant-context dispatcher into `handleTexApiRequest`.
- Replaced the localized TEX placeholder page with a server-rendered tenant-scoped workspace using the migrated TEX clients.
- Preserved the copied TEX source bundle under `_migration-source` as reference material, with runtime/build artifacts and local environment files excluded.
- Added platform-native compatibility handlers for source notification routes, driver advance create/delete, and the legacy maps autocomplete path.
- Added platform-native inbound webhook endpoints for Wappfly, UltraMsg, and Meta WhatsApp under `/api/tex/webhooks/[provider]`, including tenant resolution, token/signature verification, and reuse of migrated TEX WhatsApp processing.
- Added the unregistered WhatsApp review queue to the platform TEX page, with API support to list, ignore, or resolve submissions into employee profiles and pending TEX expenses.
- Added the shared `@torrevie/notifications` WhatsApp dispatcher and wired TEX inbound/review replies to tenant-scoped Wappfly, UltraMsg, or Meta default integration settings with audit logging for sent, skipped, and failed replies.
- Added platform-native TEX controls for expense categories, spend policies, and department budgets, including tenant-scoped API routes and audit events for category, policy, and budget mutations.
- Added platform-native TEX People controls for tenant-scoped WhatsApp employee profile create/update/delete, plus compatibility routes for `/api/tex/people` and `/api/tex/people/employees`.
- Surfaced TEX employee monthly salary and submission cadence in the People API/UI, preserving source fields already present in the platform schema.
- Restored source employee manager assignment through the platform `manager_user_id` relationship, with manager options resolved from active shared tenant users and source-compatible manager field names accepted by the People API.
- Restored source team management through platform-native `/api/tex/people/teams` routes and People workspace controls for team manager/member assignment, backed by `tex_teams` and `tex_team_members`.
- Kept TEX web user invitations, role assignment, and account status management in the shared customer administration module instead of porting source standalone auth/user-reset flows.
- Rejected the source standalone company onboarding flow as a TEX-specific tenancy mechanism; platform tenant provisioning remains the canonical onboarding path.
- Rejected source standalone auth/admin surfaces (`Login`, `Signup`, `SetPassword`, `Onboarding`, `AdminPanel`, demo login, list-user-emails, delete-user, invite-user, and provision-tenant-admin) as TEX-owned flows; they are covered by shared Supabase auth, Admin Portal tenant lifecycle, and customer administration.
- Added platform-native TEX reports for tenant-scoped spend analysis, previous-period comparison, category/status/employee breakdowns, and CSV export through `/api/tex/reports`.
- Replaced the source reports screen's `xlsx` and Recharts dependency path with lightweight platform UI and browser CSV export to avoid new top-level dependencies.
- Added shared Postmark email dispatch in `@torrevie/notifications` and a tenant-scoped `/api/tex/reports/email` endpoint that honors TEX integration email settings, audits sent/skipped/failed outcomes, and keeps outbound email inside the platform app.
- Ported the source FX refresh Edge Function behavior into platform API routes `/api/tex/fx-rates` and `/api/tex/fx-rates/refresh`, preserving primary/fallback rate fetching, peg insertion, manual-override protection, platform-service-role writes, and audit logging.
- Added a guarded customer-portal cron endpoint and Vercel Cron schedule for daily TEX FX refresh across active TEX tenants, using the existing platform API/domain logic and `CRON_SECRET` authorization.
- Added a read-only TEX integration status panel and `/api/tex/integrations` workspace for active WhatsApp routing, provider-profile summaries, and receipt storage boundary visibility.
- Kept WhatsApp provider profile writes in the shared customer administration module so TEX does not own a parallel integration-admin surface.
- Resolved source single-provider routing through shared tenant WhatsApp provider profiles: customer administrators may save multiple profiles, and the selected default syncs into active TEX inbound/outbound settings.
- Rejected the source `company-logos` bucket and `companies.logo_url` path as TEX-owned storage; tenant branding must use shared `tenant_settings.branding` plus tenant-prefixed `files` storage when a platform branding editor is added.
- Verified migrated receipt uploads persist under `tenant/{tenant_id}/tex/receipts/{file_id}.{extension}` and remain backed by the root `files.storage_path` tenant-prefix constraint.
- Added root Supabase Storage object policies and isolation coverage for tenant-prefixed platform buckets, including TEX receipt objects in the `receipts` bucket.
- Added platform-native role-specific dashboard cards for admin, finance, manager, and employee users using shared role/entitlement context and already tenant-scoped TEX data.
- Deferred source TEX-specific email retry, suppression, and unsubscribe tables to the shared platform notification-delivery model required by the HLD; TEX now dispatches email through `@torrevie/notifications` without creating product-owned queue tables.
- Added a local-only TEX browser smoke harness that seeds a deterministic Supabase tenant/user/workspace, starts the customer portal locally, authenticates through Supabase Auth, and verifies `/en/tex` plus `/ar/tex` render inside the shared platform.
- Added a staging verification runbook and `pnpm verify:tex:staging` guardrail script for deployed SaaS cron and Supabase Storage RLS checks, explicitly refusing `tex1.torrevie.com`.
- Kept `tex1.torrevie.com` untouched; no DNS, Vercel, live environment, or shutdown action is part of this migration branch.

## Remaining Gaps

- Daily FX scheduling still needs production Vercel Cron execution verification after deployment; code-level scheduling, authorization, and tenant enumeration coverage are in place.
- Storage bucket policies still need deployed Supabase execution before production promotion; `pnpm verify:tex:staging` now covers the live policy behavior through a rolled-back staging transaction.
- End-to-end browser verification is now covered locally; it still needs staging execution after deployment with staging Supabase/Vercel environment values.

## Verification Plan

- `pnpm test:tex`
- `pnpm test:isolation`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`
- `pnpm test:tex:browser`
- `pnpm verify:tex:staging` after deployment to the new SaaS staging or production-candidate environment
