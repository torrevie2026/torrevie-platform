create type public.fsm_job_status as enum (
  'new',
  'triage',
  'scheduled',
  'assigned',
  'in_progress',
  'waiting_info',
  'waiting_access',
  'on_hold',
  'pending_approval',
  'temp_fix',
  'rework',
  'completed',
  'closed',
  'cancelled'
);

create type public.fsm_urgency_level as enum ('low', 'medium', 'high', 'emergency');

create table public.fsm_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  job_number text not null,
  title text not null,
  description text,
  status public.fsm_job_status not null default 'new',
  urgency public.fsm_urgency_level not null default 'medium',
  account_id uuid,
  site_text text,
  source_channel public.channel_type,
  intake_request_id uuid references public.intake_requests(id) on delete set null,
  assigned_user_id uuid references public.users(id) on delete set null,
  scheduled_for timestamptz,
  completed_at timestamptz,
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, job_number),
  constraint fsm_jobs_account_tenant_fk foreign key (tenant_id, account_id)
    references public.accounts (tenant_id, id)
    on delete restrict,
  constraint fsm_jobs_intake_tenant_unique unique (tenant_id, intake_request_id),
  check (length(trim(title)) > 0),
  check (job_number ~ '^FSM-[0-9]{8}-[0-9]{4}$')
);

create table public.fsm_job_state_history (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  job_id uuid not null,
  old_status public.fsm_job_status,
  new_status public.fsm_job_status not null,
  note text,
  changed_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  constraint fsm_job_state_history_job_tenant_fk foreign key (tenant_id, job_id)
    references public.fsm_jobs (tenant_id, id)
    on delete cascade
);

create index fsm_jobs_tenant_status_created_idx on public.fsm_jobs (tenant_id, status, created_at desc);
create index fsm_jobs_tenant_assigned_idx on public.fsm_jobs (tenant_id, assigned_user_id, status);
create index fsm_jobs_tenant_account_idx on public.fsm_jobs (tenant_id, account_id);
create index fsm_jobs_tenant_scheduled_idx on public.fsm_jobs (tenant_id, scheduled_for);
create index fsm_job_state_history_tenant_job_idx on public.fsm_job_state_history (tenant_id, job_id, created_at desc);

create trigger fsm_jobs_set_updated_at
before update on public.fsm_jobs
for each row execute function public.set_updated_at();

alter table public.fsm_jobs enable row level security;
alter table public.fsm_job_state_history enable row level security;

create policy fsm_jobs_select on public.fsm_jobs for select to authenticated using (tenant_id = public.current_tenant_id());
create policy fsm_jobs_insert on public.fsm_jobs for insert to authenticated with check (tenant_id = public.current_tenant_id());
create policy fsm_jobs_update on public.fsm_jobs for update to authenticated using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy fsm_jobs_delete on public.fsm_jobs for delete to authenticated using (tenant_id = public.current_tenant_id());

create policy fsm_job_state_history_select on public.fsm_job_state_history for select to authenticated using (tenant_id = public.current_tenant_id());
create policy fsm_job_state_history_insert on public.fsm_job_state_history for insert to authenticated with check (tenant_id = public.current_tenant_id());
create policy fsm_job_state_history_update on public.fsm_job_state_history for update to authenticated using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy fsm_job_state_history_delete on public.fsm_job_state_history for delete to authenticated using (tenant_id = public.current_tenant_id());

grant select, insert, update, delete on public.fsm_jobs to authenticated;
grant select, insert, update, delete on public.fsm_job_state_history to authenticated;
grant select, insert, update, delete on public.fsm_jobs to service_role;
grant select, insert, update, delete on public.fsm_job_state_history to service_role;

alter table public.intake_requests
  add constraint intake_requests_converted_fsm_job_fk
  foreign key (tenant_id, converted_job_id)
  references public.fsm_jobs (tenant_id, id)
  on delete restrict;
