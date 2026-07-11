begin;

insert into public.users (id, email) values
  ('00000000-0000-0000-0000-000000000101', 'tenant-settings-a@example.test'),
  ('00000000-0000-0000-0000-000000000102', 'tenant-settings-b@example.test');
insert into public.tenants (id, name, slug, status) values
  ('00000000-0000-0000-0000-000000001101', 'Tenant Settings A', 'tenant-settings-a', 'active'),
  ('00000000-0000-0000-0000-000000001102', 'Tenant Settings B', 'tenant-settings-b', 'active');
insert into public.tenant_settings (tenant_id, timezone) values
  ('00000000-0000-0000-0000-000000001101', 'Asia/Dubai'),
  ('00000000-0000-0000-0000-000000001102', 'Asia/Dubai');

set local role authenticated;
set local app.current_tenant_id = '00000000-0000-0000-0000-000000001101';

do $$
declare
  visible_count integer;
  insert_succeeded boolean := false;
begin
  select count(*) into visible_count
  from public.tenant_settings
  where tenant_id = '00000000-0000-0000-0000-000000001102';
  if visible_count <> 0 then raise exception 'tenant_settings cross-tenant select leaked rows'; end if;

  begin
    insert into public.tenant_settings (tenant_id, timezone)
    values ('00000000-0000-0000-0000-000000001102', 'UTC');
    insert_succeeded := true;
  exception when others then null;
  end;
  if insert_succeeded then raise exception 'tenant_settings cross-tenant insert succeeded'; end if;
end $$;

update public.tenant_settings
set timezone = 'UTC'
where tenant_id = '00000000-0000-0000-0000-000000001102';

delete from public.tenant_settings
where tenant_id = '00000000-0000-0000-0000-000000001102';

reset role;

do $$
begin
  if exists (
    select 1 from public.tenant_settings
    where tenant_id = '00000000-0000-0000-0000-000000001102' and timezone = 'UTC'
  ) then raise exception 'tenant_settings cross-tenant update changed row'; end if;

  if not exists (
    select 1 from public.tenant_settings
    where tenant_id = '00000000-0000-0000-0000-000000001102'
  ) then raise exception 'tenant_settings cross-tenant delete removed row'; end if;
end $$;

set local role authenticated;
set local app.current_tenant_id = '';

do $$
declare
  visible_count integer;
begin
  select count(*) into visible_count from public.tenant_settings;
  if visible_count <> 0 then raise exception 'tenant_settings visible without tenant context'; end if;
end $$;

rollback;
