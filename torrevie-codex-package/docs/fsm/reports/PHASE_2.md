# Phase 2 Report: WP-28 FSM Adaptive UX and Onboarding

Date: 2026-07-13

## Scope

- Added data-driven FSM segment configuration for detection, suggested plan tier, dashboard widgets, and default flow settings.
- Added `config/navProfiles.ts` with one navigation profile per business segment and entitlement-based filtering.
- Added `config/terminology.ts` with locale-aware terminology packs and Arabic-ready structure.
- Added a client-side `useTerm` hook and provider for components that need runtime terminology lookup.
- Added the customer portal `/fsm` route with adaptive navigation, dashboard widgets, terminology preview, default flow display, and onboarding entry point.
- Added a five-step onboarding form that stores segment answers, confirmed segment, plan tier, baseline metrics, activated channel, terminology profile, nav profile, and flow settings on the tenant.
- Added audit logging for FSM onboarding completion.
- Updated the app launcher so subscribed FSM tenants can open Torrevie FSM.

## Files

- `apps/customer-portal/config/fsmSegments.ts`
- `apps/customer-portal/config/navProfiles.ts`
- `apps/customer-portal/config/terminology.ts`
- `apps/customer-portal/lib/fsm/index.ts`
- `apps/customer-portal/lib/fsm/useTerm.tsx`
- `apps/customer-portal/app/[locale]/fsm/page.tsx`
- `apps/customer-portal/app/[locale]/fsm/actions.ts`
- `apps/customer-portal/app/fsm/page.tsx`
- `scripts/fsm-adaptive-ux-smoke.ts`

## Decisions

- Implemented the adaptive FSM route as one shared page. Segment profiles rename, reorder, and hide surfaces instead of forking pages.
- Used the WP-27 `tenants` fields for segment, plan summary, profiles, onboarding answers, baseline metrics, and flow settings.
- Filtered menu items by `get_org_entitlements(public.current_tenant_id())`.
- Kept Arabic content as English fallback while preserving the locale-aware structure and RTL-safe layout.
- Stored channel activation choice in onboarding answers. Real Channel Hub tables and provider setup remain WP-29.

## Verification

- `pnpm test:fsm-adaptive-ux`
- `pnpm test`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm build`

All gates passed locally.

## Known Gaps

- Industry default seeding is represented in the onboarding save path but the staging `apply-industry-defaults` behavior is not ported yet. That belongs with FSM defaults and Channel Hub work.
- Dashboard widget values are placeholders until WP-29 and later FSM operational tables exist.
- CSV import templates and QR poster generation are not included in this slice.
- The onboarding form is server-rendered as a single five-step page. A richer client stepper can be added once the FSM route has live operational data.

## Manual Actions

- No provider accounts, secrets, DNS records, phone numbers, or billed resources were created.
