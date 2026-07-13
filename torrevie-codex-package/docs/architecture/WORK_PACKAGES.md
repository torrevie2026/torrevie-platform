# Work Packages — Torrevie SaaS Platform, Foundation Through First Live Deployment

Work through these in order. Do not skip ahead. Each package states its objective, what you may touch, what you may not touch, requirements, required tests, acceptance criteria, and dependencies. A package is not done until it meets its acceptance criteria and passes the checks in `AGENTS.md`'s Definition of Done.

Checkpoints are marked explicitly. At a checkpoint, stop and report status before continuing, even if you believe you could keep going. Checkpoints exist where real money, real external accounts, or production data are involved.

---

## Phase A — Accounts and Infrastructure Bootstrap

### WP-0: Confirm required accounts and credentials

Objective: identify every external account needed before any provisioning can happen, and request what is missing.

You need, before this phase can complete: a GitHub organization or account to host the repository, a Supabase account with billing configured for at least three projects (development, staging, production), a Vercel account with billing configured for at least two projects (admin portal, customer portal), a domain registrar or DNS access for torrevie.com to point subdomains at Vercel, and at minimum one AI provider account for the eventual AI gateway (not required until Phase 8, but worth confirming access early).

**CHECKPOINT.** Do not create any billed resource (a Supabase project, a Vercel project, a paid plan) without explicit confirmation from Semaan that the account exists and spending is authorized. If a credential or account does not exist yet, stop and list exactly what is needed, in plain terms, so it can be created or shared.

---

## Phase B — Repository and Local Foundation

### WP-1: Repository scaffold

Objective: initialize the monorepo structure defined in `AGENTS.md`.
Allowed: root config, `package.json`, `pnpm-workspace.yaml`, TypeScript base config, ESLint/Prettier config, `.github/workflows/` skeleton (no deploy steps yet), `.env.example`, this `docs/` tree.
Prohibited: any application or package business logic.
Requirements: `pnpm install` and `pnpm lint` succeed on an empty scaffold.
Tests: a CI job that runs successfully on an empty commit.
Acceptance: a fresh clone can install and lint with no errors.
Dependencies: WP-0 confirmed for GitHub access.

### WP-2: Local Supabase setup

Objective: Supabase CLI local stack running and connectable.
Allowed: `supabase/` directory, `supabase/config.toml`.
Requirements: `supabase start` succeeds locally; a smoke test connects.
Tests: connection smoke test.
Acceptance: documented in `AGENTS.md` under Commands (already listed; confirm they work).
Dependencies: WP-1.

### WP-3: Platform schema migration set 1

Objective: `tenants`, `tenant_settings`, `users`, `tenant_memberships`, `user_profiles` per `DATABASE_LLD.md`.
Allowed: `supabase/migrations/`.
Prohibited: application code.
Requirements: migrations apply cleanly, forward-only, match `DATABASE_LLD.md` exactly.
Tests: migration applies without error against the local stack.
Acceptance: schema matches the LLD.
Dependencies: WP-2.

### WP-4: Roles and permissions schema

Objective: `roles`, `permissions`, `role_permissions`, `user_role_assignments`, seeded from `RBAC_MATRIX.md`.
Allowed: `supabase/migrations/`, `supabase/seed/`.
Requirements: every role and permission key in `RBAC_MATRIX.md` is present.
Tests: seed applies cleanly, a query confirms every mapped permission exists.
Dependencies: WP-3.

### WP-5: Subscription schema

Objective: `products`, `plans`, `plan_features`, `subscriptions`, `subscription_entitlements` per `DATABASE_LLD.md`.
Allowed: `supabase/migrations/`.
Tests: migration test.
Dependencies: WP-3.

### WP-6: RLS policy set for platform tables

