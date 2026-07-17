# TEX LLD v2: Self-Enrolled Trial, Tiered Modules, and WhatsApp-First Onboarding

| Field | Value |
| --- | --- |
| Product | TEX |
| Scope | Customer Portal, Admin Platform, shared Supabase platform, Quick Connect worker |
| Version | 2.0 draft |
| Date | 17 July 2026 |
| Status | Draft for internal product and engineering review |
| Owner | Torrevie |

## 1. Executive Summary

### Business Purpose
TEX must become a self-selling SaaS product that a customer can discover, trial, and understand without Torrevie manually onboarding every account. The first value moment is simple: connect WhatsApp, invite an employee, receive a receipt, review the structured expense, and approve it.

### User Experience Behavior
New customers start at `app.torrevie.com/tex`, enroll into a 15-day Trial workspace, and land in a guided setup flow instead of the full TEX dashboard. The interface uses plain language, minimal fields, and one next action per step.

### Functional Requirements
- Trial customers receive TEX Lite capability only.
- Trial onboarding focuses on company profile, Quick Connect WhatsApp, employee invitation, first receipt, review, approval, and dashboard.
- Growth and Enterprise features are not exposed as full screens during Trial or Lite.
- Upgrade prompts are selective and contextual.

### Data and Configuration Requirements
- Tenant entitlement must carry product `tex` plus TEX plan: `trial`, `lite`, `growth`, or `enterprise`.
- Tenant-level TEX settings must store onboarding state, plan limits, default currency, business type, WhatsApp mode, and billing status placeholders.
- Every tenant-scoped TEX record keeps `tenant_id` and remains protected by RLS.

### Permission and Tier Rules
Trial uses Lite permissions with trial limits. Lite is a complete product. Growth unlocks operational controls. Enterprise starts Torrevie-led onboarding rather than instantly unlocking all configuration.

### Development Notes
Implement as part of the existing modular monolith. Do not create a separate TEX app, service, database, or deployment target. Customer routes remain under `apps/customer-portal/app/[locale]/tex`; API routes remain under `apps/customer-portal/app/api/tex`.

## 2. Current TEX Context

### Business Purpose
TEX is live inside the Torrevie SaaS Platform as an Expense and Trip Management application. Its migrated scope already includes expenses, trips, finance review, people, reports, settings, WhatsApp review, receipt storage, OCR, and Quick Connect.

### User Experience Behavior
Today, a subscribed tenant can access TEX from the customer portal and use module navigation. The new direction changes first-time entry from "open the full workspace" to "complete a guided path to first value."

### Functional Requirements
- Keep current TEX production routes.
- Preserve existing expense, trip, people, report, integration, receipt, and Quick Connect behavior.
- Add a plan-aware layer above the current modules.
- Add a trial onboarding route and state machine.

### Data and Configuration Requirements
Existing important data domains:
- `tex_employee_profiles`
- `tex_expenses`
- `tex_trips`
- `tex_trip_legs`
- `tex_unregistered_whatsapp_submissions`
- `tex_quick_connect_sessions`
- `tex_quick_connect_events`
- shared `files`, `audit_events`, tenant memberships, roles, entitlements, and notification provider settings

### Permission and Tier Rules
Existing role and permission checks remain server-side. Plan checks must be added server-side and reflected in UI visibility.

### Development Notes
Treat `apps/customer-portal/app/[locale]/tex/_migration-source` as reference-only. Do not delete it until the migrated implementation and new product direction are verified.

## 3. Product Objective

### Business Purpose
TEX should convert interested customers from social media, referrals, and direct visits into active Trial users without Torrevie support.

### User Experience Behavior
The first session should feel like a guided setup, not a software configuration project. The customer should always know what to do next.

### Functional Requirements
- Self-enroll new tenant.
- Auto-create 15-day Trial entitlement.
- Guide the customer through setup.
- Drive the customer to send and approve the first receipt.
- Show a simple value dashboard after setup.
- Provide clear upgrade paths to Lite, Growth, or Enterprise request.

### Data and Configuration Requirements
- Trial start and end timestamps.
- Trial status: `active`, `expired`, `converted`, `cancelled`.
- Onboarding step completion timestamps.
- Plan and employee limit configuration.
- Source attribution where available: social campaign, referral, direct, admin-created.

