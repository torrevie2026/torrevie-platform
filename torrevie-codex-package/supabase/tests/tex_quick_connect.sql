begin;

insert into public.users (id, email) values
  ('00000000-0000-0000-0000-00000000d101', 'tex-qc-a@example.test'),
  ('00000000-0000-0000-0000-00000000d102', 'tex-qc-b@example.test');

insert into public.tenants (id, name, slug, status) values
  ('00000000-0000-0000-0000-00000001d101', 'TEX Quick Connect A', 'tex-qc-a', 'active'),
  ('00000000-0000-0000-0000-00000001d102', 'TEX Quick Connect B', 'tex-qc-b', 'active');

insert into public.tex_quick_connect_sessions (
  id,
  tenant_id,
  status,
  pairing_code,
  qr_code_data,
  created_by,
  updated_by
) values
  (
    '00000000-0000-0000-0000-00000002d101',
    '00000000-0000-0000-0000-00000001d101',
    'qr_pending',
    'pair-a',
    'qr-a',
    '00000000-0000-0000-0000-00000000d101',
    '00000000-0000-0000-0000-00000000d101'
  ),
  (
    '00000000-0000-0000-0000-00000002d102',
    '00000000-0000-0000-0000-00000001d102',
    'connected',
    'pair-b',
    'qr-b',
    '00000000-0000-0000-0000-00000000d102',
    '00000000-0000-0000-0000-00000000d102'
  );

insert into public.tex_quick_connect_events (
  id,
  tenant_id,
  session_id,
  event_type,
  direction,
  status,
  message,
  created_by
) values
  (
    '00000000-0000-0000-0000-00000003d101',
    '00000000-0000-0000-0000-00000001d101',
    '00000000-0000-0000-0000-00000002d101',
    'quick_connect.qr.generated',
    'system',
    'qr_pending',
    'Tenant A QR generated',
    '00000000-0000-0000-0000-00000000d101'
  ),
  (
    '00000000-0000-0000-0000-00000003d102',
    '00000000-0000-0000-0000-00000001d102',
    '00000000-0000-0000-0000-00000002d102',
    'quick_connect.connected',
    'system',
    'connected',
    'Tenant B connected',
    '00000000-0000-0000-0000-00000000d102'
  );

set local role authenticated;
set local app.current_tenant_id = '00000000-0000-0000-0000-00000001d101';

do $$
declare
  visible_count integer;
begin
  select count(*) into visible_count
  from public.tex_quick_connect_sessions
  where tenant_id = '00000000-0000-0000-0000-00000001d102';

  if visible_count <> 0 then
    raise exception 'tex_quick_connect_sessions cross-tenant select leaked rows';
  end if;

  select count(*) into visible_count
  from public.tex_quick_connect_events
  where tenant_id = '00000000-0000-0000-0000-00000001d102';

  if visible_count <> 0 then
    raise exception 'tex_quick_connect_events cross-tenant select leaked rows';
  end if;
end $$;

set local app.current_tenant_id = '';

do $$
declare
  visible_count integer;
begin
  select count(*) into visible_count from public.tex_quick_connect_sessions;
  if visible_count <> 0 then
    raise exception 'tex_quick_connect_sessions visible without tenant context';
  end if;

  select count(*) into visible_count from public.tex_quick_connect_events;
  if visible_count <> 0 then
    raise exception 'tex_quick_connect_events visible without tenant context';
  end if;
end $$;

rollback;
