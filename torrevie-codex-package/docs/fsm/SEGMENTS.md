# Torrevie FSM Segments

Torrevie FSM adapts by business segment. Segment answers how the organization operates. Industry answers what the organization services.

## Segment Model

| Segment | Name | Default tier | Primary intake | Operating model |
|---|---|---|---|---|
| `SOLO` | Independent Operator | Entry | WhatsApp | Direct job creation, same-day quotes, simple invoicing |
| `TRADE` | Specialist Trade Contractor | Growth | WhatsApp and phone | Reactive jobs plus PM, contracts, quotes, and SLA |
| `FM` | Facility Management Company | Enterprise | Hotline, helpdesk, WhatsApp | SLA triage, dispatch, checklists, reporting |
| `COMMUNITY` | Building and Community Management | Growth or Enterprise | Hotline, WhatsApp, portal | Resident requests, approvals, common-area PPM, board reports |
| `OEM` | Manufacturer After-Sales and Service | Enterprise | Email, hotline, portal | Install base, warranty, serials, parts, dealer dispatch |

## Detection

Onboarding stores answers in `tenants.onboarding_answers` and derives a suggested segment from:

- Who the organization serves.
- How requests arrive today.
- Field team size.

The user can override the suggestion. The confirmed value is stored in `tenants.business_segment`.

## What Segment Controls

- Navigation order through `apps/customer-portal/config/navProfiles.ts`.
- Terminology through `apps/customer-portal/config/terminology.ts`.
- Default flow through `apps/customer-portal/config/fsmSegments.ts`.
- Suggested plan tier during onboarding.

Segment does not replace entitlements. Entitlements still decide whether a surface is available.
