insert into public.roles (key, label, scope) values
  ('torrevie_platform_admin', 'Torrevie Platform Admin', 'platform'),
  ('torrevie_operations_admin', 'Torrevie Operations Admin', 'platform'),
  ('torrevie_support_agent', 'Torrevie Support Agent', 'platform'),
  ('torrevie_billing_admin', 'Torrevie Billing Admin', 'platform'),
  ('torrevie_security_admin', 'Torrevie Security Admin', 'platform'),
  ('customer_admin', 'Customer Admin', 'customer'),
  ('customer_module_admin', 'Customer Module Admin', 'customer'),
  ('customer_manager', 'Customer Manager', 'customer'),
  ('customer_standard_user', 'Customer Standard User', 'customer'),
  ('customer_readonly', 'Customer Readonly', 'customer'),
  ('integration_service', 'Integration Service', 'customer')
on conflict (key) do update set
  label = excluded.label,
  scope = excluded.scope;

insert into public.permissions (key, description) values
  ('platform.provision', 'Create, suspend, reactivate, archive a tenant'),
  ('platform.subscription.manage', 'Assign products, plans, entitlements to a tenant'),
  ('platform.support_access.grant', 'Start a time-boxed support-access session'),
  ('platform.audit.read_all', 'Read audit events across every tenant'),
  ('tenant.settings.manage', 'Edit tenant settings and branding'),
  ('tenant.user.invite', 'Invite a new user into the tenant'),
  ('tenant.user.manage', 'Edit or deactivate an existing tenant member'),
  ('tenant.role.assign', 'Assign a role to a tenant member'),
  ('crm.account.read', 'Read CRM accounts'),
  ('crm.account.write', 'Create or edit CRM accounts'),
  ('crm.opportunity.read', 'Read opportunities'),
  ('crm.opportunity.write', 'Create or edit opportunities'),
  ('crm.pipeline.manage', 'Configure pipeline stages'),
  ('fsm.work_order.read', 'Read work orders'),
  ('fsm.work_order.update_assigned', 'Update assigned work orders'),
  ('fsm.work_order.manage', 'Full work order administration'),
  ('tex.expense.submit', 'Submit an expense claim'),
  ('tex.expense.approve', 'Approve an expense claim'),
  ('tex.policy.manage', 'Configure expense policies'),
  ('cme.content.draft', 'Create AI-assisted content drafts'),
  ('cme.content.publish', 'Approve and publish content'),
  ('lqs.lead.read', 'Read leads'),
  ('lqs.lead.qualify', 'Update qualification status'),
  ('lqs.scoring.manage', 'Configure scoring and routing rules')
on conflict (key) do update set description = excluded.description;

insert into public.products (key, label) values
  ('crm', 'CRM'),
  ('fsm', 'FSM'),
  ('tex', 'TEX'),
  ('cme', 'CME'),
  ('lqs', 'LQS')
on conflict (key) do update set label = excluded.label;

insert into public.plans (product_id, key, label)
select products.id, plan_keys.key, plan_keys.label
from public.products
cross join (
  values
    ('starter', 'Starter'),
    ('growth', 'Growth'),
    ('enterprise', 'Enterprise')
) as plan_keys(key, label)
on conflict (product_id, key) do update set label = excluded.label;

insert into public.role_permissions (role_id, permission_id)
select roles.id, permissions.id
from public.roles
join public.permissions on permissions.key in (
  'platform.provision',
  'platform.subscription.manage',
  'platform.support_access.grant',
  'platform.audit.read_all',
  'tenant.settings.manage',
  'tenant.user.invite',
  'tenant.user.manage',
  'tenant.role.assign',
  'crm.account.read',
  'crm.account.write',
  'crm.opportunity.read',
  'crm.opportunity.write',
  'crm.pipeline.manage',
  'fsm.work_order.read',
  'fsm.work_order.update_assigned',
  'fsm.work_order.manage',
  'tex.expense.submit',
  'tex.expense.approve',
  'tex.policy.manage',
  'cme.content.draft',
  'cme.content.publish',
  'lqs.lead.read',
  'lqs.lead.qualify',
  'lqs.scoring.manage'
)
where roles.key = 'torrevie_platform_admin'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select roles.id, permissions.id
from public.roles
join public.permissions on permissions.key in ('platform.provision', 'platform.support_access.grant')
where roles.key = 'torrevie_operations_admin'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select roles.id, permissions.id
from public.roles
join public.permissions on permissions.key in ('platform.support_access.grant', 'platform.audit.read_all')
where roles.key = 'torrevie_support_agent'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select roles.id, permissions.id
from public.roles
join public.permissions on permissions.key in ('platform.subscription.manage', 'platform.audit.read_all')
where roles.key = 'torrevie_billing_admin'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select roles.id, permissions.id
from public.roles
join public.permissions on permissions.key in ('platform.audit.read_all', 'tenant.role.assign')
where roles.key = 'torrevie_security_admin'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select roles.id, permissions.id
from public.roles
join public.permissions on permissions.key in (
  'tenant.settings.manage',
  'tenant.user.invite',
  'tenant.user.manage',
  'tenant.role.assign',
  'crm.account.read',
  'crm.account.write',
  'crm.opportunity.read',
  'crm.opportunity.write',
  'crm.pipeline.manage',
  'fsm.work_order.read',
  'fsm.work_order.update_assigned',
  'fsm.work_order.manage',
  'tex.expense.submit',
  'tex.expense.approve',
  'tex.policy.manage',
  'cme.content.draft',
  'cme.content.publish',
  'lqs.lead.read',
  'lqs.lead.qualify',
  'lqs.scoring.manage'
)
where roles.key = 'customer_admin'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select roles.id, permissions.id
from public.roles
join public.permissions on permissions.key in (
  'crm.account.read',
  'crm.account.write',
  'crm.opportunity.read',
  'crm.opportunity.write',
  'crm.pipeline.manage',
  'fsm.work_order.manage',
  'tex.policy.manage',
  'cme.content.publish',
  'lqs.scoring.manage'
)
where roles.key = 'customer_module_admin'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select roles.id, permissions.id
from public.roles
join public.permissions on permissions.key in (
  'crm.account.read',
  'crm.opportunity.read',
  'crm.opportunity.write',
  'tex.expense.approve',
  'fsm.work_order.manage'
)
where roles.key = 'customer_manager'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select roles.id, permissions.id
from public.roles
join public.permissions on permissions.key in (
  'crm.account.read',
  'crm.opportunity.read',
  'crm.opportunity.write',
  'fsm.work_order.update_assigned',
  'tex.expense.submit',
  'cme.content.draft',
  'lqs.lead.qualify'
)
where roles.key = 'customer_standard_user'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select roles.id, permissions.id
from public.roles
join public.permissions on permissions.key like '%.read'
where roles.key = 'customer_readonly'
on conflict do nothing;
