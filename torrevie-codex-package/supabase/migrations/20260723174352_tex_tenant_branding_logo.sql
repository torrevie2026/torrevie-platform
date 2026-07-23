alter table public.tenants
  add column if not exists logo_storage_path text,
  add column if not exists logo_content_type text,
  add column if not exists logo_updated_at timestamptz;

comment on column public.tenants.logo_storage_path is 'Tenant-scoped Supabase Storage object path for customer branding logo.';
comment on column public.tenants.logo_content_type is 'MIME type for the tenant branding logo.';
comment on column public.tenants.logo_updated_at is 'Timestamp used for cache busting tenant branding logo URLs.';
