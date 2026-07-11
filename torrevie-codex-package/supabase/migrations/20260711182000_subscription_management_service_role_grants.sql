grant select on public.products to service_role;
grant select on public.plans to service_role;
grant select on public.plan_features to service_role;
grant select, insert, update on public.subscriptions to service_role;
grant select, insert, update, delete on public.subscription_entitlements to service_role;
