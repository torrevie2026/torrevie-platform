# Phase 1 Report: WP-27 FSM Segmentation and Plans

Date: 2026-07-13

## Scope

- Added tenant-level FSM business segment and commercial plan tier fields.
- Seeded FSM Entry, Growth, and Enterprise plan features through the platform plan and entitlement model.
- Added feature override support with expiry, reason, audit events, RLS, and isolation tests.
- Added `get_org_entitlements(org_id)` as the merged entitlement resolver for plan grants and overrides.
- Added Admin Portal controls for FSM segment, tier summary, and feature overrides.
- Added server-side FSM seat-limit enforcement in customer and staff tenant-user invite paths.

## Migration

- `supabase/migrations/20260713140000_fsm_segmentation_plans.sql`

The migration maps the prompt's `organizations` terminology to platform `tenants`, per `AGENTS.md` and the Phase 0 mapping. Existing tenants are backfilled to `business_segment = TRADE` and `plan_tier = growth`. New tenants keep the additive default `plan_tier = entry`.

## Decisions

- Reused the existing `products`, `plans`, `plan_features`, `subscriptions`, and `subscription_entitlements` model instead of creating a parallel FSM entitlement system.
- Used FSM plan keys `entry`, `growth`, and `enterprise` under the existing FSM product.
- Kept `tenants.plan_tier` as a tenant summary and onboarding default. Runtime enforcement reads entitlements through `get_org_entitlements`.
- Restricted `fsm.entitlement.override` to Torrevie platform and billing roles. Customer admins can manage FSM settings, but cannot grant above-tier features.
- Mapped current generic customer roles to FSM seat categories until FSM product roles are introduced: `customer_standard_user` counts as field, and admin, module admin, manager, and readonly count as office.
- Added explicit grants for new public schema objects because current Supabase Data API behavior may require grants in addition to RLS.

## Verification

- `pnpm supabase:reset`
- `pnpm exec supabase db advisors --local`
- `pnpm test`
- `pnpm test:fsm-entitlements`
- `pnpm test:isolation`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`

All gates passed locally.

## Known Gaps

- FSM-specific dispatcher and technician roles do not exist yet. Seat-limit enforcement uses the current platform customer roles until WP-28 introduces adaptive FSM UX and role-facing flows.
- Module activation UI is prepared through Admin Portal controls and entitlements, but customer-facing module toggle UX is deferred to WP-28.
- Supabase types were not regenerated because this repository currently has no generated Supabase types package or generation script.

## Manual Actions

- No provider accounts, secrets, DNS records, phone numbers, or billed resources were created.
