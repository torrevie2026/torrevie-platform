begin;

insert into public.users (id, email) values ('00000000-0000-0000-0000-00000000b901', 'tex-billing@example.test');

insert into public.tenants (id, name, slug, status) values
  ('00000000-0000-0000-0000-00000001b901', 'TEX Billing A', 'tex-billing-a', 'active'),
  ('00000000-0000-0000-0000-00000001b902', 'TEX Billing B', 'tex-billing-b', 'active');

insert into public.tex_billing_customers (
  id,
  tenant_id,
  stripe_customer_id,
  billing_email,
  currency
) values
  (
    '00000000-0000-0000-0000-00000002b901',
    '00000000-0000-0000-0000-00000001b901',
    'cus_tex_billing_a',
    'billing-a@example.test',
    'aed'
  ),
  (
    '00000000-0000-0000-0000-00000002b902',
    '00000000-0000-0000-0000-00000001b902',
    'cus_tex_billing_b',
    'billing-b@example.test',
    'usd'
  );

insert into public.tex_billing_subscriptions (
  id,
  tenant_id,
  stripe_customer_id,
  stripe_subscription_id,
  stripe_price_id,
  plan_key,
  currency,
  stripe_status
) values
  (
    '00000000-0000-0000-0000-00000003b901',
    '00000000-0000-0000-0000-00000001b901',
    'cus_tex_billing_a',
    'sub_tex_billing_a',
    'price_tex_lite_aed',
    'lite',
    'aed',
    'active'
  ),
  (
    '00000000-0000-0000-0000-00000003b902',
    '00000000-0000-0000-0000-00000001b902',
    'cus_tex_billing_b',
    'sub_tex_billing_b',
    'price_tex_growth_usd',
    'growth',
    'usd',
    'active'
  );

insert into public.tex_billing_events (
  id,
  tenant_id,
  stripe_event_id,
  event_type,
  status
) values
  (
    '00000000-0000-0000-0000-00000004b901',
    '00000000-0000-0000-0000-00000001b901',
    'evt_tex_billing_a',
    'customer.subscription.updated',
    'processed'
  ),
  (
    '00000000-0000-0000-0000-00000004b902',
    '00000000-0000-0000-0000-00000001b902',
    'evt_tex_billing_b',
    'customer.subscription.updated',
    'processed'
  );

set local role authenticated;
set local app.current_tenant_id = '00000000-0000-0000-0000-00000001b901';

do $$
declare
  visible_count integer;
  insert_succeeded boolean := false;
  update_succeeded boolean := false;
begin
  select count(*) into visible_count
  from public.tex_billing_customers
  where tenant_id = '00000000-0000-0000-0000-00000001b902';
  if visible_count <> 0 then
    raise exception 'tex_billing_customers cross-tenant select leaked rows';
  end if;

  select count(*) into visible_count
  from public.tex_billing_subscriptions
  where tenant_id = '00000000-0000-0000-0000-00000001b902';
  if visible_count <> 0 then
    raise exception 'tex_billing_subscriptions cross-tenant select leaked rows';
  end if;

  select count(*) into visible_count
  from public.tex_billing_events
  where tenant_id = '00000000-0000-0000-0000-00000001b902';
  if visible_count <> 0 then
    raise exception 'tex_billing_events cross-tenant select leaked rows';
  end if;

  begin
    insert into public.tex_billing_customers (tenant_id, stripe_customer_id, billing_email, currency)
    values ('00000000-0000-0000-0000-00000001b901', 'cus_forbidden', 'forbidden@example.test', 'aed');
    insert_succeeded := true;
  exception when others then null;
  end;
  if insert_succeeded then
    raise exception 'tex_billing_customers authenticated insert succeeded';
  end if;

  begin
    update public.tex_billing_subscriptions
    set stripe_status = 'canceled'
    where id = '00000000-0000-0000-0000-00000003b901';
    update_succeeded := true;
  exception when others then null;
  end;
  if update_succeeded then
    raise exception 'tex_billing_subscriptions authenticated update succeeded';
  end if;
end $$;

set local app.current_tenant_id = '';

do $$
declare visible_count integer;
begin
  select count(*) into visible_count from public.tex_billing_customers;
  if visible_count <> 0 then raise exception 'tex_billing_customers visible without tenant context'; end if;

  select count(*) into visible_count from public.tex_billing_subscriptions;
  if visible_count <> 0 then raise exception 'tex_billing_subscriptions visible without tenant context'; end if;

  select count(*) into visible_count from public.tex_billing_events;
  if visible_count <> 0 then raise exception 'tex_billing_events visible without tenant context'; end if;
end $$;

rollback;
