alter table public.user_profiles
  add column if not exists tex_first_run_tutorial_dismissed_at timestamptz;

create index if not exists user_profiles_tex_first_run_tutorial_idx
  on public.user_profiles (tenant_id, user_id)
  where tex_first_run_tutorial_dismissed_at is null;
