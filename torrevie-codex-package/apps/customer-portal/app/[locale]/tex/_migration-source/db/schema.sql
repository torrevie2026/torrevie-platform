create extension if not exists pgcrypto;

-- TEX Neon schema
-- Mirrors the business model from the Supabase app while using the same
-- server-owned Neon access pattern as CRM. Authorization is enforced in API
-- handlers, not through Supabase RLS/auth/storage policies.

create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country_code text not null,
  base_currency text not null,
  logo_url text,
  plan text default 'trial',
  stripe_customer_id text,
  trial_expires_at timestamptz,
  tax_registration_number text,
  vat_rate_override numeric,
  trip_linking_mode text not null default 'auto',
  whatsapp_provider text not null default 'ultramsg',
  whatsapp_instance_id text,
  wappfly_api_token text,
  wappfly_session_id text,
  meta_phone_number_id text,
  meta_whatsapp_business_account_id text,
  created_at timestamptz not null default now()
);

alter table if exists companies add column if not exists meta_phone_number_id text;
alter table if exists companies add column if not exists meta_whatsapp_business_account_id text;

create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete set null,
  email text not null unique,
  password_hash text not null,
  full_name text,
  role text default 'employee',
  super_admin boolean not null default false,
  avatar_url text,
  manager_id uuid references app_users(id) on delete set null,
  is_ceo boolean not null default false,
  approval_limit_aed numeric,
  notification_preferences jsonb not null default '{"expense_submitted":true,"expense_approved":true,"expense_rejected":true,"expense_paid":true,"policy_violation":true,"budget_warning":true,"budget_exceeded":true,"sync_complete":true,"trip_budget_warning":true}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_users_role_check check (role in ('admin', 'finance', 'manager', 'employee', 'coordinator'))
);

create table if not exists user_company_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  role text not null default 'employee',
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, company_id),
  constraint user_company_memberships_role_check check (role in ('admin', 'finance', 'manager', 'employee', 'coordinator'))
);

create table if not exists password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists country_configs (
  id uuid primary key default gen_random_uuid(),
  country_code text not null unique,
  country_name text not null,
  base_currency text not null,
  currency_name text not null,
  currency_symbol text not null,
  has_vat boolean default true,
  vat_rate numeric not null default 0,
  vat_rate_reduced numeric,
  tax_name text default 'VAT',
  tax_id_label text default 'VAT Number',
  tax_authority_name text,
  created_at timestamptz not null default now()
);

create table if not exists currency_pegs (
  id uuid primary key default gen_random_uuid(),
  from_currency text not null,
  to_currency text not null default 'USD',
  rate numeric not null,
  effective_from date not null,
  notes text,
  unique (from_currency, to_currency, effective_from)
);

create table if not exists fx_rates (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  from_currency text not null,
  to_currency text not null,
  rate numeric not null,
  source text,
  is_manual_override boolean not null default false,
  created_at timestamptz not null default now(),
  unique (date, from_currency, to_currency)
);

create table if not exists employees (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  phone_number text not null,
  department text,
  monthly_salary numeric not null default 0,
  role text,
  is_active boolean not null default true,
  manager_profile_id uuid references app_users(id) on delete set null,
  submission_frequency text not null default 'realtime',
  created_at timestamptz not null default now(),
  unique (company_id, phone_number)
);

alter table if exists employees add column if not exists monthly_salary numeric not null default 0;

create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  description text,
  manager_id uuid references employees(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  joined_at timestamptz default now(),
  unique (team_id, employee_id)
);