### Permission and Tier Rules
Trial admins can manage only their Trial tenant and Trial Lite capabilities. Enterprise request creates an internal Torrevie action, not an automatic full unlock.

### Development Notes
Use shared platform tenant provisioning and Supabase Auth. No TEX-owned auth system.

## 4. Core Differentiator: WhatsApp-First, No Employee App

### Business Purpose
TEX removes friction for employees. Employees already know WhatsApp, so receipt submission should not require app installation, account setup, or training.

### User Experience Behavior
Employees submit receipts by sending a WhatsApp message. Admins and finance users see structured expense records, approvals, dashboards, and reports in TEX.

### Functional Requirements
- Trial and Lite use Quick Connect only.
- Incoming receipt messages create structured expense records when OCR has enough information.
- If sender or OCR is incomplete, the receipt appears in WhatsApp Review.
- Admin can assign sender to employee, correct fields, and create the expense.
- TEX replies back through WhatsApp when possible.

### Data and Configuration Requirements
- Store sender phone normalized to E.164 where possible.
- Store receipt file in tenant-prefixed shared storage.
- Store OCR result, confidence, source message ID, and review status.
- Store Quick Connect session and lifecycle events.

### Permission and Tier Rules
Only tenant admins or integration managers can connect WhatsApp. Finance or manager roles review and approve according to configured permissions.

### Development Notes
Quick Connect remains a persistent worker, not a Vercel serverless function. Follow `docs/runbooks/TEX_QUICK_CONNECT.md`.

## 5. Product Positioning

### Business Purpose
The product promise is: "WhatsApp in the front, business control in the back."

### User Experience Behavior
The customer should see TEX as an operational control system, not a chat bot. WhatsApp is the input channel; TEX is where approval, reporting, control, and audit happen.

### Functional Requirements
- Trial/Lite copy focuses on speed and simplicity.
- Growth copy focuses on control by team, site, project, trip, branch, and cost center.
- Enterprise copy focuses on Torrevie-led process design and integration.

### Data and Configuration Requirements
Store plan positioning content as static copy first. Move to CMS/config only when marketing starts changing it frequently.

### Permission and Tier Rules
Product positioning must not imply a customer has features outside their tier.

### Development Notes
Use Torrevie brand tone and palette from `docs/brand/BRAND_FOR_CODEX.md`.

## 6. Target Customer Segments

| Segment | Primary Need | Best Entry Tier | Notes |
| --- | --- | --- | --- |
| Small transport operator | Collect driver receipts and approve quickly | Trial, Lite | Fastest path to value |
| Small services company | Control employee spending without app rollout | Trial, Lite | Basic categories and spend limits are enough |
| Growing logistics company | Control by trip, container, branch, team, or project | Growth | Needs tagging and reporting depth |
| Multi-branch operator | Standardize expense process across locations | Growth, Enterprise | May need approval hierarchy |
| Enterprise / complex operations | Custom workflow, ERP, reporting, provider setup | Enterprise | Torrevie-led onboarding |

### Development Notes
Use segment and business type to tune onboarding examples and dashboard cards later. Do not fork the app per segment.

## 7. User Personas

| Persona | Goal | TEX Behavior |
| --- | --- | --- |
| Owner / General Manager | See spend clearly and prevent leakage | Simple dashboard, approvals, upgrade prompts |
| Finance Manager | Review, approve, reject, reimburse, export | Finance review, reports, batch workflows |
| Operations Manager | Track spend against trips, teams, sites, or projects | Growth tagging and dashboards |
| Employee / Driver | Send receipts with minimal effort | WhatsApp only; no app required |
| Torrevie Admin | Manage plans, limits, billing status, enterprise setup | Admin Platform controls |

## 8. Tier Model: Trial, Lite, Growth, Enterprise

| Tier | Positioning | Primary Buyer | Commercial Intent |
| --- | --- | --- | --- |
| Trial | Try Lite in 15 days | New self-enrolled customer | Reach first value quickly |
| Lite | The fastest WhatsApp expense system for small teams | Small teams | Paid self-service starter |
| Growth | WhatsApp expense operations for companies that need control by site, trip, project, branch, or team | Growing operators | Paid expansion |
| Enterprise | Consultancy-led cost control around the customer's process | Complex customers | Torrevie-led sale and onboarding |

