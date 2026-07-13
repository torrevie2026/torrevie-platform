begin;

insert into public.users (id, email) values ('00000000-0000-0000-0000-000000000601', 'subscriptions@example.test');
insert into public.tenants (id, name, slug, status) values
  ('00000000-0000-0000-0000-000000001601', 'Subscriptions A', 'subscriptions-a', 'active'),
  ('00000000-0000-0000-0000-000000001602', 'Subscriptions B', 'subscriptions-b', 'active');

insert into public.subscriptions (id, tenant_id, product_id, plan_id, status, starts_at)
select '00000000-0000-0000-0000-000000006601', '00000000-0000-0000-0000-000000001601', products.id, plans.id, 'active', now()
from public.products join public.plans on plans.product_id = products.id
where products.key = 'crm' and plans.key = 'starter';
insert into public.subscriptions (id, tenant_id, product_id, plan_id, status, starts_at)
select '00000000-0000-0000-0000-000000006602', '00000000-0000-0000-0000-000000001602', products.id, plans.id, 'active', now()
from public.products join public.plans on plans.product_id = products.id
where products.key = 'fsm' and plans.key = 'entry';

set local role authenticated;
set local app.current_tenant_id = '00000000-0000-0000-0000-000000001601';

do $$
declare product_id uuid; plan_id uuid; visible_count integer; insert_succeeded boolean := false;
begin
  select count(*) into visible_count from public.subscriptions where tenant_id = '00000000-0000-0000-0000-000000001602';
  if visible_count <> 0 then raise exception 'subscriptions cross-tenant select leaked rows'; end if;
  select products.id, plans.id into product_id, plan_id
  from public.products join public.plans on plans.product_id = products.id
  where products.key = 'tex' and plans.key = 'starter';
  begin
    insert into public.subscriptions (tenant_id, product_id, plan_id, status, starts_at)
    values ('00000000-0000-0000-0000-000000001602', product_id, plan_id, 'active', now());
    insert_succeeded := true;
  exception when others then null;
  end;
  if insert_succeeded then raise exception 'subscriptions cross-tenant insert succeeded'; end if;
end $$;

update public.subscriptions set status = 'cancelled' where id = '00000000-0000-0000-0000-000000006602';
delete from public.subscriptions where id = '00000000-0000-0000-0000-000000006602';

reset role;

do $$
begin
  if exists (select 1 from public.subscriptions where id = '00000000-0000-0000-0000-000000006602' and status = 'cancelled') then
    raise exception 'subscriptions cross-tenant update changed row';
  end if;
  if not exists (select 1 from public.subscriptions where id = '00000000-0000-0000-0000-000000006602') then
    raise exception 'subscriptions cross-tenant delete removed row';
  end if;
end $$;

set local role authenticated;
set local app.current_tenant_id = '';

do $$
declare visible_count integer;
begin
  select count(*) into visible_count from public.subscriptions;
  if visible_count <> 0 then raise exception 'subscriptions visible without tenant context'; end if;
end $$;

rollback;
