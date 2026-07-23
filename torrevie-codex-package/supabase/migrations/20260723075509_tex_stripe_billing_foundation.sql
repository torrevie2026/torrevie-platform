create type public.tex_billing_currency as enum ('aed', 'usd');
create type public.tex_billing_event_status as enum ('processed', 'ignored', 'failed');

create table public.tex_billing_customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  stripe_customer_id text not null unique,
  billing_email text not null default '',
  currency public.tex_billing_currency not null default 'aed',
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id)
);

create table public.tex_billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  platform_subscription_id uuid references public.subscriptions(id) on delete set null,
  stripe_customer_id text not null,
  stripe_subscription_id text not null unique,
  stripe_price_id text not null,
  plan_key public.tex_plan_key not null,
  currency public.tex_billing_currency not null,
  stripe_status text not null,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  latest_invoice_id text,
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id)
);

create table public.tex_billing_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete set null,
  stripe_event_id text not null unique,
  event_type text not null,
  status public.tex_billing_event_status not null,
  error text,
  processed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index tex_billing_customers_tenant_idx
  on public.tex_billing_customers (tenant_id);

create index tex_billing_subscriptions_tenant_status_idx
  on public.tex_billing_subscriptions (tenant_id, stripe_status);

create index tex_billing_events_tenant_processed_idx
  on public.tex_billing_events (tenant_id, processed_at desc);

create trigger tex_billing_customers_set_updated_at before update on public.tex_billing_customers
for each row execute function public.set_updated_at();

create trigger tex_billing_subscriptions_set_updated_at before update on public.tex_billing_subscriptions
for each row execute function public.set_updated_at();

alter table public.tex_billing_customers enable row level security;
alter table public.tex_billing_subscriptions enable row level security;
alter table public.tex_billing_events enable row level security;

grant select on public.tex_billing_customers to authenticated;
grant select on public.tex_billing_subscriptions to authenticated;
grant select on public.tex_billing_events to authenticated;

grant select, insert, update, delete on public.tex_billing_customers to service_role;
grant select, insert, update, delete on public.tex_billing_subscriptions to service_role;
grant select, insert, update, delete on public.tex_billing_events to service_role;

create policy tex_billing_customers_select on public.tex_billing_customers
for select to authenticated using (tenant_id = public.current_tenant_id());

create policy tex_billing_subscriptions_select on public.tex_billing_subscriptions
for select to authenticated using (tenant_id = public.current_tenant_id());

create policy tex_billing_events_select on public.tex_billing_events
for select to authenticated using (tenant_id = public.current_tenant_id());