### Functional Requirements
- Trial duration defaults to 15 days.
- Lite employee limit defaults to 15.
- Growth employee limit defaults to 75.
- Enterprise limit is custom or unlimited.
- Limits must be configurable from Admin Platform.

### Data and Configuration Requirements
Create or extend configuration with:
- `tex_plan`
- `tex_plan_status`
- `tex_trial_started_at`
- `tex_trial_ends_at`
- `tex_employee_limit`
- `tex_whatsapp_provider_scope`
- `tex_billing_status`
- `tex_enterprise_request_status`

### Permission and Tier Rules
Plan rules must be enforced in API/domain logic, not only UI.

## 9. Feature Matrix by Tier

| Capability | Trial | Lite | Growth | Enterprise |
| --- | --- | --- | --- | --- |
| Duration | 15 days | Paid | Paid | Contract |
| Employee limit | Limited, default 5 during trial | Up to 15 | Up to 75 | Custom |
| WhatsApp Quick Connect | Active | Active | Active | Optional |
| Wappfly / UltraMsg | Hidden | Hidden or upgrade prompt | Active | Custom |
| Meta WhatsApp Business API | Hidden | Hidden or upgrade prompt | Active | Torrevie-led setup |
| Receipt OCR | Active | Active | Active | Active / custom |
| Basic expenses | Active | Active | Active | Active |
| Trip expenses | Basic visibility | Basic | Advanced tagging/reporting | Custom |
| Categories | Basic | Basic | Advanced | Custom |
| Approval flow | One level | One level | Multi-level | Custom hierarchy |
| Spend limits | Basic | Basic | Advanced by employee/category/team/site/trip | Custom |
| Employee management | Limited | Active | Active | Active |
| Team/department setup | Basic | Basic | Advanced | Custom |
| Sites/projects/branches | Hidden | Hidden or teaser | Active | Custom |
| Cost centers | Hidden | Hidden or teaser | Active | Custom |
| Dashboard | Lite dashboard | Lite dashboard | Management dashboards | Custom dashboards |
| Reports | Basic | Basic | Advanced | Custom |
| Export Excel/PDF | Basic | Active | Active | Active/custom |
| Reimbursement status | Basic | Active | Batches | Custom |
| Audit trail | Standard | Standard | Standard | Advanced |
| API access | Hidden | Hidden | Limited or optional | Contracted |
| ERP/accounting integration | Hidden | Hidden | Optional teaser | Custom |
| Admin platform plan controls | Active | Active | Active | Active |

## 10. Trial Mode Rules

### Business Purpose
Trial must reduce time to value and avoid overwhelming first-time customers.

### User Experience Behavior
Trial users see a guided setup and a Lite dashboard. Growth and Enterprise modules are not shown as navigation clutter.

### Functional Requirements
- Trial is automatically created after self-enrollment.
- Trial routes redirect incomplete users to onboarding.
- Trial supports Quick Connect only.
- Trial supports limited employee invitations.
- Trial supports one approval flow and basic reports.
- Trial shows upgrade prompts only after value is visible.

### Data and Configuration Requirements
- Trial limits are tenant-scoped configuration.
- Store onboarding progress independently from plan.
- Store first receipt and first approval timestamps for activation metrics.

### Permission and Tier Rules
Trial users cannot configure Wappfly, UltraMsg, Meta API, multi-level approvals, advanced reports, integrations, advanced cost centers, branches, or enterprise settings.

### Development Notes
Do not implement Trial as a separate app or separate tenant model. It is a plan state inside the shared platform.

## 11. Self-Enrollment Journey

### Business Purpose
Self-enrollment should turn anonymous interest into an active tenant without manual Torrevie action.

### User Experience Behavior
1. Visitor opens `app.torrevie.com/tex`.
2. Visitor chooses "Start 15-day trial".
3. Visitor creates account or signs in.
4. Platform creates tenant, membership, and Trial TEX entitlement.
5. User lands on "Set Up TEX in 5 Minutes".

### Functional Requirements
- Public TEX entry route detects unauthenticated visitors.
- Trial form collects minimum information only.
- Supabase Auth handles identity.
- Tenant provisioning creates tenant, admin membership, entitlement, default TEX settings, default categories, default approval rule, onboarding state, and audit event.

