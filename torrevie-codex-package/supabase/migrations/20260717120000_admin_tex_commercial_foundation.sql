create type public.tex_plan_key as enum ('trial', 'lite', 'growth', 'enterprise');
create type public.tex_plan_status as enum ('trialing', 'active', 'expired', 'suspended', 'cancelled');
create type public.tex_whatsapp_provider_scope as enum ('not_configured', 'torrevie_managed', 'customer_owned');
create type public.tex_billing_status as enum ('not_configured', 'manual_invoice_pending', 'invoiced', 'paid', 'overdue', 'waived');
create type public.tex_enterprise_request_status as enum ('requested', 'contacted', 'discovery', 'proposal', 'setup', 'live', 'closed');

create table public.tex_plan_controls (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  plan_key public.tex_plan_key not null default 'trial',
  plan_status public.tex_plan_status not null default 'trialing',
  trial_start_date date,
  trial_end_date date,
  employee_limit integer not null default 5 check (employee_limit >= 0),
  seat_count integer not null default 0 check (seat_count >= 0),
  whatsapp_provider_scope public.tex_whatsapp_provider_scope not null default 'not_configured',
  billing_status public.tex_billing_status not null default 'not_configured',
  renewal_date date,
  internal_plan_notes text not null default '',
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id)
);

create table public.tex_onboarding_status (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  company_profile_completed_at timestamptz,
  whatsapp_connected_at timestamptz,
  first_employee_invited_at timestamptz,
  first_receipt_received_at timestamptz,
  first_expense_approved_at timestamptz,
  dashboard_first_viewed_at timestamptz,
  last_activity_at timestamptz,
  ocr_pending_count integer not null default 0 check (ocr_pending_count >= 0),
  manual_review_count integer not null default 0 check (manual_review_count >= 0),
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id)
);

create table public.tex_enterprise_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  status public.tex_enterprise_request_status not null default 'requested',
  requested_capabilities text[] not null default '{}',
  contact_name text not null default '',
  contact_email text not null default '',
  contact_phone text not null default '',
  contact_position text not null default '',
  internal_owner_user_id uuid references public.users(id) on delete set null,
  internal_notes text not null default '',
  target_go_live_date date,
  next_follow_up_date date,
  closed_at timestamptz,
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tex_plan_controls_tenant_status_idx
  on public.tex_plan_controls (tenant_id, plan_status, trial_end_date);

create index tex_plan_controls_status_trial_end_idx
  on public.tex_plan_controls (plan_status, trial_end_date);

create index tex_onboarding_status_tenant_last_activity_idx
  on public.tex_onboarding_status (tenant_id, last_activity_at desc);

create index tex_enterprise_requests_tenant_status_idx
  on public.tex_enterprise_requests (tenant_id, status, next_follow_up_date);

create index tex_enterprise_requests_status_follow_up_idx
  on public.tex_enterprise_requests (status, next_follow_up_date);

create trigger tex_plan_controls_set_updated_at before update on public.tex_plan_controls
for each row execute function public.set_updated_at();

create trigger tex_onboarding_status_set_updated_at before update on public.tex_onboarding_status
for each row execute function public.set_updated_at();

create trigger tex_enterprise_requests_set_updated_at before update on public.tex_enterprise_requests
for each row execute function public.set_updated_at();

alter table public.tex_plan_controls enable row level security;
alter table public.tex_onboarding_status enable row level security;
alter table public.tex_enterprise_requests enable row level security;

grant select, insert, update, delete on public.tex_plan_controls to authenticated;
grant select, insert, update, delete on public.tex_onboarding_status to authenticated;
grant select, insert, update, delete on public.tex_enterprise_requests to authenticated;
grant select, insert, update, delete on public.tex_plan_controls to service_role;
grant select, insert, update, delete on public.tex_onboarding_status to service_role;
grant select, insert, update, delete on public.tex_enterprise_requests to service_role;

