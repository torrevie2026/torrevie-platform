grant usage on schema public to service_role;
grant select, insert, update on public.tenants to service_role;
grant select, insert, update on public.tenant_settings to service_role;
grant select, insert on public.audit_events to service_role;
