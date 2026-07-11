create extension if not exists pgcrypto with schema extensions;

create or replace function public.current_tenant_id() returns uuid
language sql stable
set search_path = ''
as $$
  select nullif(current_setting('app.current_tenant_id', true), '')::uuid;
$$;

create or replace function public.is_platform_service_role() returns boolean
language sql stable
set search_path = ''
as $$
  select coalesce(nullif(current_setting('app.platform_service_role', true), '')::boolean, false);
$$;

create or replace function public.set_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  status text not null default 'active' check (status in ('active', 'deactivated')),
  mfa_enrolled boolean not null default false,
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  status text not null check (status in ('active', 'trial', 'suspended', 'archived')),
  region text,
  legal_entity_name text,
  billing_email text,
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tenant_settings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique references public.tenants(id) on delete cascade,
  default_locale text not null default 'en' check (default_locale in ('en', 'ar')),
  timezone text not null default 'Asia/Dubai',
  branding jsonb,
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tenant_memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'invited', 'disabled')),
  invited_by uuid references public.users(id),
  joined_at timestamptz,
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);

create table public.files (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  storage_path text not null,
  filename text not null,
  content_type text,
  size_bytes bigint,
  uploaded_by uuid references public.users(id),
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (storage_path like ('tenant/' || tenant_id::text || '/%'))
);

create table public.user_profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  display_name text not null,
  locale text check (locale is null or locale in ('en', 'ar')),
  avatar_file_id uuid references public.files(id),
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  scope text not null check (scope in ('platform', 'customer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

create table public.user_role_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete restrict,
  assigned_by uuid references public.users(id),
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, user_id, role_id)
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key in ('crm', 'fsm', 'tex', 'cme', 'lqs')),
  label text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  key text not null,
  label text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, key)
);

create table public.plan_features (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans(id) on delete cascade,
  feature_key text not null,
  limit_value integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  plan_id uuid not null references public.plans(id) on delete restrict,
  status text not null check (status in ('trial', 'active', 'expired', 'cancelled')),
  starts_at timestamptz not null,
  expires_at timestamptz,
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, product_id)
);

create table public.subscription_entitlements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  feature_key text not null,
  limit_value integer,
  override_reason text,
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete set null,
  actor_user_id uuid references public.users(id) on delete set null,
  action text not null,
  target_type text,
  target_id uuid,
  metadata jsonb,
  occurred_at timestamptz not null default now()
);

