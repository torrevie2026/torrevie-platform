# TEX Self-Enrolled SaaS Work Package Plan

| Field | Value |
| --- | --- |
| Product | TEX |
| Source LLD | `docs/architecture/TEX_LLD_V2.md` |
| Date | 17 July 2026 |
| Status | Draft for execution planning |

This plan phases the revised TEX direction into executable work packages. It assumes TEX remains inside the existing Torrevie modular monolith, uses the shared Supabase database, keeps tenant isolation through RLS, and does not create a separate TEX deployment.

## Phase 0: Product Alignment and Release Guardrails

### WP-TEX-00: Approve TEX LLD v2 and defaults

Objective: lock the product rules before implementation.

Allowed: documentation only.

Requirements:
- Approve Trial, Lite, Growth, and Enterprise definitions.
- Confirm default Trial duration: 15 days.
- Confirm default Trial employee limit: 5.
- Confirm default Lite employee limit: 15.
- Confirm default Growth employee limit: 75.
- Confirm missing OCR currency behavior: default to tenant currency with audit-visible note.

Tests: none.

Acceptance:
- `TEX_LLD_V2.md` is approved or annotated with open decisions.
- Default limits are captured in a single source of truth.

Dependencies: none.

Checkpoint: stop for business approval before schema or production behavior changes.

## Phase 1: Plan, Trial, and Onboarding Foundation

### WP-TEX-01: TEX plan model and entitlement metadata

Objective: introduce server-side TEX plan resolution for `trial`, `lite`, `growth`, and `enterprise`.

Allowed:
- `apps/customer-portal/lib/tex.ts`
- `apps/customer-portal/lib/tex/*` if split is needed
- existing subscription/entitlement tables if metadata is already available
- root `supabase/migrations`
- root `supabase/tests`

Requirements:
- Resolve current tenant TEX plan and status.
- Resolve employee limit, provider scope, and trial dates.
- Add API/domain helpers to enforce plan rules.
- Every plan-sensitive mutation must check the plan server-side.

Tests:
- Unit/API tests for plan resolution.
- Tenant-isolation tests for any new tenant-scoped table.

Acceptance:
- A Trial tenant receives Trial/Lite capability only.
- A Growth tenant unlocks Growth capability.
- A Lite tenant cannot access Growth provider setup through API calls.

Dependencies: WP-TEX-00.

### WP-TEX-02: Trial provisioning from self-enrollment

Objective: make `app.torrevie.com/tex` able to create a self-enrolled Trial tenant.

Allowed:
- Customer portal public TEX entry route.
- Shared auth/provisioning path.
- Tenant/product entitlement provisioning code.
- Audit logging.

Requirements:
- Unauthenticated user sees "Start 15-day trial".
- Registration creates or reuses the Supabase Auth user.
- Provision tenant, customer admin membership, TEX Trial entitlement, default TEX settings, default categories, default approval flow, and audit event.
- Guard against duplicate trial creation for the same user/email.

Tests:
- API tests for idempotent provisioning.
- E2E smoke for start-trial to onboarding landing.

Acceptance:
- New user can start Trial without Torrevie manual setup.
- User lands in TEX onboarding, not full dashboard.

Dependencies: WP-TEX-01.

### WP-TEX-03: Onboarding state model

Objective: track onboarding progress independently from the plan.

Allowed:
- Root Supabase migration.
- TEX domain/API logic.
- Tenant-isolation tests.

Requirements:
- Track company profile, Quick Connect, employee invite, first receipt, first review, first approval, and dashboard view.
- Write audit events for key onboarding milestones.
- Expose onboarding progress to server components and API.

Tests:
- Migration tests.
- Tenant-isolation tests.
- Unit/API tests for step completion.

Acceptance:
- Onboarding progress resumes correctly after logout/login.
- One tenant cannot read or update another tenant's onboarding state.

Dependencies: WP-TEX-01.

## Phase 2: Guided Trial/Lite User Experience

### WP-TEX-04: "Set Up TEX in 5 Minutes" route

Objective: build the guided first-session experience.

Allowed:
- `apps/customer-portal/app/[locale]/tex/onboarding`
- TEX client/server components.
- Existing TEX APIs.

