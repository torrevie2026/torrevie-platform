create table public.tex_employee_profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  name text not null,
  phone_number text not null,
  department text,
  monthly_salary numeric(14, 2) not null default 0,
  manager_user_id uuid references public.users(id) on delete set null,
  is_active boolean not null default true,
  submission_frequency text not null default 'realtime' check (submission_frequency in ('realtime', 'daily', 'weekly', 'monthly')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id),
  unique (tenant_id, phone_number)
);

create table public.tex_teams (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  description text,
  manager_employee_profile_id uuid references public.tex_employee_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id),
  unique (tenant_id, name)
);

create table public.tex_team_members (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  team_id uuid not null references public.tex_teams(id) on delete cascade,
  employee_profile_id uuid not null references public.tex_employee_profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id),
  unique (team_id, employee_profile_id)
);

create table public.tex_expense_categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  is_system boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id),
  unique (tenant_id, name)
);

create table public.tex_trips (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  description text,
  trip_type text not null default 'general' check (trip_type in ('general', 'logistics')),
  origin text,
  destination text,
  budget_amount numeric(14, 2),
  advance_deposit_file_id uuid references public.files(id) on delete set null,
  start_date date,
  end_date date,
  status text not null default 'open' check (status in ('open', 'closed', 'cancelled')),
  enforce_currency boolean not null default false,
  enforced_currency text,
  team_id uuid references public.tex_teams(id) on delete set null,
  container_number text,
  driver_employee_profile_id uuid references public.tex_employee_profiles(id) on delete set null,
  driver_trip_amount numeric(14, 2) not null default 0,
  subcontractor_driver_name text,
  subcontractor_amount numeric(14, 2) not null default 0,
  subcontractor_notes text,
  driver_payout_status text not null default 'unpaid' check (driver_payout_status in ('unpaid', 'paid')),
  driver_payout_paid_by uuid references public.users(id) on delete set null,
  driver_payout_paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id)
);

create table public.tex_trip_legs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  trip_id uuid not null references public.tex_trips(id) on delete cascade,
  sequence integer not null default 1,
  origin text not null,
  origin_place_id text,
  origin_lat numeric,
  origin_lng numeric,
  origin_country text,
  destination text not null,
  destination_place_id text,
  destination_lat numeric,
  destination_lng numeric,
  destination_country text,
  mode text check (mode is null or mode in ('road', 'sea', 'air', 'rail')),
  status text not null default 'planned' check (status in ('planned', 'in_transit', 'completed', 'cancelled')),
  planned_start timestamptz,
  planned_end timestamptz,
  actual_start timestamptz,
  actual_end timestamptz,
  distance_km numeric,
  is_return_trip boolean not null default false,
  return_distance_km numeric,
  return_duration_seconds integer,
  total_distance_km numeric,
  duration_seconds integer,
  distance_source text,
  route_polyline text,
  budget_amount numeric(14, 2),
  container_ref text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id),
  unique (tenant_id, trip_id, sequence)
);

create table public.tex_expenses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  submitter_user_id uuid references public.users(id) on delete set null,
  employee_profile_id uuid references public.tex_employee_profiles(id) on delete set null,
  employee_name text,
  employee_phone text,
  whatsapp_chat_jid text,
  vendor text,
  expense_date date not null,
  amount numeric(14, 2) not null,
  currency text not null,
  base_amount numeric(14, 2),
  exchange_rate numeric,
  category text,
  expense_type text not null default 'receipt',
  payment_method text,
  trip_id uuid references public.tex_trips(id) on delete set null,
  trip_leg_id uuid references public.tex_trip_legs(id) on delete set null,
  trip_name text,
  notes text,
  tax_id_number text,
  tax_amount numeric(14, 2),
  receipt_file_id uuid references public.files(id) on delete set null,
  original_currency text,
  original_amount numeric(14, 2),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'paid')),
  source text not null default 'web',
  policy_flag boolean not null default false,
  policy_flag_reason text,
  approved_by uuid references public.users(id) on delete set null,
  approved_at timestamptz,
  rejected_by uuid references public.users(id) on delete set null,
  rejected_at timestamptz,
  rejected_reason text,
  finance_reviewed_by uuid references public.users(id) on delete set null,
  finance_reviewed_at timestamptz,
  paid_by uuid references public.users(id) on delete set null,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id)
);

