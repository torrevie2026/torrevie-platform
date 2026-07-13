# Torrevie FSM Staging State

Reference: TRV-FSM-2026-001, WP-26.

## Source Status

The Lovable staging export is present at `reference/fsm-staging/`. It is a Vite React 18 app with Supabase migrations and Edge Functions. It is excluded from platform lint, formatting, builds, and deployments through repository ignore rules. It is a blueprint only, not the system of record.

Top-level source shape:

| Area | Confirmed files |
| --- | --- |
| Web app | `src/App.tsx`, `src/pages/*`, `src/components/*`, `src/hooks/*` |
| Supabase schema | `supabase/migrations/*.sql` |
| Edge Functions | `supabase/functions/*/index.ts` |
| Generated Supabase types | `src/integrations/supabase/types.ts` |
| PWA assets | `public/*`, `vite-plugin-pwa` dependency |

## Stack

| Concern | Staging implementation |
| --- | --- |
| Web | React 18, Vite, TypeScript, React Router |
| UI | shadcn-ui, Tailwind CSS, lucide-react |
| Data fetching | TanStack Query |
| Backend | Supabase Postgres, Auth, Storage, Edge Functions |
| PWA | `vite-plugin-pwa`, Workbox |
| Maps | Mapbox |
| Email | Resend |
| WhatsApp | UltraMsg |
| AI | Lovable AI Gateway |

## Routes

Routes are defined in `reference/fsm-staging/src/App.tsx`. Access is guarded by `ProtectedRoute` and product modules are filtered in `AppLayout`.

| Route | Page | Roles in staging | Platform target |
| --- | --- | --- | --- |
| `/auth` | `Auth` | Public | Platform auth remains in `packages/auth` and app login surfaces. |
| `/reset-password` | `ResetPassword` | Public | Platform auth flow. |
| `/` | `Dashboard` | admin, dispatcher, read_only | FSM adaptive dashboard. |
| `/jobs` | `Jobs` | admin, dispatcher, read_only | FSM work orders. |
| `/scheduling` | `Scheduling` | admin, dispatcher | FSM scheduling and dispatch. |
| `/routes` | `RouteMap` | admin, dispatcher | Route optimization feature. |
| `/customers` | `Customers` | authenticated | Platform contacts/accounts with FSM context. |
| `/technicians` | `Technicians` | admin, dispatcher | Platform users plus FSM technician profile. |
| `/assets` | `Assets` | authenticated | FSM assets and install base. |
| `/contracts` | `Contracts` | admin, dispatcher | FSM service contracts. |
| `/pm` | `PmSchedules` | admin, dispatcher | PM calendar behind entitlement. |
| `/whatsapp` | `WhatsappLogs` | admin, dispatcher | Channel Hub logs. |
| `/users` | `Users` | admin | Platform customer administration. |
| `/modules` | `OrganizationModules` | admin | Platform subscriptions and entitlement controls. |
| `/inspection-templates` | `InspectionTemplates` | admin | FSM inspections configuration. |
| `/sla-settings` | `SlaSettings` | admin | FSM SLA configuration. |
| `/org-settings` | `OrganizationSettings` | admin | Tenant settings plus FSM settings. |
| `/catalog` | `ServiceCatalog` | admin, dispatcher | FSM service catalog and parts. |
| `/invoices` | `Invoices` | admin, dispatcher | FSM invoices. |
| `/triage` | `TriageQueue` | admin, dispatcher | Channel Hub triage reading `intake_requests`. |
| `/fault-analytics` | `FaultAnalytics` | admin, dispatcher | ROI and analytics feature. |
| `/ops` | `OpsDashboard` | admin, dispatcher | FM command center dashboard. |
| `/tech-performance` | `TechnicianPerformance` | admin, dispatcher | FSM performance reporting. |
| `/ai-reports` | `AiReports` | admin, dispatcher | AI reports behind entitlement. |
| `/my-jobs` | `TechnicianDashboard` | technician | Responsive PWA technician experience unless Flutter checkpoint is approved. |
| `/platform-admin` | `PlatformAdmin` | platform_admin | Existing Admin Portal. |
| `/platform-admin/onboard` | `PlatformOnboarding` | platform_admin | Existing provisioning plus new onboarding wizard. |
| `/platform-admin/org/:orgId` | `PlatformOrgDetails` | platform_admin | Existing Admin Portal tenant detail. |
| `/platform-admin/usage` | `PlatformUsage` | platform_admin | Existing usage reporting. |
| `/install` | `Install` | Public | PWA install helper if still needed. |

