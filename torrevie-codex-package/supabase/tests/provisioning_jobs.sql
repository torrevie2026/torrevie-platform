begin;

insert into public.users (id, email) values ('00000000-0000-0000-0000-000000000901', 'jobs@example.test');
insert into public.tenants (id, name, slug, status) values
  ('00000000-0000-0000-0000-000000001901', 'Jobs A', 'jobs-a', 'active'),
  ('00000000-0000-0000-0000-000000001902', 'Jobs B', 'jobs-b', 'active');
insert into public.provisioning_jobs (id, tenant_id, status) values
  ('00000000-0000-0000-0000-000000009901', '00000000-0000-0000-0000-000000001901', 'pending'),
  ('00000000-0000-0000-0000-000000009902', '00000000-0000-0000-0000-000000001902', 'pending');

set local role authenticated;
set local app.current_tenant_id = '00000000-0000-0000-0000-000000001901';

do $$
declare visible_count integer; insert_succeeded boolean := false;
begin
  select count(*) into visible_count from public.provisioning_jobs where tenant_id = '00000000-0000-0000-0000-000000001902';
  if visible_count <> 0 then raise exception 'provisioning_jobs cross-tenant select leaked rows'; end if;
  begin
    insert into public.provisioning_jobs (tenant_id, status)
    values ('00000000-0000-0000-0000-000000001902', 'pending');
    insert_succeeded := true;
  exception when others then null;
  end;
  if insert_succeeded then raise exception 'provisioning_jobs cross-tenant insert succeeded'; end if;
end $$;

update public.provisioning_jobs set status = 'running' where id = '00000000-0000-0000-0000-000000009902';
delete from public.provisioning_jobs where id = '00000000-0000-0000-0000-000000009902';

reset role;

do $$
begin
  if exists (select 1 from public.provisioning_jobs where id = '00000000-0000-0000-0000-000000009902' and status = 'running') then
    raise exception 'provisioning_jobs cross-tenant update changed row';
  end if;
  if not exists (select 1 from public.provisioning_jobs where id = '00000000-0000-0000-0000-000000009902') then
    raise exception 'provisioning_jobs cross-tenant delete removed row';
  end if;
end $$;

set local role authenticated;
set local app.current_tenant_id = '';

do $$
declare visible_count integer;
begin
  select count(*) into visible_count from public.provisioning_jobs;
  if visible_count <> 0 then raise exception 'provisioning_jobs visible without tenant context'; end if;
end $$;

rollback;
