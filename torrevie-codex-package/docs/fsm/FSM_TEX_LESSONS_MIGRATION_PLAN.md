# FSM Migration Plan From TEX Lessons

Date: 2026-07-24

This document converts the TEX production migration lessons into the working plan for the FSM upgrade and migration.

FSM must not be copied as a standalone application into the platform. The staging export remains a functional reference. The platform remains the system of record for authentication, tenancy, subscriptions, entitlements, provider settings, storage, audit, and production operations.

## What TEX Proved

TEX reached production because the migration treated the old product as source material, not as architecture. That is the core lesson for FSM.

The practical lessons are:

- Product routes must live inside the shared customer portal.
- Product APIs must use shared platform authentication and tenant context.
- Product data must use tenant-scoped platform tables and RLS.
- Product settings must not create a second admin system.
- Provider setup must sit in shared platform integration controls.
- Every critical mutation must write audit events.
- Every page must render a real operational state, not a placeholder.
- Navigation must be verified in the browser after every route change.
- Production readiness requires live staging or production-candidate checks, not only local tests.

For FSM this means we port the operating workflows, not the Lovable app shell.

## FSM Product Standard

FSM should feel like an operations control room, not a marketing site.

The product behavior standard is:

- A signed-in tenant lands on useful work immediately.
- Menus show only the surfaces that tenant can use.
- No navigation item opens a blank, generic, or wrong page.
- Empty states explain the next action in plain language.
- Every workflow has a visible status, owner, date, and next step.
- Mobile technician workflows are first-class in the responsive app until a Flutter checkpoint is approved.
- Admin setup is guided, but day-to-day work stays dense and fast.
- Channel setup shows provider status, last test result, and next action.
- Downgraded or trial-expired features lock without deleting data.
- Reports prove value with live platform data, not static copy.

## Migration Principles

Use these rules before starting any FSM package.

1. Shared platform concepts win.

   FSM must use platform tenants, memberships, RBAC, subscriptions, entitlements, storage, audit events, and provider settings. Staging concepts such as `organizations`, product-local roles, and product-local modules are mapped only where needed for data import or compatibility.

2. Build the spine first.

   The spine is tenant context, entitlements, navigation, onboarding, jobs, customers, assets, technicians, and audit. Channel Hub, voice, PM, SLA, contracts, and analytics should attach to that spine.

3. Keep pages shared and adaptive.

   Do not create separate SOLO, TRADE, FM, COMMUNITY, and OEM pages. Use segment profiles, terminology packs, dashboard registries, and flow settings to adapt shared pages.

4. Isolate providers behind adapters.

   WhatsApp, voice, email, maps, reports, and AI must have adapter boundaries. Business logic should call provider-neutral interfaces.

5. Verify every route like a user.

   TEX had late polish around navigation and duplicated controls. FSM should prevent that earlier with browser smoke scripts for every top-level nav item and every segment profile.

6. Do not ship hidden setup work.

   Setup screens must show current state. A connected channel must show provider, status, credential health without revealing secrets, last inbound event, and last outbound test.

7. Production checks are separate from local checks.

   Local tests prove code behavior. Production-candidate verification proves environment, Supabase RLS, storage policies, cron, webhooks, and domains.

## Recommended FSM Workstreams

### 1. Control Plane And Entitlements

Goal: make FSM controllable from Admin Portal before expanding customer workflows.

Deliver:

- FSM plan assignment and trial status.
- Feature entitlement resolver for all FSM surfaces.
- Seat limit enforcement for office users and field users.
- Segment, plan, channel, and module controls on tenant detail.
- Read-only lock behavior for features above tier.

Gate:

- A new Entry tenant cannot access PM, SLA, inspections, contracts, voice, or advanced reports.
- A platform admin override grants one feature without changing the plan.
- Existing tenants retain their active access.

### 2. Customer Workspace Shell

Goal: make every FSM route reliable before deep workflow expansion.

Deliver:

- Segment-aware navigation.
- Terminology hook.
- Segment-specific dashboard widgets.
- Working pages for Jobs, Scheduling, PM, Contracts, Clients, Assets, Quotes and Invoices, WhatsApp Inbox, Reports, Settings, and Onboarding.
- Browser smoke coverage for each top-level navigation item.

Gate:

- Five test tenants, one per segment, show the correct menus and terms.
- Every menu item opens the intended section.
- Each section has a useful empty state and next action.

### 3. Core Field Operations

Goal: make the job lifecycle usable without depending on every channel.

Deliver:

