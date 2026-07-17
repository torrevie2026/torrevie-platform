begin;

insert into public.users (id, email) values ('00000000-0000-0000-0000-00000000d001', 'tex-plan-controls@example.test');

insert into public.tenants (id, name, slug, status) values
  ('00000000-0000-0000-0000-00000001d001', 'TEX Plan Controls A', 'tex-plan-controls-a', 'active'),
  ('00000000-0000-0000-0000-00000001d002', 'TEX Plan Controls B', 'tex-plan-controls-b', 'active');

insert into public.tex_plan_controls (id, tenant_id, plan_key, plan_status, employee_limit, seat_count)
values
  ('00000000-0000-0000-0000-00000002d001', '00000000-0000-0000-0000-00000001d001', 'trial', 'trialing', 5, 1),
  ('00000000-0000-0000-0000-00000002d002', '00000000-0000-0000-0000-00000001d002', 'growth', 'active', 50, 3);

set local role authenticated;
set local app.current_tenant_id = '00000000-0000-0000-0000-00000001d001';

do $$
declare visible_count integer; insert_succeeded boolean := false;
begin
  select count(*) into visible_count
  from public.tex_plan_controls
  where tenant_id = '00000000-0000-0000-0000-00000001d002';

  if visible_count <> 0 then
    raise exception 'tex_plan_controls cross-tenant select leaked rows';
  end if;

  begin
    insert into public.tex_plan_controls (tenant_id, plan_key, plan_status)
    values ('00000000-0000-0000-0000-00000001d002', 'lite', 'active');
    insert_succeeded := true;
  exception when others then null;
  end;

  if insert_succeeded then
    raise exception 'tex_plan_controls cross-tenant insert succeeded';
  end if;
end $$;

update public.tex_plan_controls
set employee_limit = 99
where id = '00000000-0000-0000-0000-00000002d002';

delete from public.tex_plan_controls
where id = '00000000-0000-0000-0000-00000002d002';

reset role;

do $$
begin
  if exists (
    select 1 from public.tex_plan_controls
    where id = '00000000-0000-0000-0000-00000002d002'
      and employee_limit = 99
  ) then
    raise exception 'tex_plan_controls cross-tenant update changed row';
  end if;

  if not exists (
    select 1 from public.tex_plan_controls
    where id = '00000000-0000-0000-0000-00000002d002'
  ) then
    raise exception 'tex_plan_controls cross-tenant delete removed row';
  end if;
end $$;

set local role authenticated;
set local app.current_tenant_id = '';

do $$
declare visible_count integer;
begin
  select count(*) into visible_count from public.tex_plan_controls;
  if visible_count <> 0 then raise exception 'tex_plan_controls visible without tenant context'; end if;
end $$;

rollback;
