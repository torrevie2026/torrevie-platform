create type public.channel_type as enum ('whatsapp', 'voice', 'email', 'portal');
create type public.channel_status as enum ('active', 'pending', 'suspended');
create type public.intake_request_status as enum ('new', 'triaged', 'converted', 'spam', 'closed');
create type public.call_direction as enum ('inbound', 'outbound');
create type public.call_outcome as enum ('answered', 'voicemail', 'abandoned', 'converted');

create table public.org_channels (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  channel_type public.channel_type not null,
  provider text not null,
  display_name text not null,
  config jsonb not null default '{}'::jsonb,
  credentials_ref uuid,
  status public.channel_status not null default 'pending',
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, channel_type, display_name)
);

create table public.org_channel_credentials (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  channel_id uuid not null references public.org_channels(id) on delete cascade,
  secret_name text not null,
  secret_value text not null,
  secret_last4 text,
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (channel_id, secret_name)
);

alter table public.org_channels
  add constraint org_channels_credentials_ref_fkey
  foreign key (credentials_ref) references public.org_channel_credentials(id) on delete set null;

create table public.intake_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  channel_id uuid references public.org_channels(id) on delete set null,
  channel_type public.channel_type not null,
  external_ref text,
  contact_name text,
  contact_phone text,
  contact_email text,
  matched_customer_id uuid references public.accounts(id) on delete set null,
  raw_payload jsonb not null default '{}'::jsonb,
  transcript text,
  ai_summary text,
  ai_classification jsonb not null default '{}'::jsonb,
  status public.intake_request_status not null default 'new',
  converted_job_id uuid,
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, channel_type, external_ref)
);

create table public.call_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  channel_id uuid references public.org_channels(id) on delete set null,
  direction public.call_direction not null,
  from_number text,
  to_number text,
  started_at timestamptz not null default now(),
  duration_seconds integer not null default 0 check (duration_seconds >= 0),
  recording_url text,
  transcript text,
  outcome public.call_outcome not null default 'answered',
  intake_request_id uuid references public.intake_requests(id) on delete set null,
  cost_estimate numeric(12, 4),
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index org_channels_tenant_type_idx on public.org_channels (tenant_id, channel_type);
create index org_channels_tenant_status_idx on public.org_channels (tenant_id, status);
create index org_channel_credentials_channel_idx on public.org_channel_credentials (channel_id);
create index intake_requests_tenant_status_created_idx on public.intake_requests (tenant_id, status, created_at desc);
create index intake_requests_tenant_channel_idx on public.intake_requests (tenant_id, channel_type, created_at desc);
create index call_logs_tenant_started_idx on public.call_logs (tenant_id, started_at desc);
create index call_logs_intake_request_idx on public.call_logs (intake_request_id);

create trigger org_channels_set_updated_at
before update on public.org_channels
for each row execute function public.set_updated_at();

create trigger org_channel_credentials_set_updated_at
before update on public.org_channel_credentials
for each row execute function public.set_updated_at();

create trigger intake_requests_set_updated_at
before update on public.intake_requests
for each row execute function public.set_updated_at();

create trigger call_logs_set_updated_at
before update on public.call_logs
for each row execute function public.set_updated_at();

alter table public.org_channels enable row level security;
alter table public.org_channel_credentials enable row level security;
alter table public.intake_requests enable row level security;
alter table public.call_logs enable row level security;

create policy org_channels_select on public.org_channels for select to authenticated using (tenant_id = public.current_tenant_id());
create policy org_channels_insert on public.org_channels for insert to authenticated with check (tenant_id = public.current_tenant_id());
create policy org_channels_update on public.org_channels for update to authenticated using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy org_channels_delete on public.org_channels for delete to authenticated using (tenant_id = public.current_tenant_id());

create policy org_channel_credentials_select on public.org_channel_credentials for select to authenticated using (tenant_id = public.current_tenant_id());
create policy org_channel_credentials_insert on public.org_channel_credentials for insert to authenticated with check (tenant_id = public.current_tenant_id());
create policy org_channel_credentials_update on public.org_channel_credentials for update to authenticated using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy org_channel_credentials_delete on public.org_channel_credentials for delete to authenticated using (tenant_id = public.current_tenant_id());

create policy intake_requests_select on public.intake_requests for select to authenticated using (tenant_id = public.current_tenant_id());
create policy intake_requests_insert on public.intake_requests for insert to authenticated with check (tenant_id = public.current_tenant_id());
create policy intake_requests_update on public.intake_requests for update to authenticated using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy intake_requests_delete on public.intake_requests for delete to authenticated using (tenant_id = public.current_tenant_id());

create policy call_logs_select on public.call_logs for select to authenticated using (tenant_id = public.current_tenant_id());
create policy call_logs_insert on public.call_logs for insert to authenticated with check (tenant_id = public.current_tenant_id());
create policy call_logs_update on public.call_logs for update to authenticated using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy call_logs_delete on public.call_logs for delete to authenticated using (tenant_id = public.current_tenant_id());

grant select, insert, update, delete on public.org_channels to authenticated;
grant select, insert, update, delete on public.intake_requests to authenticated;
grant select, insert, update, delete on public.call_logs to authenticated;
grant select, insert, update, delete on public.org_channel_credentials to service_role;
grant select, insert, update, delete on public.org_channels to service_role;
grant select, insert, update, delete on public.intake_requests to service_role;
grant select, insert, update, delete on public.call_logs to service_role;

create or replace function public.get_org_channel_usage(org_id uuid)
returns table (
  channel_type public.channel_type,
  active_count integer,
  pending_count integer
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    oc.channel_type,
    count(*) filter (where oc.status = 'active')::int as active_count,
    count(*) filter (where oc.status = 'pending')::int as pending_count
  from public.org_channels oc
  where oc.tenant_id = org_id
  group by oc.channel_type
  order by oc.channel_type;
$$;

grant execute on function public.get_org_channel_usage(uuid) to authenticated;
grant execute on function public.get_org_channel_usage(uuid) to service_role;