### Data and Configuration Requirements
- Business name
- Country
- Currency
- Business type
- Admin name and email from auth profile
- Marketing source fields where available

### Permission and Tier Rules
The enrolling user becomes customer admin for the tenant and TEX admin for the Trial workspace.

### Development Notes
Provisioning must be idempotent by user/email and guarded against duplicate accidental trial tenants.

## 12. Guided Onboarding UX Flow

### Recommended Checklist

| Step | Action | Required | Completion Signal |
| --- | --- | --- | --- |
| 1 | Confirm company profile | Yes | Business name, country, currency, type saved |
| 2 | Connect WhatsApp | Yes for Quick Connect trial | Quick Connect session connected |
| 3 | Invite employees | Yes | At least one active employee profile |
| 4 | Send first receipt | Yes | Receipt submission received |
| 5 | Review expense | Yes | Expense or review item opened |
| 6 | Approve expense | Yes | First approval/rejection action completed |
| 7 | View dashboard | Yes | Dashboard viewed after first transaction |

### User Experience Behavior
Each step has one action, short explanation, completion status, minimal fields, no technical language, clear next step, and skip only where safe.

### Functional Requirements
- Onboarding page route: `/[locale]/tex/onboarding`.
- Progress component visible on Trial/Lite dashboard until complete.
- Resume incomplete onboarding after login.
- Allow safe skip for invite employee only if admin submits first receipt from linked WhatsApp.

### Data and Configuration Requirements
Store per-step status:
- `company_profile_completed_at`
- `quick_connect_completed_at`
- `employee_invited_at`
- `first_receipt_received_at`
- `first_expense_reviewed_at`
- `first_expense_approved_at`
- `dashboard_viewed_at`

### Development Notes
Keep onboarding state in a TEX tenant settings table or shared product-onboarding table. Prefer shared table if CRM/FSM will reuse onboarding later.

## 13. WhatsApp Provider Strategy by Tier

| Provider Option | Trial | Lite | Growth | Enterprise |
| --- | --- | --- | --- | --- |
| Quick Connect | Active | Active | Active | Optional |
| Wappfly | Hidden | Locked prompt | Active | Optional |
| UltraMsg | Hidden | Locked prompt | Active | Optional |
| Meta WhatsApp Business API | Hidden | Locked prompt | Active | Torrevie-led |
| Custom provider strategy | Hidden | Hidden | Hidden | Torrevie-led |

### Functional Requirements
- Trial and Lite setup page shows Quick Connect as the only active option.
- Growth exposes provider profile setup through shared integration controls.
- Enterprise triggers Torrevie onboarding for provider design.

### Data and Configuration Requirements
- Store selected provider at tenant level.
- Store provider profiles in shared integration settings.
- Store Quick Connect session state in existing Quick Connect tables.

### Permission and Tier Rules
Only users with integration management permission can connect or change WhatsApp settings.

### Development Notes
Quick Connect worker remains the default Trial/Lite path. Provider credentials must never be exposed to the browser.

## 14. Employee Invitation Flow

### Business Purpose
The customer needs to add employees quickly without training or app installation.

### User Experience Behavior
Admin enters employee name and WhatsApp number. TEX can send an invitation message once WhatsApp is connected.

### Functional Requirements
- Add employee with name, WhatsApp number, optional department/team.
- Normalize and validate phone number.
- Enforce employee limit by plan.
- Send optional WhatsApp invitation:
  "You can now send receipts to your company TEX WhatsApp."

### Data and Configuration Requirements
- Employee profile: name, phone, active status, department/team, manager, submission cadence.
- Invitation status and sent timestamp if implemented.

### Permission and Tier Rules
Trial and Lite enforce lower employee limits. Growth and Enterprise use configured limits.

### Development Notes
Match incoming receipts to employees by normalized phone digits and safe country-code fallback, but avoid ambiguous matches.

## 15. First Receipt Submission Flow

### Business Purpose
The first receipt proves product value.

### User Experience Behavior
Employee or admin sends a receipt image through WhatsApp. TEX acknowledges receipt and creates either a pending expense or review item.

### Functional Requirements
- Receive inbound WhatsApp media.
- Persist receipt file in tenant-scoped storage.
- Run OCR/extraction.
- Match sender to employee.
- Default missing currency to tenant currency, initially AED for UAE tenants.
- Create pending expense if date, amount, currency, and employee are known.
- Otherwise create WhatsApp Review item with extracted fields.

