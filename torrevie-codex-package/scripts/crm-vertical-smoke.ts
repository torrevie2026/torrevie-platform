import { execFileSync } from "node:child_process";

const projectId = "torrevie-codex-package";
const containerName = `supabase_db_${projectId}`;

const sql = String.raw`
begin;

insert into public.users (id, email) values
  ('00000000-0000-4000-8000-000000018001', 'crm-vertical-admin@example.test'),
  ('00000000-0000-4000-8000-000000018002', 'crm-vertical-owner@example.test');
insert into public.tenants (id, name, slug, status) values
  ('00000000-0000-4000-8000-000000018101', 'CRM Vertical Smoke', 'crm-vertical-smoke', 'active');
insert into public.tenant_memberships (tenant_id, user_id, status, joined_at) values
  ('00000000-0000-4000-8000-000000018101', '00000000-0000-4000-8000-000000018001', 'active', now()),
  ('00000000-0000-4000-8000-000000018101', '00000000-0000-4000-8000-000000018002', 'active', now());
insert into public.user_role_assignments (tenant_id, user_id, role_id, assigned_by)
select '00000000-0000-4000-8000-000000018101', '00000000-0000-4000-8000-000000018001', roles.id, '00000000-0000-4000-8000-000000018001'
from public.roles
where roles.key = 'customer_admin';

set local role authenticated;
set local app.current_tenant_id = '00000000-0000-4000-8000-000000018101';

insert into public.pipeline_stages (id, tenant_id, key, label, sort_order, created_by, updated_by) values
  ('00000000-0000-4000-8000-000000018201', '00000000-0000-4000-8000-000000018101', 'qualified', 'Qualified', 10, '00000000-0000-4000-8000-000000018001', '00000000-0000-4000-8000-000000018001'),
  ('00000000-0000-4000-8000-000000018202', '00000000-0000-4000-8000-000000018101', 'proposal', 'Proposal', 20, '00000000-0000-4000-8000-000000018001', '00000000-0000-4000-8000-000000018001');

insert into public.accounts (id, tenant_id, name, industry, owner_user_id, created_by, updated_by)
values ('00000000-0000-4000-8000-000000018301', '00000000-0000-4000-8000-000000018101', 'Gulf Logistics', 'Logistics', '00000000-0000-4000-8000-000000018002', '00000000-0000-4000-8000-000000018001', '00000000-0000-4000-8000-000000018001');

insert into public.contacts (id, tenant_id, account_id, first_name, last_name, email, source_module, created_by, updated_by)
values ('00000000-0000-4000-8000-000000018401', '00000000-0000-4000-8000-000000018101', '00000000-0000-4000-8000-000000018301', 'Maya', 'Haddad', 'maya.crm@example.test', 'crm', '00000000-0000-4000-8000-000000018001', '00000000-0000-4000-8000-000000018001');

insert into public.opportunities (id, tenant_id, account_id, primary_contact_id, pipeline_stage_id, name, amount, currency, owner_user_id, created_by, updated_by)
values ('00000000-0000-4000-8000-000000018501', '00000000-0000-4000-8000-000000018101', '00000000-0000-4000-8000-000000018301', '00000000-0000-4000-8000-000000018401', '00000000-0000-4000-8000-000000018201', 'Warehouse rollout', 12000, 'AED', '00000000-0000-4000-8000-000000018002', '00000000-0000-4000-8000-000000018001', '00000000-0000-4000-8000-000000018001');

update public.opportunities
set pipeline_stage_id = '00000000-0000-4000-8000-000000018202',
    version = version + 1,
    updated_by = '00000000-0000-4000-8000-000000018001'
where id = '00000000-0000-4000-8000-000000018501';

do $$
declare
  moved_count integer;
  visible_count integer;
begin
  select count(*) into moved_count
  from public.opportunities
  where id = '00000000-0000-4000-8000-000000018501'
    and pipeline_stage_id = '00000000-0000-4000-8000-000000018202'
    and version = 2;

  if moved_count <> 1 then
    raise exception 'CRM vertical smoke did not move opportunity to proposal';
  end if;

  select count(*) into visible_count
  from public.opportunities
  where tenant_id = '00000000-0000-4000-8000-000000018101';

  if visible_count <> 1 then
    raise exception 'CRM vertical smoke expected one visible opportunity, received %', visible_count;
  end if;
end $$;

rollback;
`;

execFileSync(
  "docker",
  [
    "exec",
    "-i",
    containerName,
    "psql",
    "-U",
    "postgres",
    "-d",
    "postgres",
    "-v",
    "ON_ERROR_STOP=1",
    "-f",
    "-"
  ],
  {
    input: sql,
    stdio: ["pipe", "ignore", "inherit"]
  }
);

console.log("CRM vertical smoke test passed.");
