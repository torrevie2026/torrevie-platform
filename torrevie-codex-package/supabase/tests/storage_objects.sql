begin;

insert into public.tenants (id, name, slug, status) values
  ('00000000-0000-0000-0000-000000001901', 'Storage A', 'storage-a', 'active'),
  ('00000000-0000-0000-0000-000000001902', 'Storage B', 'storage-b', 'active');

insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do update set public = excluded.public;

insert into storage.objects (bucket_id, name, owner)
values
  ('receipts', 'tenant/00000000-0000-0000-0000-000000001901/tex/receipts/a.png', null),
  ('receipts', 'tenant/00000000-0000-0000-0000-000000001902/tex/receipts/b.png', null);

set local role authenticated;
set local app.current_tenant_id = '00000000-0000-0000-0000-000000001901';

do $$
declare
  visible_count integer;
  insert_succeeded boolean := false;
begin
  select count(*) into visible_count
  from storage.objects
  where bucket_id = 'receipts'
    and name like 'tenant/00000000-0000-0000-0000-000000001902/%';

  if visible_count <> 0 then
    raise exception 'storage.objects cross-tenant select leaked rows';
  end if;

  begin
    insert into storage.objects (bucket_id, name, owner)
    values (
      'receipts',
      'tenant/00000000-0000-0000-0000-000000001902/tex/receipts/c.png',
      null
    );
    insert_succeeded := true;
  exception when others then null;
  end;

  if insert_succeeded then
    raise exception 'storage.objects cross-tenant insert succeeded';
  end if;
end $$;

update storage.objects
set metadata = jsonb_build_object('changed', true)
where bucket_id = 'receipts'
  and name = 'tenant/00000000-0000-0000-0000-000000001902/tex/receipts/b.png';

do $$
begin
  delete from storage.objects
  where bucket_id = 'receipts'
    and name = 'tenant/00000000-0000-0000-0000-000000001902/tex/receipts/b.png';
exception when others then
  null;
end $$;

reset role;

do $$
begin
  if exists (
    select 1
    from storage.objects
    where bucket_id = 'receipts'
      and name = 'tenant/00000000-0000-0000-0000-000000001902/tex/receipts/b.png'
      and metadata = jsonb_build_object('changed', true)
  ) then
    raise exception 'storage.objects cross-tenant update changed row';
  end if;

  if not exists (
    select 1
    from storage.objects
    where bucket_id = 'receipts'
      and name = 'tenant/00000000-0000-0000-0000-000000001902/tex/receipts/b.png'
  ) then
    raise exception 'storage.objects cross-tenant delete removed row';
  end if;
end $$;

set local role authenticated;
set local app.current_tenant_id = '';

do $$
declare
  visible_count integer;
begin
  select count(*) into visible_count
  from storage.objects
  where bucket_id = 'receipts';

  if visible_count <> 0 then
    raise exception 'storage.objects visible without tenant context';
  end if;
end $$;

rollback;