### Data and Configuration Requirements
- Receipt file record.
- WhatsApp submission metadata.
- OCR result and confidence.
- Expense record if auto-created.
- Audit event.

### Permission and Tier Rules
Receipt submission is allowed for Trial/Lite/Growth/Enterprise within plan limits.

### Development Notes
OCR should be helpful, not blocking. If one non-critical field is missing, default or send to review according to policy.

## 16. Approval and Expense Review Flow

### Business Purpose
TEX must convert receipt chaos into controlled spend approval.

### User Experience Behavior
Admin/manager sees a compact list of pending expenses with receipt preview, employee, vendor, date, amount, category, and approve/reject actions.

### Functional Requirements
- One approval level in Trial/Lite.
- Multi-level approvals in Growth.
- Custom hierarchy in Enterprise.
- Reject requires optional reason.
- Approval/rejection writes audit event and notifies sender when configured.

### Data and Configuration Requirements
- Expense status.
- Approved/rejected by and timestamps.
- Review notes.
- Policy flags.
- Reimbursement status.

### Permission and Tier Rules
Approval permission remains server-side. Lite cannot add extra approval levels. Growth can configure additional levels within product rules. Enterprise can receive custom workflows through Torrevie setup.

### Development Notes
Use a shared workflow package only when at least two apps use it now. Until then, keep TEX-specific approval logic in `apps/customer-portal/lib/tex.ts` or `lib/tex/*`.

## 17. Module Permission Engine

### Business Purpose
Plan-based permissions must keep the UI simple and enforce commercial boundaries.

### User Experience Behavior
Users see only modules that make sense for their tier and role. Locked prompts appear only where useful.

### Functional Requirements
- Resolve role permissions and plan entitlements on every TEX request.
- Expose a shaped module visibility object to the frontend.
- Enforce limits on mutations.
- Audit denied upgrade-relevant actions where useful.

### Data and Configuration Requirements
- Product entitlement.
- TEX plan.
- Plan status.
- Feature flags.
- Role permissions.
- Usage counters, especially employee count and active Quick Connect status.

### Permission and Tier Rules
Authorization order:
1. Authenticated user.
2. Active tenant membership.
3. TEX entitlement.
4. Role permission.
5. TEX plan rule.
6. Resource ownership / tenant RLS.

### Development Notes
Prefer a `resolveTexWorkspaceAccess()` helper that returns permissions, plan, limits, and module visibility. Keep it server-side.

## 18. Lite UX Rules

### Business Purpose
Lite must feel like a real product, not a restricted demo.

### User Experience Behavior
Lite navigation is clean:
- Dashboard
- Expenses
- WhatsApp
- People
- Reports
- Settings

### Functional Requirements
- Hide complex Growth setup screens.
- Show basic reports and exports.
- Show simple settings.
- Show upgrade prompts only after relevant value.

### Data and Configuration Requirements
Lite requires default categories, default approval setting, default currency, and Quick Connect state.

### Permission and Tier Rules
Lite users cannot configure provider options beyond Quick Connect or multi-level approvals.

### Development Notes
Do not show every Growth feature greyed out in navigation. Use a dedicated "Explore Growth" page and contextual prompts.

## 19. Growth Upgrade Experience

### Business Purpose
Growth should feel like natural expansion for customers with more operational complexity.

### User Experience Behavior
The customer sees upgrade prompts tied to business value:
- "See spending by site, trip, or project."
- "Add a second approval level."
- "Use an official WhatsApp provider."

### Functional Requirements
- Upgrade / Explore Growth page.
- Contextual locked actions.
- Dashboard insight teasers.
- Growth module unlock after subscription update.

### Data and Configuration Requirements
- Upgrade interest event.
- Plan change audit.
- Updated plan limits.

### Permission and Tier Rules
Only tenant admins can request or start upgrade. Payment activation is Phase 2; before that, Admin Platform can change plan.

### Development Notes
Do not build payment as a blocker for Growth UX. Build plan state and manual admin activation first.

## 20. Enterprise Onboarding Experience

### Business Purpose
Enterprise is consultancy-led and should protect Torrevie from unsupported self-service complexity.

