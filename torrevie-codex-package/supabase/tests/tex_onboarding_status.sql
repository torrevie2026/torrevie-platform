begin;

insert into public.tenants (id, name, slug, status) values
  ('00000000-0000-0000-0000-00000001d101', 'TEX Onboarding A', 'tex-onboarding-a', 'active'),
  ('00000000-0000-0000-0000-00000001d102', 'TEX Onboarding B', 'tex-onboarding-b', 'active');

insert into public.tex_onboarding_status (id, tenant_id, last_activity_at)
values
  ('00000000-0000-0000-0000-00000002d101', '00000000-0000-0000-0000-00000001d101', now()),
  ('00000000-0000-0000-0000-00000002d102', '00000000-0000-0000-0000-00000001d102', now());

set local role authenticated;
set local app.current_tenant_id = '00000000-0000-0000-0000-00000001d101';

do $$
declare visible_count integer; insert_succeeded boolean := false;
begin
  select count(*) into visible_count
  from public.tex_onboarding_status
  where tenant_id = '00000000-0000-0000-0000-00000001d102';

  if visible_count <> 0 then
    raise exception 'tex_onboarding_status cross-tenant select leaked rows';
  end if;

  begin
    insert into public.tex_onboarding_status (tenant_id)
    values ('00000000-0000-0000-0000-00000001d102');
    insert_succeeded := true;
  exception when others then null;
  end;

  if insert_succeeded then
    raise exception 'tex_onboarding_status cross-tenant insert succeeded';
  end if;
end $$;

update public.tex_onboarding_status
set ocr_pending_count = 9
where id = '00000000-0000-0000-0000-00000002d102';

delete from public.tex_onboarding_status
where id = '00000000-0000-0000-0000-00000002d102';

reset role;

do $$
begin
  if exists (
    select 1 from public.tex_onboarding_status
    where id = '00000000-0000-0000-0000-00000002d102'
      and ocr_pending_count = 9
  ) then
    raise exception 'tex_onboarding_status cross-tenant update changed row';
  end if;

  if not exists (
    select 1 from public.tex_onboarding_status
    where id = '00000000-0000-0000-0000-00000002d102'
  ) then
    raise exception 'tex_onboarding_status cross-tenant delete removed row';
  end if;
end $$;

set local role authenticated;
set local app.current_tenant_id = '';

do $$
declare visible_count integer;
begin
  select count(*) into visible_count from public.tex_onboarding_status;
  if visible_count <> 0 then raise exception 'tex_onboarding_status visible without tenant context'; end if;
end $$;

rollback;
