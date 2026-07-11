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

## Open Questions

- None.