Objective: apply the pattern in `RLS_POLICY_SPEC.md` to every table created in WP-3 through WP-5, plus `audit_events`, `files`, `provisioning_jobs`, `provisioning_steps`.
Allowed: `supabase/migrations/`.
Requirements: four explicit policies per table, `current_tenant_id()` function defined once.
Tests: the tenant-isolation test cases from `RLS_POLICY_SPEC.md`, one file per table, in `supabase/tests/`.
**Acceptance, release-blocking: a Tenant A session cannot read, write, update, or delete a Tenant B row in any of these tables.**
Dependencies: WP-3, WP-4, WP-5.

---

## Phase C — Identity and Tenant Context

### WP-7: Auth integration

Objective: Supabase Auth wired into a minimal `apps/customer-portal`, including the custom access token hook from `AUTH_LLD.md`.
Allowed: `apps/customer-portal/`, `packages/auth/`.
Requirements: login, session handling, tenant claim resolution as described in `AUTH_LLD.md`.
Tests: integration test logging in and confirming the tenant claim is present and correct.
Dependencies: WP-6.

### WP-8: Tenant-context package

Objective: `packages/tenant-context`, the only place `app.current_tenant_id` is ever set, per `AGENTS.md`.
Allowed: `packages/tenant-context/`.
Requirements: every server-side data call routes through this package.
Tests: unit tests for resolution logic, integration test confirming the RLS session variable is set correctly per request.
Dependencies: WP-7.

### WP-9: Permissions package

Objective: `packages/permissions`, server-side role and permission checks based on `RBAC_MATRIX.md`.
Allowed: `packages/permissions/`.
Requirements: no client-side-only enforcement anywhere.
Tests: unit tests covering every role in `RBAC_MATRIX.md` against a representative permission set.
Dependencies: WP-8.

### WP-10: Tenant-isolation test suite, formalized and CI-gating

Objective: consolidate every test from WP-6 through WP-9 into one CI-gating suite (`pnpm test:isolation`).
**CHECKPOINT: from this point forward, no pull request touching a table, a policy, or a route may merge unless this suite passes. This is the primary safety gate for the entire platform. Confirm this is wired into branch protection before continuing to Phase D.**
Dependencies: WP-6 through WP-9.

---

## Phase D — Control Plane Foundation

### WP-11: Admin Portal shell

Objective: `apps/admin-portal` scaffold with role-gated routing, no real features yet.
Requirements: only `torrevie_*` roles can reach any route.
Tests: authorization test confirming a customer role cannot access the admin portal.
Dependencies: WP-9.

### WP-12: Tenant lifecycle

Objective: create, edit, suspend, reactivate, archive a tenant, from `apps/admin-portal`.
Tests: end-to-end test creating and suspending a tenant.
Dependencies: WP-11.

### WP-13: Provisioning pipeline

Objective: the provisioning-job mechanism, `packages/provisioning`, matching the HLD's provisioning sequence.
Requirements: each step independently retryable, status visible in the Admin Portal.
Tests: a test simulating a failed step and confirming retry does not duplicate earlier steps.
Dependencies: WP-12.

### WP-14: Subscription management in the Admin Portal

Objective: assign products and plans to a tenant.
Tests: end-to-end test assigning CRM to a tenant, confirming entitlement resolution.
Dependencies: WP-13.

---

## Phase E — Customer Portal Foundation

### WP-15: Customer Portal shell with localization

Objective: `apps/customer-portal` shell, Arabic and English, right-to-left verified on every shared component.
Requirements: matches Torrevie Visual Identity (Inter, locked palette).
Tests: visual-regression test per shared component in both locales.
Dependencies: WP-9.

### WP-16: Customer administration screens

Objective: `customer_admin` can manage users and roles within their own tenant only.
Tests: a tenant-isolation test specific to this feature.
Dependencies: WP-10, WP-15.

---

## Phase F — CRM Vertical Slice

### WP-17: CRM schema and RLS

Objective: `accounts`, `contacts`, `pipeline_stages`, `opportunities`, `activities` per `DATABASE_LLD.md`, with RLS per `RLS_POLICY_SPEC.md`.
Tests: migration and RLS tests for each table.
Dependencies: WP-6.

### WP-18: CRM vertical slice UI