### User Experience Behavior
Enterprise appears as "Request Enterprise Setup" or "Contact Torrevie", not "Unlock now."

### Functional Requirements
- Enterprise request form.
- Internal Torrevie notification.
- Enterprise setup checklist.
- Admin Platform status tracking.
- Ability to record discovery notes and target go-live date.

### Data and Configuration Requirements
- Request status: `requested`, `contacted`, `discovery`, `proposal`, `setup`, `live`, `closed`.
- Customer contact details.
- Requested capabilities.
- Internal owner.

### Permission and Tier Rules
Enterprise does not automatically unlock all modules. Torrevie admin decides enabled modules and limits.

### Development Notes
Enterprise workflow belongs in the Admin Platform and shared tenant/product configuration, not inside a separate TEX deployment.

## 21. Admin Platform Requirements

### Business Purpose
Torrevie must control plans, limits, billing status, trial status, and enterprise onboarding.

### Functional Requirements
Admin Platform should manage:
- TEX plan: Trial, Lite, Growth, Enterprise.
- Plan status: active, trialing, expired, suspended, cancelled.
- Trial dates.
- Employee limit.
- WhatsApp provider scope.
- Billing status placeholder.
- Manual upgrade/downgrade.
- Enterprise request status.
- Internal notes.
- Audit trail.

### Data and Configuration Requirements
Prefer shared subscription/entitlement tables if already present. Add TEX-specific settings only for product behavior not shared by other apps.

### Permission and Tier Rules
Only Torrevie staff roles can change another tenant's plan. Every change writes audit event.

### Development Notes
Admin controls should not expose provider secrets directly. Use masked values and server-only secret storage.

## 22. Phase 2 Billing and Card Payment Requirements

### Business Purpose
Billing is reserved for Phase 2, but plan architecture must not block it.

### Customer-Facing Flow
1. Select plan.
2. Select number of users.
3. Add credit card.
4. Confirm subscription.
5. Unlock tier capabilities.

### Functional Requirements
- Customer can enroll card.
- Customer can select tier and user count.
- System calculates subscription.
- Admin Platform controls plan, billing status, user limit, renewal, failed payments, and invoices/receipts.

### Data and Configuration Requirements
- Billing customer ID.
- Payment provider subscription ID.
- Plan price ID.
- Seat count.
- Renewal date.
- Billing status.
- Invoice references.

### Permission and Tier Rules
Payment success activates plan automatically in Phase 2. Payment failure can suspend upgrade-only features while preserving data access according to business policy.

### Development Notes
Do not store card data. Use a payment provider tokenized flow.

## 23. UI/UX Simplification Requirements

### Business Purpose
Customers from social media may have limited IT support. TEX must feel approachable.

### User Experience Behavior
- Plain language.
- Compact list views for expenses and trips.
- Clear next action.
- Fewer visible modules during Trial.
- Strong receipt preview.
- Dashboard focused on money, pending approvals, and setup progress.

### Functional Requirements
- Use Torrevie Design System.
- Keep cards for repeated items and tools only.
- Use table/list density for expenses and trips.
- Use consistent buttons and actions.
- Support Arabic and RTL.

### Data and Configuration Requirements
Store locale preference and tenant currency. Date display should follow regional format, including DD/MM/YYYY where configured.

### Permission and Tier Rules
Hidden modules must also be denied server-side.

### Development Notes
Avoid decorative clutter. The first viewport in Trial should be the setup progress and next action.

## 24. Development Roadmap

### Phase 0: Documentation and Product Alignment
- Approve this LLD.
- Confirm Lite/Growth/Enterprise default limits.
- Confirm Trial employee limit.
- Confirm default currency behavior.

### Phase 1: Plan and Onboarding Foundation
- Add TEX plan config and onboarding state.
- Add Trial provisioning through self-enrollment.
- Add onboarding route and redirect behavior.
- Add module visibility helper.

### Phase 2: Lite Trial UX
- Build "Set Up TEX in 5 Minutes".
- Simplify Trial/Lite navigation.
- Add Trial/Lite dashboard.
- Add employee invitation flow.
- Add Quick Connect onboarding checks.

### Phase 3: Receipt Activation Loop
- Improve first receipt status tracking.
- Improve OCR fallback and review.
- Ensure matched employee persists during manual review.
- Add approval completion checkpoint.

