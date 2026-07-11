begin;

insert into public.users (id, email) values
  ('00000000-0000-0000-0000-00000000b301', 'crm-opps-owner-a@example.test'),
  ('00000000-0000-0000-0000-00000000b302', 'crm-opps-owner-b@example.test'),
  ('00000000-0000-0000-0000-00000000b303', 'crm-opps-owner-c@example.test');
insert into public.tenants (id, name, slug, status) values
  ('00000000-0000-0000-0000-00000001b301', 'CRM Opportunities A', 'crm-opportunities-a', 'active'),
  ('00000000-0000-0000-0000-00000001b302', 'CRM Opportunities B', 'crm-opportunities-b', 'active');
insert into public.accounts (id, tenant_id, name, owner_user_id) values
  ('00000000-0000-0000-0000-00000002b301', '00000000-0000-0000-0000-00000001b301', 'Opportunity Account A', '00000000-0000-0000-0000-00000000b301'),
  ('00000000-0000-0000-0000-00000002b302', '00000000-0000-0000-0000-00000001b302', 'Opportunity Account B', '00000000-0000-0000-0000-00000000b302');
insert into public.contacts (id, tenant_id, account_id, first_name, email, source_module) values
  ('00000000-0000-0000-0000-00000003b301', '00000000-0000-0000-0000-00000001b301', '00000000-0000-0000-0000-00000002b301', 'Ava', 'ava-opps@example.test', 'crm'),
  ('00000000-0000-0000-0000-00000003b302', '00000000-0000-0000-0000-00000001b302', '00000000-0000-0000-0000-00000002b302', 'Ben', 'ben-opps@example.test', 'crm');
insert into public.pipeline_stages (id, tenant_id, key, label, sort_order) values
  ('00000000-0000-0000-0000-00000004b301', '00000000-0000-0000-0000-00000001b301', 'qualified', 'Qualified', 10),
  ('00000000-0000-0000-0000-00000004b302', '00000000-0000-0000-0000-00000001b302', 'qualified', 'Qualified', 10);
insert into public.opportunities (id, tenant_id, account_id, primary_contact_id, pipeline_stage_id, name, amount, owner_user_id) values
  ('00000000-0000-0000-0000-00000005b301', '00000000-0000-0000-0000-00000001b301', '00000000-0000-0000-0000-00000002b301', '00000000-0000-0000-0000-00000003b301', '00000000-0000-0000-0000-00000004b301', 'Opportunity A', 1000, '00000000-0000-0000-0000-00000000b301'),
  ('00000000-0000-0000-0000-00000005b302', '00000000-0000-0000-0000-00000001b302', '00000000-0000-0000-0000-00000002b302', '00000000-0000-0000-0000-00000003b302', '00000000-0000-0000-0000-00000004b302', 'Opportunity B', 2000, '00000000-0000-0000-0000-00000000b302');

set local role authenticated;
set local app.current_tenant_id = '00000000-0000-0000-0000-00000001b301';

do $$
declare
  visible_count integer;
  insert_succeeded boolean := false;
begin
  select count(*) into visible_count from public.opportunities where tenant_id = '00000000-0000-0000-0000-00000001b302';
  if visible_count <> 0 then raise exception 'opportunities cross-tenant select leaked rows'; end if;

  begin
    insert into public.opportunities (tenant_id, account_id, pipeline_stage_id, name, owner_user_id)
    values ('00000000-0000-0000-0000-00000001b302', '00000000-0000-0000-0000-00000002b302', '00000000-0000-0000-0000-00000004b302', 'Cross Opportunity', '00000000-0000-0000-0000-00000000b303');
    insert_succeeded := true;
  exception when others then null;
  end;
  if insert_succeeded then raise exception 'opportunities cross-tenant insert succeeded'; end if;
end $$;

update public.opportunities set name = 'Changed Opportunity B' where id = '00000000-0000-0000-0000-00000005b302';
delete from public.opportunities where id = '00000000-0000-0000-0000-00000005b302';

reset role;

do $$
begin
  if exists (select 1 from public.opportunities where id = '00000000-0000-0000-0000-00000005b302' and name = 'Changed Opportunity B') then
    raise exception 'opportunities cross-tenant update changed row';
  end if;
  if not exists (select 1 from public.opportunities where id = '00000000-0000-0000-0000-00000005b302') then
    raise exception 'opportunities cross-tenant delete removed row';
  end if;
end $$;

set local role authenticated;
set local app.current_tenant_id = '';

do $$
declare visible_count integer;
begin
  select count(*) into visible_count from public.opportunities;
  if visible_count <> 0 then raise exception 'opportunities visible without tenant context'; end if;
end $$;

rollback;
