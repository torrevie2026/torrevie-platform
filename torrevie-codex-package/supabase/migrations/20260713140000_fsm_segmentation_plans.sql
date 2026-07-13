create type public.business_segment as enum ('SOLO', 'TRADE', 'FM', 'COMMUNITY', 'OEM');
create type public.plan_tier as enum ('entry', 'growth', 'enterprise');

alter table public.tenants
  add column business_segment public.business_segment not null default 'TRADE',
  add column plan_tier public.plan_tier not null default 'entry',
  add column terminology_pack text not null default 'trade',
  add column nav_profile text not null default 'trade',
  add column flow_settings jsonb not null default '{}'::jsonb,
  add column onboarding_answers jsonb not null default '{}'::jsonb,
  add column baseline_metrics jsonb not null default '{}'::jsonb;

update public.tenants
set
  business_segment = coalesce(business_segment, 'TRADE'::public.business_segment),
  plan_tier = 'growth'::public.plan_tier,
  terminology_pack = coalesce(nullif(terminology_pack, ''), 'trade'),
  nav_profile = coalesce(nullif(nav_profile, ''), 'trade'),
  flow_settings = coalesce(flow_settings, '{}'::jsonb),
  onboarding_answers = coalesce(onboarding_answers, '{}'::jsonb),
  baseline_metrics = coalesce(baseline_metrics, '{}'::jsonb);

alter table public.tenants
  add constraint tenants_terminology_pack_check
  check (terminology_pack in ('solo', 'trade', 'fm', 'community', 'oem')),
  add constraint tenants_nav_profile_check
  check (nav_profile in ('solo', 'trade', 'fm', 'community', 'oem'));

alter table public.plan_features
  add column enabled boolean not null default true;

alter table public.subscription_entitlements
  add column enabled boolean not null default true;

create unique index if not exists plan_features_plan_id_feature_key_idx
  on public.plan_features (plan_id, feature_key);

create unique index if not exists subscription_entitlements_subscription_feature_idx
  on public.subscription_entitlements (subscription_id, feature_key);

create table public.org_feature_overrides (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  feature_key text not null,
  enabled boolean not null,
  limit_value integer,
  reason text not null,
  expires_at timestamptz,
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, feature_key)
);

create index org_feature_overrides_tenant_feature_idx
  on public.org_feature_overrides (tenant_id, feature_key);

create index org_feature_overrides_tenant_expires_idx
  on public.org_feature_overrides (tenant_id, expires_at);

create trigger org_feature_overrides_set_updated_at
before update on public.org_feature_overrides
for each row execute function public.set_updated_at();

alter table public.org_feature_overrides enable row level security;

create policy org_feature_overrides_select
on public.org_feature_overrides
for select
to authenticated
using (tenant_id = public.current_tenant_id());

create policy org_feature_overrides_insert
on public.org_feature_overrides
for insert
to authenticated
with check (tenant_id = public.current_tenant_id());

create policy org_feature_overrides_update
on public.org_feature_overrides
for update
to authenticated
using (tenant_id = public.current_tenant_id())
with check (tenant_id = public.current_tenant_id());

create policy org_feature_overrides_delete
on public.org_feature_overrides
for delete
to authenticated
using (tenant_id = public.current_tenant_id());

grant select, insert, update, delete on public.org_feature_overrides to authenticated;
grant select, insert, update, delete on public.org_feature_overrides to service_role;
grant select, update on public.tenants to service_role;
grant select, update on public.plan_features to service_role;
grant select, update on public.subscription_entitlements to service_role;

insert into public.products (key, label) values ('fsm', 'FSM')
on conflict (key) do update set label = excluded.label;

update public.plans
set key = 'entry', label = 'Entry'
where product_id = (select id from public.products where key = 'fsm')
  and key = 'starter'
  and not exists (
    select 1
    from public.plans existing
    where existing.product_id = public.plans.product_id
      and existing.key = 'entry'
  );

insert into public.plans (product_id, key, label)
select products.id, 'entry', 'Entry'
from public.products
where products.key = 'fsm'
on conflict (product_id, key) do update set label = excluded.label;

