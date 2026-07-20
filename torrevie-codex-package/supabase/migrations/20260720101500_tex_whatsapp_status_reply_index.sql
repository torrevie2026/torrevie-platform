create index if not exists tex_unregistered_whatsapp_submissions_resolved_expense_idx
  on public.tex_unregistered_whatsapp_submissions (tenant_id, resolved_expense_id, resolved_at desc, created_at desc)
  where resolved_expense_id is not null;

create table if not exists public.tex_quick_connect_outbox (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  session_id uuid references public.tex_quick_connect_sessions(id) on delete set null,
  submission_id uuid references public.tex_unregistered_whatsapp_submissions(id) on delete set null,
  expense_id uuid references public.tex_expenses(id) on delete set null,
  recipient_phone text,
  whatsapp_chat_jid text,
  message_text text not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  attempts integer not null default 0,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null
);

create index if not exists tex_quick_connect_outbox_tenant_status_idx
  on public.tex_quick_connect_outbox (tenant_id, status, created_at)
  where status in ('pending', 'failed');

drop trigger if exists tex_quick_connect_outbox_set_updated_at on public.tex_quick_connect_outbox;
create trigger tex_quick_connect_outbox_set_updated_at
before update on public.tex_quick_connect_outbox
for each row execute function public.set_updated_at();

alter table public.tex_quick_connect_outbox enable row level security;

drop policy if exists tex_quick_connect_outbox_select on public.tex_quick_connect_outbox;
drop policy if exists tex_quick_connect_outbox_insert on public.tex_quick_connect_outbox;
drop policy if exists tex_quick_connect_outbox_update on public.tex_quick_connect_outbox;
drop policy if exists tex_quick_connect_outbox_delete on public.tex_quick_connect_outbox;

create policy tex_quick_connect_outbox_select on public.tex_quick_connect_outbox
for select to authenticated using (tenant_id = public.current_tenant_id());
create policy tex_quick_connect_outbox_insert on public.tex_quick_connect_outbox
for insert to authenticated with check (tenant_id = public.current_tenant_id());
create policy tex_quick_connect_outbox_update on public.tex_quick_connect_outbox
for update to authenticated using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id());
create policy tex_quick_connect_outbox_delete on public.tex_quick_connect_outbox
for delete to authenticated using (tenant_id = public.current_tenant_id());

grant select, insert, update, delete on public.tex_quick_connect_outbox to authenticated;
grant select, insert, update, delete on public.tex_quick_connect_outbox to service_role;
