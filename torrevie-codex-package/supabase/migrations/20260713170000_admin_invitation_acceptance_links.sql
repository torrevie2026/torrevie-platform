create table if not exists public.platform_invitation_links (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  email text not null,
  role_key text not null,
  token_hash text not null unique,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'expired')),
  auth_user_id uuid null references public.users(id) on delete set null,
  expires_at timestamptz not null,
  redeemed_at timestamptz null,
  created_by uuid not null references public.users(id),
  updated_by uuid not null references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.platform_invitation_links enable row level security;

create index if not exists platform_invitation_links_tenant_idx
  on public.platform_invitation_links (tenant_id, status, expires_at);

create index if not exists platform_invitation_links_email_idx
  on public.platform_invitation_links (lower(email));
