# AGENTS.md — Torrevie SaaS Platform

This file governs every change made in this repository, by Codex or by a human. It is the standing reference. If a decision here conflicts with an idea that seems reasonable in the moment, this file wins. If a genuine gap appears, stop and flag it rather than improvising a new pattern.

## What Torrevie is

Torrevie is the operational intelligence company that fixes the workflow before applying AI. The platform is a multi-tenant SaaS product serving five modules: CRM, FSM (Field Service Management), TEX (Travel and Expense), CME (Content Marketing Engine), and LQS (Lead Qualification System). Full business and architecture context lives in `docs/architecture/HLD.md`. Read it before making any structural decision this file does not already answer.

## Architecture principles, locked

- Modular monolith. One Next.js and TypeScript monorepo. Do not create a new service or a new deployable app without an explicit instruction to do so.
- One shared Supabase PostgreSQL database. Tenancy is enforced by a mandatory `tenant_id` column plus row-level security on every tenant-scoped table. There is no other tenancy mechanism anywhere in this codebase.
- Flutter is used only for the native FSM mobile app, under `mobile/fsm-mobile`. Never use Flutter for any web surface.
- Shared platform concepts (tenants, users, roles, entitlements, audit, files, notifications) live in `packages/`. Product-specific logic lives inside its own product route group and never imports directly from another product's route group. Products communicate through shared platform packages only.
- Full architecture rationale, the ADRs, and diagrams are in `docs/architecture/HLD.md` and `docs/adr/`.

## Non-negotiable rules

1. **Every tenant-scoped table gets row-level security in the same pull request that creates the table.** No exceptions, no follow-up ticket. See `docs/architecture/RLS_POLICY_SPEC.md` for the exact pattern.
2. **No secret, API key, database URL, or credential is ever committed.** All secrets live in environment variables, documented (never with real values) in `.env.example`.
3. **The Supabase service-role key is server-only.** It appears only in Vercel server environment variables and Supabase Edge Function secrets. It is never referenced in any file under `apps/*/app` client components, `mobile/`, or anything that ships to a browser or device.
4. **Authorization is enforced server-side and by RLS, never by hiding a UI element alone.** Every API route checks tenant membership, role, permission, and entitlement before touching data.
5. **Every mutation writes an audit event.** Create, update, delete, and any permission-relevant action.
6. **Migrations are forward-only.** Never edit a migration file that has already been merged. A correction is a new migration.
7. **Every new tenant table, RLS policy, or authorization-relevant route requires a passing tenant-isolation test before merge.** This suite is release-blocking, not optional, from Work Package 10 onward.
8. **Arabic and right-to-left support is required on every shared UI component**, not retrofitted later. Test both directions before merging a shared component.
9. **No new top-level dependency without a one-line justification in the pull request description.**
10. **No package in `packages/` is created for hypothetical future reuse.** It is created because two or more apps need it right now. If a package ends up used by only one app, move it back into that app.

## Repository structure

```
torrevie-platform/
  apps/
    admin-portal/          Torrevie staff only, deploys to admin.torrevie.com
    customer-portal/       All customer users, deploys to app.torrevie.com
                            contains route groups: crm, fsm, tex, cme, lqs
  mobile/
    fsm-mobile/             Flutter, native only, FSM technicians
  packages/
    ui/                    Shared design system components (Inter, Torrevie palette)
    auth/                  Supabase Auth wiring
    tenant-context/        Server-side tenant resolution, the only place app.current_tenant_id is set
    permissions/           Role and permission checks, server-side only
    database/               Typed Supabase client wrappers
    validation/             Shared schema validation (used client and server)
    api-client/              Typed API client shared by web and mobile
    notifications/          In-app, email, push notification dispatch
    ai-gateway/              Provider-neutral AI call layer, used by CME and LQS
    integrations/            Inbound/outbound integration framework
    workflow/                Shared state-machine and approval-chain library
    observability/           Structured logging, correlation IDs, error reporting
    localization/            Arabic/English message catalogues, RTL utilities
    feature-flags/           Tenant and platform feature flag resolution
    testing/                 Shared test utilities, including the tenant-isolation harness
  supabase/
    migrations/              Numbered, forward-only SQL migrations
    seed/                    Synthetic seed data only, never real customer data
    functions/                Edge Functions
    tests/                    Database and RLS tests
  docs/
    architecture/             HLD.md and all LLD documents
    adr/                      Architecture Decision Records
    api/
    security/
    runbooks/
  scripts/
  .github/
```