create table if not exists trips (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  description text,
  trip_type text not null default 'general',
  origin text,
  destination text,
  budget_aed numeric,
  advance_deposit_slip_url text,
  advance_deposit_slip_file_id uuid,
  start_date date,
  end_date date,
  status text default 'open',
  enforce_currency boolean default false,
  enforced_currency text,
  team_id uuid references teams(id) on delete set null,
  container_number text,
  driver_employee_id uuid references employees(id) on delete set null,
  driver_trip_amount numeric not null default 0,
  subcontractor_driver_name text,
  subcontractor_amount numeric not null default 0,
  subcontractor_notes text,
  driver_payout_status text not null default 'unpaid',
  driver_payout_paid_by uuid references app_users(id) on delete set null,
  driver_payout_paid_at timestamptz,
  created_by uuid references app_users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table if exists trips add column if not exists driver_employee_id uuid references employees(id) on delete set null;
alter table if exists trips add column if not exists advance_deposit_slip_url text;
alter table if exists trips add column if not exists advance_deposit_slip_file_id uuid;
alter table if exists trips add column if not exists driver_trip_amount numeric not null default 0;
alter table if exists trips add column if not exists subcontractor_driver_name text;
alter table if exists trips add column if not exists subcontractor_amount numeric not null default 0;
alter table if exists trips add column if not exists subcontractor_notes text;
alter table if exists trips add column if not exists driver_payout_status text not null default 'unpaid';
alter table if exists trips add column if not exists driver_payout_paid_by uuid references app_users(id) on delete set null;
alter table if exists trips add column if not exists driver_payout_paid_at timestamptz;

create table if not exists trip_legs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  trip_id uuid not null references trips(id) on delete cascade,
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
  mode text,
  status text not null default 'planned',
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
  budget numeric,
  container_ref text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists trip_legs add column if not exists origin_place_id text;
alter table if exists trip_legs add column if not exists origin_lat numeric;
alter table if exists trip_legs add column if not exists origin_lng numeric;
alter table if exists trip_legs add column if not exists destination_place_id text;
alter table if exists trip_legs add column if not exists destination_lat numeric;
alter table if exists trip_legs add column if not exists destination_lng numeric;
alter table if exists trip_legs add column if not exists duration_seconds integer;
alter table if exists trip_legs add column if not exists is_return_trip boolean not null default false;
alter table if exists trip_legs add column if not exists return_distance_km numeric;
alter table if exists trip_legs add column if not exists return_duration_seconds integer;
alter table if exists trip_legs add column if not exists total_distance_km numeric;
alter table if exists trip_legs add column if not exists distance_source text;
alter table if exists trip_legs add column if not exists route_polyline text;

create table if not exists expense_categories (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  is_system boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, name)
);

create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  submitter_id uuid references app_users(id) on delete set null,
  employee_id uuid references employees(id) on delete set null,
  employee_name text,
  employee_phone text,
  whatsapp_chat_jid text,
  vendor text,
  date date not null,
  amount numeric not null,
  currency text not null,
  base_amount numeric,
  exchange_rate numeric,
  category text,
  expense_type text default 'receipt',
  payment_method text,
  trip_id uuid references trips(id) on delete set null,
  leg_id uuid references trip_legs(id) on delete set null,
  trip_name text,
  notes text,
  tax_id_number text,
  tax_amount numeric,
  receipt_image_url text,
  original_currency text,
  original_amount numeric,
  status text default 'pending',
  source text default 'web',
  policy_flag boolean default false,
  policy_flag_reason text,
  approved_by uuid references app_users(id) on delete set null,
  approved_at timestamptz,
  rejected_by uuid references app_users(id) on delete set null,
  rejected_at timestamptz,
  rejected_reason text,
  finance_reviewed_by uuid references app_users(id) on delete set null,
  finance_reviewed_at timestamptz,
  paid_by uuid references app_users(id) on delete set null,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists expenses add column if not exists whatsapp_chat_jid text;

create table if not exists receipt_files (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  uploaded_by uuid references app_users(id) on delete set null,
  file_name text not null,
  content_type text not null,
  size_bytes integer not null,
  data bytea not null,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'trips_advance_deposit_slip_file_id_fkey'
  ) then
    alter table trips
      add constraint trips_advance_deposit_slip_file_id_fkey
      foreign key (advance_deposit_slip_file_id) references receipt_files(id) on delete set null;
  end if;
end $$;

create table if not exists unregistered_whatsapp_submissions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  sender_raw text,
  sender_phone text,
  whatsapp_chat_jid text,
  message_id text,
  session_id text,
  message_text text,
  receipt_file_id uuid references receipt_files(id) on delete set null,
  receipt_image_url text,
  payload jsonb,
  status text not null default 'open',
  resolved_expense_id uuid references expenses(id) on delete set null,
  resolved_employee_id uuid references employees(id) on delete set null,
  resolved_by uuid references app_users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  constraint unregistered_whatsapp_submissions_status_check check (status in ('open', 'resolved', 'ignored'))
);

create table if not exists whatsapp_pending_actions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  employee_id uuid references employees(id) on delete cascade,
  expense_id uuid references expenses(id) on delete cascade,
  sender_phone text,
  whatsapp_chat_jid text,
  provider text not null,
  action text not null default 'select_trip',
  options jsonb not null default '[]'::jsonb,
  status text not null default 'open',
  expires_at timestamptz not null default now() + interval '1 hour',
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  constraint whatsapp_pending_actions_status_check check (status in ('open', 'resolved', 'expired', 'cancelled')),
  constraint whatsapp_pending_actions_action_check check (action in ('select_trip'))
);

