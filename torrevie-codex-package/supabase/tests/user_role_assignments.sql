begin;

insert into public.users (id, email) values
  ('00000000-0000-0000-0000-000000000501', 'roles-a@example.test'),
  ('00000000-0000-0000-0000-000000000502', 'roles-b@example.test'),
  ('00000000-0000-0000-0000-000000000503', 'roles-c@example.test');
insert into public.tenants (id, name, slug, status) values
  ('00000000-0000-0000-0000-000000001501', 'Assignments A', 'assignments-a', 'active'),
  ('00000000-0000-0000-0000-000000001502', 'Assignments B', 'assignments-b', 'active');

insert into public.user_role_assignments (id, tenant_id, user_id, role_id)
select '00000000-0000-0000-0000-000000005501', '00000000-0000-0000-0000-000000001501', '00000000-0000-0000-0000-000000000501', id
from public.roles where key = 'customer_admin';
insert into public.user_role_assignments (id, tenant_id, user_id, role_id)
select '00000000-0000-0000-0000-000000005502', '00000000-0000-0000-0000-000000001502', '00000000-0000-0000-0000-000000000502', id
from public.roles where key = 'customer_admin';

set local role authenticated;
set local app.current_tenant_id = '00000000-0000-0000-0000-000000001501';

do $$
declare role_id uuid; visible_count integer; insert_succeeded boolean := false;
begin
  select count(*) into visible_count from public.user_role_assignments where tenant_id = '00000000-0000-0000-0000-000000001502';
  if visible_count <> 0 then raise exception 'user_role_assignments cross-tenant select leaked rows'; end if;
  select id into role_id from public.roles where key = 'customer_readonly';
  begin
    insert into public.user_role_assignments (tenant_id, user_id, role_id)
    values ('00000000-0000-0000-0000-000000001502', '00000000-0000-0000-0000-000000000503', role_id);
    insert_succeeded := true;
  exception when others then null;
  end;
  if insert_succeeded then raise exception 'user_role_assignments cross-tenant insert succeeded'; end if;
end $$;

update public.user_role_assignments set assigned_by = '00000000-0000-0000-0000-000000000501' where id = '00000000-0000-0000-0000-000000005502';
delete from public.user_role_assignments where id = '00000000-0000-0000-0000-000000005502';

reset role;

do $$
begin
  if exists (select 1 from public.user_role_assignments where id = '00000000-0000-0000-0000-000000005502' and assigned_by = '00000000-0000-0000-0000-000000000501') then
    raise exception 'user_role_assignments cross-tenant update changed row';
  end if;
  if not exists (select 1 from public.user_role_assignments where id = '00000000-0000-0000-0000-000000005502') then
    raise exception 'user_role_assignments cross-tenant delete removed row';
  end if;
end $$;

set local role authenticated;
set local app.current_tenant_id = '';

do $$
declare visible_count integer;
begin
  select count(*) into visible_count from public.user_role_assignments;
  if visible_count <> 0 then raise exception 'user_role_assignments visible without tenant context'; end if;
end $$;

rollback;
