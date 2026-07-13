# Torrevie SaaS Platform Progress

This log records work package status, verification, and open questions.

## WP-0: Confirm required accounts and credentials

Status: Completed on 2026-07-11.

- Confirmed user authorization to proceed with GitHub, Supabase, Vercel, DNS, and AI provider access.
- No billed resources were created.
- No credentials or secrets were committed.

## WP-1: Repository scaffold

Status: Completed on 2026-07-11.

- Branch: `codex/wp-1-repository-scaffold`
- Scope: root monorepo configuration, empty workspace structure, CI skeleton, and documentation.
- Verification:
  - `pnpm install`
  - `pnpm lint`
  - `pnpm typecheck`
- Acceptance: fresh install and lint succeed on the scaffold.

## WP-2: Local Supabase setup

Status: Completed on 2026-07-11.

- Branch: `codex/wp-1-repository-scaffold`
- Scope: Supabase CLI local config and a local database smoke test.
- Notes:
  - Supabase CLI is pinned as a root dev dependency.
  - Docker Desktop was started locally to run the stack.
- Verification:
  - `pnpm exec supabase init`
  - `pnpm exec supabase start`
  - `pnpm supabase:smoke`
  - `pnpm lint`
  - `pnpm typecheck`
- Acceptance: local stack starts and the smoke test connects to the local database.

## WP-3: Platform schema migration set 1

Status: Completed on 2026-07-11.

- Branch: `codex/wp-1-repository-scaffold`
- Scope: `tenants`, `tenant_settings`, `users`, `tenant_memberships`, and `user_profiles`.
- Approved adjustment: included `files` in the same foundation migration because `user_profiles.avatar_file_id` references `files(id)`.
- Verification:
  - `pnpm supabase:reset`
  - Schema sanity query confirmed the expected foundation tables exist.

## WP-4: Roles and permissions schema

Status: Completed on 2026-07-11.

- Scope: `roles`, `permissions`, `role_permissions`, and `user_role_assignments`.
- Seed data: role and permission keys from `RBAC_MATRIX.md` are inserted by `supabase/seed.sql`.
- Verification:
  - `pnpm supabase:reset`
  - `pnpm test:isolation`

## WP-5: Subscription schema

Status: Completed on 2026-07-11.

- Scope: `products`, `plans`, `plan_features`, `subscriptions`, and `subscription_entitlements`.
- Seed data: initial product catalogue and starter/growth/enterprise plans are inserted by `supabase/seed.sql`.
- Verification:
  - `pnpm supabase:reset`
  - `pnpm test:isolation`

## WP-6: RLS policy set for platform tables

Status: Completed on 2026-07-11.

- Scope: RLS helper functions, explicit policies, grants, and isolation tests for tenant-scoped platform tables.
- Approved adjustment: included `audit_events`, `provisioning_jobs`, and `provisioning_steps` in the foundation migration because WP-6 requires their RLS policies.
- Verification:
  - `pnpm supabase:reset`
  - `pnpm test:isolation`
  - `pnpm exec supabase db lint --local`
  - `pnpm exec supabase db advisors --local`
  - `pnpm lint`
  - `pnpm typecheck`
- Acceptance: Tenant A cannot read, insert, update, or delete Tenant B rows in the tested tenant-scoped tables.

## WP-7: Auth integration

Status: Completed on 2026-07-11.

- Scope: minimal `apps/customer-portal` login/session flow and `packages/auth` JWT claim utilities.
- Approved adjustment: added a forward migration and local Supabase Auth hook config because the custom access token hook cannot be implemented solely inside app/package code.
- Notes:
  - Local Next build uses `next build --webpack` because Turbopack hit Windows path-length limits in this deep OneDrive workspace.
  - The custom access-token hook injects `tenant_id` and `role_scope` from the active tenant membership at token issuance.
