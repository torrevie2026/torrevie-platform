# Phase 3 Report: WP-29 Channel Hub Core

Date: 2026-07-13

## Scope

- Added Channel Hub schema for tenant channels, channel credentials, intake requests, and call logs.
- Added channel enums, status enums, indexes, triggers, grants, RLS policies, and isolation tests.
- Added `get_org_channel_usage(org_id)` for channel usage summaries.
- Added provider-neutral TypeScript interfaces for WhatsApp, voice, and email adapters.
- Added Channel Hub data access for channels, intake requests, and call logs.
- Added a Channel Hub section inside Torrevie FSM with unified triage, channel summaries, recent call logs, and a manual intake request form.

## Migration

- `supabase/migrations/20260713153000_fsm_channel_hub_core.sql`

## Decisions

- Used platform `tenant_id` and RLS patterns instead of staging `organization_id`.
- Used `org_channel_credentials` for channel credential records. It is granted to `service_role` only, not browser-authenticated roles.
- Kept provider names as channel configuration values and added adapter interfaces so business logic does not depend on provider-specific code.
- Did not add `jobs.source_channel` or `jobs.intake_request_id` yet because this platform repository does not have an FSM jobs table. This is a prompt-to-repository sequencing conflict, and job stamping must land with the FSM jobs schema.
- Added a manual intake form as a development and operations bridge until WhatsApp, portal, and email webhooks are wired to Edge Functions.

## Verification

- `pnpm supabase:reset`
- `pnpm test:isolation`
- `pnpm exec supabase db advisors --local`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`

All gates passed locally.

## Known Gaps

- WhatsApp, email, and portal webhook Edge Functions are not implemented in this slice.
- The public `/r/{org_slug}` portal and QR poster are not implemented yet.
- Intake-to-job conversion remains blocked until the FSM job table exists.
- Channel registration limit enforcement is not yet exposed in a customer-facing setup flow.

## Manual Actions

- No provider accounts, secrets, DNS records, phone numbers, or billed resources were created.