create table public.tex_unregistered_whatsapp_submissions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  sender_raw text,
  sender_phone text,
  whatsapp_chat_jid text,
  message_id text,
  session_id text,
  message_text text,
  receipt_file_id uuid references public.files(id) on delete set null,
  payload jsonb,
  status text not null default 'open' check (status in ('open', 'resolved', 'ignored')),
  resolved_expense_id uuid references public.tex_expenses(id) on delete set null,
  resolved_employee_profile_id uuid references public.tex_employee_profiles(id) on delete set null,
  resolved_by uuid references public.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id)
);

create table public.tex_whatsapp_pending_actions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  employee_profile_id uuid references public.tex_employee_profiles(id) on delete cascade,
  expense_id uuid references public.tex_expenses(id) on delete cascade,
  sender_phone text,
  whatsapp_chat_jid text,
  provider text not null check (provider in ('ultramsg', 'wappfly', 'meta')),
  action text not null default 'select_trip' check (action in ('select_trip')),
  options jsonb not null default '[]'::jsonb,
  status text not null default 'open' check (status in ('open', 'resolved', 'expired', 'cancelled')),
  expires_at timestamptz not null default now() + interval '1 hour',
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id)
);

create table public.tex_spend_policies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  category text not null,
  daily_limit numeric(14, 2),
  monthly_limit numeric(14, 2),
  requires_notes_above numeric(14, 2),
  is_blocked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id),
  unique (tenant_id, category)
);

create table public.tex_budgets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  department text not null,
  month integer not null check (month between 1 and 12),
  year integer not null check (year >= 2000),
  budget_amount numeric(14, 2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id),
  unique (tenant_id, department, month, year)
);

create table public.tex_driver_advances (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  employee_profile_id uuid not null references public.tex_employee_profiles(id) on delete cascade,
  amount numeric(14, 2) not null check (amount > 0),
  currency text not null,
  base_amount numeric(14, 2) not null,
  advance_date date not null default current_date,
  month integer not null check (month between 1 and 12),
  year integer not null check (year >= 2000),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id)
);

create table public.tex_employee_salary_payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  employee_profile_id uuid not null references public.tex_employee_profiles(id) on delete cascade,
  month integer not null check (month between 1 and 12),
  year integer not null check (year >= 2000),
  amount numeric(14, 2) not null check (amount >= 0),
  currency text not null,
  paid_by uuid references public.users(id) on delete set null,
  paid_at timestamptz not null default now(),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id),
  unique (tenant_id, employee_profile_id, month, year)
);

create table public.tex_erp_connections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  erp_type text,
  base_url text,
  is_active boolean not null default false,
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id)
);

create table public.tex_per_diem_rates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  destination text not null,
  daily_rate numeric(14, 2) not null,
  currency text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id),
  unique (tenant_id, destination, currency)
);

create table public.tex_notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  title text not null,
  body text,
  type text,
  related_expense_id uuid references public.tex_expenses(id) on delete set null,
  related_trip_id uuid references public.tex_trips(id) on delete set null,
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id)
);