- Verification:
  - `pnpm test:auth`
  - `pnpm test:isolation`
  - `pnpm exec supabase db lint --local`
  - `pnpm exec supabase db advisors --local`
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm build`
- Acceptance: local Supabase Auth sign-in issues a JWT containing the expected tenant claim for a test user with an active tenant membership.

## WP-8: Tenant-context package

Status: Completed on 2026-07-11.

- Scope: `packages/tenant-context`, tenant membership resolution, and the transaction helper that sets `app.current_tenant_id`.
- Dependency justification: added root dev dependency `tsx` so TypeScript package tests can run directly before a full test framework is introduced.
- Notes:
  - `packages/tenant-context` defines the only package API that sets `app.current_tenant_id`.
  - Server-side database clients are represented by a minimal query interface until `packages/database` is implemented.
- Verification:
  - `pnpm test:tenant-context`
  - `pnpm test`
  - `pnpm test:isolation`
  - `pnpm test:auth`
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm build`
- Acceptance: unit tests cover tenant membership resolution and transaction behavior; integration smoke test confirms RLS sees the expected tenant when `app.current_tenant_id` is set in a transaction.

## WP-9: Permissions package

Status: Completed on 2026-07-11.

- Scope: `packages/permissions`, initial RBAC matrix, product entitlement checks, support-session narrowing, integration-service scopes, and ownership narrowing for representative product permissions.
- Notes:
  - The package is server-side only by convention and has no UI enforcement responsibilities.
  - Torrevie staff customer-tenant actions require a support session unless they are platform-level permissions.
- Verification:
  - `pnpm test:permissions`
  - `pnpm test`
  - `pnpm test:isolation`
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm build`
- Acceptance: unit tests cover every initial role against representative permissions from `RBAC_MATRIX.md`.

## WP-10: Tenant-isolation test suite, formalized and CI-gating

Status: Completed on 2026-07-11.

- Scope: GitHub Actions platform gate now runs install, lint, typecheck, local Supabase start/reset, `pnpm test:isolation`, package/app tests, and build.
- Safety gate: `pnpm test:isolation` is explicitly named as the tenant isolation gate in CI and must be configured as a required branch-protection check before Phase D starts.
- Verification:
  - `pnpm supabase:reset`
  - `pnpm test:isolation`
  - `pnpm test`
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm build`
- Checkpoint: GitHub branch protection for `main` requires pull requests, one approval, and the `Platform Gate` status check before merge.

## WP-11: Admin Portal shell

Status: Completed on 2026-07-11.

- Scope: `apps/admin-portal` shell with server-side role-scope guard and focused authorization tests.
- Notes:
  - The shell renders only for platform-scoped sessions issued by the Supabase access-token hook.
  - Exact Torrevie staff role access is covered by the admin access helper; all customer roles are denied.
- Verification:
  - `pnpm test:admin-portal`
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm build`
  - `pnpm supabase:reset`
  - `pnpm test:isolation`
  - `pnpm test`
- Acceptance: customer roles cannot access the admin portal authorization boundary; platform-scoped staff sessions can render the shell.

## WP-12: Tenant lifecycle

Status: Completed on 2026-07-11.

- Scope: Admin Portal tenant create, edit, suspend, reactivate, and archive actions.
- Notes:
  - Tenant lifecycle mutations are server-side only and require a platform-scoped session before using the server-only Supabase service-role client.
  - Every tenant lifecycle mutation writes an `audit_events` row synchronously.
- Dependency justification: added `@supabase/supabase-js` to `apps/admin-portal` for the server-only lifecycle client.
- Verification:
  - `pnpm supabase:reset`
  - `pnpm test:tenant-lifecycle`
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm build`
  - `pnpm test:isolation`
  - `pnpm test`
- Acceptance: platform staff can manage tenant lifecycle through the Admin Portal server actions, and lifecycle writes create synchronous audit events.

## WP-13: Provisioning pipeline

Status: Completed on 2026-07-11.

