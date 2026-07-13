begin;

insert into public.users (id, email) values ('00000000-0000-0000-0000-000000000271', 'org-feature-overrides@example.test');
insert into public.tenants (id, name, slug, status) values
  ('00000000-0000-0000-0000-000000001271', 'Feature Overrides A', 'feature-overrides-a', 'active'),
  ('00000000-0000-0000-0000-000000001272', 'Feature Overrides B', 'feature-overrides-b', 'active');

insert into public.org_feature_overrides (id, tenant_id, feature_key, enabled, reason)
values
  ('00000000-0000-0000-0000-000000002271', '00000000-0000-0000-0000-000000001271', 'fsm.module.pm', true, 'Tenant A trial'),
  ('00000000-0000-0000-0000-000000002272', '00000000-0000-0000-0000-000000001272', 'fsm.module.pm', true, 'Tenant B trial');

set local role authenticated;
set local app.current_tenant_id = '00000000-0000-0000-0000-000000001271';

do $$
declare
  visible_count integer;
  insert_succeeded boolean := false;
begin
  select count(*) into visible_count
  from public.org_feature_overrides
  where tenant_id = '00000000-0000-0000-0000-000000001272';
  if visible_count <> 0 then raise exception 'org_feature_overrides cross-tenant select leaked rows'; end if;

  begin
    insert into public.org_feature_overrides (tenant_id, feature_key, enabled, reason)
    values ('00000000-0000-0000-0000-000000001272', 'fsm.module.sla', true, 'Cross tenant attempt');
    insert_succeeded := true;
  exception when others then null;
  end;
  if insert_succeeded then raise exception 'org_feature_overrides cross-tenant insert succeeded'; end if;
end $$;

update public.org_feature_overrides
set enabled = false
where id = '00000000-0000-0000-0000-000000002272';

delete from public.org_feature_overrides
where id = '00000000-0000-0000-0000-000000002272';

reset role;

do $$
begin
  if exists (
    select 1 from public.org_feature_overrides
    where id = '00000000-0000-0000-0000-000000002272' and enabled = false
  ) then raise exception 'org_feature_overrides cross-tenant update changed row'; end if;

  if not exists (
    select 1 from public.org_feature_overrides
    where id = '00000000-0000-0000-0000-000000002272'
  ) then raise exception 'org_feature_overrides cross-tenant delete removed row'; end if;
end $$;

set local role authenticated;
set local app.current_tenant_id = '';

do $$
declare
  visible_count integer;
begin
  select count(*) into visible_count from public.org_feature_overrides;
  if visible_count <> 0 then raise exception 'org_feature_overrides visible without tenant context'; end if;
end $$;

rollback;
