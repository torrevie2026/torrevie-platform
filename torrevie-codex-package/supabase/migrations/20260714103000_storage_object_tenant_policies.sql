insert into storage.buckets (id, name, public)
values
  ('receipts', 'receipts', false),
  ('attachments', 'attachments', false),
  ('avatars', 'avatars', false)
on conflict (id) do update set
  public = excluded.public;

drop policy if exists tenant_storage_objects_select on storage.objects;
drop policy if exists tenant_storage_objects_insert on storage.objects;
drop policy if exists tenant_storage_objects_update on storage.objects;
drop policy if exists tenant_storage_objects_delete on storage.objects;

create policy tenant_storage_objects_select
on storage.objects
for select
to authenticated
using (
  public.is_platform_service_role()
  or (
    bucket_id in ('receipts', 'attachments', 'avatars')
    and (storage.foldername(name))[1] = 'tenant'
    and (storage.foldername(name))[2] = public.current_tenant_id()::text
  )
);

create policy tenant_storage_objects_insert
on storage.objects
for insert
to authenticated
with check (
  public.is_platform_service_role()
  or (
    bucket_id in ('receipts', 'attachments', 'avatars')
    and (storage.foldername(name))[1] = 'tenant'
    and (storage.foldername(name))[2] = public.current_tenant_id()::text
  )
);

create policy tenant_storage_objects_update
on storage.objects
for update
to authenticated
using (
  public.is_platform_service_role()
  or (
    bucket_id in ('receipts', 'attachments', 'avatars')
    and (storage.foldername(name))[1] = 'tenant'
    and (storage.foldername(name))[2] = public.current_tenant_id()::text
  )
)
with check (
  public.is_platform_service_role()
  or (
    bucket_id in ('receipts', 'attachments', 'avatars')
    and (storage.foldername(name))[1] = 'tenant'
    and (storage.foldername(name))[2] = public.current_tenant_id()::text
  )
);

create policy tenant_storage_objects_delete
on storage.objects
for delete
to authenticated
using (
  public.is_platform_service_role()
  or (
    bucket_id in ('receipts', 'attachments', 'avatars')
    and (storage.foldername(name))[1] = 'tenant'
    and (storage.foldername(name))[2] = public.current_tenant_id()::text
  )
);

grant select, insert, update, delete on storage.objects to authenticated;
