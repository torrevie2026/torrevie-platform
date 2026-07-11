begin;

insert into public.users (id, email) values ('00000000-0000-0000-0000-000000000801', 'audit@example.test');
insert into public.tenants (id, name, slug, status) values
  ('00000000-0000-0000-0000-000000001801', 'Audit A', 'audit-a', 'active'),
  ('00000000-0000-0000-0000-000000001802', 'Audit B', 'audit-b', 'active');
insert into public.audit_events (id, tenant_id, actor_user_id, action) values
  ('00000000-0000-0000-0000-000000008801', '00000000-0000-0000-0000-000000001801', '00000000-0000-0000-0000-000000000801', 'test.a'),
  ('00000000-0000-0000-0000-000000008802', '00000000-0000-0000-0000-000000001802', '00000000-0000-0000-0000-000000000801', 'test.b');

set local role authenticated;
set local app.current_tenant_id = '00000000-0000-0000-0000-000000001801';

do $$
declare visible_count integer; insert_succeeded boolean := false;
begin
  select count(*) into visible_count from public.audit_events where tenant_id = '00000000-0000-0000-0000-000000001802';
  if visible_count <> 0 then raise exception 'audit_events cross-tenant select leaked rows'; end if;
  begin
    insert into public.audit_events (tenant_id, action)
    values ('00000000-0000-0000-0000-000000001802', 'test.foreign');
    insert_succeeded := true;
  exception when others then null;
  end;
  if insert_succeeded then raise exception 'audit_events cross-tenant insert succeeded'; end if;
end $$;

update public.audit_events set action = 'changed' where id = '00000000-0000-0000-0000-000000008802';
delete from public.audit_events where id = '00000000-0000-0000-0000-000000008802';

reset role;

do $$
begin
  if exists (select 1 from public.audit_events where id = '00000000-0000-0000-0000-000000008802' and action = 'changed') then
    raise exception 'audit_events cross-tenant update changed row';
  end if;
  if not exists (select 1 from public.audit_events where id = '00000000-0000-0000-0000-000000008802') then
    raise exception 'audit_events cross-tenant delete removed row';
  end if;
end $$;

set local role authenticated;
set local app.current_tenant_id = '';

do $$
declare visible_count integer;
begin
  select count(*) into visible_count from public.audit_events;
  if visible_count <> 0 then raise exception 'audit_events visible without tenant context'; end if;
end $$;

rollback;
