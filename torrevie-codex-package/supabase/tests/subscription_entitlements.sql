begin;

insert into public.users (id, email) values ('00000000-0000-0000-0000-000000000701', 'entitlements@example.test');
insert into public.tenants (id, name, slug, status) values
  ('00000000-0000-0000-0000-000000001701', 'Entitlements A', 'entitlements-a', 'active'),
  ('00000000-0000-0000-0000-000000001702', 'Entitlements B', 'entitlements-b', 'active');

insert into public.subscriptions (id, tenant_id, product_id, plan_id, status, starts_at)
select '00000000-0000-0000-0000-000000006701', '00000000-0000-0000-0000-000000001701', products.id, plans.id, 'active', now()
from public.products join public.plans on plans.product_id = products.id
where products.key = 'crm' and plans.key = 'starter';
insert into public.subscriptions (id, tenant_id, product_id, plan_id, status, starts_at)
select '00000000-0000-0000-0000-000000006702', '00000000-0000-0000-0000-000000001702', products.id, plans.id, 'active', now()
from public.products join public.plans on plans.product_id = products.id
where products.key = 'fsm' and plans.key = 'entry';
insert into public.subscription_entitlements (id, tenant_id, subscription_id, feature_key, limit_value) values
  ('00000000-0000-0000-0000-000000007701', '00000000-0000-0000-0000-000000001701', '00000000-0000-0000-0000-000000006701', 'crm.accounts', 100),
  ('00000000-0000-0000-0000-000000007702', '00000000-0000-0000-0000-000000001702', '00000000-0000-0000-0000-000000006702', 'fsm.work_orders', 100);

set local role authenticated;
set local app.current_tenant_id = '00000000-0000-0000-0000-000000001701';

do $$
declare visible_count integer; insert_succeeded boolean := false;
begin
  select count(*) into visible_count from public.subscription_entitlements where tenant_id = '00000000-0000-0000-0000-000000001702';
  if visible_count <> 0 then raise exception 'subscription_entitlements cross-tenant select leaked rows'; end if;
  begin
    insert into public.subscription_entitlements (tenant_id, subscription_id, feature_key, limit_value)
    values ('00000000-0000-0000-0000-000000001702', '00000000-0000-0000-0000-000000006702', 'fsm.parts', 100);
    insert_succeeded := true;
  exception when others then null;
  end;
  if insert_succeeded then raise exception 'subscription_entitlements cross-tenant insert succeeded'; end if;
end $$;

update public.subscription_entitlements set limit_value = 200 where id = '00000000-0000-0000-0000-000000007702';
delete from public.subscription_entitlements where id = '00000000-0000-0000-0000-000000007702';

reset role;

do $$
begin
  if exists (select 1 from public.subscription_entitlements where id = '00000000-0000-0000-0000-000000007702' and limit_value = 200) then
    raise exception 'subscription_entitlements cross-tenant update changed row';
  end if;
  if not exists (select 1 from public.subscription_entitlements where id = '00000000-0000-0000-0000-000000007702') then
    raise exception 'subscription_entitlements cross-tenant delete removed row';
  end if;
end $$;

set local role authenticated;
set local app.current_tenant_id = '';

do $$
declare visible_count integer;
begin
  select count(*) into visible_count from public.subscription_entitlements;
  if visible_count <> 0 then raise exception 'subscription_entitlements visible without tenant context'; end if;
end $$;

rollback;
