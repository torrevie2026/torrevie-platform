alter table public.tex_integration_settings
  add column if not exists email_notifications_enabled boolean not null default false,
  add column if not exists email_report_frequency text not null default 'weekly'
    check (email_report_frequency in ('off', 'daily', 'weekly', 'monthly')),
  add column if not exists email_report_recipients text[] not null default '{}';

create table if not exists public.tenant_whatsapp_provider_profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  label text not null,
  provider text not null check (provider in ('ultramsg', 'wappfly', 'meta')),
  status text not null default 'active' check (status in ('active', 'inactive')),
  is_default boolean not null default false,
  webhook_url text,
  whatsapp_instance_id text,
  wappfly_session_id text,
  meta_phone_number_id text,
  meta_whatsapp_business_account_id text,
  api_key_last4 text,
  keys_configured boolean not null default false,
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, label)
);

create unique index if not exists tenant_whatsapp_provider_profiles_one_default_idx
  on public.tenant_whatsapp_provider_profiles (tenant_id)
  where is_default;

create index if not exists tenant_whatsapp_provider_profiles_tenant_status_idx
  on public.tenant_whatsapp_provider_profiles (tenant_id, status);

drop trigger if exists tenant_whatsapp_provider_profiles_set_updated_at on public.tenant_whatsapp_provider_profiles;
create trigger tenant_whatsapp_provider_profiles_set_updated_at
before update on public.tenant_whatsapp_provider_profiles
for each row execute function public.set_updated_at();

alter table public.tenant_whatsapp_provider_profiles enable row level security;

drop policy if exists tenant_whatsapp_provider_profiles_select on public.tenant_whatsapp_provider_profiles;
drop policy if exists tenant_whatsapp_provider_profiles_insert on public.tenant_whatsapp_provider_profiles;
drop policy if exists tenant_whatsapp_provider_profiles_update on public.tenant_whatsapp_provider_profiles;
drop policy if exists tenant_whatsapp_provider_profiles_delete on public.tenant_whatsapp_provider_profiles;

create policy tenant_whatsapp_provider_profiles_select
on public.tenant_whatsapp_provider_profiles
for select
to authenticated
using (tenant_id = public.current_tenant_id());

create policy tenant_whatsapp_provider_profiles_insert
on public.tenant_whatsapp_provider_profiles
for insert
to authenticated
with check (tenant_id = public.current_tenant_id());

create policy tenant_whatsapp_provider_profiles_update
on public.tenant_whatsapp_provider_profiles
for update
to authenticated
using (tenant_id = public.current_tenant_id())
with check (tenant_id = public.current_tenant_id());

create policy tenant_whatsapp_provider_profiles_delete
on public.tenant_whatsapp_provider_profiles
for delete
to authenticated
using (tenant_id = public.current_tenant_id());

grant select, insert, update, delete on public.tenant_whatsapp_provider_profiles to authenticated;
grant select, insert, update, delete on public.tenant_whatsapp_provider_profiles to service_role;

alter table public.tenant_integration_secrets
  add column if not exists profile_id uuid references public.tenant_whatsapp_provider_profiles(id) on delete cascade;

alter table public.tenant_integration_secrets
  drop constraint if exists tenant_integration_secrets_tenant_id_product_key_integration_key_secret_name_key;

create unique index if not exists tenant_integration_secrets_profile_secret_idx
  on public.tenant_integration_secrets (
    tenant_id,
    product_key,
    integration_key,
    coalesce(profile_id, '00000000-0000-0000-0000-000000000000'::uuid),
    secret_name
  );

insert into public.plan_features (plan_id, feature_key, limit_value)
select plans.id, features.feature_key, features.limit_value
from public.plans
join public.products on products.id = plans.product_id
join (
  values
    ('starter', 'tenant.users.web.max', 5),
    ('starter', 'tex.whatsapp.provider_profiles.max', 1),
    ('starter', 'tenant.database.storage_mb.max', 512),
    ('starter', 'tex.email.notifications.monthly_limit', 500),
    ('growth', 'tenant.users.web.max', 25),
    ('growth', 'tex.whatsapp.provider_profiles.max', 2),
    ('growth', 'tenant.database.storage_mb.max', 2048),
    ('growth', 'tex.email.notifications.monthly_limit', 5000),
    ('enterprise', 'tenant.users.web.max', null),
    ('enterprise', 'tex.whatsapp.provider_profiles.max', 5),
    ('enterprise', 'tenant.database.storage_mb.max', null),
    ('enterprise', 'tex.email.notifications.monthly_limit', null)
) as features(plan_key, feature_key, limit_value)
  on features.plan_key = plans.key
where products.key = 'tex'
  and not exists (
    select 1
    from public.plan_features existing
    where existing.plan_id = plans.id
      and existing.feature_key = features.feature_key
  );