Requirements:
- Show seven steps from the LLD.
- Each step has one clear action, minimal fields, and completion status.
- Incomplete Trial users are redirected here when appropriate.
- Completed users can still access onboarding from Settings or Dashboard.

Tests:
- Component tests where available.
- E2E onboarding smoke in English and Arabic.

Acceptance:
- Trial user always knows the next action.
- No Growth/Enterprise clutter is shown in onboarding.

Dependencies: WP-TEX-02, WP-TEX-03.

### WP-TEX-05: Trial/Lite navigation and dashboard simplification

Objective: make Trial and Lite feel clean and complete.

Allowed:
- TEX layout/navigation components.
- TEX dashboard components.
- Existing CSS/module styles.

Requirements:
- Trial/Lite navigation: Dashboard, Expenses, WhatsApp, People, Reports, Settings.
- Hide complex Growth screens from Trial/Lite navigation.
- Dashboard shows setup progress, spend summary, pending approvals, WhatsApp status, employee count, recent receipts, and one upgrade teaser.

Tests:
- Visual/browser smoke for Trial, Lite, and Growth module visibility.
- Typecheck/build.

Acceptance:
- Trial/Lite users do not see full Growth configuration screens.
- Lite still feels like a complete product.

Dependencies: WP-TEX-04.

### WP-TEX-06: Employee invitation flow

Objective: let a Trial/Lite admin add employees quickly.

Allowed:
- TEX People UI/API.
- TEX WhatsApp outbound notification reuse.

Requirements:
- Add employee name and WhatsApp number from onboarding and People.
- Enforce plan employee limits.
- Normalize phone numbers.
- Send optional WhatsApp invitation when Quick Connect is connected.

Tests:
- API tests for employee limit enforcement.
- Unit tests for phone normalization/matching.

Acceptance:
- Trial cannot exceed configured employee limit.
- Invited employee can submit a receipt through WhatsApp.

Dependencies: WP-TEX-01, WP-TEX-04.

## Phase 3: WhatsApp First-Value Loop

### WP-TEX-07: Quick Connect onboarding integration

Objective: make WhatsApp connection understandable and reliable in Trial/Lite.

Allowed:
- TEX Integrations/WhatsApp route.
- Quick Connect status components.
- Existing Quick Connect API routes.

Requirements:
- Show Quick Connect as the only active Trial/Lite provider.
- Show QR status, connected number, last heartbeat, and retry action.
- Hide Wappfly/UltraMsg/Meta setup in Trial.
- Show locked Growth provider prompts only in controlled contexts.

Tests:
- API tests for provider visibility by tier.
- Browser smoke for QR pending/connected states.

Acceptance:
- Trial user can connect WhatsApp without seeing technical provider setup.
- Provider choices are correctly locked outside Growth.

Dependencies: WP-TEX-05.

### WP-TEX-08: First receipt activation tracking

Objective: make the first receipt drive onboarding progress automatically.

Allowed:
- Quick Connect ingest route.
- TEX WhatsApp processing logic.
- Onboarding state updates.

Requirements:
- Mark first receipt received when inbound media is stored.
- Mark first review when admin opens or resolves a receipt/expense.
- Mark first approval when approval/rejection completes.
- Keep matched employee on manual-review items.
- Default missing OCR currency to tenant currency with note.

Tests:
- TEX domain/API tests.
- E2E receipt flow smoke where environment allows.

Acceptance:
- Sending a receipt advances onboarding.
- Receipt appears with attachment, employee match, OCR result, and next action.

Dependencies: WP-TEX-03, WP-TEX-07.

### WP-TEX-09: Compact expense and WhatsApp review workflow

Objective: improve the manager-facing receipt review and approval experience.

Allowed:
- Expenses UI.
- WhatsApp Review UI.
- Finance Review UI.

Requirements:
- Compact list view for expenses and review queue.
- Receipt preview/open action.
- Uniform buttons and action fields.
- Clear "Create expense", "Approve", "Reject", and "Ignore" actions.
- DD/MM/YYYY display where configured.

Tests:
- Browser visual smoke.
- Typecheck/build.

