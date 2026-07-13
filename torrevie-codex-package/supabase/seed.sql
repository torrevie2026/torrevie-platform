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
  ('fsm.entitlement.override', 'Grant or revoke FSM feature overrides for a tenant'),
  ('fsm.settings.manage', 'Manage FSM segment, plan, onboarding, and flow settings'),
  ('tex.expense.submit', 'Submit an expense claim'),
  ('tex.expense.read', 'Read TEX expense claims'),
  ('tex.expense.manage', 'Create or edit TEX expense claims for a tenant'),
  ('tex.expense.approve', 'Approve an expense claim'),
  ('tex.finance.review', 'Review and settle approved TEX expenses'),
  ('tex.trip.manage', 'Create and manage TEX trips and trip legs'),
  ('tex.people.manage', 'Manage TEX employee profiles and teams'),
  ('tex.policy.manage', 'Configure expense policies'),
  ('tex.receipt.review', 'Review receipt OCR and unregistered WhatsApp submissions'),
  ('tex.integration.manage', 'Configure TEX integrations and webhook routing'),
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
join (
  values
    ('crm', 'starter', 'Starter'),
    ('crm', 'growth', 'Growth'),
    ('crm', 'enterprise', 'Enterprise'),
    ('fsm', 'entry', 'Entry'),
    ('fsm', 'growth', 'Growth'),
    ('fsm', 'enterprise', 'Enterprise'),
    ('tex', 'starter', 'Starter'),
    ('tex', 'growth', 'Growth'),
    ('tex', 'enterprise', 'Enterprise'),
    ('cme', 'starter', 'Starter'),
    ('cme', 'growth', 'Growth'),
    ('cme', 'enterprise', 'Enterprise'),
    ('lqs', 'starter', 'Starter'),
    ('lqs', 'growth', 'Growth'),
    ('lqs', 'enterprise', 'Enterprise')
) as plan_keys(product_key, key, label)
  on plan_keys.product_key = products.key
on conflict (product_id, key) do update set label = excluded.label;

insert into public.plan_features (plan_id, feature_key, limit_value)
select plans.id, features.feature_key, features.limit_value
from public.plans
join public.products on products.id = plans.product_id
join (
  values
    ('starter', 'crm.accounts.limit', 250),
    ('starter', 'crm.pipeline.enabled', null),
    ('growth', 'crm.accounts.limit', 2500),
    ('growth', 'crm.pipeline.enabled', null),
    ('growth', 'crm.quotes.enabled', null),
    ('enterprise', 'crm.accounts.limit', null),
    ('enterprise', 'crm.pipeline.enabled', null),
    ('enterprise', 'crm.quotes.enabled', null),
    ('enterprise', 'crm.priority_support.enabled', null)
) as features(plan_key, feature_key, limit_value)
  on features.plan_key = plans.key
where products.key = 'crm'
  and not exists (
    select 1
    from public.plan_features existing
    where existing.plan_id = plans.id
      and existing.feature_key = features.feature_key
  );

insert into public.plan_features (plan_id, feature_key, limit_value)
select plans.id, features.feature_key, features.limit_value
from public.plans
join public.products on products.id = plans.product_id
join (
  values
    ('starter', 'tex.expenses.monthly_limit', 500),
    ('starter', 'tex.receipts.ocr.enabled', null),
    ('growth', 'tex.expenses.monthly_limit', 5000),
    ('growth', 'tex.receipts.ocr.enabled', null),
    ('growth', 'tex.whatsapp.enabled', null),
    ('growth', 'tex.trips.enabled', null),
    ('enterprise', 'tex.expenses.monthly_limit', null),
    ('enterprise', 'tex.receipts.ocr.enabled', null),
    ('enterprise', 'tex.whatsapp.enabled', null),
    ('enterprise', 'tex.trips.enabled', null),
    ('enterprise', 'tex.finance.settlements.enabled', null)
) as features(plan_key, feature_key, limit_value)
  on features.plan_key = plans.key
where products.key = 'tex'
  and not exists (
    select 1
    from public.plan_features existing
    where existing.plan_id = plans.id
      and existing.feature_key = features.feature_key
  );

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
  'fsm.entitlement.override',
  'fsm.settings.manage',
  'tex.expense.submit',
  'tex.expense.read',
  'tex.expense.manage',
  'tex.expense.approve',
  'tex.finance.review',
  'tex.trip.manage',
  'tex.people.manage',
  'tex.policy.manage',
  'tex.receipt.review',
  'tex.integration.manage',
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
join public.permissions on permissions.key in ('platform.subscription.manage', 'platform.audit.read_all', 'fsm.entitlement.override')
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
  'fsm.settings.manage',
  'tex.expense.submit',
  'tex.expense.read',
  'tex.expense.manage',
  'tex.expense.approve',
  'tex.finance.review',
  'tex.trip.manage',
  'tex.people.manage',
  'tex.policy.manage',
  'tex.receipt.review',
  'tex.integration.manage',
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
  'fsm.settings.manage',
  'tex.expense.read',
  'tex.expense.manage',
  'tex.policy.manage',
  'tex.finance.review',
  'tex.trip.manage',
  'tex.people.manage',
  'tex.receipt.review',
  'tex.integration.manage',
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
  'tex.expense.read',
  'tex.expense.approve',
  'tex.finance.review',
  'tex.trip.manage',
  'tex.receipt.review',
  'fsm.work_order.manage',
  'fsm.settings.manage'
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
  'tex.expense.read',
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
