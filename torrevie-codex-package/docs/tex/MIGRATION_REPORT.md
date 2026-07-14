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
- Kept `tex1.torrevie.com` untouched; no DNS, Vercel, live environment, or shutdown action is part of this migration branch.

## Remaining Gaps

- Source reports, full settings/policy/budget administration, employee invitation UX, onboarding flow, dashboard metrics, email queue behavior, and several admin-only source screens still need platform-specific migration or explicit rejection.
- Outbound WhatsApp profile routing is currently limited to the default TEX WhatsApp integration settings; tenant provider-profile selection still needs a dedicated pass if multiple sending numbers are required per tenant.
- Remaining source Edge Functions need a dedicated pass to decide whether each becomes an App Router route, a shared notification integration, or remains deferred.
- Storage bucket policies need verification against the platform `tenant/{tenant_id}/tex/...` convention for all receipt and company-logo behavior.
- End-to-end browser verification against seeded TEX data remains required.

## Verification Plan

- `pnpm test:tex`
- `pnpm test:isolation`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`
- Browser check for `/en/tex` and `/ar/tex` after local data is available.