insert into public.plan_features (plan_id, feature_key, limit_value, enabled)
select plans.id, features.feature_key, features.limit_value, features.enabled
from public.plans
join public.products on products.id = plans.product_id
join (
  values
    ('entry', 'fsm.users.field.max', 5, true),
    ('entry', 'fsm.users.office.max', 2, true),
    ('entry', 'fsm.core.jobs.enabled', null, true),
    ('entry', 'fsm.core.scheduling.enabled', null, true),
    ('entry', 'fsm.core.customers.enabled', null, true),
    ('entry', 'fsm.commercial.quotations.enabled', null, true),
    ('entry', 'fsm.commercial.invoices.enabled', null, true),
    ('entry', 'fsm.channel.whatsapp.enabled', 1, true),
    ('entry', 'fsm.channel.whatsapp.manual_triage.enabled', null, true),
    ('entry', 'fsm.assets.basic.enabled', null, true),
    ('entry', 'fsm.roi.basic.enabled', null, true),
    ('growth', 'fsm.users.field.max', 50, true),
    ('growth', 'fsm.users.office.max', 10, true),
    ('growth', 'fsm.core.jobs.enabled', null, true),
    ('growth', 'fsm.core.scheduling.enabled', null, true),
    ('growth', 'fsm.core.customers.enabled', null, true),
    ('growth', 'fsm.commercial.quotations.enabled', null, true),
    ('growth', 'fsm.commercial.invoices.enabled', null, true),
    ('growth', 'fsm.channel.whatsapp.enabled', 1, true),
    ('growth', 'fsm.channel.whatsapp.ai_triage.enabled', null, true),
    ('growth', 'fsm.channel.email.enabled', null, true),
    ('growth', 'fsm.channel.portal.basic.enabled', null, true),
    ('growth', 'fsm.module.pm', null, true),
    ('growth', 'fsm.module.sla', null, true),
    ('growth', 'fsm.module.inspections', null, true),
    ('growth', 'fsm.module.contracts', null, true),
    ('growth', 'fsm.assets.full.enabled', null, true),
    ('growth', 'fsm.route_optimization.enabled', null, true),
    ('growth', 'fsm.roi.full.enabled', null, true),
    ('growth', 'fsm.ai_reports.enabled', null, true),
    ('growth', 'fsm.voice.addon.available', null, true),
    ('enterprise', 'fsm.users.field.max', null, true),
    ('enterprise', 'fsm.users.office.max', null, true),
    ('enterprise', 'fsm.core.jobs.enabled', null, true),
    ('enterprise', 'fsm.core.scheduling.enabled', null, true),
    ('enterprise', 'fsm.core.customers.enabled', null, true),
    ('enterprise', 'fsm.commercial.quotations.enabled', null, true),
    ('enterprise', 'fsm.commercial.invoices.enabled', null, true),
    ('enterprise', 'fsm.channel.whatsapp.enabled', null, true),
    ('enterprise', 'fsm.channel.whatsapp.ai_triage.enabled', null, true),
    ('enterprise', 'fsm.channel.whatsapp.templates.enabled', null, true),
    ('enterprise', 'fsm.channel.email.enabled', null, true),
    ('enterprise', 'fsm.channel.voice.enabled', null, true),
    ('enterprise', 'fsm.channel.portal.branded.enabled', null, true),
    ('enterprise', 'fsm.module.pm', null, true),
    ('enterprise', 'fsm.module.sla', null, true),
    ('enterprise', 'fsm.module.sla.custom_matrices.enabled', null, true),
    ('enterprise', 'fsm.module.inspections', null, true),
    ('enterprise', 'fsm.module.contracts', null, true),
    ('enterprise', 'fsm.module.compliance', null, true),
    ('enterprise', 'fsm.assets.full.enabled', null, true),
    ('enterprise', 'fsm.assets.warranty_serial.enabled', null, true),
    ('enterprise', 'fsm.route_optimization.enabled', null, true),
    ('enterprise', 'fsm.roi.full.enabled', null, true),
    ('enterprise', 'fsm.client_report_packs.enabled', null, true),
    ('enterprise', 'fsm.ai_reports.enabled', null, true),
    ('enterprise', 'fsm.sub_organizations.enabled', null, true),
    ('enterprise', 'fsm.api_access.enabled', null, true),
    ('enterprise', 'fsm.sso.enabled', null, true),
    ('enterprise', 'fsm.white_label.portal.enabled', null, true)
) as features(plan_key, feature_key, limit_value, enabled)
  on features.plan_key = plans.key
where products.key = 'fsm'
on conflict (plan_id, feature_key) do update set
  limit_value = excluded.limit_value,
  enabled = excluded.enabled,
  updated_at = now();

insert into public.permissions (key, description) values
  ('fsm.entitlement.override', 'Grant or revoke FSM feature overrides for a tenant'),
  ('fsm.settings.manage', 'Manage FSM segment, plan, onboarding, and flow settings')
on conflict (key) do update set description = excluded.description;

insert into public.role_permissions (role_id, permission_id)
select roles.id, permissions.id
from public.roles
join public.permissions on permissions.key in ('fsm.entitlement.override', 'fsm.settings.manage')
where roles.key in ('torrevie_platform_admin', 'torrevie_billing_admin')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select roles.id, permissions.id
from public.roles
join public.permissions on permissions.key = 'fsm.settings.manage'
where roles.key = 'customer_admin'
on conflict do nothing;

create or replace function public.get_org_entitlements(org_id uuid)
returns table (
  feature_key text,
  enabled boolean,
  limit_value integer,
  source text
)
language sql
stable
security invoker
set search_path = public
as $$
  with active_plan_entitlements as (
    select
      se.feature_key,
      se.enabled,
      se.limit_value
    from public.subscription_entitlements se
    join public.subscriptions s on s.id = se.subscription_id
    where se.tenant_id = org_id
      and s.tenant_id = org_id
      and s.status in ('trial', 'active')
  ),
  active_overrides as (
    select
      ofo.feature_key,
      ofo.enabled,
      ofo.limit_value
    from public.org_feature_overrides ofo
    where ofo.tenant_id = org_id
      and (ofo.expires_at is null or ofo.expires_at > now())
  ),
  keys as (
    select feature_key from active_plan_entitlements
    union
    select feature_key from active_overrides
  )
  select
    keys.feature_key,
    coalesce(active_overrides.enabled, active_plan_entitlements.enabled, false) as enabled,
    coalesce(active_overrides.limit_value, active_plan_entitlements.limit_value) as limit_value,
    case when active_overrides.feature_key is not null then 'override' else 'plan' end as source
  from keys
  left join active_plan_entitlements using (feature_key)
  left join active_overrides using (feature_key)
  where coalesce(active_overrides.enabled, active_plan_entitlements.enabled, false) = true
  order by keys.feature_key;
$$;

grant execute on function public.get_org_entitlements(uuid) to authenticated;
grant execute on function public.get_org_entitlements(uuid) to service_role;
