alter table public.tex_integration_settings
  add column if not exists whatsapp_webhook_url text,
  add column if not exists whatsapp_webhook_verify_token_last4 text,
  add column if not exists whatsapp_api_key_last4 text,
  add column if not exists whatsapp_app_secret_last4 text,
  add column if not exists whatsapp_keys_configured boolean not null default false;

create table if not exists public.tenant_integration_secrets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  product_key text not null check (product_key in ('tex')),
  integration_key text not null check (integration_key in ('whatsapp')),
  secret_name text not null check (secret_name in ('api_key', 'app_secret', 'webhook_verify_token')),
  secret_value text not null,
  secret_last4 text,
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, product_key, integration_key, secret_name)
);

drop trigger if exists tenant_integration_secrets_set_updated_at on public.tenant_integration_secrets;
create trigger tenant_integration_secrets_set_updated_at
before update on public.tenant_integration_secrets
for each row execute function public.set_updated_at();

alter table public.tenant_integration_secrets enable row level security;

drop policy if exists tenant_integration_secrets_insert on public.tenant_integration_secrets;
drop policy if exists tenant_integration_secrets_delete on public.tenant_integration_secrets;

create policy tenant_integration_secrets_insert
on public.tenant_integration_secrets
for insert
to authenticated
with check (tenant_id = public.current_tenant_id());

create policy tenant_integration_secrets_delete
on public.tenant_integration_secrets
for delete
to authenticated
using (tenant_id = public.current_tenant_id());

grant insert, delete on public.tenant_integration_secrets to authenticated;
grant select, insert, update, delete on public.tenant_integration_secrets to service_role;