## Dependency rules

- `apps/*` may depend on `packages/*`. `packages/*` may depend on other `packages/*`. `packages/*` never depends on `apps/*`.
- `apps/customer-portal/app/crm` never imports from `apps/customer-portal/app/fsm` (or any other product route group) directly. Shared needs go through `packages/*` or a documented internal API.
- `mobile/fsm-mobile` never imports TypeScript packages directly; it consumes the platform through the versioned REST API only.

## Coding standards

- TypeScript strict mode everywhere. No `any` without a comment explaining why it is unavoidable.
- All input validation and output shaping goes through `packages/validation`. No endpoint accepts unvalidated input.
- No raw, string-concatenated SQL. Use the Supabase client/query builder or parameterized queries only.
- Server components for data-heavy read views. Client components for interactive forms and dashboards.
- One typeface family, Inter, per the Torrevie Visual Identity guide. No second font family is introduced anywhere.
- Colors are limited to the locked Torrevie palette: Deep Navy #162449, White #FFFFFF, Black #0A0A0A, Turquoise #0D9488, Steel Blue #4A6FA5, Light Grey #F2F4F7.
- **`docs/brand/BRAND_FOR_CODEX.md` is the binding, code-ready brand spec** — design tokens, logo usage rules, and UI copy tone. Build `packages/ui/tokens.css` from it directly in Work Package 15. `docs/brand/BRAND_STRATEGY_POSITIONING.md`, `VISUAL_IDENTITY.md`, and `BRAND_GUIDELINES.md` are the source documents behind it. Logo files are at `assets/logo/torrevie_logo_color.png` (light backgrounds only) and `assets/logo/torrevie_logo_white.png` (dark backgrounds only).

## Testing standards

- Unit tests for business logic, especially workflow transitions and entitlement resolution.
- Integration tests against the local Supabase stack, never a mocked database, since RLS cannot be validated against a mock.
- Tenant-isolation tests are mandatory for any change touching a table, a policy, or a route. See `docs/architecture/RLS_POLICY_SPEC.md` for the required test pattern per table.
- End-to-end tests for each product's critical path, run against staging before a production promotion.

## Database migration rules

- One numbered migration file per logical change, named `NNNN_description.sql`.
- RLS policies for a new table ship in the same migration file or the immediately following one in the same pull request, never deferred.
- Every migration is applied and tested against the local Supabase stack before being submitted.
- Migrations apply automatically to staging in CI. Migrations apply to production only as part of a deliberate, reviewed release step. Never run a migration by hand against production.

## Definition of done

A change is done when: it satisfies its stated acceptance criteria, it includes the required tests, any table it touches has a reviewed RLS policy in the same pull request, no secret was introduced, it follows every rule in this file, documentation is updated where behavior changed, and, for anything security-sensitive (auth, tenant-context, permissions, RLS, AI gateway), it has been checked against `docs/architecture/RLS_POLICY_SPEC.md` and `docs/architecture/AUTH_LLD.md`.

## Commands

Defined during repository scaffolding (Work Package 1) and referenced here once they exist, not redefined per task:

```
pnpm install
pnpm dev
pnpm lint
pnpm typecheck
pnpm test
pnpm test:isolation
pnpm build
pnpm supabase:start
pnpm supabase:migrate
pnpm supabase:seed
```

## Environment variables

See `.env.example`. Never commit a file containing real values. Categories: Supabase URL and anonymous key per environment, Supabase service-role key (server-only), AI provider keys, email/SMS/WhatsApp provider credentials, webhook signing secret, error-tracking and log-aggregation tokens.

## Prohibited practices

- Bypassing row-level security for convenience during development.
- Introducing a second UI framework, a second typeface, or a color outside the locked palette.
- Adding a background job, queue system, or microservice before the trigger conditions in `docs/architecture/HLD.md` Section 24 and Section 35 are actually met.
- Logging secrets, full AI prompt bodies, or full customer record contents to operational logs.
- Using the Supabase service-role key anywhere reachable from a browser or a Flutter build.
- Committing directly to `main`. Every change is a pull request, reviewed, passing CI.

## Working sequence

Follow `docs/architecture/WORK_PACKAGES.md` in order. Do not skip ahead to product feature work before the tenant-isolation suite (Work Package 10) is passing in CI. Do not deploy to production before the checkpoints defined in the Codex kickoff prompt are explicitly cleared.
