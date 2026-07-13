# FSM Staging to Platform Mapping

Reference: TRV-FSM-2026-001, WP-26.

## Platform Rules That Win

- Tenancy is `tenants` plus tenant-scoped tables with mandatory `tenant_id`.
- Authorization is platform RBAC plus product permissions, enforced server-side and backed by RLS.
- Commercial access is platform subscriptions and entitlements. FSM does not introduce a second entitlement system.
- Every mutation writes `audit_events`.
- Provider credentials remain encrypted server-side and are never exposed to browser code.
- Arabic and RTL readiness apply to every shared UI path from the first implementation.

## Architecture Mapping

| Staging concept | Platform concept | Decision |
| --- | --- | --- |
| Vite app | `apps/customer-portal/app/[locale]/fsm` route group | Rebuild inside the platform monorepo. Do not deploy staging app. |
| React Router routes | Next.js App Router routes | Keep workflows, not routing implementation. |
| `organizations` | `tenants` and tenant settings | Do not copy `organizations`. Add FSM tenant settings only where no platform equivalent exists. |
| `profiles` | `users`, `user_profiles`, `tenant_memberships` | Use platform identity and tenant membership. |
| `user_roles`, `app_role` | `roles`, `permissions`, `user_role_assignments` | Add FSM permissions to platform RBAC. |
| `platform_admin` | `torrevie_platform_admin` and related Torrevie staff roles | Use Admin Portal support/lifecycle controls. |
| `admin` | `customer_admin` or `customer_module_admin` | Map according to tenant-wide versus FSM-only authority. |
| `dispatcher` | `customer_manager` plus FSM dispatch permissions | Add dispatch-specific FSM permissions. |
| `technician` | `customer_standard_user` plus assignment-scoped FSM permissions | Narrow updates by assignment. |
| `read_only` | `customer_readonly` | Use existing role. |
| `modules`, `tenant_modules` | `products`, `plans`, `plan_features`, `subscriptions`, `subscription_entitlements` | Entitlements remain platform-owned. |
| `module_code` | Feature keys | Use namespaced FSM keys, for example `fsm.module.pm`. |
| `customers` | Platform `contacts` and CRM accounts, plus FSM site metadata | Avoid duplicate person records. |
| `technicians` | Tenant users plus FSM technician profile | Keep technician operational metadata in FSM. |
| `assets` | FSM assets/install base | Tenant-scoped FSM schema. |
| `jobs` | FSM work orders | Port state machine into shared FSM workflow, configurable by segment. |
| `job_technicians` | Multi-technician work-order assignment | Needed for assignment-scoped permissions. |
| `job_labor` | Work-order labor entries | Tenant-scoped FSM schema and audit mutations. |
| `job_state_history` | Work-order state history | Keep behavior; all state changes also write `audit_events`. |
| `sla_pauses`, `client_delays` | FSM SLA pause and delay model | Feature-gated by SLA entitlement. |
| `pm_schedules`, `pm_schedule_templates` | FSM PM model | Feature-gated by PM entitlement. |
| Inspection tables | FSM inspection model | Feature-gated and tied to platform files. |
| Commercial tables | FSM quotation, invoice, service contract, catalog model | Rebuild with platform audit and document footer rules. |
| `audit_logs` | Platform `audit_events` | Do not duplicate audit tables. |
| `org_service_types`, `org_skills`, `org_asset_categories` | FSM defaults/configuration | Seed during onboarding and industry-default application. |
| `org_whatsapp_credentials` | `org_channel_credentials` | Migrate to generic channel credentials with compatibility view during transition. |
| `whatsapp_logs`, conversations, processed messages | Channel Hub logs plus `intake_requests` | All channels feed one intake pipeline. |
| Supabase Storage `inspection-photos` | Platform `files` and Storage path convention | Use tenant-prefixed storage paths and Storage RLS. |

## Entitlements Mapping

The current platform LLD already has `products`, `plans`, `plan_features`, `subscriptions`, and `subscription_entitlements`. The requested FSM `plan_tier` and `plan_features` design overlaps this model.

Recommended WP-27 approach:

1. Keep `plans.key` as the tier key for the FSM product: `entry`, `growth`, `enterprise`.
2. Seed FSM feature keys into the existing global `plan_features` table through the FSM product plans.
3. Add override support only for the missing override metadata: reason, expiry, and platform-admin workflow.
4. Implement one resolver that merges plan features and overrides, then materializes or reads `subscription_entitlements`.
5. Never have pages check plan names directly.

