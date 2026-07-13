# Torrevie SaaS Platform

Torrevie is the operational intelligence platform for CRM, FSM, TEX, CME, and LQS.
This repository is the modular-monolith implementation described in
`docs/architecture/HLD.md`.

## Current Status

The repository is being built in ordered work packages from
`docs/architecture/WORK_PACKAGES.md`. Progress is tracked in
`docs/architecture/PROGRESS.md`.

## Torrevie FSM

Torrevie FSM is the Field Service Management product in the platform. Current FSM references:

- `docs/fsm/SEGMENTS.md`
- `docs/fsm/ENTITLEMENTS.md`
- `docs/fsm/CHANNELS.md`
- `docs/UAT.md`

Live channel providers, phone numbers, SIP trunks, inbound email domains, and other billed resources require an explicit checkpoint before setup.

## Development

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
```

Supabase, application shells, tenant isolation, and deployment automation are added
in later work packages. No secrets belong in this repository; use `.env.example` as
the template for local-only values.