Objective: account, contact, and a single pipeline view under `apps/customer-portal/app/crm`.
Tests: end-to-end test creating an opportunity and moving it through the pipeline.
Dependencies: WP-16, WP-17.

### WP-19: Audit logging integration

Objective: wire `audit_events` writes into every mutation introduced through WP-18.
Tests: a test confirming an audit event is written for a representative action in each area touched.
Dependencies: WP-12 through WP-18.

### WP-20: Observability foundation

Objective: structured logging with correlation and tenant IDs, error tracking wired into both apps.
Requirements: no secrets or sensitive record content logged.
Tests: a sample error is captured and correlated correctly.
Dependencies: WP-19.

---

## Phase G — CI/CD and First Deployment

### WP-21: CI pipeline

Objective: full GitHub Actions pipeline — lint, typecheck, unit tests, `test:isolation`, build — gating every pull request.
Requirements: matches the flow in the HLD's CI/CD diagram.
Dependencies: WP-10.

### WP-22: Staging environment provisioning

**CHECKPOINT.** Requires a confirmed, billed Supabase staging project and a Vercel staging deployment target from WP-0. Do not create these without prior confirmation.
Objective: apply the full migration set to a real staging Supabase project, deploy `admin-portal` and `customer-portal` to Vercel preview/staging URLs.
Acceptance: staging is reachable, seeded with synthetic tenants, and the tenant-isolation suite passes against it, not just against the local stack.
Dependencies: WP-21, WP-0.

### WP-23: End-to-end staging validation

Objective: run the full end-to-end suite (login, tenant creation, provisioning, subscription assignment, CRM opportunity flow) against staging.
Acceptance: every critical path in Phases D through F works end to end on real, hosted infrastructure, not just locally.
Dependencies: WP-22.

### WP-24: Production environment provisioning

**CHECKPOINT.** Requires explicit confirmation before creating billed production resources: a production Supabase project, production Vercel deployments, and DNS records pointing `admin.torrevie.com` and `app.torrevie.com` at Vercel. State clearly what will be created and its expected cost tier before proceeding.
Objective: mirror WP-22 in production, with production secrets set directly in Vercel and Supabase project settings, never in the repository.
Dependencies: WP-23, explicit go-ahead.

### WP-25: First production release

**CHECKPOINT.** This is the first moment real customer-facing infrastructure goes live under the torrevie.com domain. Confirm before promoting.
Objective: promote the reviewed staging build to production, following the release checklist in the HLD (Section 43-M).
Acceptance: `admin.torrevie.com` and `app.torrevie.com` are live, reachable, and a smoke test (login, tenant lookup) succeeds against production. Torrevie staff can log in and see the Control Plane. This is the "working platform" milestone.
Dependencies: WP-24.

---

## After WP-25

## Phase H - Torrevie FSM Revamp

These packages implement TRV-FSM-2026-001. They continue the sequence after WP-25 and remain bound by `AGENTS.md`, `DATABASE_LLD.md`, `RLS_POLICY_SPEC.md`, `AUTH_LLD.md`, `RBAC_MATRIX.md`, and the brand specification.

### WP-26: FSM alignment audit and safety net

Objective: audit the Lovable staging export at `reference/fsm-staging/`, map it to the platform architecture, and add smoke coverage for the current login and tenant flows before FSM implementation starts.
Allowed: `docs/fsm/`, this work-package file, `docs/architecture/PROGRESS.md`, smoke-test scripts, and ignore rules that keep `reference/` out of builds.
Prohibited: FSM schema, product routes, entitlement changes, provider integration code, or migrations.
Requirements:
- Read the required governance documents before editing.
- Produce `docs/fsm/STAGING_STATE.md` with route, table, Edge Function, and RLS inventory from the staging export.
- Produce `docs/fsm/PLATFORM_MAPPING.md` mapping staging concepts to platform concepts.
- Add a named smoke-test command for current login and tenant-context flows.
- Record blockers if `reference/fsm-staging/` is missing.
Tests: `pnpm test:fsm-phase0`, plus existing lint and typecheck.
Acceptance: mapping docs exist, smoke tests pass, and no product behavior or schema changes are introduced.
Dependencies: WP-25 and availability of the staging export for full acceptance.

