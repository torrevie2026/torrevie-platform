create table if not exists public.auth_action_links (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  action_link text not null,
  action_type text not null check (action_type in ('invite', 'recovery')),
  expires_at timestamptz not null,
  access_count integer not null default 0,
  last_accessed_at timestamptz null,
  created_at timestamptz not null default now()
);

alter table public.auth_action_links enable row level security;

create index if not exists auth_action_links_expires_at_idx
  on public.auth_action_links (expires_at);
