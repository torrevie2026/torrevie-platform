create table if not exists public.tex_migration_runs (
  id uuid primary key default gen_random_uuid(),
  source_system text not null,
  mode text not null check (mode in ('dry_run', 'apply')),
  status text not null check (status in ('started', 'succeeded', 'failed')),
  summary jsonb not null default '{}'::jsonb,
  error text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.tex_migration_map (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  source_system text not null default 'tex-neon',
  source_table text not null,
  source_id text not null,
  target_table text not null,
  target_id uuid not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (source_system, source_table, source_id, target_table)
);

create table if not exists public.tex_legacy_files (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  source_system text not null default 'tex-neon',
  source_file_id uuid,
  source_url text,
  file_name text,
  content_type text,
  size_bytes bigint,
  data bytea,
  uploaded_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  migrated_at timestamptz not null default now(),
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id),
  unique (tenant_id, source_system, source_file_id)
);

alter table public.tex_expenses
  add column if not exists legacy_receipt_image_url text,
  add column if not exists legacy_receipt_file_id uuid references public.tex_legacy_files(id) on delete set null;

alter table public.tex_trips
  add column if not exists legacy_advance_deposit_slip_url text,
  add column if not exists legacy_advance_deposit_file_id uuid references public.tex_legacy_files(id) on delete set null;

alter table public.tex_unregistered_whatsapp_submissions
  add column if not exists legacy_receipt_image_url text,
  add column if not exists legacy_receipt_file_id uuid references public.tex_legacy_files(id) on delete set null;

alter table public.tex_migration_runs enable row level security;
alter table public.tex_migration_map enable row level security;
alter table public.tex_legacy_files enable row level security;

create policy tex_migration_runs_select on public.tex_migration_runs for select to authenticated using (public.is_platform_service_role());
create policy tex_migration_runs_insert on public.tex_migration_runs for insert to authenticated with check (public.is_platform_service_role());
create policy tex_migration_runs_update on public.tex_migration_runs for update to authenticated using (public.is_platform_service_role()) with check (public.is_platform_service_role());
create policy tex_migration_runs_delete on public.tex_migration_runs for delete to authenticated using (public.is_platform_service_role());

create policy tex_migration_map_select on public.tex_migration_map for select to authenticated using (public.is_platform_service_role());
create policy tex_migration_map_insert on public.tex_migration_map for insert to authenticated with check (public.is_platform_service_role());
create policy tex_migration_map_update on public.tex_migration_map for update to authenticated using (public.is_platform_service_role()) with check (public.is_platform_service_role());
create policy tex_migration_map_delete on public.tex_migration_map for delete to authenticated using (public.is_platform_service_role());

create policy tex_legacy_files_select on public.tex_legacy_files for select to authenticated using (tenant_id = public.current_tenant_id() or public.is_platform_service_role());
create policy tex_legacy_files_insert on public.tex_legacy_files for insert to authenticated with check (tenant_id = public.current_tenant_id() or public.is_platform_service_role());
create policy tex_legacy_files_update on public.tex_legacy_files for update to authenticated using (tenant_id = public.current_tenant_id() or public.is_platform_service_role()) with check (tenant_id = public.current_tenant_id() or public.is_platform_service_role());
create policy tex_legacy_files_delete on public.tex_legacy_files for delete to authenticated using (tenant_id = public.current_tenant_id() or public.is_platform_service_role());

grant select, insert, update, delete on
  public.tex_migration_runs,
  public.tex_migration_map,
  public.tex_legacy_files
to authenticated, service_role;

create index if not exists tex_migration_map_tenant_idx on public.tex_migration_map (tenant_id);
create index if not exists tex_legacy_files_tenant_idx on public.tex_legacy_files (tenant_id);
create index if not exists tex_expenses_legacy_receipt_file_idx on public.tex_expenses (tenant_id, legacy_receipt_file_id);