### WP-27: FSM segmentation and plans

Objective: add business segments, FSM plan tiers, entitlement resolution, and platform admin controls.
Allowed: migrations, shared entitlement package work, Admin Portal controls, tests, and documentation.
Requirements:
- Use platform tenant, subscription, and entitlement mechanics. Do not create a parallel organization or role system.
- Add RLS and isolation tests for every new tenant-scoped table.
- Existing platform tenants keep current behavior.
Acceptance: Entry tenants cannot use PM, SLA, inspections, or contracts; overrides grant one feature above tier; seat limits are enforced.
Dependencies: WP-26.

### WP-28: FSM adaptive UX and onboarding

Objective: add segment navigation profiles, terminology packs, adaptive dashboards, flow settings, and the five-step onboarding wizard.
Requirements:
- Profiles and terminology are data-driven and locale-aware.
- Shared UI remains RTL-ready.
- Onboarding applies industry defaults, segment overlays, and at least one intake channel before finish.
Acceptance: five test tenants, one per segment, show correct menu, terms, dashboard widgets, and default flow.
Dependencies: WP-27.

### WP-29: FSM Channel Hub core

Objective: implement the unified intake model, WhatsApp adapter refactor, portal and QR intake, email intake, and triage rework.
Requirements:
- Every channel writes `intake_requests`.
- Provider names remain behind adapters.
- Credential tables protect secrets and never expose raw values to browser code.
Acceptance: WhatsApp, portal, and inbound email requests appear in one triage queue and convert to jobs with `source_channel` stamped.
Dependencies: WP-28.

### WP-30: FSM voice agent

Objective: add the provider-agnostic voice adapter, Vapi implementation, voice webhook tools, call logs, provisioning flow, minute caps, and Channel Hub usage display.
Requirements:
- Stop at checkpoints before creating billed telephony, Vapi, Twilio, or UAE provider resources.
- Secure webhooks with per-channel secrets.
- Document UAE call-forwarding and licensed-provider constraints in the admin UI.
Acceptance: a test call identifies a known caller, creates an intake request, records transcript and call metadata, and respects caps.
Dependencies: WP-29 and explicit checkpoint approval for any billed resource.

### WP-31: FSM brand and ROI

Objective: apply Torrevie brand tokens across FSM, add the ROI dashboard, baseline capture, monthly value email, PDF footer behavior, and client report packs.
Requirements:
- No surface uses colors outside the locked palette except approved status colors.
- Generated documents carry tenant identity plus the Torrevie footer unless Enterprise white-label entitlement removes it.
Acceptance: contrast checks pass, ROI dashboard renders real seeded data, and generated PDFs comply with the brand footer rule.
Dependencies: WP-30.

### WP-32: FSM hardening

Objective: finish RLS coverage, load-test intake webhooks, add rate limiting, and complete FSM operating documentation.
Requirements:
- Add `docs/fsm/SEGMENTS.md`, `docs/fsm/ENTITLEMENTS.md`, `docs/fsm/CHANNELS.md`, and update the README.
- Add `docs/UAT.md` with five personas and ten-step happy paths.
Acceptance: cross-tenant access attempts fail, rate limits protect public endpoints, load tests meet agreed thresholds, and documentation is complete.
Dependencies: WP-31.

---

Once WP-25 is complete, the platform has a working, deployed foundation: tenancy, identity, roles, entitlements, the Control Plane, and a working CRM vertical slice, live on production infrastructure. From here, continue into the HLD's Implementation Roadmap (Section 41), Phase 6 onward: FSM and the Flutter mobile foundation, TEX, LQS and the AI gateway, CME, integrations, and enterprise hardening — each following the same pattern of schema, RLS, tests, feature build, staging validation, and a reviewed production release.