create table public.tex_country_configs (
  id uuid primary key default gen_random_uuid(),
  country_code text not null unique,
  country_name text not null,
  base_currency text not null,
  currency_name text not null,
  currency_symbol text not null,
  has_vat boolean not null default true,
  vat_rate numeric(6, 3) not null default 0,
  vat_rate_reduced numeric(6, 3),
  tax_name text not null default 'VAT',
  tax_id_label text not null default 'VAT Number',
  tax_authority_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tex_currency_pegs (
  id uuid primary key default gen_random_uuid(),
  from_currency text not null,
  to_currency text not null default 'USD',
  rate numeric not null,
  effective_from date not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (from_currency, to_currency, effective_from)
);

create table public.tex_fx_rates (
  id uuid primary key default gen_random_uuid(),
  rate_date date not null,
  from_currency text not null,
  to_currency text not null,
  rate numeric not null,
  source text,
  is_manual_override boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (rate_date, from_currency, to_currency)
);

create table public.tex_integration_settings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  whatsapp_provider text not null default 'ultramsg' check (whatsapp_provider in ('ultramsg', 'wappfly', 'meta')),
  whatsapp_instance_id text,
  wappfly_session_id text,
  meta_phone_number_id text,
  meta_whatsapp_business_account_id text,
  google_maps_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id),
  unique (tenant_id)
);

create unique index tex_unregistered_whatsapp_submissions_message_unique_idx
  on public.tex_unregistered_whatsapp_submissions (tenant_id, message_id)
  where message_id is not null;

create index tex_employee_profiles_tenant_id_idx on public.tex_employee_profiles (tenant_id);
create index tex_employee_profiles_user_id_idx on public.tex_employee_profiles (tenant_id, user_id);
create index tex_teams_tenant_id_idx on public.tex_teams (tenant_id);
create index tex_team_members_tenant_id_idx on public.tex_team_members (tenant_id);
create index tex_team_members_team_id_idx on public.tex_team_members (tenant_id, team_id);
create index tex_trips_tenant_status_idx on public.tex_trips (tenant_id, status);
create index tex_trip_legs_trip_sequence_idx on public.tex_trip_legs (tenant_id, trip_id, sequence);
create index tex_expenses_tenant_status_idx on public.tex_expenses (tenant_id, status);
create index tex_expenses_tenant_date_idx on public.tex_expenses (tenant_id, expense_date);
create index tex_expenses_employee_profile_idx on public.tex_expenses (tenant_id, employee_profile_id);
create index tex_expenses_submitter_idx on public.tex_expenses (tenant_id, submitter_user_id);
create index tex_expenses_trip_idx on public.tex_expenses (tenant_id, trip_id);
create index tex_unregistered_whatsapp_submissions_tenant_status_idx on public.tex_unregistered_whatsapp_submissions (tenant_id, status, created_at desc);
create index tex_whatsapp_pending_actions_lookup_idx on public.tex_whatsapp_pending_actions (tenant_id, employee_profile_id, status, expires_at desc);
create index tex_notifications_user_idx on public.tex_notifications (tenant_id, user_id, is_read, created_at desc);
create index tex_driver_advances_tenant_month_idx on public.tex_driver_advances (tenant_id, year, month);
create index tex_employee_salary_payments_tenant_month_idx on public.tex_employee_salary_payments (tenant_id, year, month);

create trigger tex_employee_profiles_set_updated_at before update on public.tex_employee_profiles for each row execute function public.set_updated_at();
create trigger tex_teams_set_updated_at before update on public.tex_teams for each row execute function public.set_updated_at();
create trigger tex_team_members_set_updated_at before update on public.tex_team_members for each row execute function public.set_updated_at();
create trigger tex_expense_categories_set_updated_at before update on public.tex_expense_categories for each row execute function public.set_updated_at();
create trigger tex_trips_set_updated_at before update on public.tex_trips for each row execute function public.set_updated_at();
create trigger tex_trip_legs_set_updated_at before update on public.tex_trip_legs for each row execute function public.set_updated_at();
create trigger tex_expenses_set_updated_at before update on public.tex_expenses for each row execute function public.set_updated_at();
create trigger tex_unregistered_whatsapp_submissions_set_updated_at before update on public.tex_unregistered_whatsapp_submissions for each row execute function public.set_updated_at();
create trigger tex_whatsapp_pending_actions_set_updated_at before update on public.tex_whatsapp_pending_actions for each row execute function public.set_updated_at();
create trigger tex_spend_policies_set_updated_at before update on public.tex_spend_policies for each row execute function public.set_updated_at();
create trigger tex_budgets_set_updated_at before update on public.tex_budgets for each row execute function public.set_updated_at();
create trigger tex_driver_advances_set_updated_at before update on public.tex_driver_advances for each row execute function public.set_updated_at();
create trigger tex_employee_salary_payments_set_updated_at before update on public.tex_employee_salary_payments for each row execute function public.set_updated_at();
create trigger tex_erp_connections_set_updated_at before update on public.tex_erp_connections for each row execute function public.set_updated_at();
create trigger tex_per_diem_rates_set_updated_at before update on public.tex_per_diem_rates for each row execute function public.set_updated_at();
create trigger tex_notifications_set_updated_at before update on public.tex_notifications for each row execute function public.set_updated_at();
create trigger tex_country_configs_set_updated_at before update on public.tex_country_configs for each row execute function public.set_updated_at();
create trigger tex_currency_pegs_set_updated_at before update on public.tex_currency_pegs for each row execute function public.set_updated_at();
create trigger tex_fx_rates_set_updated_at before update on public.tex_fx_rates for each row execute function public.set_updated_at();
create trigger tex_integration_settings_set_updated_at before update on public.tex_integration_settings for each row execute function public.set_updated_at();

