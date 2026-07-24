# FSM Route Inventory

Date: 2026-07-24

This inventory freezes the current FSM customer workspace routes before the next upgrade pass.

## Current Route Model

FSM currently renders from the shared customer portal route:

- `/[locale]/fsm`
- `/[locale]/fsm?section={section}`

The shell resolves tenant context, FSM workspace settings, segment navigation, entitlements, Channel Hub data, and ROI data server-side.

The current implementation lives in:

- `apps/customer-portal/app/[locale]/fsm/page.tsx`
- `apps/customer-portal/app/[locale]/fsm/actions.ts`
- `apps/customer-portal/lib/fsm/index.ts`
- `apps/customer-portal/lib/fsm/channels.ts`
- `apps/customer-portal/lib/fsm/roi.ts`
- `apps/customer-portal/config/navProfiles.ts`
- `apps/customer-portal/config/fsmSegments.ts`
- `apps/customer-portal/config/terminology.ts`

## Section Status

| Section     | URL                        | Current status                                                                      | Next migration need                                                                                    |
| ----------- | -------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Dashboard   | `/fsm`                     | Adaptive dashboard shell with segment widgets and getting-started card.             | Replace placeholder values with live FSM job, intake, invoice, SLA, and technician metrics.            |
| Onboarding  | `/fsm?section=onboarding`  | Five-step onboarding form exists.                                                   | Add industry default seeding, CSV import templates, and mandatory channel completion checks.           |
| Channel Hub | `/fsm?section=channels`    | Channel snapshot, manual intake, and voice setup request surfaces exist.            | Complete WhatsApp, email, portal, and voice webhooks into one intake pipeline.                         |
| Reports     | `/fsm?section=reports`     | ROI dashboard shell exists.                                                         | Connect to real jobs, invoices, SLA, after-hours intake, monthly value email, and client report packs. |
| Jobs        | `/fsm?section=jobs`        | Section shell renders.                                                              | Build work-order list, detail, state changes, assignment, photos, and audit actions.                   |
| Scheduling  | `/fsm?section=scheduling`  | Section shell renders.                                                              | Build calendar, dispatch board, technician assignment, and route hints.                                |
| Dispatch    | `/fsm?section=dispatch`    | Section shell renders for FM navigation.                                            | Decide whether this remains an alias of Scheduling or becomes a dispatch-specific view.                |
| PM          | `/fsm?section=pm`          | Section shell renders behind PM entitlement.                                        | Build PM schedules, templates, generation, and planner views.                                          |
| SLA         | `/fsm?section=sla`         | Section shell renders behind SLA entitlement.                                       | Build SLA board, pause tracking, client delay tracking, and breach prioritization.                     |
| Contracts   | `/fsm?section=contracts`   | Section shell renders behind contract or warranty entitlement depending on segment. | Build contracts, renewal tracking, contract coverage, and warranty rules.                              |
| Customers   | `/fsm?section=customers`   | Section shell renders with segment terminology.                                     | Connect to platform contacts and FSM site metadata.                                                    |
| Assets      | `/fsm?section=assets`      | Section shell renders with segment terminology.                                     | Build assets, common areas, install base, serials, QR codes, and warranty metadata.                    |
| Technicians | `/fsm?section=technicians` | Section shell renders with segment terminology.                                     | Connect to tenant users plus FSM technician profiles, skills, zones, and status.                       |
| Commercial  | `/fsm?section=commercial`  | Section shell renders.                                                              | Build quotations, invoices, service catalog, and document footer behavior.                             |
| WhatsApp    | `/fsm?section=whatsapp`    | Section shell renders behind WhatsApp entitlement.                                  | Preserve migrated UltraMsg behavior and add Wappfly default through provider adapter.                  |
| Triage      | `/fsm?section=triage`      | Section shell renders for FM, COMMUNITY, and OEM profiles.                          | Point to `intake_requests`, with convert, merge, reply, spam, and SLA countdown actions.               |
| Approvals   | `/fsm?section=approvals`   | Section shell renders for COMMUNITY.                                                | Build cost threshold and chargeable resident approval workflow.                                        |
| Catalog     | `/fsm?section=catalog`     | Section shell renders for OEM spare parts.                                          | Build service catalog and parts reservation basics.                                                    |
| Settings    | `/fsm?section=settings`    | Section shell renders.                                                              | Add FSM flow settings, ROI constants, channel defaults, document defaults, and terminology preview.    |

## Segment Navigation Coverage

| Segment   | Current top-level navigation                                                                                                                                           |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SOLO      | Today, Jobs, WhatsApp Inbox, Customers, Quotes and Invoices, ROI, Settings, Onboarding                                                                                 |
| TRADE     | Dashboard, Jobs, Scheduling, PM Calendar, Contracts, Customers, Assets, Quotes and Invoices, WhatsApp Inbox, Reports, Settings, Onboarding                             |
| FM        | Command Center, Triage, Jobs, Scheduling and Dispatch, PPM Planner, SLA Board, Sites and Assets, Contracts, Subcontractors, Channel Hub, Reports, Settings, Onboarding |
| COMMUNITY | Command Center, Requests, Jobs, PPM Planner, Units and Residents, Common Areas, Approvals, Channel Hub, Board Reports, Settings, Onboarding                            |
| OEM       | Dashboard, Service Requests, Work Orders, Install Base, Warranty and Contracts, Spare Parts, Dealers and Technicians, Channel Hub, Reports, Settings, Onboarding       |

## Browser Smoke Requirement

The next FSM test pass should verify:

- Command: `pnpm test:fsm:browser`
- `/en/fsm` renders the shell.
- `/ar/fsm` renders the shell with RTL direction.
- Every visible navigation item opens a page with the expected heading.
- Feature-gated navigation is hidden when the entitlement is missing.
- Channel Hub and ROI load their server data only when their sections are active.
- Mobile width preserves navigation, headings, actions, and panel text without overlap.

## Immediate Risk List

- Many sections are route-safe shells, not complete workflows.
- `dispatch` may duplicate `scheduling` unless the product behavior is defined.
- `commercial` combines quotations and invoices for now.
- WhatsApp Inbox and Channel Hub overlap until provider adapter migration is complete.
- Reports currently mix ROI and client reporting in one section.
- Arabic uses English terminology fallback, which is structurally ready but not translated.

## Next Implementation Order

1. Add browser smoke coverage for the current route inventory.
2. Build Jobs as the first real FSM operational workflow.
3. Connect Customers, Assets, and Technicians to the Jobs workflow.
4. Convert WhatsApp, portal, and email intake into one Triage workflow.
5. Expand Channel Hub only after the intake tables and route smoke tests are stable.