- Work orders with status history.
- Customer, site, asset, and technician relationships.
- Scheduling and assignment.
- Quote, invoice, and service report basics.
- Technician responsive PWA flow.

Gate:

- A dispatcher creates a job, assigns a technician, completes work, and issues an invoice.
- A technician can open assigned work on mobile and update status.
- Audit events exist for status changes and commercial document actions.

### 4. Channel Hub

Goal: make all intake sources feed one pipeline.

Deliver:

- `org_channels`, `org_channel_credentials`, `intake_requests`, and `call_logs`.
- WhatsApp adapter refactor with Wappfly default and UltraMsg compatibility.
- Portal intake and QR request path.
- Email intake adapter and parsing endpoint.
- Triage queue reading `intake_requests`.

Gate:

- WhatsApp, portal, and email submissions appear in one triage queue.
- Conversion stamps the created job with source channel and intake request.
- Channel limits are enforced by entitlements.
- Provider credentials never reach browser code.

### 5. Voice Hotline

Goal: add AI voice without turning Torrevie into a telecom operator.

Deliver:

- Voice provider adapter.
- Vapi webhook and tool handlers.
- Caller identification, service request creation, job status lookup, and human escalation tools.
- Call logs with transcript, recording URL, outcome, and estimated cost.
- Minute caps and usage display.
- Setup copy for customer-side forwarding and licensed local partner paths.

Gate:

- A test call creates an intake request and call log.
- Known callers are matched by phone.
- Minute caps warn at 80 percent and block when configured.
- No live number, assistant, SIP trunk, or paid resource is created without approval.

### 6. ROI And Reporting

Goal: show value inside the product.

Deliver:

- ROI dashboard from live FSM data.
- Baseline metrics captured during onboarding.
- Monthly value email.
- Enterprise client report pack for FM and COMMUNITY.
- PDF footers with tenant identity and Torrevie legal footer.

Gate:

- ROI dashboard renders real values from seeded data.
- Before and after baseline deltas display correctly.
- Enterprise white-label entitlement controls footer removal.

### 7. Production Hardening

Goal: prove FSM can survive production use.

Deliver:

- RLS tests for all new FSM tables.
- Intake webhook load test.
- Portal and voice rate limits.
- Storage policy verification.
- Production-candidate browser smoke.
- UAT script per segment.

Gate:

- Cross-tenant reads and writes fail in tests.
- Browser smoke passes for English and Arabic route shells.
- Production-candidate checks pass before merge to production.

## Page Behavior Guidelines

Every FSM page should follow this checklist:

- The page title matches the tenant segment terminology.
- The primary action is visible above the fold.
- Filters and tabs do not move the layout when data changes.
- Empty states include one useful action.
- Loading states preserve the final layout shape.
- Errors include the failed action and recovery step.
- The page does not expose feature names that the tenant is not entitled to use.
- RTL layout does not assume left-side navigation or left-to-right reading order.

## Channel Hub Guidelines

Channel Hub should inherit the TEX integration discipline, but with FSM-specific intake depth.

Each channel card should show:

- Channel type.
- Provider.
- Status.
- Last inbound event.
- Last outbound test.
- Monthly usage.
- Entitlement limit.
- Setup next step.

Each channel setup flow should:

- Store secrets server-side only.
- Test the connection before marking active.
- Write audit events for create, update, suspend, and test actions.
- Create no paid provider resource without approval.
- Explain UAE voice routing as customer-side forwarding or licensed partner routing.

## Verification Standard

FSM should add these checks as the migration progresses:

- `pnpm test:fsm`
- `pnpm test:fsm:browser`
- `pnpm test:fsm:rls`
- `pnpm verify:fsm:staging`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`

The browser test must cover:

- `/en/fsm`
- `/ar/fsm`
- each top-level section for the selected segment
- onboarding
- Channel Hub
- mobile technician viewport

The production-candidate verifier must cover:

- Supabase RLS.
- Storage policies.
- Edge Function secrets.
- Webhook reachability.
- Cron or scheduled jobs.
- Public portal rate limiting.

## First Execution Block

The next practical block for FSM should be:

1. Freeze the current FSM page map.
2. Add browser smoke coverage for all current FSM navigation items.
3. Confirm Admin Portal tenant controls for FSM subscription, segment, plan, and trial state.
4. Define the FSM route inventory and mark each route as ready, shell-only, or missing.
5. Start Channel Hub only after the route and entitlement spine is stable.

This avoids the main failure mode of product migrations: adding deep features before the tenant can reliably find, access, and use the core workspace.