alter table public.tex_employee_profiles enable row level security;
alter table public.tex_teams enable row level security;
alter table public.tex_team_members enable row level security;
alter table public.tex_expense_categories enable row level security;
alter table public.tex_trips enable row level security;
alter table public.tex_trip_legs enable row level security;
alter table public.tex_expenses enable row level security;
alter table public.tex_unregistered_whatsapp_submissions enable row level security;
alter table public.tex_whatsapp_pending_actions enable row level security;
alter table public.tex_spend_policies enable row level security;
alter table public.tex_budgets enable row level security;
alter table public.tex_driver_advances enable row level security;
alter table public.tex_employee_salary_payments enable row level security;
alter table public.tex_erp_connections enable row level security;
alter table public.tex_per_diem_rates enable row level security;
alter table public.tex_notifications enable row level security;
alter table public.tex_country_configs enable row level security;
alter table public.tex_currency_pegs enable row level security;
alter table public.tex_fx_rates enable row level security;
alter table public.tex_integration_settings enable row level security;

create policy tex_country_configs_select on public.tex_country_configs for select to authenticated using (true);
create policy tex_country_configs_insert on public.tex_country_configs for insert to authenticated with check (public.is_platform_service_role());
create policy tex_country_configs_update on public.tex_country_configs for update to authenticated using (public.is_platform_service_role()) with check (public.is_platform_service_role());
create policy tex_country_configs_delete on public.tex_country_configs for delete to authenticated using (public.is_platform_service_role());

create policy tex_currency_pegs_select on public.tex_currency_pegs for select to authenticated using (true);
create policy tex_currency_pegs_insert on public.tex_currency_pegs for insert to authenticated with check (public.is_platform_service_role());
create policy tex_currency_pegs_update on public.tex_currency_pegs for update to authenticated using (public.is_platform_service_role()) with check (public.is_platform_service_role());
create policy tex_currency_pegs_delete on public.tex_currency_pegs for delete to authenticated using (public.is_platform_service_role());

create policy tex_fx_rates_select on public.tex_fx_rates for select to authenticated using (true);
create policy tex_fx_rates_insert on public.tex_fx_rates for insert to authenticated with check (public.is_platform_service_role());
create policy tex_fx_rates_update on public.tex_fx_rates for update to authenticated using (public.is_platform_service_role()) with check (public.is_platform_service_role());
create policy tex_fx_rates_delete on public.tex_fx_rates for delete to authenticated using (public.is_platform_service_role());

create policy tex_employee_profiles_select on public.tex_employee_profiles for select to authenticated using (tenant_id = public.current_tenant_id());
create policy tex_employee_profiles_insert on public.tex_employee_profiles for insert to authenticated with check (tenant_id = public.current_tenant_id());
create policy tex_employee_profiles_update on public.tex_employee_profiles for update to authenticated using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy tex_employee_profiles_delete on public.tex_employee_profiles for delete to authenticated using (tenant_id = public.current_tenant_id());

