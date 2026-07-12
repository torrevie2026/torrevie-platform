alter table public.users
  add column first_name text,
  add column last_name text,
  add column position text,
  add column mobile_number text,
  add column recovery_email text,
  add column profile_completed_at timestamptz;

alter table public.users
  add constraint users_recovery_email_format_check
  check (recovery_email is null or recovery_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$');

create index users_recovery_email_idx on public.users (recovery_email) where recovery_email is not null;