create policy tex_plan_controls_select on public.tex_plan_controls for select to authenticated using (tenant_id = public.current_tenant_id());
create policy tex_plan_controls_insert on public.tex_plan_controls for insert to authenticated with check (tenant_id = public.current_tenant_id());
create policy tex_plan_controls_update on public.tex_plan_controls for update to authenticated using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy tex_plan_controls_delete on public.tex_plan_controls for delete to authenticated using (tenant_id = public.current_tenant_id());

create policy tex_onboarding_status_select on public.tex_onboarding_status for select to authenticated using (tenant_id = public.current_tenant_id());
create policy tex_onboarding_status_insert on public.tex_onboarding_status for insert to authenticated with check (tenant_id = public.current_tenant_id());
create policy tex_onboarding_status_update on public.tex_onboarding_status for update to authenticated using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy tex_onboarding_status_delete on public.tex_onboarding_status for delete to authenticated using (tenant_id = public.current_tenant_id());

create policy tex_enterprise_requests_select on public.tex_enterprise_requests for select to authenticated using (tenant_id = public.current_tenant_id());
create policy tex_enterprise_requests_insert on public.tex_enterprise_requests for insert to authenticated with check (tenant_id = public.current_tenant_id());
create policy tex_enterprise_requests_update on public.tex_enterprise_requests for update to authenticated using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy tex_enterprise_requests_delete on public.tex_enterprise_requests for delete to authenticated using (tenant_id = public.current_tenant_id());

insert into public.plans (product_id, key, label)
select products.id, plan_keys.key, plan_keys.label
from public.products
join (
  values
    ('trial', 'Trial'),
    ('lite', 'Lite'),
    ('growth', 'Growth'),
    ('enterprise', 'Enterprise')
) as plan_keys(key, label) on true
where products.key = 'tex'
on conflict (product_id, key) do update set label = excluded.label;

insert into public.plan_features (plan_id, feature_key, limit_value, enabled)
select plans.id, features.feature_key, features.limit_value, features.enabled
from public.plans
join public.products on products.id = plans.product_id
join (
  values
    ('trial', 'tex.enabled', null, true),
    ('trial', 'tex.employee_limit', 5, true),
    ('trial', 'tex.whatsapp.enabled', null, true),
    ('trial', 'tex.receipts.ocr.enabled', null, true),
    ('trial', 'tex.approval_workflow.enabled', null, true),
    ('lite', 'tex.enabled', null, true),
    ('lite', 'tex.employee_limit', 10, true),
    ('lite', 'tex.whatsapp.enabled', null, true),
    ('lite', 'tex.receipts.ocr.enabled', null, true),
    ('lite', 'tex.approval_workflow.enabled', null, true),
    ('growth', 'tex.enabled', null, true),
    ('growth', 'tex.employee_limit', 50, true),
    ('growth', 'tex.whatsapp.enabled', null, true),
    ('growth', 'tex.receipts.ocr.enabled', null, true),
    ('growth', 'tex.approval_workflow.enabled', null, true),
    ('growth', 'tex.trips.enabled', null, true),
    ('growth', 'tex.erp_export.enabled', null, true),
    ('enterprise', 'tex.enabled', null, true),
    ('enterprise', 'tex.employee_limit', null, true),
    ('enterprise', 'tex.whatsapp.enabled', null, true),
    ('enterprise', 'tex.receipts.ocr.enabled', null, true),
    ('enterprise', 'tex.approval_workflow.enabled', null, true),
    ('enterprise', 'tex.trips.enabled', null, true),
    ('enterprise', 'tex.erp_export.enabled', null, true),
    ('enterprise', 'tex.enterprise_onboarding.enabled', null, true)
) as features(plan_key, feature_key, limit_value, enabled)
  on features.plan_key = plans.key
where products.key = 'tex'
on conflict (plan_id, feature_key) do update set
  limit_value = excluded.limit_value,
  enabled = excluded.enabled;