Acceptance:
- Manager can review and approve first receipt quickly.
- No inconsistent odd action buttons remain in the core first-value path.

Dependencies: WP-TEX-08.

## Phase 4: Growth Upgrade and Module Visibility

### WP-TEX-10: Module visibility engine

Objective: centralize TEX module visibility by plan and role.

Allowed:
- TEX domain helper.
- TEX layout/navigation.
- API bootstrap payload.

Requirements:
- Return module states: `active`, `hidden`, `locked`, `teaser`.
- Enforce the same rules server-side.
- Cover Trial, Lite, Growth, Enterprise.

Tests:
- Unit tests for visibility matrix.
- API tests for denied Growth actions.

Acceptance:
- UI and API agree on what each tier can use.
- Hidden modules cannot be accessed by direct URL/API.

Dependencies: WP-TEX-01, WP-TEX-05.

### WP-TEX-11: Explore Growth page and contextual prompts

Objective: introduce upgrade prompts without cluttering Lite.

Allowed:
- TEX upgrade/explore route.
- Dashboard teaser component.
- Locked contextual actions.

Requirements:
- Dedicated Explore Growth page.
- Contextual locked actions for second approval level, provider options, advanced reports, site/trip/project reporting.
- One upgrade prompt per page maximum.

Tests:
- Browser smoke for Trial/Lite/Growth prompt behavior.

Acceptance:
- Lite users see helpful upgrade prompts, not a wall of disabled screens.

Dependencies: WP-TEX-10.

### WP-TEX-12: Growth feature unlock baseline

Objective: make Growth plan visibly unlock selected operational controls.

Allowed:
- TEX settings/integrations/reports/trips UI.
- Plan enforcement logic.

Requirements:
- Growth can access provider options.
- Growth can access advanced report teasers or baseline advanced reports.
- Growth can use site/project/trip/container tagging where already supported.
- Growth can use expanded employee limit.

Tests:
- API tests for plan transitions.
- Browser smoke for Growth navigation.

Acceptance:
- Changing tenant to Growth changes module visibility and limits without code changes.

Dependencies: WP-TEX-10, WP-TEX-11.

## Phase 5: Admin Platform Controls

### WP-TEX-13: Admin plan management for TEX

Objective: let Torrevie staff manage TEX plans and limits.

Allowed:
- Admin Platform tenant/product settings.
- Shared subscription/entitlement metadata.
- Audit events.

Requirements:
- View and edit TEX plan.
- Edit trial dates, plan status, employee limit, WhatsApp provider scope, billing status placeholder.
- Every change writes audit event.

Tests:
- Authorization tests: customer roles cannot access admin controls.
- API tests for plan updates.

Acceptance:
- Torrevie staff can upgrade/downgrade a tenant manually.
- Customer users cannot alter their plan through direct API calls.

Dependencies: WP-TEX-01.

### WP-TEX-14: Enterprise request workflow

Objective: support Enterprise as a Torrevie-led workflow, not instant self-service.

Allowed:
- Customer-facing Enterprise request UI.
- Admin Platform request status.
- Notifications.

Requirements:
- Customer can request Enterprise setup.
- Torrevie receives internal notification.
- Admin can track status: requested, contacted, discovery, proposal, setup, live, closed.
- Store requested capabilities and internal notes.

Tests:
- API tests for request creation.
- Authorization tests for admin-only status updates.

Acceptance:
- Enterprise button does not unlock all features.
- Request is visible to Torrevie staff.

Dependencies: WP-TEX-13.

## Phase 6: Reporting, Exports, and Operational Polish

### WP-TEX-15: Lite reports and exports

Objective: make Lite useful after the first approval.

Allowed:
- TEX Reports UI/API.
- Existing export functionality.

Requirements:
- Basic spend report.
- Category/status/employee summaries.
- Export to CSV initially; PDF/Excel if already supported without new dependency.
- Upgrade teaser for site/trip/project reporting.

Tests:
- API tests for report date/currency behavior.
- Browser smoke for exports.

Acceptance:
- Lite customer can export usable basic reports.

Dependencies: WP-TEX-09, WP-TEX-11.

### WP-TEX-16: Growth operational reporting baseline

