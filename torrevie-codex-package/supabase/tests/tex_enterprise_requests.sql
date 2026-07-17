begin;

insert into public.tenants (id, name, slug, status) values
  ('00000000-0000-0000-0000-00000001d201', 'TEX Enterprise A', 'tex-enterprise-a', 'active'),
  ('00000000-0000-0000-0000-00000001d202', 'TEX Enterprise B', 'tex-enterprise-b', 'active');

insert into public.tex_enterprise_requests (id, tenant_id, status, contact_email)
values
  ('00000000-0000-0000-0000-00000002d201', '00000000-0000-0000-0000-00000001d201', 'requested', 'a@example.test'),
  ('00000000-0000-0000-0000-00000002d202', '00000000-0000-0000-0000-00000001d202', 'proposal', 'b@example.test');

set local role authenticated;
set local app.current_tenant_id = '00000000-0000-0000-0000-00000001d201';

do $$
declare visible_count integer; insert_succeeded boolean := false;
begin
  select count(*) into visible_count
  from public.tex_enterprise_requests
  where tenant_id = '00000000-0000-0000-0000-00000001d202';

  if visible_count <> 0 then
    raise exception 'tex_enterprise_requests cross-tenant select leaked rows';
  end if;

  begin
    insert into public.tex_enterprise_requests (tenant_id, status)
    values ('00000000-0000-0000-0000-00000001d202', 'requested');
    insert_succeeded := true;
  exception when others then null;
  end;

  if insert_succeeded then
    raise exception 'tex_enterprise_requests cross-tenant insert succeeded';
  end if;
end $$;

update public.tex_enterprise_requests
set status = 'live'
where id = '00000000-0000-0000-0000-00000002d202';

delete from public.tex_enterprise_requests
where id = '00000000-0000-0000-0000-00000002d202';

reset role;

do $$
begin
  if exists (
    select 1 from public.tex_enterprise_requests
    where id = '00000000-0000-0000-0000-00000002d202'
      and status = 'live'
  ) then
    raise exception 'tex_enterprise_requests cross-tenant update changed row';
  end if;

  if not exists (
    select 1 from public.tex_enterprise_requests
    where id = '00000000-0000-0000-0000-00000002d202'
  ) then
    raise exception 'tex_enterprise_requests cross-tenant delete removed row';
  end if;
end $$;

set local role authenticated;
set local app.current_tenant_id = '';

do $$
declare visible_count integer;
begin
  select count(*) into visible_count from public.tex_enterprise_requests;
  if visible_count <> 0 then raise exception 'tex_enterprise_requests visible without tenant context'; end if;
end $$;

rollback;