create table public.provisioning_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  status text not null check (status in ('pending', 'running', 'succeeded', 'failed')),
  started_at timestamptz,
  completed_at timestamptz,
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.provisioning_steps (
  id uuid primary key default gen_random_uuid(),
  provisioning_job_id uuid not null references public.provisioning_jobs(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  step_key text not null,
  status text not null check (status in ('pending', 'running', 'succeeded', 'failed')),
  attempt_count integer not null default 0,
  error text,
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tenant_settings_tenant_id_idx on public.tenant_settings (tenant_id);
create index tenant_memberships_tenant_id_user_id_idx on public.tenant_memberships (tenant_id, user_id);
create index files_tenant_id_idx on public.files (tenant_id);
create index user_profiles_tenant_id_user_id_idx on public.user_profiles (tenant_id, user_id);
create index user_role_assignments_tenant_id_user_id_idx on public.user_role_assignments (tenant_id, user_id);
create index subscriptions_tenant_id_product_id_idx on public.subscriptions (tenant_id, product_id);
create index subscription_entitlements_tenant_id_subscription_id_idx on public.subscription_entitlements (tenant_id, subscription_id);
create index audit_events_tenant_id_occurred_at_idx on public.audit_events (tenant_id, occurred_at desc);
create index provisioning_jobs_tenant_id_status_idx on public.provisioning_jobs (tenant_id, status);
create index provisioning_steps_tenant_id_job_id_idx on public.provisioning_steps (tenant_id, provisioning_job_id);

create trigger users_set_updated_at before update on public.users for each row execute function public.set_updated_at();
create trigger tenants_set_updated_at before update on public.tenants for each row execute function public.set_updated_at();
create trigger tenant_settings_set_updated_at before update on public.tenant_settings for each row execute function public.set_updated_at();
create trigger tenant_memberships_set_updated_at before update on public.tenant_memberships for each row execute function public.set_updated_at();
create trigger files_set_updated_at before update on public.files for each row execute function public.set_updated_at();
create trigger user_profiles_set_updated_at before update on public.user_profiles for each row execute function public.set_updated_at();
create trigger roles_set_updated_at before update on public.roles for each row execute function public.set_updated_at();
create trigger permissions_set_updated_at before update on public.permissions for each row execute function public.set_updated_at();
create trigger products_set_updated_at before update on public.products for each row execute function public.set_updated_at();
create trigger plans_set_updated_at before update on public.plans for each row execute function public.set_updated_at();
create trigger plan_features_set_updated_at before update on public.plan_features for each row execute function public.set_updated_at();
create trigger user_role_assignments_set_updated_at before update on public.user_role_assignments for each row execute function public.set_updated_at();
create trigger subscriptions_set_updated_at before update on public.subscriptions for each row execute function public.set_updated_at();
create trigger subscription_entitlements_set_updated_at before update on public.subscription_entitlements for each row execute function public.set_updated_at();
create trigger provisioning_jobs_set_updated_at before update on public.provisioning_jobs for each row execute function public.set_updated_at();
create trigger provisioning_steps_set_updated_at before update on public.provisioning_steps for each row execute function public.set_updated_at();

alter table public.users enable row level security;
alter table public.tenants enable row level security;
alter table public.tenant_settings enable row level security;
alter table public.tenant_memberships enable row level security;
alter table public.files enable row level security;
alter table public.user_profiles enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_role_assignments enable row level security;
alter table public.products enable row level security;
alter table public.plans enable row level security;
alter table public.plan_features enable row level security;
alter table public.subscriptions enable row level security;
alter table public.subscription_entitlements enable row level security;
alter table public.audit_events enable row level security;
alter table public.provisioning_jobs enable row level security;
alter table public.provisioning_steps enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

create policy users_select on public.users for select to authenticated using (
  public.is_platform_service_role()
  or exists (
    select 1 from public.tenant_memberships tm
    where tm.user_id = users.id and tm.tenant_id = public.current_tenant_id()
  )
);
create policy users_insert on public.users for insert to authenticated with check (public.is_platform_service_role());
create policy users_update on public.users for update to authenticated using (public.is_platform_service_role()) with check (public.is_platform_service_role());
create policy users_delete on public.users for delete to authenticated using (public.is_platform_service_role());

create policy tenants_select on public.tenants for select to authenticated using (
  public.is_platform_service_role() or id = public.current_tenant_id()
);
create policy tenants_insert on public.tenants for insert to authenticated with check (public.is_platform_service_role());
create policy tenants_update on public.tenants for update to authenticated using (public.is_platform_service_role()) with check (public.is_platform_service_role());
create policy tenants_delete on public.tenants for delete to authenticated using (public.is_platform_service_role());

create policy tenant_settings_select on public.tenant_settings for select to authenticated using (tenant_id = public.current_tenant_id());
create policy tenant_settings_insert on public.tenant_settings for insert to authenticated with check (tenant_id = public.current_tenant_id());
create policy tenant_settings_update on public.tenant_settings for update to authenticated using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy tenant_settings_delete on public.tenant_settings for delete to authenticated using (tenant_id = public.current_tenant_id());

create policy tenant_memberships_select on public.tenant_memberships for select to authenticated using (tenant_id = public.current_tenant_id());
create policy tenant_memberships_insert on public.tenant_memberships for insert to authenticated with check (tenant_id = public.current_tenant_id());
create policy tenant_memberships_update on public.tenant_memberships for update to authenticated using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy tenant_memberships_delete on public.tenant_memberships for delete to authenticated using (tenant_id = public.current_tenant_id());

create policy files_select on public.files for select to authenticated using (tenant_id = public.current_tenant_id());
create policy files_insert on public.files for insert to authenticated with check (tenant_id = public.current_tenant_id());
create policy files_update on public.files for update to authenticated using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy files_delete on public.files for delete to authenticated using (tenant_id = public.current_tenant_id());

create policy user_profiles_select on public.user_profiles for select to authenticated using (tenant_id = public.current_tenant_id());
create policy user_profiles_insert on public.user_profiles for insert to authenticated with check (tenant_id = public.current_tenant_id());
create policy user_profiles_update on public.user_profiles for update to authenticated using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy user_profiles_delete on public.user_profiles for delete to authenticated using (tenant_id = public.current_tenant_id());

create policy roles_select on public.roles for select to authenticated using (true);
create policy roles_insert on public.roles for insert to authenticated with check (public.is_platform_service_role());
create policy roles_update on public.roles for update to authenticated using (public.is_platform_service_role()) with check (public.is_platform_service_role());
create policy roles_delete on public.roles for delete to authenticated using (public.is_platform_service_role());

create policy permissions_select on public.permissions for select to authenticated using (true);
create policy permissions_insert on public.permissions for insert to authenticated with check (public.is_platform_service_role());
create policy permissions_update on public.permissions for update to authenticated using (public.is_platform_service_role()) with check (public.is_platform_service_role());
create policy permissions_delete on public.permissions for delete to authenticated using (public.is_platform_service_role());

create policy role_permissions_select on public.role_permissions for select to authenticated using (true);
create policy role_permissions_insert on public.role_permissions for insert to authenticated with check (public.is_platform_service_role());
create policy role_permissions_update on public.role_permissions for update to authenticated using (public.is_platform_service_role()) with check (public.is_platform_service_role());
create policy role_permissions_delete on public.role_permissions for delete to authenticated using (public.is_platform_service_role());

create policy user_role_assignments_select on public.user_role_assignments for select to authenticated using (tenant_id = public.current_tenant_id());
create policy user_role_assignments_insert on public.user_role_assignments for insert to authenticated with check (tenant_id = public.current_tenant_id());
create policy user_role_assignments_update on public.user_role_assignments for update to authenticated using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy user_role_assignments_delete on public.user_role_assignments for delete to authenticated using (tenant_id = public.current_tenant_id());

create policy products_select on public.products for select to authenticated using (true);
create policy products_insert on public.products for insert to authenticated with check (public.is_platform_service_role());
create policy products_update on public.products for update to authenticated using (public.is_platform_service_role()) with check (public.is_platform_service_role());
create policy products_delete on public.products for delete to authenticated using (public.is_platform_service_role());

create policy plans_select on public.plans for select to authenticated using (true);
create policy plans_insert on public.plans for insert to authenticated with check (public.is_platform_service_role());
create policy plans_update on public.plans for update to authenticated using (public.is_platform_service_role()) with check (public.is_platform_service_role());
create policy plans_delete on public.plans for delete to authenticated using (public.is_platform_service_role());

create policy plan_features_select on public.plan_features for select to authenticated using (true);
create policy plan_features_insert on public.plan_features for insert to authenticated with check (public.is_platform_service_role());
create policy plan_features_update on public.plan_features for update to authenticated using (public.is_platform_service_role()) with check (public.is_platform_service_role());
create policy plan_features_delete on public.plan_features for delete to authenticated using (public.is_platform_service_role());

create policy subscriptions_select on public.subscriptions for select to authenticated using (tenant_id = public.current_tenant_id());
create policy subscriptions_insert on public.subscriptions for insert to authenticated with check (tenant_id = public.current_tenant_id());
create policy subscriptions_update on public.subscriptions for update to authenticated using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy subscriptions_delete on public.subscriptions for delete to authenticated using (tenant_id = public.current_tenant_id());

create policy subscription_entitlements_select on public.subscription_entitlements for select to authenticated using (tenant_id = public.current_tenant_id());
create policy subscription_entitlements_insert on public.subscription_entitlements for insert to authenticated with check (tenant_id = public.current_tenant_id());
create policy subscription_entitlements_update on public.subscription_entitlements for update to authenticated using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy subscription_entitlements_delete on public.subscription_entitlements for delete to authenticated using (tenant_id = public.current_tenant_id());

create policy audit_events_select on public.audit_events for select to authenticated using (tenant_id = public.current_tenant_id());
create policy audit_events_insert on public.audit_events for insert to authenticated with check (tenant_id = public.current_tenant_id());

create policy provisioning_jobs_select on public.provisioning_jobs for select to authenticated using (tenant_id = public.current_tenant_id());
create policy provisioning_jobs_insert on public.provisioning_jobs for insert to authenticated with check (public.is_platform_service_role() and tenant_id = public.current_tenant_id());
create policy provisioning_jobs_update on public.provisioning_jobs for update to authenticated using (public.is_platform_service_role() and tenant_id = public.current_tenant_id()) with check (public.is_platform_service_role() and tenant_id = public.current_tenant_id());
create policy provisioning_jobs_delete on public.provisioning_jobs for delete to authenticated using (public.is_platform_service_role() and tenant_id = public.current_tenant_id());

create policy provisioning_steps_select on public.provisioning_steps for select to authenticated using (tenant_id = public.current_tenant_id());
create policy provisioning_steps_insert on public.provisioning_steps for insert to authenticated with check (public.is_platform_service_role() and tenant_id = public.current_tenant_id());
create policy provisioning_steps_update on public.provisioning_steps for update to authenticated using (public.is_platform_service_role() and tenant_id = public.current_tenant_id()) with check (public.is_platform_service_role() and tenant_id = public.current_tenant_id());
create policy provisioning_steps_delete on public.provisioning_steps for delete to authenticated using (public.is_platform_service_role() and tenant_id = public.current_tenant_id());