create table if not exists spend_policies (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  category text not null,
  daily_limit numeric,
  monthly_limit numeric,
  requires_notes_above numeric,
  is_blocked boolean default false,
  created_at timestamptz not null default now(),
  unique (company_id, category)
);

create table if not exists budgets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  department text not null,
  month integer not null check (month between 1 and 12),
  year integer not null check (year >= 2000),
  budget_amount numeric not null,
  created_at timestamptz not null default now(),
  unique (company_id, department, month, year)
);

create table if not exists driver_advances (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  amount numeric not null check (amount > 0),
  currency text not null,
  base_amount numeric not null,
  advance_date date not null default current_date,
  month integer not null check (month between 1 and 12),
  year integer not null check (year >= 2000),
  notes text,
  created_by uuid references app_users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists employee_salary_payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  month integer not null check (month between 1 and 12),
  year integer not null check (year >= 2000),
  amount numeric not null check (amount >= 0),
  currency text not null,
  paid_by uuid references app_users(id) on delete set null,
  paid_at timestamptz not null default now(),
  note text,
  created_at timestamptz not null default now(),
  unique (company_id, employee_id, month, year)
);

create table if not exists erp_connections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  erp_type text,
  base_url text,
  is_active boolean default false,
  last_sync_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists per_diem_rates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  destination text not null,
  daily_rate numeric not null,
  currency text not null,
  created_at timestamptz not null default now(),
  unique (company_id, destination, currency)
);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  user_id uuid references app_users(id) on delete set null,
  title text not null,
  body text,
  type text,
  related_expense_id uuid references expenses(id) on delete set null,
  related_trip_id uuid references trips(id) on delete set null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

alter table if exists notifications add column if not exists related_expense_id uuid references expenses(id) on delete set null;
alter table if exists notifications add column if not exists related_trip_id uuid references trips(id) on delete set null;

create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete set null,
  user_id uuid references app_users(id) on delete set null,
  action text not null,
  table_name text not null,
  record_id uuid,
  old_values jsonb,
  new_values jsonb,
  ip_address text,
  created_at timestamptz not null default now()
);

create table if not exists email_send_log (
  id uuid primary key default gen_random_uuid(),
  message_id text,
  template_name text not null,
  recipient_email text not null,
  status text not null,
  error_message text,
  metadata jsonb,
  created_at timestamptz not null default now(),
  constraint email_send_log_status_check check (status in ('pending', 'sent', 'suppressed', 'failed', 'bounced', 'complained', 'dlq'))
);

create table if not exists email_send_state (
  id integer primary key default 1 check (id = 1),
  retry_after_until timestamptz,
  batch_size integer not null default 10,
  send_delay_ms integer not null default 200,
  auth_email_ttl_minutes integer not null default 15,
  transactional_email_ttl_minutes integer not null default 60,
  updated_at timestamptz not null default now()
);

insert into email_send_state (id) values (1) on conflict do nothing;

insert into user_company_memberships (user_id, company_id, role, is_default)
select id, company_id, coalesce(role, 'employee'), true
from app_users
where company_id is not null
on conflict (user_id, company_id) do update set
  role = excluded.role,
  is_default = user_company_memberships.is_default or excluded.is_default,
  updated_at = now();