create policy tex_teams_select on public.tex_teams for select to authenticated using (tenant_id = public.current_tenant_id());
create policy tex_teams_insert on public.tex_teams for insert to authenticated with check (tenant_id = public.current_tenant_id());
create policy tex_teams_update on public.tex_teams for update to authenticated using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy tex_teams_delete on public.tex_teams for delete to authenticated using (tenant_id = public.current_tenant_id());

create policy tex_team_members_select on public.tex_team_members for select to authenticated using (tenant_id = public.current_tenant_id());
create policy tex_team_members_insert on public.tex_team_members for insert to authenticated with check (tenant_id = public.current_tenant_id());
create policy tex_team_members_update on public.tex_team_members for update to authenticated using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy tex_team_members_delete on public.tex_team_members for delete to authenticated using (tenant_id = public.current_tenant_id());

create policy tex_expense_categories_select on public.tex_expense_categories for select to authenticated using (tenant_id = public.current_tenant_id());
create policy tex_expense_categories_insert on public.tex_expense_categories for insert to authenticated with check (tenant_id = public.current_tenant_id());
create policy tex_expense_categories_update on public.tex_expense_categories for update to authenticated using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy tex_expense_categories_delete on public.tex_expense_categories for delete to authenticated using (tenant_id = public.current_tenant_id());

create policy tex_trips_select on public.tex_trips for select to authenticated using (tenant_id = public.current_tenant_id());
create policy tex_trips_insert on public.tex_trips for insert to authenticated with check (tenant_id = public.current_tenant_id());
create policy tex_trips_update on public.tex_trips for update to authenticated using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy tex_trips_delete on public.tex_trips for delete to authenticated using (tenant_id = public.current_tenant_id());

create policy tex_trip_legs_select on public.tex_trip_legs for select to authenticated using (tenant_id = public.current_tenant_id());
create policy tex_trip_legs_insert on public.tex_trip_legs for insert to authenticated with check (tenant_id = public.current_tenant_id());
create policy tex_trip_legs_update on public.tex_trip_legs for update to authenticated using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy tex_trip_legs_delete on public.tex_trip_legs for delete to authenticated using (tenant_id = public.current_tenant_id());

create policy tex_expenses_select on public.tex_expenses for select to authenticated using (tenant_id = public.current_tenant_id());
create policy tex_expenses_insert on public.tex_expenses for insert to authenticated with check (tenant_id = public.current_tenant_id());
create policy tex_expenses_update on public.tex_expenses for update to authenticated using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy tex_expenses_delete on public.tex_expenses for delete to authenticated using (tenant_id = public.current_tenant_id());

create policy tex_unregistered_whatsapp_submissions_select on public.tex_unregistered_whatsapp_submissions for select to authenticated using (tenant_id = public.current_tenant_id());
create policy tex_unregistered_whatsapp_submissions_insert on public.tex_unregistered_whatsapp_submissions for insert to authenticated with check (tenant_id = public.current_tenant_id());
create policy tex_unregistered_whatsapp_submissions_update on public.tex_unregistered_whatsapp_submissions for update to authenticated using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy tex_unregistered_whatsapp_submissions_delete on public.tex_unregistered_whatsapp_submissions for delete to authenticated using (tenant_id = public.current_tenant_id());

create policy tex_whatsapp_pending_actions_select on public.tex_whatsapp_pending_actions for select to authenticated using (tenant_id = public.current_tenant_id());
create policy tex_whatsapp_pending_actions_insert on public.tex_whatsapp_pending_actions for insert to authenticated with check (tenant_id = public.current_tenant_id());
create policy tex_whatsapp_pending_actions_update on public.tex_whatsapp_pending_actions for update to authenticated using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy tex_whatsapp_pending_actions_delete on public.tex_whatsapp_pending_actions for delete to authenticated using (tenant_id = public.current_tenant_id());

