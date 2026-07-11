begin;

insert into public.users (id, email) values ('00000000-0000-0000-0000-000000000301', 'files@example.test');
insert into public.tenants (id, name, slug, status) values
  ('00000000-0000-0000-0000-000000001301', 'Files A', 'files-a', 'active'),
  ('00000000-0000-0000-0000-000000001302', 'Files B', 'files-b', 'active');
insert into public.files (id, tenant_id, storage_path, filename) values
  ('00000000-0000-0000-0000-000000003301', '00000000-0000-0000-0000-000000001301', 'tenant/00000000-0000-0000-0000-000000001301/crm/account/a', 'a.txt'),
  ('00000000-0000-0000-0000-000000003302', '00000000-0000-0000-0000-000000001302', 'tenant/00000000-0000-0000-0000-000000001302/crm/account/b', 'b.txt');

set local role authenticated;
set local app.current_tenant_id = '00000000-0000-0000-0000-000000001301';

do $$
declare visible_count integer; insert_succeeded boolean := false;
begin
  select count(*) into visible_count from public.files where tenant_id = '00000000-0000-0000-0000-000000001302';
  if visible_count <> 0 then raise exception 'files cross-tenant select leaked rows'; end if;
  begin
    insert into public.files (tenant_id, storage_path, filename)
    values ('00000000-0000-0000-0000-000000001302', 'tenant/00000000-0000-0000-0000-000000001302/crm/account/c', 'c.txt');
    insert_succeeded := true;
  exception when others then null;
  end;
  if insert_succeeded then raise exception 'files cross-tenant insert succeeded'; end if;
end $$;

update public.files set filename = 'changed.txt' where id = '00000000-0000-0000-0000-000000003302';
delete from public.files where id = '00000000-0000-0000-0000-000000003302';

reset role;

do $$
begin
  if exists (select 1 from public.files where id = '00000000-0000-0000-0000-000000003302' and filename = 'changed.txt') then
    raise exception 'files cross-tenant update changed row';
  end if;
  if not exists (select 1 from public.files where id = '00000000-0000-0000-0000-000000003302') then
    raise exception 'files cross-tenant delete removed row';
  end if;
end $$;

set local role authenticated;
set local app.current_tenant_id = '';

do $$
declare visible_count integer;
begin
  select count(*) into visible_count from public.files;
  if visible_count <> 0 then raise exception 'files visible without tenant context'; end if;
end $$;

rollback;
