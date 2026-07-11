import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const projectId = "torrevie-codex-package";
const containerName = `supabase_db_${projectId}`;
const tenantA = randomUUID();
const tenantB = randomUUID();
const userId = randomUUID();

const now = Date.now();
const smokeSql = `
insert into public.users (id, email) values ('${userId}', 'tenant-context-${now}@example.test');
insert into public.tenants (id, name, slug, status) values
  ('${tenantA}', 'Tenant Context A', 'tenant-context-a-${now}', 'active'),
  ('${tenantB}', 'Tenant Context B', 'tenant-context-b-${now}', 'active');
insert into public.tenant_memberships (tenant_id, user_id, status, joined_at)
values ('${tenantA}', '${userId}', 'active', now());
insert into public.tenant_settings (tenant_id, timezone) values
  ('${tenantA}', 'Asia/Dubai'),
  ('${tenantB}', 'UTC');

begin;
select set_config('app.current_tenant_id', '${tenantA}', true);
set local role authenticated;

do $$
declare
  visible_count integer;
  visible_tenants text[];
begin
  select count(*), array_agg(tenant_id::text)
  into visible_count, visible_tenants
  from public.tenant_settings;

  if visible_count <> 1 or visible_tenants[1] <> '${tenantA}' then
    raise exception 'Tenant-context smoke test did not scope RLS to the expected tenant.';
  end if;
end $$;

rollback;
`;

execFileSync(
  "docker",
  ["exec", "-i", containerName, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-f", "-"],
  { input: smokeSql, stdio: ["pipe", "ignore", "inherit"] }
);

console.log("Tenant-context integration smoke test passed.");
