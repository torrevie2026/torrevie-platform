begin;

insert into public.users (id, email) values
  ('00000000-0000-0000-0000-00000000e001', 'support-actor@example.test'),
  ('00000000-0000-0000-0000-00000000e002', 'support-viewer@example.test');

insert into public.tenants (id, name, slug, status) values
  ('00000000-0000-0000-0000-00000001e001', 'Support Access A', 'support-access-a', 'active'),
  ('00000000-0000-0000-0000-00000001e002', 'Support Access B', 'support-access-b', 'active');

set local role authenticated;
set local app.platform_service_role = 'true';

insert into public.support_access_sessions (
  id,
  tenant_id,
  actor_user_id,
  token_hash,
  reason,
  expires_at,
  created_by,
  updated_by
) values
  (
    '00000000-0000-0000-0000-00000002e001',
    '00000000-0000-0000-0000-00000001e001',
    '00000000-0000-0000-0000-00000000e001',
    'hash-a',
    'Support tenant A',
    now() + interval '15 minutes',
    '00000000-0000-0000-0000-00000000e001',
    '00000000-0000-0000-0000-00000000e001'
  ),
  (
    '00000000-0000-0000-0000-00000002e002',
    '00000000-0000-0000-0000-00000001e002',
    '00000000-0000-0000-0000-00000000e001',
    'hash-b',
    'Support tenant B',
    now() + interval '15 minutes',
    '00000000-0000-0000-0000-00000000e001',
    '00000000-0000-0000-0000-00000000e001'
  );

reset app.platform_service_role;
set local app.current_tenant_id = '00000000-0000-0000-0000-00000001e001';

do $$
declare visible_count integer; insert_succeeded boolean := false;
begin
  select count(*) into visible_count
  from public.support_access_sessions
  where tenant_id = '00000000-0000-0000-0000-00000001e002';

  if visible_count <> 0 then
    raise exception 'support_access_sessions cross-tenant select leaked rows';
  end if;

  begin
    insert into public.support_access_sessions (tenant_id, actor_user_id, token_hash, reason, expires_at)
    values (
      '00000000-0000-0000-0000-00000001e001',
      '00000000-0000-0000-0000-00000000e001',
      'tenant-insert',
      'Tenant insert',
      now() + interval '15 minutes'
    );
    insert_succeeded := true;
  exception when others then null;
  end;

  if insert_succeeded then
    raise exception 'support_access_sessions tenant-context insert succeeded';
  end if;
end $$;

update public.support_access_sessions
set status = 'ended'
where id = '00000000-0000-0000-0000-00000002e002';

reset role;

do $$
begin
  if exists (
    select 1 from public.support_access_sessions
    where id = '00000000-0000-0000-0000-00000002e002'
      and status = 'ended'
  ) then
    raise exception 'support_access_sessions cross-tenant update changed row';
  end if;
end $$;

set local role authenticated;
set local app.current_tenant_id = '';

do $$
declare visible_count integer;
begin
  select count(*) into visible_count from public.support_access_sessions;
  if visible_count <> 0 then
    raise exception 'support_access_sessions visible without tenant context';
  end if;
end $$;

rollback;