- Scope: `packages/provisioning`, Admin Portal provisioning status page, start-job and retry-step server actions, and service-role grants for provisioning tables.
- Notes:
  - Provisioning jobs use explicit ordered steps and keep each step independently retryable.
  - Admin Portal visibility shows job status, step status, attempts, errors, and retry controls for failed steps.
  - Provisioning state transitions write `audit_events` rows synchronously.
- Dependency justification: added `@supabase/supabase-js` to `packages/provisioning` for the Supabase-backed provisioning store.
- Verification:
  - `pnpm test:provisioning`
  - `pnpm typecheck`
  - `pnpm lint`
  - `pnpm build`
  - `pnpm supabase:reset`
  - `pnpm test:isolation`
  - `pnpm test`
- Acceptance: a failed provisioning step can be retried without re-running already succeeded steps, and provisioning status is visible in the Admin Portal.

## WP-14: Subscription management in the Admin Portal

Status: Completed on 2026-07-11.

- Scope: Admin Portal subscription assignment page, server action for assigning product plans to tenants, plan-derived entitlement materialization, CRM plan feature seed data, and service-role grants for subscription management tables.
- Notes:
  - Plan assignment derives the product from the selected plan server-side, then upserts one tenant subscription per product.
  - Subscription entitlements are rebuilt from `plan_features` whenever a plan is assigned.
  - Every subscription assignment writes an `audit_events` row synchronously.
- Verification:
  - `pnpm supabase:reset`
  - `pnpm test:subscriptions`
  - `pnpm typecheck`
  - `pnpm lint`
  - `pnpm build`
  - `pnpm test:isolation`
  - `pnpm test`
- Acceptance: assigning CRM Growth to a tenant creates entitlement rows and permission resolution allows CRM access for that tenant.

## WP-15: Customer Portal shell with localization

Status: Completed on 2026-07-11.

- Scope: Customer Portal localized shell, shared localization package, shared UI brand tokens, approved logo asset, and RTL smoke checks.
- Notes:
  - `/en` and `/ar` render the same shell with locale-specific copy and direction.
  - Customer Portal CSS uses logical properties so shared layout behavior works in LTR and RTL.
  - Shared UI tokens are built from `docs/brand/BRAND_FOR_CODEX.md`.
- Dependency justification: added `@torrevie/localization` and `@torrevie/ui` to `apps/customer-portal` for message catalogues and shared brand tokens.
- Verification:
  - `pnpm test:localization`
  - `pnpm test:customer-portal-shell`
  - `pnpm typecheck`
  - `pnpm lint`
  - `pnpm build`
  - `pnpm test:isolation`
  - `pnpm test`
  - Browser check at `http://127.0.0.1:3115/en` and `http://127.0.0.1:3115/ar`
- Acceptance: English renders LTR, Arabic renders RTL, the approved logo loads, and neither locale has horizontal overflow.

## WP-16: Customer administration screens

Status: Completed on 2026-07-11.

- Scope: Customer Portal user administration route, customer-admin domain actions, localized copy, and feature-specific tenant-isolation coverage.
- Notes:
  - Customer administration requires a customer tenant context and server-side `tenant.user.invite`, `tenant.user.manage`, and `tenant.role.assign` permission checks.
  - Customer administrators can assign only customer-scoped roles; platform and integration roles are rejected before any database call.
  - Tenant membership and role assignment writes run inside `packages/tenant-context` so `app.current_tenant_id` is set before RLS-scoped queries.
- Dependency justification: added `@torrevie/permissions` and `@torrevie/tenant-context` to `apps/customer-portal` for server-side authorization and tenant-scoped data access.
- Verification:
  - `pnpm test:customer-admin`
  - `pnpm test:customer-portal-shell`
  - `pnpm test:localization`
  - `pnpm typecheck`
  - `pnpm lint`
  - `pnpm build`
  - `pnpm test:isolation`
  - `pnpm test`
  - Browser check at `http://127.0.0.1:3116/en/admin/users` and `http://127.0.0.1:3116/ar/admin/users`
