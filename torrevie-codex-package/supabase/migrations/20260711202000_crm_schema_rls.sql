create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  industry text,
  owner_user_id uuid references public.users(id) on delete set null,
  deleted_at timestamptz,
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id)
);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  account_id uuid,
  first_name text not null,
  last_name text,
  email text,
  phone text,
  source_module text check (source_module is null or source_module in ('crm', 'fsm', 'lqs')),
  deleted_at timestamptz,
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint contacts_account_tenant_fk foreign key (tenant_id, account_id)
    references public.accounts (tenant_id, id)
    on delete restrict
);

create table public.pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  key text not null,
  label text not null,
  sort_order integer not null,
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, key),
  unique (tenant_id, sort_order)
);

create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  account_id uuid not null,
  primary_contact_id uuid,
  pipeline_stage_id uuid not null,
  name text not null,
  amount numeric(14,2),
  currency text not null default 'AED',
  owner_user_id uuid references public.users(id) on delete set null,
  version integer not null default 1,
  closed_at timestamptz,
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  constraint opportunities_account_tenant_fk foreign key (tenant_id, account_id)
    references public.accounts (tenant_id, id)
    on delete restrict,
  constraint opportunities_primary_contact_tenant_fk foreign key (tenant_id, primary_contact_id)
    references public.contacts (tenant_id, id)
    on delete restrict,
  constraint opportunities_pipeline_stage_tenant_fk foreign key (tenant_id, pipeline_stage_id)
    references public.pipeline_stages (tenant_id, id)
    on delete restrict,
  check (amount is null or amount >= 0),
  check (version >= 1),
  check (currency ~ '^[A-Z]{3}$')
);

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  related_type text not null check (related_type in ('opportunity', 'account', 'contact')),
  related_id uuid not null,
  activity_type text not null check (activity_type in ('call', 'email', 'meeting', 'note')),
  notes text,
  occurred_at timestamptz not null default now(),
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id)
);

create unique index contacts_tenant_email_unique_idx
  on public.contacts (tenant_id, lower(email))
  where email is not null;

create index accounts_tenant_id_idx on public.accounts (tenant_id);
create index accounts_tenant_owner_user_id_idx on public.accounts (tenant_id, owner_user_id);
create index accounts_tenant_name_idx on public.accounts (tenant_id, name);

create index contacts_tenant_id_idx on public.contacts (tenant_id);
create index contacts_tenant_account_id_idx on public.contacts (tenant_id, account_id);
create index contacts_tenant_source_module_idx on public.contacts (tenant_id, source_module);

create index pipeline_stages_tenant_id_idx on public.pipeline_stages (tenant_id);
create index pipeline_stages_tenant_sort_order_idx on public.pipeline_stages (tenant_id, sort_order);

create index opportunities_tenant_id_idx on public.opportunities (tenant_id);
create index opportunities_tenant_account_id_idx on public.opportunities (tenant_id, account_id);
create index opportunities_tenant_owner_user_id_idx on public.opportunities (tenant_id, owner_user_id);
create index opportunities_tenant_pipeline_stage_id_idx on public.opportunities (tenant_id, pipeline_stage_id);

create index activities_tenant_id_idx on public.activities (tenant_id);
create index activities_tenant_related_idx on public.activities (tenant_id, related_type, related_id);
create index activities_tenant_occurred_at_idx on public.activities (tenant_id, occurred_at desc);

create trigger accounts_set_updated_at before update on public.accounts for each row execute function public.set_updated_at();
create trigger contacts_set_updated_at before update on public.contacts for each row execute function public.set_updated_at();
create trigger pipeline_stages_set_updated_at before update on public.pipeline_stages for each row execute function public.set_updated_at();
create trigger opportunities_set_updated_at before update on public.opportunities for each row execute function public.set_updated_at();
create trigger activities_set_updated_at before update on public.activities for each row execute function public.set_updated_at();

alter table public.accounts enable row level security;
alter table public.contacts enable row level security;
alter table public.pipeline_stages enable row level security;
alter table public.opportunities enable row level security;
alter table public.activities enable row level security;

grant select, insert, update, delete on public.accounts to authenticated;
grant select, insert, update, delete on public.contacts to authenticated;
grant select, insert, update, delete on public.pipeline_stages to authenticated;
grant select, insert, update, delete on public.opportunities to authenticated;
grant select, insert, update, delete on public.activities to authenticated;

create policy accounts_select on public.accounts for select to authenticated using (tenant_id = public.current_tenant_id());
create policy accounts_insert on public.accounts for insert to authenticated with check (tenant_id = public.current_tenant_id());
create policy accounts_update on public.accounts for update to authenticated using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy accounts_delete on public.accounts for delete to authenticated using (tenant_id = public.current_tenant_id());

create policy contacts_select on public.contacts for select to authenticated using (tenant_id = public.current_tenant_id());
create policy contacts_insert on public.contacts for insert to authenticated with check (tenant_id = public.current_tenant_id());
create policy contacts_update on public.contacts for update to authenticated using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy contacts_delete on public.contacts for delete to authenticated using (tenant_id = public.current_tenant_id());

create policy pipeline_stages_select on public.pipeline_stages for select to authenticated using (tenant_id = public.current_tenant_id());
create policy pipeline_stages_insert on public.pipeline_stages for insert to authenticated with check (tenant_id = public.current_tenant_id());
create policy pipeline_stages_update on public.pipeline_stages for update to authenticated using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy pipeline_stages_delete on public.pipeline_stages for delete to authenticated using (tenant_id = public.current_tenant_id());

create policy opportunities_select on public.opportunities for select to authenticated using (tenant_id = public.current_tenant_id());
create policy opportunities_insert on public.opportunities for insert to authenticated with check (tenant_id = public.current_tenant_id());
create policy opportunities_update on public.opportunities for update to authenticated using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy opportunities_delete on public.opportunities for delete to authenticated using (tenant_id = public.current_tenant_id());

create policy activities_select on public.activities for select to authenticated using (tenant_id = public.current_tenant_id());
create policy activities_insert on public.activities for insert to authenticated with check (tenant_id = public.current_tenant_id());
create policy activities_update on public.activities for update to authenticated using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy activities_delete on public.activities for delete to authenticated using (tenant_id = public.current_tenant_id());
