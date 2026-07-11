begin;

insert into public.users (id, email) values
  ('00000000-0000-0000-0000-000000000401', 'profiles-a@example.test'),
  ('00000000-0000-0000-0000-000000000402', 'profiles-b@example.test'),
  ('00000000-0000-0000-0000-000000000403', 'profiles-c@example.test');
insert into public.tenants (id, name, slug, status) values
  ('00000000-0000-0000-0000-000000001401', 'Profiles A', 'profiles-a', 'active'),
  ('00000000-0000-0000-0000-000000001402', 'Profiles B', 'profiles-b', 'active');
insert into public.user_profiles (id, tenant_id, user_id, display_name) values
  ('00000000-0000-0000-0000-000000004401', '00000000-0000-0000-0000-000000001401', '00000000-0000-0000-0000-000000000401', 'A'),
  ('00000000-0000-0000-0000-000000004402', '00000000-0000-0000-0000-000000001402', '00000000-0000-0000-0000-000000000402', 'B');

set local role authenticated;
set local app.current_tenant_id = '00000000-0000-0000-0000-000000001401';

do $$
declare visible_count integer; insert_succeeded boolean := false;
begin
  select count(*) into visible_count from public.user_profiles where tenant_id = '00000000-0000-0000-0000-000000001402';
  if visible_count <> 0 then raise exception 'user_profiles cross-tenant select leaked rows'; end if;
  begin
    insert into public.user_profiles (tenant_id, user_id, display_name)
    values ('00000000-0000-0000-0000-000000001402', '00000000-0000-0000-0000-000000000403', 'C');
    insert_succeeded := true;
  exception when others then null;
  end;
  if insert_succeeded then raise exception 'user_profiles cross-tenant insert succeeded'; end if;
end $$;

update public.user_profiles set display_name = 'Changed' where id = '00000000-0000-0000-0000-000000004402';
delete from public.user_profiles where id = '00000000-0000-0000-0000-000000004402';

reset role;

do $$
begin
  if exists (select 1 from public.user_profiles where id = '00000000-0000-0000-0000-000000004402' and display_name = 'Changed') then
    raise exception 'user_profiles cross-tenant update changed row';
  end if;
  if not exists (select 1 from public.user_profiles where id = '00000000-0000-0000-0000-000000004402') then
    raise exception 'user_profiles cross-tenant delete removed row';
  end if;
end $$;

set local role authenticated;
set local app.current_tenant_id = '';

do $$
declare visible_count integer;
begin
  select count(*) into visible_count from public.user_profiles;
  if visible_count <> 0 then raise exception 'user_profiles visible without tenant context'; end if;
end $$;

rollback;