## Navigation and Module Guards

`src/components/layout/AppLayout.tsx` defines static navigation and filters by staging roles and modules.

Confirmed module codes:

- `pm`
- `inspections`
- `sla`
- `contracts`
- `compliance`
- `ai`

Platform port:

- Replace static navigation with segment profiles.
- Replace `tenant_modules` checks with the platform entitlement resolver.
- Keep only one shared page per capability; segment profiles rename and reorder.

## Enums

Confirmed staging enums:

| Enum | Values or purpose |
| --- | --- |
| `app_role` | `admin`, `dispatcher`, `technician`, `read_only`; later extended by `platform_admin` in code. |
| `customer_type` | `residential`, `commercial`, `fm` |
| `job_status` | 17-state work-order workflow from `new` through `closed`, including `triage`, `waiting_info`, `waiting_access`, `on_hold`, `temp_fix`, `pending_approval`, `rework`. |
| `urgency_level` | `low`, `medium`, `high`, `emergency` |
| `contract_tier` | `basic`, `gold`, `platinum` |
| `technician_status` | `available`, `busy`, `offline` |
| `sla_status` | `on_track`, `at_risk`, `breached` |
| `whatsapp_status` | `pending`, `sent`, `delivered`, `read`, `failed` |
| `module_code` | `pm`, `inspections`, `sla`, `contracts`, `compliance`, `ai` |
| `tenant_module_status` | `active`, `trial`, `suspended` |
| `industry_type` | `fire_safety`, `hvac`, `electrical`, `general_maintenance`; prompt later adds `entrance_systems`, `home_maintenance`. |

## Tables

Confirmed staging tables:

| Domain | Tables |
| --- | --- |
| Identity and tenancy | `organizations`, `profiles`, `user_roles` |
| Modules | `modules`, `tenant_modules` |
| Customers and assets | `customers`, `assets`, `technicians` |
| Jobs | `jobs`, `job_state_history`, `job_labor`, `job_technicians`, `job_templates` |
| SLA and delays | `sla_pauses`, `client_delays` |
| PM | `pm_schedules`, `pm_schedule_templates` |
| Inspections | `inspection_templates`, `inspection_template_items`, `inspections`, `inspection_items`, `inspection_photos` |
| Commercial | `service_contracts`, `service_catalog`, `quotations`, `quotation_items`, `invoices`, `invoice_items` |
| Reporting | `report_templates`, `audit_logs` |
| Industry defaults | `org_service_types`, `org_skills`, `org_asset_categories` |
| WhatsApp | `org_whatsapp_credentials`, `whatsapp_logs`, `whatsapp_conversations`, `whatsapp_processed_messages` |

## Database Functions

Confirmed staging functions:

| Function | Purpose |
| --- | --- |
| `has_role`, `is_admin`, `is_dispatcher_or_admin`, `is_platform_admin` | Staging RBAC helpers. Map to platform permissions. |
| `get_user_org_id`, `in_user_org` | Staging tenant-scope helpers. Map to `current_tenant_id()` and platform tenant context. |
| `tenant_has_module`, `user_has_module` | Staging module entitlement helpers. Map to platform entitlement resolver. |
| `get_technician_id` | Technician profile lookup. |
| `generate_job_number`, `set_job_number` | Work-order numbering. |
| `generate_contract_number`, `set_contract_number` | Contract numbering. |
| `generate_invoice_number`, `set_invoice_number` | Invoice numbering. |
| `calculate_line_total`, `update_quotation_totals`, `update_invoice_totals` | Commercial document totals. |
| `record_job_state_change` | Job state history trigger behavior. |
| `get_effective_sla_deadline` | SLA pause-aware deadline. |
| `set_sla_pause_duration_minutes` | SLA pause duration bookkeeping. |
| `update_updated_at` | Timestamp trigger. |
| `handle_new_user` | Staging Auth profile bootstrap. |

## Edge Functions

Confirmed staging Edge Functions:

