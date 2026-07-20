create table public.support_access_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  actor_user_id uuid not null references public.users(id) on delete cascade,
  token_hash text not null unique,
  status text not null default 'active' check (status in ('active', 'ended', 'expired')),
  reason text not null,
  expires_at timestamptz not null,
  last_used_at timestamptz,
  ended_at timestamptz,
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at > created_at),
  check (length(trim(reason)) >= 3)
);

create index support_access_sessions_tenant_id_status_idx
  on public.support_access_sessions (tenant_id, status, expires_at desc);

create index support_access_sessions_actor_user_id_idx
  on public.support_access_sessions (actor_user_id, created_at desc);

create trigger support_access_sessions_set_updated_at
  before update on public.support_access_sessions
  for each row execute function public.set_updated_at();

alter table public.support_access_sessions enable row level security;

grant select, insert, update, delete on public.support_access_sessions to authenticated;

create policy support_access_sessions_select
  on public.support_access_sessions
  for select to authenticated
  using (public.is_platform_service_role());

create policy support_access_sessions_insert
  on public.support_access_sessions
  for insert to authenticated
  with check (public.is_platform_service_role());

create policy support_access_sessions_update
  on public.support_access_sessions
  for update to authenticated
  using (public.is_platform_service_role())
  with check (public.is_platform_service_role());

create policy support_access_sessions_delete
  on public.support_access_sessions
  for delete to authenticated
  using (public.is_platform_service_role());
