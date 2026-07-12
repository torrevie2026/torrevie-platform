insert into public.permissions (key, description) values
  ('tex.expense.submit', 'Submit an expense claim'),
  ('tex.expense.read', 'Read TEX expense claims'),
  ('tex.expense.manage', 'Create or edit TEX expense claims for a tenant'),
  ('tex.expense.approve', 'Approve an expense claim'),
  ('tex.finance.review', 'Review and settle approved TEX expenses'),
  ('tex.trip.manage', 'Create and manage TEX trips and trip legs'),
  ('tex.people.manage', 'Manage TEX employee profiles and teams'),
  ('tex.policy.manage', 'Configure expense policies'),
  ('tex.receipt.review', 'Review receipt OCR and unregistered WhatsApp submissions'),
  ('tex.integration.manage', 'Configure TEX integrations and webhook routing')
on conflict (key) do update set description = excluded.description;

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
  'tex.expense.submit',
  'tex.expense.read',
  'tex.expense.manage',
  'tex.expense.approve',
  'tex.finance.review',
  'tex.trip.manage',
  'tex.people.manage',
  'tex.policy.manage',
  'tex.receipt.review',
  'tex.integration.manage'
)
where roles.key in ('torrevie_platform_admin', 'customer_admin')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select roles.id, permissions.id
from public.roles
join public.permissions on permissions.key in (
  'tex.expense.read',
  'tex.expense.manage',
  'tex.policy.manage',
  'tex.finance.review',
  'tex.trip.manage',
  'tex.people.manage',
  'tex.receipt.review',
  'tex.integration.manage'
)
where roles.key = 'customer_module_admin'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select roles.id, permissions.id
from public.roles
join public.permissions on permissions.key in (
  'tex.expense.read',
  'tex.expense.approve',
  'tex.finance.review',
  'tex.trip.manage',
  'tex.receipt.review'
)
where roles.key = 'customer_manager'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select roles.id, permissions.id
from public.roles
join public.permissions on permissions.key in (
  'tex.expense.submit',
  'tex.expense.read'
)
where roles.key = 'customer_standard_user'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select roles.id, permissions.id
from public.roles
join public.permissions on permissions.key = 'tex.expense.read'
where roles.key = 'customer_readonly'
on conflict do nothing;