| Function | Purpose | Integration notes |
| --- | --- | --- |
| `apply-industry-defaults` | Seeds service types, skills, and asset categories. | Port into onboarding/provisioning. |
| `onboard-organization` | Creates organization, users, modules, and defaults. | Replace with platform provisioning and onboarding wizard. |
| `manage-org-user` | Invites/manages organization users. | Replace with platform customer administration and seat limits. |
| `platform-admin-delete` | Deletes organization data. | Replace with platform lifecycle/archive/export policy. |
| `platform-tenant-usage` | Usage reporting. | Map to platform usage reporting. |
| `export-organization-data` | Data export. | Map to tenant export runbook. |
| `auto-generate-pm-jobs` | PM job generation. | Port as FSM scheduled workflow, gated by PM entitlement. |
| `auto-schedule-jobs` | Scheduling automation. | Port behind dispatch feature. |
| `optimize-pm-routes` | Route optimization. | Uses Mapbox and service role; port behind adapter/entitlement. |
| `generate-inspection-report` | Inspection report generation. | Must use platform files and Torrevie PDF footer. |
| `generate-service-report` | Service report generation. | Must use platform files and Torrevie PDF footer. |
| `send-quotation-email` | Sends quotation email. | Uses Resend. Port to notifications package. |
| `send-invoice-email` | Sends invoice email. | Uses Resend. Port to notifications package. |
| `send-overdue-reminder` | Sends overdue invoice reminders. | Uses Resend. Port to notifications package. |
| `send-whatsapp` | Sends outbound UltraMsg WhatsApp messages. | Replace with provider adapter. |
| `whatsapp-webhook` | Handles inbound UltraMsg webhook, AI parsing, conversations, dedupe, job creation. | Feed Channel Hub `intake_requests`. |
| `ai-reports` | Generates AI reports. | Uses Lovable AI Gateway. Port to platform `ai-gateway`. |

## Provider and Secret Usage

| Provider or secret | Where found | Platform handling |
| --- | --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | Many Edge Functions | Server-only. Keep out of browser and Flutter. Audit every use. |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | User management and email functions | Use platform notifications package. |
| `ULTRAMSG_WEBHOOK_SECRET` | `whatsapp-webhook` | Replace with per-channel secret in Channel Hub. |
| UltraMsg instance/token | `org_whatsapp_credentials`, WhatsApp functions | Migrate to `org_channel_credentials`. |
| `LOVABLE_API_KEY` | `whatsapp-webhook`, `ai-reports` | Replace with platform `ai-gateway`; no Lovable dependency in production. |
| `MAPBOX_PUBLIC_TOKEN` | `optimize-pm-routes` | Treat as route provider config, not hardcoded business logic. |
| `CRON_SECRET` | `auto-generate-pm-jobs` | Replace with platform scheduled-job convention. |

## RLS Inventory

The staging export enables RLS on all confirmed staging tables and on some `storage.objects` and `realtime.messages` paths. Its policies are not the platform pattern. Common staging patterns include:

- `in_user_org(organization_id)`
- role helper predicates such as `is_admin(auth.uid())`
- broad authenticated reads in early migrations
- service-role-only policies for WhatsApp internal tables
- public storage read for `inspection-photos`, later tightened by organization path checks
- platform-admin cross-tenant policies on product tables

Platform port requirements:

- Use `tenant_id`, not `organization_id`, on every tenant-scoped platform table.
- Use `current_tenant_id()` as the RLS backstop.
- Create four explicit policies per tenant-scoped table.
- Keep role and entitlement logic in server-side application code plus platform permission packages.
- Use audited service-role paths for cross-tenant platform administration.
- Add tenant-isolation tests for every new table and route.

## Key Behavioral Findings

- WhatsApp inbound is more than logging. It identifies customers or technicians, auto-creates prospects, handles customer confirmation/rejection, handles technician acknowledgement, starts conversational intake, uses AI extraction, stores media, deduplicates messages, and can create jobs.
- The staging app has a real technician PWA dashboard. No Flutter app exists in the current platform tree, so the phase should continue with the responsive PWA unless Flutter work is explicitly approved.
- Current staging onboarding is platform-like but duplicates platform concepts. It must be harvested for workflow and defaults, not copied as architecture.
- The staging app's module gate is useful as behavior but must be replaced by the platform entitlement engine.
- The staging UI and copy are not Torrevie brand compliant and should not be ported unchanged.
