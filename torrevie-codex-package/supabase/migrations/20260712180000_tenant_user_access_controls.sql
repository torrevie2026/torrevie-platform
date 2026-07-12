alter table public.user_profiles
  add column web_access_enabled boolean not null default true,
  add column whatsapp_access_enabled boolean not null default false,
  add column whatsapp_phone_number text,
  add column require_profile_completion boolean not null default true,
  add column require_password_change boolean not null default false,
  add column require_mfa boolean not null default false;

alter table public.user_profiles
  add constraint user_profiles_tenant_id_user_id_key unique (tenant_id, user_id);

alter table public.user_profiles
  add constraint user_profiles_whatsapp_phone_format_check
  check (
    whatsapp_phone_number is null
    or whatsapp_phone_number ~ '^\+[1-9][0-9]{6,31}$'
  );

create index user_profiles_whatsapp_phone_idx
  on public.user_profiles (tenant_id, whatsapp_phone_number)
  where whatsapp_phone_number is not null;