insert into country_configs (
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
  (
    'AE',
    'United Arab Emirates',
    'AED',
    'UAE Dirham',
    'AED',
    true,
    5,
    'VAT',
    'TRN',
    'Federal Tax Authority'
  ),
  (
    'SA',
    'Saudi Arabia',
    'SAR',
    'Saudi Riyal',
    'SAR',
    true,
    15,
    'VAT',
    'VAT Number',
    'Zakat, Tax and Customs Authority'
  ),
  (
    'BH',
    'Bahrain',
    'BHD',
    'Bahraini Dinar',
    'BHD',
    true,
    10,
    'VAT',
    'VAT Number',
    'National Bureau for Revenue'
  ),
  (
    'KW',
    'Kuwait',
    'KWD',
    'Kuwaiti Dinar',
    'KWD',
    false,
    0,
    'VAT',
    'Tax Number',
    'Kuwait Tax Authority'
  ),
  (
    'OM',
    'Oman',
    'OMR',
    'Omani Rial',
    'OMR',
    true,
    5,
    'VAT',
    'VAT Number',
    'Oman Tax Authority'
  ),
  (
    'QA',
    'Qatar',
    'QAR',
    'Qatari Riyal',
    'QAR',
    false,
    0,
    'VAT',
    'Tax Number',
    'General Tax Authority'
  )
on conflict (country_code) do update set
  country_name = excluded.country_name,
  base_currency = excluded.base_currency,
  currency_name = excluded.currency_name,
  currency_symbol = excluded.currency_symbol,
  has_vat = excluded.has_vat,
  vat_rate = excluded.vat_rate,
  tax_name = excluded.tax_name,
  tax_id_label = excluded.tax_id_label,
  tax_authority_name = excluded.tax_authority_name;

insert into currency_pegs (
  from_currency,
  to_currency,
  rate,
  effective_from,
  notes
) values
  (
    'AED',
    'USD',
    0.272294,
    '1997-11-01',
    'UAE dirham fixed peg: 1 USD = 3.6725 AED'
  ),
  (
    'SAR',
    'USD',
    0.266667,
    '1986-06-01',
    'Saudi riyal fixed peg: 1 USD = 3.75 SAR'
  ),
  (
    'BHD',
    'USD',
    2.659574,
    '2001-01-01',
    'Bahraini dinar fixed peg: 1 USD = 0.376 BHD'
  ),
  (
    'OMR',
    'USD',
    2.597403,
    '1986-01-01',
    'Omani rial fixed peg: 1 USD = 0.385 OMR'
  ),
  (
    'QAR',
    'USD',
    0.274725,
    '2001-07-01',
    'Qatari riyal fixed peg: 1 USD = 3.64 QAR'
  )
on conflict (from_currency, to_currency, effective_from) do update set
  rate = excluded.rate,
  notes = excluded.notes;

create table if not exists suppressed_emails (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  reason text not null,
  metadata jsonb,
  created_at timestamptz not null default now(),
  constraint suppressed_emails_reason_check check (reason in ('unsubscribe', 'bounce', 'complaint'))
);

create table if not exists email_unsubscribe_tokens (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  email text not null unique,
  created_at timestamptz not null default now(),
  used_at timestamptz
);

create index if not exists app_users_company_idx on app_users(company_id);
create index if not exists app_users_manager_idx on app_users(manager_id);
create index if not exists user_company_memberships_user_idx on user_company_memberships(user_id);
create index if not exists user_company_memberships_company_idx on user_company_memberships(company_id);
create index if not exists employees_company_idx on employees(company_id);
create index if not exists employees_manager_profile_idx on employees(manager_profile_id);
create index if not exists teams_company_idx on teams(company_id);
create index if not exists team_members_employee_idx on team_members(employee_id);
create index if not exists trips_company_status_idx on trips(company_id, status);
create index if not exists trips_team_idx on trips(team_id);
create index if not exists trips_driver_payout_idx on trips(company_id, driver_employee_id, driver_payout_status);
create index if not exists trip_legs_trip_sequence_idx on trip_legs(trip_id, sequence);
create index if not exists expenses_company_status_idx on expenses(company_id, status);
create index if not exists expenses_company_date_idx on expenses(company_id, date);
create index if not exists expenses_employee_idx on expenses(employee_id);
create index if not exists expenses_submitter_idx on expenses(submitter_id);
create index if not exists expenses_trip_idx on expenses(trip_id);
create index if not exists receipt_files_company_created_idx on receipt_files(company_id, created_at desc);
create index if not exists unregistered_whatsapp_submissions_company_status_idx on unregistered_whatsapp_submissions(company_id, status, created_at desc);
create unique index if not exists unregistered_whatsapp_submissions_message_unique_idx
  on unregistered_whatsapp_submissions(company_id, message_id)
  where message_id is not null;
create index if not exists whatsapp_pending_actions_lookup_idx
  on whatsapp_pending_actions(company_id, employee_id, status, expires_at desc);
create index if not exists whatsapp_pending_actions_expense_idx on whatsapp_pending_actions(expense_id);
create index if not exists notifications_user_idx on notifications(user_id, is_read, created_at desc);
create index if not exists notifications_related_expense_idx on notifications(related_expense_id);
create index if not exists notifications_related_trip_idx on notifications(related_trip_id);
create index if not exists audit_log_company_created_idx on audit_log(company_id, created_at desc);
create index if not exists driver_advances_company_month_idx on driver_advances(company_id, year, month);
create index if not exists driver_advances_employee_idx on driver_advances(employee_id, year, month);
create index if not exists employee_salary_payments_company_month_idx on employee_salary_payments(company_id, year, month);
create index if not exists employee_salary_payments_employee_idx on employee_salary_payments(employee_id, year, month);
create index if not exists email_send_log_created_idx on email_send_log(created_at desc);
create index if not exists email_send_log_recipient_idx on email_send_log(recipient_email);
create index if not exists email_send_log_message_idx on email_send_log(message_id);
create unique index if not exists email_send_log_sent_message_unique_idx
  on email_send_log(message_id) where status = 'sent' and message_id is not null;
