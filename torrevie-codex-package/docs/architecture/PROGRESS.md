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

## Open Questions

- None.