create policy tex_spend_policies_select on public.tex_spend_policies for select to authenticated using (tenant_id = public.current_tenant_id());
create policy tex_spend_policies_insert on public.tex_spend_policies for insert to authenticated with check (tenant_id = public.current_tenant_id());
create policy tex_spend_policies_update on public.tex_spend_policies for update to authenticated using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy tex_spend_policies_delete on public.tex_spend_policies for delete to authenticated using (tenant_id = public.current_tenant_id());

create policy tex_budgets_select on public.tex_budgets for select to authenticated using (tenant_id = public.current_tenant_id());
create policy tex_budgets_insert on public.tex_budgets for insert to authenticated with check (tenant_id = public.current_tenant_id());
create policy tex_budgets_update on public.tex_budgets for update to authenticated using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy tex_budgets_delete on public.tex_budgets for delete to authenticated using (tenant_id = public.current_tenant_id());

create policy tex_driver_advances_select on public.tex_driver_advances for select to authenticated using (tenant_id = public.current_tenant_id());
create policy tex_driver_advances_insert on public.tex_driver_advances for insert to authenticated with check (tenant_id = public.current_tenant_id());
create policy tex_driver_advances_update on public.tex_driver_advances for update to authenticated using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy tex_driver_advances_delete on public.tex_driver_advances for delete to authenticated using (tenant_id = public.current_tenant_id());

create policy tex_employee_salary_payments_select on public.tex_employee_salary_payments for select to authenticated using (tenant_id = public.current_tenant_id());
create policy tex_employee_salary_payments_insert on public.tex_employee_salary_payments for insert to authenticated with check (tenant_id = public.current_tenant_id());
create policy tex_employee_salary_payments_update on public.tex_employee_salary_payments for update to authenticated using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy tex_employee_salary_payments_delete on public.tex_employee_salary_payments for delete to authenticated using (tenant_id = public.current_tenant_id());

create policy tex_erp_connections_select on public.tex_erp_connections for select to authenticated using (tenant_id = public.current_tenant_id());
create policy tex_erp_connections_insert on public.tex_erp_connections for insert to authenticated with check (tenant_id = public.current_tenant_id());
create policy tex_erp_connections_update on public.tex_erp_connections for update to authenticated using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy tex_erp_connections_delete on public.tex_erp_connections for delete to authenticated using (tenant_id = public.current_tenant_id());

create policy tex_per_diem_rates_select on public.tex_per_diem_rates for select to authenticated using (tenant_id = public.current_tenant_id());
create policy tex_per_diem_rates_insert on public.tex_per_diem_rates for insert to authenticated with check (tenant_id = public.current_tenant_id());
create policy tex_per_diem_rates_update on public.tex_per_diem_rates for update to authenticated using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy tex_per_diem_rates_delete on public.tex_per_diem_rates for delete to authenticated using (tenant_id = public.current_tenant_id());

create policy tex_notifications_select on public.tex_notifications for select to authenticated using (tenant_id = public.current_tenant_id());
create policy tex_notifications_insert on public.tex_notifications for insert to authenticated with check (tenant_id = public.current_tenant_id());
create policy tex_notifications_update on public.tex_notifications for update to authenticated using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy tex_notifications_delete on public.tex_notifications for delete to authenticated using (tenant_id = public.current_tenant_id());

create policy tex_integration_settings_select on public.tex_integration_settings for select to authenticated using (tenant_id = public.current_tenant_id());
create policy tex_integration_settings_insert on public.tex_integration_settings for insert to authenticated with check (tenant_id = public.current_tenant_id());
create policy tex_integration_settings_update on public.tex_integration_settings for update to authenticated using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy tex_integration_settings_delete on public.tex_integration_settings for delete to authenticated using (tenant_id = public.current_tenant_id());