Objective: deliver the first Growth-only report value.

Allowed:
- TEX Reports UI/API.
- Existing trip/team/project tagging fields.

Requirements:
- Spend by trip where data exists.
- Spend by team/department where data exists.
- Placeholder-free Growth report page for unlocked tenants.

Tests:
- API tests for Growth access.
- Report calculation tests.

Acceptance:
- Growth tenant can see at least one real advanced breakdown.

Dependencies: WP-TEX-12, WP-TEX-15.

## Phase 7: Billing Readiness, Not Payment Processing

### WP-TEX-17: Billing metadata and checkout placeholder

Objective: prepare for Phase 2 billing without taking card payments yet.

Allowed:
- Admin Platform billing metadata.
- Customer plan selection placeholder.

Requirements:
- Store billing status, renewal date, seat count, invoice reference placeholders.
- Customer can view plan and request upgrade.
- No card data is collected.

Tests:
- API tests for billing metadata authorization.

Acceptance:
- Plan and billing status can be managed manually until payments are enabled.

Dependencies: WP-TEX-13.

### WP-TEX-18: Payment provider integration design checkpoint

Objective: decide payment provider and integration boundary.

Allowed: documentation only unless explicitly approved.

Requirements:
- Confirm provider.
- Confirm pricing model.
- Confirm invoice/tax handling.
- Confirm webhook processing and failure policy.

Tests: none.

Acceptance:
- Approved payment implementation plan exists before payment code starts.

Dependencies: WP-TEX-17.

Checkpoint: do not implement card collection before this is approved.

## Phase 8: Verification and Production Readiness

### WP-TEX-19: End-to-end Trial activation test

Objective: validate the complete self-enrollment loop.

Allowed:
- Test fixtures, smoke scripts, browser tests.

Requirements:
- Start trial.
- Confirm company profile.
- Connect Quick Connect or mock connected state in test env.
- Invite employee.
- Submit first receipt or seed inbound receipt.
- Review and approve.
- Confirm dashboard updated.

Tests:
- E2E browser test in staging.
- Tenant-isolation tests for new tables.

Acceptance:
- New tenant reaches first value without Torrevie manual action.

Dependencies: WP-TEX-02 through WP-TEX-09.

### WP-TEX-20: Staging UAT and production release checklist

Objective: release the revised TEX Trial/Lite experience safely.

Allowed:
- Staging deployment.
- Production deployment after approval.
- Documentation/runbooks.

Requirements:
- Staging UAT with a fresh trial tenant.
- Quick Connect worker health confirmed.
- Vercel logs clean.
- Supabase RLS tests passing.
- Rollback instructions documented.

Tests:
- `pnpm test:tex`
- `pnpm test:isolation`
- `pnpm --filter @torrevie/customer-portal typecheck:local`
- `pnpm --filter @torrevie/customer-portal build`
- Browser smoke against staging.

Acceptance:
- Business approval to promote.
- Production smoke passes on `app.torrevie.com/tex`.

Dependencies: WP-TEX-19.

Checkpoint: production promotion requires explicit approval.

## Recommended Execution Order

1. WP-TEX-00
2. WP-TEX-01
3. WP-TEX-03
4. WP-TEX-02
5. WP-TEX-04
6. WP-TEX-05
7. WP-TEX-06
8. WP-TEX-07
9. WP-TEX-08
10. WP-TEX-09
11. WP-TEX-10
12. WP-TEX-11
13. WP-TEX-13
14. WP-TEX-14
15. WP-TEX-12
16. WP-TEX-15
17. WP-TEX-16
18. WP-TEX-17
19. WP-TEX-18
20. WP-TEX-19
21. WP-TEX-20

## Suggested First Sprint

The first sprint should avoid payment and deep Growth work. It should ship the self-enrollment foundation and first-session path.

Sprint scope:
- WP-TEX-00
- WP-TEX-01
- WP-TEX-03
- Start WP-TEX-02

Sprint acceptance:
- Plan model exists.
- Onboarding state exists with RLS.
- Trial provisioning design is implemented enough to create a tenant in dev/staging.
- No production behavior changes are promoted without approval.

