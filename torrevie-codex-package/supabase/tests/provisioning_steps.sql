begin;

insert into public.users (id, email) values ('00000000-0000-0000-0000-000000001001', 'steps@example.test');
insert into public.tenants (id, name, slug, status) values
  ('00000000-0000-0000-0000-000000002001', 'Steps A', 'steps-a', 'active'),
  ('00000000-0000-0000-0000-000000002002', 'Steps B', 'steps-b', 'active');
insert into public.provisioning_jobs (id, tenant_id, status) values
  ('00000000-0000-0000-0000-000000009001', '00000000-0000-0000-0000-000000002001', 'pending'),
  ('00000000-0000-0000-0000-000000009002', '00000000-0000-0000-0000-000000002002', 'pending');
insert into public.provisioning_steps (id, provisioning_job_id, tenant_id, step_key, status) values
  ('00000000-0000-0000-0000-000000010001', '00000000-0000-0000-0000-000000009001', '00000000-0000-0000-0000-000000002001', 'seed_defaults', 'pending'),
  ('00000000-0000-0000-0000-000000010002', '00000000-0000-0000-0000-000000009002', '00000000-0000-0000-0000-000000002002', 'seed_defaults', 'pending');

set local role authenticated;
set local app.current_tenant_id = '00000000-0000-0000-0000-000000002001';

do $$
declare visible_count integer; insert_succeeded boolean := false;
begin
  select count(*) into visible_count from public.provisioning_steps where tenant_id = '00000000-0000-0000-0000-000000002002';
  if visible_count <> 0 then raise exception 'provisioning_steps cross-tenant select leaked rows'; end if;
  begin
    insert into public.provisioning_steps (provisioning_job_id, tenant_id, step_key, status)
    values ('00000000-0000-0000-0000-000000009002', '00000000-0000-0000-0000-000000002002', 'create_admin_invite', 'pending');
    insert_succeeded := true;
  exception when others then null;
  end;
  if insert_succeeded then raise exception 'provisioning_steps cross-tenant insert succeeded'; end if;
end $$;

update public.provisioning_steps set status = 'running' where id = '00000000-0000-0000-0000-000000010002';
delete from public.provisioning_steps where id = '00000000-0000-0000-0000-000000010002';

reset role;

do $$
begin
  if exists (select 1 from public.provisioning_steps where id = '00000000-0000-0000-0000-000000010002' and status = 'running') then
    raise exception 'provisioning_steps cross-tenant update changed row';
  end if;
  if not exists (select 1 from public.provisioning_steps where id = '00000000-0000-0000-0000-000000010002') then
    raise exception 'provisioning_steps cross-tenant delete removed row';
  end if;
end $$;

set local role authenticated;
set local app.current_tenant_id = '';

do $$
declare visible_count integer;
begin
  select count(*) into visible_count from public.provisioning_steps;
  if visible_count <> 0 then raise exception 'provisioning_steps visible without tenant context'; end if;
end $$;

rollback;
