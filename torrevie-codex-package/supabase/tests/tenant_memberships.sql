begin;

insert into public.users (id, email) values
  ('00000000-0000-0000-0000-000000000201', 'tenant-memberships-a@example.test'),
  ('00000000-0000-0000-0000-000000000202', 'tenant-memberships-b@example.test'),
  ('00000000-0000-0000-0000-000000000203', 'tenant-memberships-c@example.test');
insert into public.tenants (id, name, slug, status) values
  ('00000000-0000-0000-0000-000000001201', 'Tenant Memberships A', 'tenant-memberships-a', 'active'),
  ('00000000-0000-0000-0000-000000001202', 'Tenant Memberships B', 'tenant-memberships-b', 'active');
insert into public.tenant_memberships (id, tenant_id, user_id, status) values
  ('00000000-0000-0000-0000-000000002201', '00000000-0000-0000-0000-000000001201', '00000000-0000-0000-0000-000000000201', 'active'),
  ('00000000-0000-0000-0000-000000002202', '00000000-0000-0000-0000-000000001202', '00000000-0000-0000-0000-000000000202', 'active');

set local role authenticated;
set local app.current_tenant_id = '00000000-0000-0000-0000-000000001201';

do $$
declare
  visible_count integer;
  insert_succeeded boolean := false;
begin
  select count(*) into visible_count from public.tenant_memberships where tenant_id = '00000000-0000-0000-0000-000000001202';
  if visible_count <> 0 then raise exception 'tenant_memberships cross-tenant select leaked rows'; end if;

  begin
    insert into public.tenant_memberships (tenant_id, user_id, status)
    values ('00000000-0000-0000-0000-000000001202', '00000000-0000-0000-0000-000000000203', 'active');
    insert_succeeded := true;
  exception when others then null;
  end;
  if insert_succeeded then raise exception 'tenant_memberships cross-tenant insert succeeded'; end if;
end $$;

update public.tenant_memberships set status = 'disabled' where id = '00000000-0000-0000-0000-000000002202';
delete from public.tenant_memberships where id = '00000000-0000-0000-0000-000000002202';

reset role;

do $$
begin
  if exists (select 1 from public.tenant_memberships where id = '00000000-0000-0000-0000-000000002202' and status = 'disabled') then
    raise exception 'tenant_memberships cross-tenant update changed row';
  end if;
  if not exists (select 1 from public.tenant_memberships where id = '00000000-0000-0000-0000-000000002202') then
    raise exception 'tenant_memberships cross-tenant delete removed row';
  end if;
end $$;

set local role authenticated;
set local app.current_tenant_id = '';

do $$
declare visible_count integer;
begin
  select count(*) into visible_count from public.tenant_memberships;
  if visible_count <> 0 then raise exception 'tenant_memberships visible without tenant context'; end if;
end $$;

rollback;