- Acceptance: a customer administrator has a tenant-scoped user and role management surface, non-admin roles are denied in server-side tests, and the isolation suite proves the feature cannot read or mutate another tenant's membership or role rows.

## WP-17: CRM schema and RLS

Status: Completed on 2026-07-11.

- Scope: CRM `accounts`, `contacts`, `pipeline_stages`, `opportunities`, and `activities` tables, tenant-aware relationships, indexes, triggers, grants, and RLS policies.
- Notes:
  - Every CRM table is tenant-scoped and has the required select, insert, update, and delete RLS policies.
  - CRM relationship foreign keys include `tenant_id` to prevent cross-tenant references even if a record id is guessed.
  - Contacts enforce per-tenant email uniqueness only when email is present.
- Verification:
  - `pnpm supabase:reset`
  - `pnpm test:isolation`
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm build`
  - `pnpm test`
  - Schema smoke query confirming four RLS policies on each CRM table
- Acceptance: the CRM schema applies from a clean reset, and tenant-isolation tests prove Tenant A cannot select, insert, update, or delete Tenant B CRM rows.

## WP-18: CRM vertical slice UI

Status: Completed on 2026-07-11.

- Scope: Customer Portal CRM route, tenant-context-aware CRM account/contact/opportunity/pipeline actions, localized CRM copy, and vertical slice smoke tests.
- Notes:
  - CRM domain actions enforce server-side permissions and CRM entitlement checks before tenant-scoped database work.
  - The smoke test creates an account, contact, and opportunity, then moves the opportunity to the next pipeline stage under local tenant RLS.
  - `/en/crm` and `/ar/crm` render the first pipeline view, with `/crm` redirecting to the English locale.
- Verification:
  - `pnpm test:crm`
  - `pnpm test:customer-portal-shell`
  - `pnpm test:localization`
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm build`
  - `pnpm test`
  - `pnpm test:isolation`
  - Browser check at `http://127.0.0.1:3117/en/crm` and `http://127.0.0.1:3117/ar/crm`
- Acceptance: a seeded tenant flow can create an account, contact, and opportunity, move the opportunity through the CRM pipeline, and render the pipeline surface in English and Arabic without horizontal overflow.

## WP-19: Audit logging integration

Status: Completed on 2026-07-11.

- Scope: CRM audit writes plus verification of the existing tenant lifecycle, provisioning, subscription, and customer-administration audit paths.
- Notes:
  - CRM pipeline initialization, account creation, contact creation, opportunity creation, and opportunity stage movement write `audit_events` rows synchronously inside tenant context.
  - CRM audit metadata is limited to operational identifiers and summary fields; full customer records are not logged.
- Verification:
  - `pnpm test:crm`
  - `pnpm test:tenant-lifecycle`
  - `pnpm test:provisioning`
  - `pnpm test:subscriptions`
  - `pnpm test:customer-admin`
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm build`
  - `pnpm test:isolation`
  - `pnpm test`
- Acceptance: every mutation path introduced through WP-18 has a representative audit assertion, including CRM opportunity stage movement.

## WP-20: Observability foundation

Status: Completed on 2026-07-11.

- Scope: shared observability package, structured request logging, correlation IDs, and server error capture hooks for both Next.js apps.
- Notes:
  - `packages/observability` emits JSON records with app, event, level, timestamp, correlation ID, request path, method, and tenant/user IDs when supplied by trusted upstream headers.
  - Both `apps/admin-portal` and `apps/customer-portal` use Next.js `proxy.ts` request hooks to set `x-correlation-id` and log request start/end records.
  - Both apps use Next.js `instrumentation.ts` and `onRequestError` to capture server errors with route context.
  - Sensitive keys such as authorization headers, cookies, passwords, tokens, API keys, and service-role keys are redacted before emission.
- Verification:
  - `pnpm test:observability`
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm build`
  - `pnpm test:isolation`
  - `pnpm test`
