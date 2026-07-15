create table if not exists public.tex_quick_connect_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  status text not null default 'idle' check (status in ('idle', 'qr_pending', 'connected', 'disconnected', 'failed')),
  pairing_code text,
  qr_code_data text,
  qr_expires_at timestamptz,
  connected_phone text,
  connected_at timestamptz,
  last_seen_at timestamptz,
  error text,
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id)
);

create table if not exists public.tex_quick_connect_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  session_id uuid references public.tex_quick_connect_sessions(id) on delete cascade,
  event_type text not null,
  direction text not null default 'system' check (direction in ('inbound', 'outbound', 'system')),
  status text,
  message text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(id) on delete set null,
  occurred_at timestamptz not null default now()
);

create index if not exists tex_quick_connect_sessions_tenant_status_idx
  on public.tex_quick_connect_sessions (tenant_id, status);

create index if not exists tex_quick_connect_events_tenant_occurred_idx
  on public.tex_quick_connect_events (tenant_id, occurred_at desc);

drop trigger if exists tex_quick_connect_sessions_set_updated_at on public.tex_quick_connect_sessions;
create trigger tex_quick_connect_sessions_set_updated_at
before update on public.tex_quick_connect_sessions
for each row execute function public.set_updated_at();

alter table public.tex_quick_connect_sessions enable row level security;
alter table public.tex_quick_connect_events enable row level security;

drop policy if exists tex_quick_connect_sessions_select on public.tex_quick_connect_sessions;
drop policy if exists tex_quick_connect_sessions_insert on public.tex_quick_connect_sessions;
drop policy if exists tex_quick_connect_sessions_update on public.tex_quick_connect_sessions;
drop policy if exists tex_quick_connect_sessions_delete on public.tex_quick_connect_sessions;

create policy tex_quick_connect_sessions_select on public.tex_quick_connect_sessions
for select to authenticated using (tenant_id = public.current_tenant_id());
create policy tex_quick_connect_sessions_insert on public.tex_quick_connect_sessions
for insert to authenticated with check (tenant_id = public.current_tenant_id());
create policy tex_quick_connect_sessions_update on public.tex_quick_connect_sessions
for update to authenticated using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy tex_quick_connect_sessions_delete on public.tex_quick_connect_sessions
for delete to authenticated using (tenant_id = public.current_tenant_id());

drop policy if exists tex_quick_connect_events_select on public.tex_quick_connect_events;
drop policy if exists tex_quick_connect_events_insert on public.tex_quick_connect_events;
drop policy if exists tex_quick_connect_events_update on public.tex_quick_connect_events;
drop policy if exists tex_quick_connect_events_delete on public.tex_quick_connect_events;

create policy tex_quick_connect_events_select on public.tex_quick_connect_events
for select to authenticated using (tenant_id = public.current_tenant_id());
create policy tex_quick_connect_events_insert on public.tex_quick_connect_events
for insert to authenticated with check (tenant_id = public.current_tenant_id());
create policy tex_quick_connect_events_update on public.tex_quick_connect_events
for update to authenticated using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy tex_quick_connect_events_delete on public.tex_quick_connect_events
for delete to authenticated using (tenant_id = public.current_tenant_id());

grant select, insert, update, delete on public.tex_quick_connect_sessions to authenticated;
grant select, insert, update, delete on public.tex_quick_connect_events to authenticated;
grant select, insert, update, delete on public.tex_quick_connect_sessions to service_role;
grant select, insert, update, delete on public.tex_quick_connect_events to service_role;
