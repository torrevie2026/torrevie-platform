begin;

insert into public.users (id, email) values
  ('00000000-0000-0000-0000-00000000b201', 'crm-pipeline-owner-a@example.test'),
  ('00000000-0000-0000-0000-00000000b202', 'crm-pipeline-owner-b@example.test');
insert into public.tenants (id, name, slug, status) values
  ('00000000-0000-0000-0000-00000001b201', 'CRM Pipeline A', 'crm-pipeline-a', 'active'),
  ('00000000-0000-0000-0000-00000001b202', 'CRM Pipeline B', 'crm-pipeline-b', 'active');
insert into public.pipeline_stages (id, tenant_id, key, label, sort_order) values
  ('00000000-0000-0000-0000-00000002b201', '00000000-0000-0000-0000-00000001b201', 'qualified', 'Qualified', 10),
  ('00000000-0000-0000-0000-00000002b202', '00000000-0000-0000-0000-00000001b202', 'proposal', 'Proposal', 10);

set local role authenticated;
set local app.current_tenant_id = '00000000-0000-0000-0000-00000001b201';

do $$
declare
  visible_count integer;
  insert_succeeded boolean := false;
begin
  select count(*) into visible_count from public.pipeline_stages where tenant_id = '00000000-0000-0000-0000-00000001b202';
  if visible_count <> 0 then raise exception 'pipeline_stages cross-tenant select leaked rows'; end if;

  begin
    insert into public.pipeline_stages (tenant_id, key, label, sort_order)
    values ('00000000-0000-0000-0000-00000001b202', 'cross', 'Cross', 20);
    insert_succeeded := true;
  exception when others then null;
  end;
  if insert_succeeded then raise exception 'pipeline_stages cross-tenant insert succeeded'; end if;
end $$;

update public.pipeline_stages set label = 'Changed' where id = '00000000-0000-0000-0000-00000002b202';
delete from public.pipeline_stages where id = '00000000-0000-0000-0000-00000002b202';

reset role;

do $$
begin
  if exists (select 1 from public.pipeline_stages where id = '00000000-0000-0000-0000-00000002b202' and label = 'Changed') then
    raise exception 'pipeline_stages cross-tenant update changed row';
  end if;
  if not exists (select 1 from public.pipeline_stages where id = '00000000-0000-0000-0000-00000002b202') then
    raise exception 'pipeline_stages cross-tenant delete removed row';
  end if;
end $$;

set local role authenticated;
set local app.current_tenant_id = '';

do $$
declare visible_count integer;
begin
  select count(*) into visible_count from public.pipeline_stages;
  if visible_count <> 0 then raise exception 'pipeline_stages visible without tenant context'; end if;
end $$;

rollback;
