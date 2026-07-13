begin;

insert into public.users (id, email) values ('00000000-0000-0000-0000-000000000291', 'fsm-channel-hub@example.test');
insert into public.tenants (id, name, slug, status) values
  ('00000000-0000-0000-0000-000000001291', 'FSM Channel A', 'fsm-channel-a', 'active'),
  ('00000000-0000-0000-0000-000000001292', 'FSM Channel B', 'fsm-channel-b', 'active');

insert into public.org_channels (id, tenant_id, channel_type, provider, display_name, status)
values
  ('00000000-0000-0000-0000-000000002291', '00000000-0000-0000-0000-000000001291', 'whatsapp', 'wappfly', 'A WhatsApp', 'active'),
  ('00000000-0000-0000-0000-000000002292', '00000000-0000-0000-0000-000000001292', 'email', 'postmark', 'B Email', 'active');

insert into public.intake_requests (id, tenant_id, channel_id, channel_type, external_ref, contact_name, ai_summary)
values
  ('00000000-0000-0000-0000-000000003291', '00000000-0000-0000-0000-000000001291', '00000000-0000-0000-0000-000000002291', 'whatsapp', 'msg-a', 'Tenant A Caller', 'Tenant A summary'),
  ('00000000-0000-0000-0000-000000003292', '00000000-0000-0000-0000-000000001292', '00000000-0000-0000-0000-000000002292', 'email', 'msg-b', 'Tenant B Caller', 'Tenant B summary');

insert into public.call_logs (id, tenant_id, channel_id, direction, from_number, to_number, intake_request_id)
values
  ('00000000-0000-0000-0000-000000004291', '00000000-0000-0000-0000-000000001291', '00000000-0000-0000-0000-000000002291', 'inbound', '+971501111111', '+441111111111', '00000000-0000-0000-0000-000000003291'),
  ('00000000-0000-0000-0000-000000004292', '00000000-0000-0000-0000-000000001292', '00000000-0000-0000-0000-000000002292', 'inbound', '+971502222222', '+442222222222', '00000000-0000-0000-0000-000000003292');

insert into public.org_channel_credentials (id, tenant_id, channel_id, secret_name, secret_value, secret_last4)
values
  ('00000000-0000-0000-0000-000000005291', '00000000-0000-0000-0000-000000001291', '00000000-0000-0000-0000-000000002291', 'voice_webhook_secret', 'tenant-a-secret', 'cret'),
  ('00000000-0000-0000-0000-000000005292', '00000000-0000-0000-0000-000000001292', '00000000-0000-0000-0000-000000002292', 'voice_webhook_secret', 'tenant-b-secret', 'cret');

set local role authenticated;
set local app.current_tenant_id = '00000000-0000-0000-0000-000000001291';

do $$
declare
  visible_count integer;
  insert_succeeded boolean := false;
begin
  select count(*) into visible_count from public.org_channels where tenant_id = '00000000-0000-0000-0000-000000001292';
  if visible_count <> 0 then raise exception 'org_channels cross-tenant select leaked rows'; end if;

  select count(*) into visible_count from public.intake_requests where tenant_id = '00000000-0000-0000-0000-000000001292';
  if visible_count <> 0 then raise exception 'intake_requests cross-tenant select leaked rows'; end if;

  select count(*) into visible_count from public.call_logs where tenant_id = '00000000-0000-0000-0000-000000001292';
  if visible_count <> 0 then raise exception 'call_logs cross-tenant select leaked rows'; end if;

  begin
    execute 'select count(*) from public.org_channel_credentials where tenant_id = ''00000000-0000-0000-0000-000000001292''';
    insert_succeeded := true;
  exception when insufficient_privilege then null;
  end;
  if insert_succeeded then raise exception 'org_channel_credentials authenticated select succeeded'; end if;
  insert_succeeded := false;

  begin
    insert into public.intake_requests (tenant_id, channel_type, external_ref)
    values ('00000000-0000-0000-0000-000000001292', 'portal', 'cross-tenant');
    insert_succeeded := true;
  exception when others then null;
  end;
  if insert_succeeded then raise exception 'intake_requests cross-tenant insert succeeded'; end if;
end $$;

update public.org_channels
set display_name = 'Cross tenant update'
where id = '00000000-0000-0000-0000-000000002292';

update public.intake_requests
set status = 'spam'
where id = '00000000-0000-0000-0000-000000003292';

delete from public.call_logs
where id = '00000000-0000-0000-0000-000000004292';

do $$
declare
  update_succeeded boolean := false;
begin
  begin
    update public.org_channel_credentials
    set secret_value = 'cross-tenant-update'
    where id = '00000000-0000-0000-0000-000000005292';
    update_succeeded := true;
  exception when insufficient_privilege then null;
  end;

  if update_succeeded then raise exception 'org_channel_credentials authenticated update succeeded'; end if;
end $$;

reset role;

do $$
begin
  if exists (
    select 1 from public.org_channels
    where id = '00000000-0000-0000-0000-000000002292'
      and display_name = 'Cross tenant update'
  ) then raise exception 'org_channels cross-tenant update changed row'; end if;

  if exists (
    select 1 from public.intake_requests
    where id = '00000000-0000-0000-0000-000000003292'
      and status = 'spam'
  ) then raise exception 'intake_requests cross-tenant update changed row'; end if;

  if not exists (
    select 1 from public.call_logs
    where id = '00000000-0000-0000-0000-000000004292'
  ) then raise exception 'call_logs cross-tenant delete removed row'; end if;

  if exists (
    select 1 from public.org_channel_credentials
    where id = '00000000-0000-0000-0000-000000005292'
      and secret_value = 'cross-tenant-update'
  ) then raise exception 'org_channel_credentials cross-tenant update changed row'; end if;
end $$;

set local role authenticated;
set local app.current_tenant_id = '';

do $$
declare
  visible_count integer;
begin
  select count(*) into visible_count from public.org_channels;
  if visible_count <> 0 then raise exception 'org_channels visible without tenant context'; end if;

  select count(*) into visible_count from public.intake_requests;
  if visible_count <> 0 then raise exception 'intake_requests visible without tenant context'; end if;

  select count(*) into visible_count from public.call_logs;
  if visible_count <> 0 then raise exception 'call_logs visible without tenant context'; end if;
end $$;

rollback;
