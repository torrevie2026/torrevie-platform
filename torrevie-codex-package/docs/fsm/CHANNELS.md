# Torrevie FSM Channels

The Channel Hub is the unified intake surface for Torrevie FSM. Every source writes to `intake_requests`.

## Tables

- `org_channels`: tenant channel registrations and provider configuration.
- `org_channel_credentials`: per-channel secrets. Authenticated browser users have no grant to this table.
- `intake_requests`: unified service request intake.
- `call_logs`: voice call metadata, transcript, recording URL, and cost estimate.

## Channel Types

| Channel | Status |
|---|---|
| WhatsApp | Modelled in Channel Hub. Provider adapters are defined. |
| Voice | Voice setup flow and Vapi webhook core are implemented. Live provisioning requires a checkpoint. |
| Email | Modelled in Channel Hub. Inbound provider webhook is pending. |
| Portal | Modelled in Channel Hub. Public portal endpoint is pending. |

## Voice Webhook Security

`supabase/functions/voice-webhook` requires:

- `x-torrevie-channel-id`.
- A bearer token or `x-torrevie-channel-secret`.
- A matching `voice_webhook_secret` row in `org_channel_credentials`.

The webhook applies a per-channel in-memory rate limit of 120 requests per minute. Production deployments should add provider-level rate controls and edge firewall rules before live traffic.

## Portal Rate Limit Policy

Public portal intake uses the local policy `fsm.portal.intake`:

- 20 requests per identity per minute.
- Identity should be derived from tenant slug plus IP or verified captcha token when the public endpoint is implemented.

## Live Provider Checkpoints

Stop before creating or configuring:

- Vapi accounts or assistants.
- Twilio accounts or phone numbers.
- WhatsApp provider instances.
- Inbound email domains.
- UAE SIP trunks or licensed telephony partner resources.

No channel provider credentials are committed to the repository.
