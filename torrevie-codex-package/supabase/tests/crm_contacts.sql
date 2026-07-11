begin;

insert into public.users (id, email) values
  ('00000000-0000-0000-0000-00000000b101', 'crm-contacts-owner-a@example.test'),
  ('00000000-0000-0000-0000-00000000b102', 'crm-contacts-owner-b@example.test'),
  ('00000000-0000-0000-0000-00000000b103', 'crm-contacts-owner-c@example.test');
insert into public.tenants (id, name, slug, status) values
  ('00000000-0000-0000-0000-00000001b101', 'CRM Contacts A', 'crm-contacts-a', 'active'),
  ('00000000-0000-0000-0000-00000001b102', 'CRM Contacts B', 'crm-contacts-b', 'active');
insert into public.accounts (id, tenant_id, name, owner_user_id) values
  ('00000000-0000-0000-0000-00000002b101', '00000000-0000-0000-0000-00000001b101', 'Contact Account A', '00000000-0000-0000-0000-00000000b101'),
  ('00000000-0000-0000-0000-00000002b102', '00000000-0000-0000-0000-00000001b102', 'Contact Account B', '00000000-0000-0000-0000-00000000b102');
insert into public.contacts (id, tenant_id, account_id, first_name, last_name, email, source_module) values
  ('00000000-0000-0000-0000-00000003b101', '00000000-0000-0000-0000-00000001b101', '00000000-0000-0000-0000-00000002b101', 'Ava', 'Tenant', 'ava@example.test', 'crm'),
  ('00000000-0000-0000-0000-00000003b102', '00000000-0000-0000-0000-00000001b102', '00000000-0000-0000-0000-00000002b102', 'Ben', 'Tenant', 'ben@example.test', 'crm');

set local role authenticated;
set local app.current_tenant_id = '00000000-0000-0000-0000-00000001b101';

do $$
declare
  visible_count integer;
  insert_succeeded boolean := false;
begin
  select count(*) into visible_count from public.contacts where tenant_id = '00000000-0000-0000-0000-00000001b102';
  if visible_count <> 0 then raise exception 'contacts cross-tenant select leaked rows'; end if;

  begin
    insert into public.contacts (tenant_id, account_id, first_name, email, source_module)
    values ('00000000-0000-0000-0000-00000001b102', '00000000-0000-0000-0000-00000002b102', 'Cross', 'cross-contact@example.test', 'crm');
    insert_succeeded := true;
  exception when others then null;
  end;
  if insert_succeeded then raise exception 'contacts cross-tenant insert succeeded'; end if;
end $$;

update public.contacts set first_name = 'Changed' where id = '00000000-0000-0000-0000-00000003b102';
delete from public.contacts where id = '00000000-0000-0000-0000-00000003b102';

reset role;

do $$
begin
  if exists (select 1 from public.contacts where id = '00000000-0000-0000-0000-00000003b102' and first_name = 'Changed') then
    raise exception 'contacts cross-tenant update changed row';
  end if;
  if not exists (select 1 from public.contacts where id = '00000000-0000-0000-0000-00000003b102') then
    raise exception 'contacts cross-tenant delete removed row';
  end if;
end $$;

set local role authenticated;
set local app.current_tenant_id = '';

do $$
declare visible_count integer;
begin
  select count(*) into visible_count from public.contacts;
  if visible_count <> 0 then raise exception 'contacts visible without tenant context'; end if;
end $$;

rollback;