- Acceptance: a sample error is captured with its correlation ID, tenant ID, user ID, digest, and sanitized metadata.

## WP-21: CI pipeline

Status: Completed on 2026-07-11.

- Scope: GitHub Actions Platform Gate workflow and a CI contract smoke test.
- Notes:
  - The Platform Gate runs on every pull request and push to `main`, with manual dispatch available for recovery checks.
  - The gate follows the HLD flow: install, lint, typecheck, local Supabase start/reset, unit and smoke tests, tenant-isolation gate, build, then Supabase shutdown.
  - Workflow permissions are read-only by default, and concurrency cancels superseded runs on the same branch/ref.
  - `scripts/ci-pipeline-smoke.mjs` pins the required workflow commands and order so later edits cannot silently drop the release-blocking gates.
- Verification:
  - `pnpm test:ci-pipeline`
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm build`
  - `pnpm test:isolation`
  - `pnpm test`
- Acceptance: every pull request is gated by lint, typecheck, the unit/smoke test suite, tenant isolation, and build in the documented CI/CD order.

## WP-22: Staging environment provisioning

Status: Completed on 2026-07-11.

- Supabase staging project: `ybafzzgadjnxbidyxzws`.
- Vercel customer staging project: `torrevie-customer-portal-staging`.
- Vercel admin staging project: `torrevie-admin-portal-staging`.
- Scope:
  - Applied the full migration set through CRM schema/RLS to hosted Supabase staging.
  - Seeded baseline catalogue data plus synthetic Alpha/Beta staging tenants.
  - Created Vercel staging deployments for both portals from `main` at `ca1aba4`.
  - Configured public Supabase browser environment variables on both Vercel staging projects.
- Verification:
  - Hosted Supabase table/RLS sanity checks confirmed Tenant Alpha cannot read Tenant Beta CRM data.
  - Customer staging renders at `https://torrevie-customer-portal-staging.vercel.app/en`.
  - Admin staging renders the sign-in page at `https://torrevie-admin-portal-staging.vercel.app/login`.
  - Fresh Vercel runtime error scans for both redeployed staging projects returned no errors.
- Notes:
  - The Admin Portal still needs `SUPABASE_SERVICE_ROLE_KEY` set directly in Vercel before admin mutation routes can run against staging.
  - The hosted Supabase Auth access-token hook setting still needs dashboard confirmation before browser login can be treated as validated.

## WP-23: End-to-end staging validation

Status: Completed on 2026-07-11.

- Scope:
  - Added `scripts/staging-validation.sql` as a rollback-only hosted staging validation script.
  - Ran the script against Supabase staging project `ybafzzgadjnxbidyxzws`.
- Verification:
  - Hosted staging SQL validation passed for tenant lifecycle, provisioning retry/success state, CRM Growth subscription assignment, entitlement materialization, CRM account/contact/opportunity creation, opportunity stage movement, tenant-isolation visibility, and representative audit events.
  - Customer staging URL renders the localized portal shell.
  - Hosted Supabase Auth custom access-token hook is enabled for `public.auth_hook_add_tenant_claim`.
  - Synthetic admin Auth user signs in through Admin Portal staging and receives a platform-scoped JWT; `/` renders the Admin Portal shell with `Platform access`.
  - Synthetic customer Auth user signs in through Customer Portal staging and `/session` shows tenant `00000000-0000-4000-8000-000000023912` with `role_scope=customer`.
  - Customer Portal staging `/en/crm` renders the CRM pipeline with CRM Growth entitlement under the synthetic customer session.
  - Admin staging production redeploy `dpl_2GiQwMUJDSDYDHw9x68sEWs4ge13` is live behind `https://torrevie-admin-portal-staging.vercel.app`.
  - Admin Portal browser validation created `WP23 Browser Tenant 015648`, suspended and reactivated it, started a provisioning job that succeeded all steps, and assigned CRM Growth.
  - Hosted database confirmation for `wp23-browser-015648` shows tenant status `active`, provisioning succeeded, CRM Growth assigned, 3 entitlements, and representative audit events for tenant lifecycle, provisioning, and subscription assignment.
  - Vercel runtime error scan for admin deployment `dpl_2GiQwMUJDSDYDHw9x68sEWs4ge13` returned no errors after validation.