### Phase 4: Growth Upgrade Surface
- Add Explore Growth page.
- Add contextual locked actions.
- Add Growth provider choices.
- Add advanced reporting teasers.

### Phase 5: Admin Platform Controls
- Add plan management.
- Add trial and billing status.
- Add enterprise request workflow.
- Add audit views.

### Phase 6: Phase 2 Billing
- Select payment provider.
- Add subscription checkout.
- Add billing webhooks.
- Add invoice status and failed-payment handling.

### Verification
- Unit tests for plan visibility and onboarding state.
- API tests for plan enforcement.
- Tenant-isolation tests for any new tenant-scoped table.
- E2E smoke for self-enroll -> connect WhatsApp -> invite employee -> first receipt -> approve -> dashboard.

## 25. Open Decisions

| Decision | Options | Recommended Default |
| --- | --- | --- |
| Trial employee limit | 3, 5, 10 | 5 |
| Trial duration | 7, 14, 15, 30 days | 15 days |
| Lite employee limit | 10, 15, 25 | 15 |
| Growth employee limit | 50, 75, 100 | 75 |
| Default Trial currency | Country default, manual only | Country default with admin confirmation |
| Missing OCR currency | Manual review, tenant currency default | Tenant currency default with note |
| Payment provider | Stripe, local gateway, manual first | Manual first, Stripe-compatible design |
| Enterprise activation | Instant unlock, request workflow | Request workflow |
| WhatsApp invitation wording | Formal, friendly, customizable | Friendly fixed copy first |

## Module Visibility Table

| Module / Screen | Trial | Lite | Growth | Enterprise |
| --- | --- | --- | --- | --- |
| Onboarding checklist | Active | Visible until complete | Optional | Custom |
| Lite dashboard | Active | Active | Active with expanded widgets | Custom dashboards |
| Expenses | Active | Active | Active | Active |
| WhatsApp Quick Connect | Active | Active | Active | Optional |
| WhatsApp provider setup | Hidden | Locked prompt | Active | Torrevie-led |
| People | Limited | Active | Active | Active |
| Trips | Basic | Basic | Active with tagging/reporting | Custom |
| Finance review | Basic | Active | Active | Custom |
| Reports | Basic | Basic | Advanced | Custom |
| Settings | Simple | Simple | Expanded | Custom |
| Cost centers | Hidden | Teaser | Active | Custom |
| Branches/sites/projects | Hidden | Teaser | Active | Custom |
| Approval workflow builder | Hidden | Locked action | Active | Custom |
| Integrations/API | Hidden | Hidden | Teaser or active by add-on | Custom |
| Enterprise setup | Hidden | Contact prompt | Contact prompt | Active |

## Suggested Trial/Lite Dashboard Layout

1. Setup progress: next step, completion percentage, and one primary action.
2. Spend summary: this month spend, pending approval amount, approved amount.
3. Pending approvals: compact list of latest receipts.
4. WhatsApp status: connected/not connected, last receipt received.
5. Employee count: active employees versus plan limit.
6. Recent receipts: latest receipt thumbnails or rows.
7. Upgrade insight teaser: one small contextual prompt after first value is reached.

## Upgrade Prompt Rules

- Do not show upgrade prompts before the customer completes at least one value step, unless the user explicitly clicks a locked action.
- Do not display more than one upgrade prompt per page.
- Do not replace empty states with upgrade messaging.
- Do not show Enterprise as an instant plan unlock.
- Use business language, not internal feature names.
- Always let the user return to their current work.

## Suggested Admin Settings for Tiers and Subscriptions

| Setting | Scope | Used By |
| --- | --- | --- |
| TEX plan | Tenant/product entitlement | Module visibility and limits |
| Plan status | Tenant/product entitlement | Access and billing state |
| Trial start/end | Tenant/product entitlement | Trial banner, expiry |
| Employee limit | TEX settings or entitlement metadata | People module and invitations |
| WhatsApp provider scope | TEX settings | Integrations page |
| Billing status | Subscription metadata | Admin Platform and Phase 2 billing |
| Renewal date | Subscription metadata | Billing reminders |
| Enterprise request status | Admin Platform | Sales/onboarding workflow |
| Default currency | TEX settings | OCR fallback and reports |
| Business type | TEX settings | Onboarding copy and templates |

