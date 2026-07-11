begin;

insert into public.users (id, email) values
  ('00000000-0000-0000-0000-000000000a01', 'customer-admin-feature-admin@example.test'),
  ('00000000-0000-0000-0000-000000000a02', 'customer-admin-feature-member-a@example.test'),
  ('00000000-0000-0000-0000-000000000a03', 'customer-admin-feature-member-b@example.test');
insert into public.tenants (id, name, slug, status) values
  ('00000000-0000-0000-0000-000000001a01', 'Customer Admin Feature A', 'customer-admin-feature-a', 'active'),
  ('00000000-0000-0000-0000-000000001a02', 'Customer Admin Feature B', 'customer-admin-feature-b', 'active');
insert into public.tenant_memberships (id, tenant_id, user_id, status) values
  ('00000000-0000-0000-0000-000000002a01', '00000000-0000-0000-0000-000000001a01', '00000000-0000-0000-0000-000000000a01', 'active'),
  ('00000000-0000-0000-0000-000000002a02', '00000000-0000-0000-0000-000000001a01', '00000000-0000-0000-0000-000000000a02', 'active'),
  ('00000000-0000-0000-0000-000000002a03', '00000000-0000-0000-0000-000000001a02', '00000000-0000-0000-0000-000000000a03', 'active');
insert into public.user_role_assignments (id, tenant_id, user_id, role_id, assigned_by)
select '00000000-0000-0000-0000-000000003a01', '00000000-0000-0000-0000-000000001a01', '00000000-0000-0000-0000-000000000a01', roles.id, '00000000-0000-0000-0000-000000000a01'
from public.roles
where roles.key = 'customer_admin';
insert into public.user_role_assignments (id, tenant_id, user_id, role_id, assigned_by)
select '00000000-0000-0000-0000-000000003a02', '00000000-0000-0000-0000-000000001a02', '00000000-0000-0000-0000-000000000a03', roles.id, '00000000-0000-0000-0000-000000000a03'
from public.roles
where roles.key = 'customer_readonly';

set local role authenticated;
set local app.current_tenant_id = '00000000-0000-0000-0000-000000001a01';

do $$
declare
  visible_cross_tenant_members integer;
  cross_tenant_membership_inserted boolean := false;
  cross_tenant_role_inserted boolean := false;
begin
  select count(*) into visible_cross_tenant_members
  from public.tenant_memberships
  where tenant_id = '00000000-0000-0000-0000-000000001a02';

  if visible_cross_tenant_members <> 0 then
    raise exception 'customer admin feature leaked cross-tenant members';
  end if;

  update public.tenant_memberships
     set status = 'disabled'
   where id = '00000000-0000-0000-0000-000000002a02';

  if not exists (
    select 1
    from public.tenant_memberships
    where id = '00000000-0000-0000-0000-000000002a02'
      and status = 'disabled'
  ) then
    raise exception 'customer admin feature could not update own-tenant member';
  end if;

  begin
    insert into public.tenant_memberships (tenant_id, user_id, status)
    values ('00000000-0000-0000-0000-000000001a02', '00000000-0000-0000-0000-000000000a02', 'invited');
    cross_tenant_membership_inserted := true;
  exception when others then null;
  end;

  if cross_tenant_membership_inserted then
    raise exception 'customer admin feature inserted cross-tenant membership';
  end if;

  begin
    insert into public.user_role_assignments (tenant_id, user_id, role_id, assigned_by)
    select '00000000-0000-0000-0000-000000001a02', '00000000-0000-0000-0000-000000000a03', roles.id, '00000000-0000-0000-0000-000000000a01'
    from public.roles
    where roles.key = 'customer_admin';
    cross_tenant_role_inserted := true;
  exception when others then null;
  end;

  if cross_tenant_role_inserted then
    raise exception 'customer admin feature inserted cross-tenant role assignment';
  end if;
end $$;

update public.user_role_assignments
   set assigned_by = '00000000-0000-0000-0000-000000000a01'
 where id = '00000000-0000-0000-0000-000000003a02';
delete from public.user_role_assignments
 where id = '00000000-0000-0000-0000-000000003a02';

reset role;

do $$
begin
  if exists (
    select 1
    from public.user_role_assignments
    where id = '00000000-0000-0000-0000-000000003a02'
      and assigned_by = '00000000-0000-0000-0000-000000000a01'
  ) then
    raise exception 'customer admin feature cross-tenant role update changed row';
  end if;

  if not exists (
    select 1
    from public.user_role_assignments
    where id = '00000000-0000-0000-0000-000000003a02'
  ) then
    raise exception 'customer admin feature cross-tenant role delete removed row';
  end if;
end $$;

rollback;