- Checkpoint:
  - Production provisioning in WP-24 remains a checkpoint and must not start until WP-23 full acceptance is cleared.

## WP-24: Production environment provisioning

Status: Completed on 2026-07-13.

- Supabase production project: `rhntonxblbhxsvdpmius` (`torrevie-production`) in `torrevie2026's Org`.
- Supabase production URL: `https://rhntonxblbhxsvdpmius.supabase.co`.
- Scope completed:
  - Created the hosted Supabase production project in `eu-west-2`, mirroring staging.
  - Applied the full reviewed migration set through CRM schema/RLS.
  - Seeded baseline catalogue data only: roles, permissions, products, plans, CRM plan features, and role-permission joins.
  - Enabled the Supabase Auth custom access-token hook against `public.auth_hook_add_tenant_claim`.
  - Created production Vercel projects for Admin Portal and Customer Portal from `main` at `a1f4d68`.
  - Configured public production Supabase/browser environment variables on both Vercel production projects.
  - Added `admin.torrevie.com` and `app.torrevie.com` to the matching Vercel production projects.
  - Configured Cloudflare DNS CNAME records for both production hostnames with proxy disabled.
  - Set `SUPABASE_SERVICE_ROLE_KEY` directly in the Admin Portal production Vercel project as a sensitive Production-only environment variable. Codex did not read or handle the secret value.
  - Created the first production Torrevie platform admin user and linked it to the `torrevie_platform_admin` role.
- Verification:
  - Production migration history includes platform foundation, auth hook, admin tenant lifecycle grants, provisioning grants, subscription grants, and CRM schema/RLS.
  - Baseline catalogue counts: 11 roles, 24 permissions, 5 products, 15 plans, 9 plan features, and 77 role-permission joins.
  - RLS is enabled on the checked platform and CRM public tables.
  - Direct hook smoke test returned successfully for a synthetic event without creating production tenant or user data.
  - PR #15 Platform Gate CI passed on run `29167487280`.
  - Admin production Vercel deployment `dpl_DwYJgRu5x83ccmcitkoe8nzR9S1P` is `READY`.
  - Customer production Vercel deployment `dpl_PiChzcSPJmmVAMNPQJMCA5YqwvvE` is `READY`.
  - Admin production `/login` returns HTTP 200 at the Vercel URL.
  - Customer production `/en` returns HTTP 200 at the Vercel URL.
  - `admin.torrevie.com` resolves to `ec1d49f965f4edb6.vercel-dns-017.com`, is valid in Vercel, and `/login` returns HTTP 200.
  - `app.torrevie.com` resolves to `5ce3c2ebe9f1006e.vercel-dns-017.com`, is valid in Vercel, and `/en` returns HTTP 200.
  - Admin Portal production environment variables include `SUPABASE_SERVICE_ROLE_KEY` as a sensitive Production-only variable.
  - Latest Admin Portal production deployment `dpl_3hjxnwbWLT2HmPH9uHoMym2D4ZgF` is `READY`.
  - Production database contains one active `torrevie_platform_admin` user under tenant slug `torrevie-platform`.
  - Supabase Auth custom access-token hook returns `role_scope = 'platform'` for the first platform admin user.
  - Fresh Vercel production runtime error scans for the Admin Portal returned no errors after the service-role env redeploy.

