begin;

insert into public.users (id, email) values
  ('00000000-0000-0000-0000-00000000b001', 'crm-accounts-owner-a@example.test'),
  ('00000000-0000-0000-0000-00000000b002', 'crm-accounts-owner-b@example.test'),
  ('00000000-0000-0000-0000-00000000b003', 'crm-accounts-owner-c@example.test');
insert into public.tenants (id, name, slug, status) values
  ('00000000-0000-0000-0000-00000001b001', 'CRM Accounts A', 'crm-accounts-a', 'active'),
  ('00000000-0000-0000-0000-00000001b002', 'CRM Accounts B', 'crm-accounts-b', 'active');
insert into public.accounts (id, tenant_id, name, industry, owner_user_id) values
  ('00000000-0000-0000-0000-00000002b001', '00000000-0000-0000-0000-00000001b001', 'Account A', 'Logistics', '00000000-0000-0000-0000-00000000b001'),
  ('00000000-0000-0000-0000-00000002b002', '00000000-0000-0000-0000-00000001b002', 'Account B', 'Construction', '00000000-0000-0000-0000-00000000b002');

set local role authenticated;
set local app.current_tenant_id = '00000000-0000-0000-0000-00000001b001';

do $$
declare
  visible_count integer;
  insert_succeeded boolean := false;
begin
  select count(*) into visible_count from public.accounts where tenant_id = '00000000-0000-0000-0000-00000001b002';
  if visible_count <> 0 then raise exception 'accounts cross-tenant select leaked rows'; end if;

  begin
    insert into public.accounts (tenant_id, name, owner_user_id)
    values ('00000000-0000-0000-0000-00000001b002', 'Cross Tenant Account', '00000000-0000-0000-0000-00000000b003');
    insert_succeeded := true;
  exception when others then null;
  end;
  if insert_succeeded then raise exception 'accounts cross-tenant insert succeeded'; end if;
end $$;

update public.accounts set name = 'Changed Account B' where id = '00000000-0000-0000-0000-00000002b002';
delete from public.accounts where id = '00000000-0000-0000-0000-00000002b002';

reset role;

do $$
begin
  if exists (select 1 from public.accounts where id = '00000000-0000-0000-0000-00000002b002' and name = 'Changed Account B') then
    raise exception 'accounts cross-tenant update changed row';
  end if;
  if not exists (select 1 from public.accounts where id = '00000000-0000-0000-0000-00000002b002') then
    raise exception 'accounts cross-tenant delete removed row';
  end if;
end $$;

set local role authenticated;
set local app.current_tenant_id = '';

do $$
declare visible_count integer;
begin
  select count(*) into visible_count from public.accounts;
  if visible_count <> 0 then raise exception 'accounts visible without tenant context'; end if;
end $$;

rollback;
