# Phase 4 Report: WP-30 Voice Agent Core

Date: 2026-07-13

## Scope

- Added provider-neutral voice utilities for assistant scripts, setup path selection, Vapi webhook normalization, Twilio missed-call deflection XML, and monthly minute-cap warnings.
- Added a Channel Hub voice setup request flow. Growth tenants with the voice add-on and Enterprise tenants can create a pending voice channel without provisioning external resources.
- Added voice usage display in Channel Hub from the current month's `call_logs`.
- Added `supabase/functions/voice-webhook` for Vapi tool calls and end-of-call reports.
- Added tool handling for `identify_caller`, `create_service_request`, `check_job_status`, and `escalate_to_human`.
- Added call-log creation with transcript, recording URL, estimated cost, and linked intake request.
- Added `pnpm test:fsm-voice-core` and included it in the normal test chain.
- Documented server-only voice provider placeholders in `.env.example`.

## Migration

- No migration was added in this phase.
- WP-30 reused `org_channels`, `org_channel_credentials`, `intake_requests`, and `call_logs` from WP-29.

## Decisions

- Kept live provider provisioning out of scope until the required billing checkpoint is explicitly cleared.
- Stored voice setup state in `org_channels.config` because WP-29 already introduced the tenant-scoped channel configuration record.
- Treated Path A as the default setup path: the customer forwards an existing number to the provider-hosted assistant number.
- Treated Path C as a Twilio missed-call deflection path that returns TwiML and creates intake through the same pipeline.
- Required a per-channel webhook secret stored through `org_channel_credentials`. The Edge Function rejects calls without `x-torrevie-channel-id` and a matching bearer or channel-secret value.
- Returned `not_available` for `check_job_status` because the FSM jobs table is not present in this repository yet.
- Used the existing CRM `contacts` table for caller identification by phone number.

## Verification

- `pnpm test:fsm-voice-core`
- `pnpm lint`
- `pnpm typecheck`

All gates passed locally before this report was written.

## Known Gaps

- A real Vapi assistant was not provisioned.
- No Twilio number, Vapi-native number, SIP trunk, or UAE licensed telephony partner was configured.
- The Edge Function is ready for deployment, but it still needs hosted Supabase function deployment and per-channel secret insertion before live calls can be accepted.
- Intake-to-job conversion remains blocked until the FSM jobs schema exists.
- `check_job_status` cannot return live FSM job state until the jobs table and state machine land.

## Manual Actions

- Confirm before creating any Vapi account, Twilio account, phone number, SIP trunk, or UAE telephony provider resource.
- Set voice provider secrets in hosted Supabase or Vercel environments only. Never commit real values.
- For each live voice channel, create a `voice_webhook_secret` credential row and configure the provider webhook to send `x-torrevie-channel-id` plus the secret.