grant select, insert, update, delete on
  public.tex_employee_profiles,
  public.tex_teams,
  public.tex_team_members,
  public.tex_expense_categories,
  public.tex_trips,
  public.tex_trip_legs,
  public.tex_expenses,
  public.tex_unregistered_whatsapp_submissions,
  public.tex_whatsapp_pending_actions,
  public.tex_spend_policies,
  public.tex_budgets,
  public.tex_driver_advances,
  public.tex_employee_salary_payments,
  public.tex_erp_connections,
  public.tex_per_diem_rates,
  public.tex_notifications,
  public.tex_integration_settings
to authenticated;

grant select on
  public.tex_country_configs,
  public.tex_currency_pegs,
  public.tex_fx_rates
to authenticated;

grant select, insert, update, delete on
  public.tex_employee_profiles,
  public.tex_teams,
  public.tex_team_members,
  public.tex_expense_categories,
  public.tex_trips,
  public.tex_trip_legs,
  public.tex_expenses,
  public.tex_unregistered_whatsapp_submissions,
  public.tex_whatsapp_pending_actions,
  public.tex_spend_policies,
  public.tex_budgets,
  public.tex_driver_advances,
  public.tex_employee_salary_payments,
  public.tex_erp_connections,
  public.tex_per_diem_rates,
  public.tex_notifications,
  public.tex_country_configs,
  public.tex_currency_pegs,
  public.tex_fx_rates,
  public.tex_integration_settings
to service_role;

insert into public.tex_country_configs (
  country_code,
  country_name,
  base_currency,
  currency_name,
  currency_symbol,
  has_vat,
  vat_rate,
  tax_name,
  tax_id_label,
  tax_authority_name
) values
  ('AE', 'United Arab Emirates', 'AED', 'UAE Dirham', 'AED', true, 5, 'VAT', 'TRN', 'Federal Tax Authority'),
  ('SA', 'Saudi Arabia', 'SAR', 'Saudi Riyal', 'SAR', true, 15, 'VAT', 'VAT Number', 'Zakat, Tax and Customs Authority'),
  ('BH', 'Bahrain', 'BHD', 'Bahraini Dinar', 'BHD', true, 10, 'VAT', 'VAT Number', 'National Bureau for Revenue'),
  ('KW', 'Kuwait', 'KWD', 'Kuwaiti Dinar', 'KWD', false, 0, 'VAT', 'Tax Number', 'Kuwait Tax Authority'),
  ('OM', 'Oman', 'OMR', 'Omani Rial', 'OMR', true, 5, 'VAT', 'VAT Number', 'Oman Tax Authority'),
  ('QA', 'Qatar', 'QAR', 'Qatari Riyal', 'QAR', false, 0, 'VAT', 'Tax Number', 'General Tax Authority')
on conflict (country_code) do update set
  country_name = excluded.country_name,
  base_currency = excluded.base_currency,
  currency_name = excluded.currency_name,
  currency_symbol = excluded.currency_symbol,
  has_vat = excluded.has_vat,
  vat_rate = excluded.vat_rate,
  tax_name = excluded.tax_name,
  tax_id_label = excluded.tax_id_label,
  tax_authority_name = excluded.tax_authority_name,
  updated_at = now();

insert into public.tex_currency_pegs (from_currency, to_currency, rate, effective_from, notes) values
  ('AED', 'USD', 0.272294, '1997-11-01', 'UAE dirham fixed peg: 1 USD = 3.6725 AED'),
  ('SAR', 'USD', 0.266667, '1986-06-01', 'Saudi riyal fixed peg: 1 USD = 3.75 SAR'),
  ('BHD', 'USD', 2.659574, '2001-01-01', 'Bahraini dinar fixed peg: 1 USD = 0.376 BHD'),
  ('OMR', 'USD', 2.597403, '1986-01-01', 'Omani rial fixed peg: 1 USD = 0.385 OMR'),
  ('QAR', 'USD', 0.274725, '2001-07-01', 'Qatari riyal fixed peg: 1 USD = 3.64 QAR')
on conflict (from_currency, to_currency, effective_from) do update set
  rate = excluded.rate,
  notes = excluded.notes,
  updated_at = now();
