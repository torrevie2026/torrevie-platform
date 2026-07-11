# Row-Level Security Policy Specification

This is the exact pattern every tenant-scoped table follows. It is not a suggestion. A migration that adds a tenant-scoped table without these four policies does not pass review.

## Standard pattern

For a table `example_table` with a `tenant_id` column:

```sql
alter table example_table enable row level security;

create policy example_table_select on example_table
  for select
  using (tenant_id = current_tenant_id());

create policy example_table_insert on example_table
  for insert
  with check (tenant_id = current_tenant_id());

create policy example_table_update on example_table
  for update
  using (tenant_id = current_tenant_id())
  with check (tenant_id = current_tenant_id());

create policy example_table_delete on example_table
  for delete
  using (tenant_id = current_tenant_id());
```

Four separate policies, not one combined policy, so each operation is independently testable and independently auditable in a security review.

## current_tenant_id()

Defined once, in the first platform migration, as:

```sql
create or replace function current_tenant_id() returns uuid
language sql stable
as $$
  select nullif(current_setting('app.current_tenant_id', true), '')::uuid;
$$;
```

`app.current_tenant_id` is set by the server-side Supabase client wrapper in `packages/tenant-context`, once per request, immediately after the caller's tenant membership is resolved and before any query runs. This is the only place in the codebase permitted to set this session variable. No other package sets it, ever.

## Tables with additional scope beyond tenant_id

Some tables need a narrower policy than "any member of this tenant." Apply the tenant policy first, then add ownership or role narrowing in the application layer (Section 16 of the HLD) rather than encoding every business rule into RLS. RLS is the backstop against a missed application check, not a substitute for role-based logic. Exceptions, where RLS itself should narrow further:

- `integration_secrets`: select and update restricted additionally to a `platform_service_role` claim, since even a tenant administrator should not read a raw secret value through the standard API path.
- `audit_events`: insert-only from application code (no update or delete policy at all, by design; audit rows are immutable). A Torrevie staff cross-tenant read path uses a dedicated `security definer` function, never a relaxed RLS policy on the table itself.
- `provisioning_jobs` and `provisioning_steps`: select is available to the tenant, but insert and update are restricted to a `platform_service_role` claim, since only the provisioning pipeline creates and advances these rows, never a customer session.

## Platform tables without a tenant_id

`tenants`, `products`, `plans`, `plan_features`, `roles`, `permissions`, `role_permissions` are either global catalog tables or the tenant root itself. These get RLS enabled with a policy restricted to a `platform_service_role` claim for write operations, and a read policy open to any authenticated user for the catalog tables (`products`, `plans`, `roles`, `permissions`) since these are not sensitive, non-tenant-specific reference data.

## Storage RLS

Applied to every bucket. Path convention: `tenant/{tenant_id}/{product}/{entity_type}/{entity_id}/{file_id}`.

```sql
create policy tenant_files_select on storage.objects
  for select
  using (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = 'tenant'
    and (storage.foldername(name))[2] = current_tenant_id()::text
  );
```

Equivalent policies for insert, update, and delete, mirroring the table pattern above.

## Required test per table

Every migration that adds a tenant-scoped table must ship with a corresponding entry in `supabase/tests/` proving, at minimum:

1. A session with `app.current_tenant_id` set to Tenant A cannot select a row belonging to Tenant B.
2. A session with `app.current_tenant_id` set to Tenant A cannot insert a row with `tenant_id` set to Tenant B.
3. A session with `app.current_tenant_id` set to Tenant A cannot update or delete a row belonging to Tenant B.
4. A session with no `app.current_tenant_id` set (unauthenticated or misconfigured context) can access nothing on the table.

This is the same suite referenced as release-blocking in `AGENTS.md` and in Work Package 10 of `WORK_PACKAGES.md`.
