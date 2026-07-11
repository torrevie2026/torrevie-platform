begin;

insert into public.users (id, email) values
  ('00000000-0000-0000-0000-00000000b401', 'crm-activities-owner-a@example.test'),
  ('00000000-0000-0000-0000-00000000b402', 'crm-activities-owner-b@example.test'),
  ('00000000-0000-0000-0000-00000000b403', 'crm-activities-owner-c@example.test');
insert into public.tenants (id, name, slug, status) values
  ('00000000-0000-0000-0000-00000001b401', 'CRM Activities A', 'crm-activities-a', 'active'),
  ('00000000-0000-0000-0000-00000001b402', 'CRM Activities B', 'crm-activities-b', 'active');
insert into public.activities (id, tenant_id, related_type, related_id, activity_type, notes) values
  ('00000000-0000-0000-0000-00000002b401', '00000000-0000-0000-0000-00000001b401', 'account', '00000000-0000-0000-0000-00000003b401', 'note', 'Tenant A note'),
  ('00000000-0000-0000-0000-00000002b402', '00000000-0000-0000-0000-00000001b402', 'account', '00000000-0000-0000-0000-00000003b402', 'note', 'Tenant B note');

set local role authenticated;
set local app.current_tenant_id = '00000000-0000-0000-0000-00000001b401';

do $$
declare
  visible_count integer;
  insert_succeeded boolean := false;
begin
  select count(*) into visible_count from public.activities where tenant_id = '00000000-0000-0000-0000-00000001b402';
  if visible_count <> 0 then raise exception 'activities cross-tenant select leaked rows'; end if;

  begin
    insert into public.activities (tenant_id, related_type, related_id, activity_type, notes)
    values ('00000000-0000-0000-0000-00000001b402', 'account', '00000000-0000-0000-0000-00000003b402', 'note', 'Cross tenant note');
    insert_succeeded := true;
  exception when others then null;
  end;
  if insert_succeeded then raise exception 'activities cross-tenant insert succeeded'; end if;
end $$;

update public.activities set notes = 'Changed Tenant B note' where id = '00000000-0000-0000-0000-00000002b402';
delete from public.activities where id = '00000000-0000-0000-0000-00000002b402';

reset role;

do $$
begin
  if exists (select 1 from public.activities where id = '00000000-0000-0000-0000-00000002b402' and notes = 'Changed Tenant B note') then
    raise exception 'activities cross-tenant update changed row';
  end if;
  if not exists (select 1 from public.activities where id = '00000000-0000-0000-0000-00000002b402') then
    raise exception 'activities cross-tenant delete removed row';
  end if;
end $$;

set local role authenticated;
set local app.current_tenant_id = '';

do $$
declare visible_count integer;
begin
  select count(*) into visible_count from public.activities;
  if visible_count <> 0 then raise exception 'activities visible without tenant context'; end if;
end $$;

rollback;
