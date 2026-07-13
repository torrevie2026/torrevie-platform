# Phase 6 Report: WP-32 FSM Hardening

Date: 2026-07-13

## Scope

- Expanded Channel Hub RLS coverage for `org_channel_credentials`.
- Added local FSM rate-limit policy utilities.
- Added in-memory rate limiting to the voice webhook.
- Added `pnpm test:fsm-hardening` and included it in the normal test chain.
- Added FSM operating documentation:
  - `docs/fsm/SEGMENTS.md`
  - `docs/fsm/ENTITLEMENTS.md`
  - `docs/fsm/CHANNELS.md`
  - `docs/UAT.md`
- Updated the root README with Torrevie FSM references and checkpoint notes.

## Migration

- No migration was added in this phase.
- The existing Channel Hub schema already contains the tenant-scoped tables required for the added RLS tests.

## Decisions

- Used a local deterministic rate-limit utility for tests and policy documentation.
- Added equivalent in-memory throttling inside `supabase/functions/voice-webhook` because Supabase Edge Functions cannot import from the Next app package.
- Treated provider-level rate controls and firewall rules as deployment tasks for the first live channel rollout.
- Kept load testing as a local smoke test because no public portal endpoint or live provider endpoint exists yet.

## Verification

- `pnpm test:fsm-hardening`
- `pnpm test:isolation`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`

## Known Gaps

- Public portal endpoint rate limiting will be wired when the endpoint is implemented.
- Email and WhatsApp inbound webhook load tests will land when those Edge Functions exist.
- Voice webhook Deno type checking still requires Deno in the local Windows environment.
- No external provider load test was run because no live provider resources were created.

## Manual Actions

- Before live voice or public portal launch, configure provider-level throttling and edge firewall controls.
- Before live channel setup, create provider accounts and secrets only after the explicit checkpoint.