## WP-25: First production release

Status: Completed on 2026-07-13.

- Scope:
  - Human production login smoke test completed against `https://admin.torrevie.com`.
  - Admin Portal shell rendered for `dev@torrevie.com`.
  - The shell showed `Platform access`.
- Verification:
  - Browser screenshot supplied by Semaan on 2026-07-13.
- Acceptance:
  - `admin.torrevie.com` is reachable, the platform admin can sign in, and the Control Plane shell renders.

## Open Questions

- None for the completed foundation sequence.

## WP-26: FSM alignment audit and safety net

Status: Completed on 2026-07-13.

- Scope:
  - Added the FSM audit documentation structure under `docs/fsm/`.
  - Added `docs/fsm/STAGING_STATE.md` with confirmed staging stack, routes, navigation, enums, tables, database functions, Edge Functions, provider usage, and RLS inventory.
  - Added `docs/fsm/PLATFORM_MAPPING.md` mapping staging tenancy, roles, modules, entitlements, jobs, channels, functions, and files to the platform architecture.
  - Added `docs/fsm/reports/PHASE_0.md`.
  - Added `pnpm test:fsm-phase0` as a named wrapper around the existing auth tenant-claim and tenant-context smoke tests.
  - Excluded `reference/` from Git ignore, Prettier, and ESLint processing.
- Decisions:
  - Used `docs/architecture/PROGRESS.md` because no root `PROGRESS.md` exists.
  - Mapped prompt references to `organizations` onto platform `tenants`.
  - Treated the existing platform plans and entitlements tables as the starting point for FSM plan work.
  - Treated the responsive technician PWA as the implementation target until a Flutter checkpoint is explicitly approved.
- Verification:
  - `pnpm test:fsm-phase0`
  - `pnpm lint`
  - `pnpm typecheck`
- Acceptance:
  - Staging export is present under `reference/fsm-staging/`.
  - Route, table, function, Edge Function, and RLS inventory are documented.
  - Mapping conflicts and platform resolutions are documented.
  - No FSM schema, route, entitlement, or provider implementation was introduced.

## WP-27: FSM segmentation and plans

Status: Completed on 2026-07-13.

- Scope:
  - Added `business_segment` and `plan_tier` enums and tenant-level FSM configuration columns.
  - Seeded FSM Entry, Growth, and Enterprise plan features through the platform plan and entitlement tables.
  - Added `org_feature_overrides` with RLS, audit support, expiry, and reason metadata.
  - Added `public.get_org_entitlements(org_id)` to merge active subscription entitlements with active overrides.
  - Added Admin Portal controls for FSM segment, plan tier summary, and feature overrides.
  - Added server-side FSM seat-limit checks in customer and staff tenant-user invitation flows.
  - Updated RBAC documentation and permission seeds for `fsm.settings.manage` and `fsm.entitlement.override`.
- Decisions:
  - Used platform `tenants` where the prompt named `organizations`.
  - Reused the existing platform subscription and entitlement model instead of adding a parallel FSM entitlement layer.
  - Restricted FSM feature overrides to Torrevie platform and billing roles.
  - Counted `customer_standard_user` as an FSM field user and customer admin, module admin, manager, and readonly roles as FSM office users until FSM product roles are introduced.
  - Added explicit grants for new public schema objects alongside RLS.
- Verification:
  - `pnpm supabase:reset`
  - `pnpm exec supabase db advisors --local`
  - `pnpm test`
  - `pnpm test:fsm-entitlements`
  - `pnpm test:isolation`
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm build`
- Acceptance:
  - Entry tenants do not receive PM, SLA, inspections, or contracts from plan entitlements.
  - A feature override grants PM above Entry in the smoke test.
  - Tenant isolation tests cover `org_feature_overrides`.
  - Seat limits are enforced server-side in user invitation paths.
- Report:
  - `docs/fsm/reports/PHASE_1.md`