WP-27 implemented this mapping through `subscriptions`, `subscription_entitlements`, `org_feature_overrides`, and `get_org_entitlements(org_id)`. `tenants.plan_tier` remains a summary and onboarding default. Runtime gates must use entitlements.

Initial staging-to-feature mapping:

| Staging module/page | Feature key candidate |
| --- | --- |
| PM schedules/templates/generation | `fsm.module.pm` |
| SLA settings, SLA board, pauses, client delays | `fsm.module.sla` |
| Inspections and checklists | `fsm.module.inspections` |
| Contracts, quotations, invoices, catalog | `fsm.module.contracts` plus document feature keys where needed |
| Fault analytics, AI reports | `fsm.module.ai` |
| Compliance placeholders | `fsm.module.compliance` |
| WhatsApp logs/webhook/send | `fsm.channel.whatsapp` |
| Route map and route optimization | `fsm.route_optimization` |
| Technician PWA | `fsm.technician_pwa` |

## Segment Mapping

Business segment has no current platform equivalent. WP-27 should add it as tenant-level configuration. The execution prompt names `organizations.business_segment`; the platform mapping is `tenants.business_segment` unless a compatibility view is required for imported staging data.

| Segment | Suggested plan | Platform handling |
| --- | --- | --- |
| SOLO | Entry | Tenant segment controls nav, terms, flow settings, and dashboard presets. |
| TRADE | Growth | Same, with PM/contracts/SLA prominent. |
| FM | Enterprise, Growth minimum | Same, with SLA and Channel Hub features prominent. |
| COMMUNITY | Growth or Enterprise | Same, with resident terminology and portal settings. |
| OEM | Enterprise, Growth minimum | Same, with install-base, warranty, and serial-number terminology. |

## Edge Function Mapping

| Staging function | Platform destination |
| --- | --- |
| `apply-industry-defaults` | Onboarding/provisioning step, shared FSM default seeding service. |
| `onboard-organization` | Platform tenant provisioning plus FSM onboarding wizard. |
| `manage-org-user` | Existing customer/user administration, extended with seat entitlements. |
| `platform-admin-delete` | Existing tenant lifecycle/export/archive policy. |
| `platform-tenant-usage` | Platform usage reporting. |
| `export-organization-data` | Tenant export runbook and Admin Portal control. |
| `auto-generate-pm-jobs` | FSM scheduled PM generation workflow. |
| `auto-schedule-jobs` | Dispatch automation behind entitlement. |
| `optimize-pm-routes` | Route optimization provider adapter. |
| `generate-inspection-report`, `generate-service-report` | Platform report/PDF generation with Torrevie footer. |
| Email send/reminder functions | `packages/notifications` and server-side document actions. |
| `send-whatsapp`, `whatsapp-webhook` | Channel Hub provider adapters and intake pipeline. |
| `ai-reports` | `packages/ai-gateway` and FSM analytics/reporting. |

## Conflict Log

| Conflict | Repository source of truth | Resolution |
| --- | --- | --- |
| Staging uses `organizations`; platform LLD uses `tenants`. | `DATABASE_LLD.md`, `AGENTS.md` | Use `tenants` as the tenant root. |
| Staging uses `organization_id`; platform requires `tenant_id`. | `RLS_POLICY_SPEC.md` | New FSM tables use `tenant_id`. Imported records must be mapped. |
| Staging roles are product-local. | `RBAC_MATRIX.md` | Add FSM permissions to platform RBAC and map roles. |
| Staging module system overlaps platform entitlement system. | `DATABASE_LLD.md`, WP-14 | Entitlements remain platform-owned. |
| Staging broad RLS policies allow authenticated reads in early migrations. | `RLS_POLICY_SPEC.md` | Rebuild every policy using explicit tenant-scoped policies and tests. |
| Staging has direct platform-admin policies on product tables. | `RLS_POLICY_SPEC.md` | Use audited service-role/support paths, not relaxed tenant-table RLS. |
| Staging stores UltraMsg-specific credential columns. | TRV-FSM-2026-001 | Migrate to provider-agnostic channel credentials. |
| Staging uses Lovable AI Gateway. | `AGENTS.md`, platform `ai-gateway` ownership | Replace with provider-neutral platform AI gateway. |
| Prompt mentions `PROGRESS.md` at root. | Repository tree | Use `docs/architecture/PROGRESS.md`. |

## Work Package Boundary

WP-26 does not introduce FSM schema, routes, channel providers, or entitlements. It establishes the mapping and smoke-test safety net only. WP-27 starts implementation.
