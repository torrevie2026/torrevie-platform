insert into public.products (key, label)
values ('fsm', 'FSM')
on conflict (key) do update set label = excluded.label;

insert into public.plans (product_id, key, label)
select products.id, plan_seed.key, plan_seed.label
from public.products
cross join (
  values
    ('entry', 'Entry'),
    ('growth', 'Growth'),
    ('enterprise', 'Enterprise')
) as plan_seed(key, label)
where products.key = 'fsm'
on conflict (product_id, key) do update set label = excluded.label;

insert into public.plan_features (plan_id, feature_key, limit_value, enabled)
select plans.id, features.feature_key, features.limit_value, features.enabled
from public.plans
join public.products on products.id = plans.product_id
join (
  values
    ('entry', 'fsm.users.field.max', 5, true),
    ('entry', 'fsm.users.office.max', 2, true),
    ('entry', 'fsm.core.jobs.enabled', null, true),
    ('entry', 'fsm.core.scheduling.enabled', null, true),
    ('entry', 'fsm.core.customers.enabled', null, true),
    ('entry', 'fsm.commercial.quotations.enabled', null, true),
    ('entry', 'fsm.commercial.invoices.enabled', null, true),
    ('entry', 'fsm.channel.whatsapp.enabled', 1, true),
    ('entry', 'fsm.channel.whatsapp.manual_triage.enabled', null, true),
    ('entry', 'fsm.assets.basic.enabled', null, true),
    ('entry', 'fsm.roi.basic.enabled', null, true),
    ('growth', 'fsm.users.field.max', 50, true),
    ('growth', 'fsm.users.office.max', 10, true),
    ('growth', 'fsm.core.jobs.enabled', null, true),
    ('growth', 'fsm.core.scheduling.enabled', null, true),
    ('growth', 'fsm.core.customers.enabled', null, true),
    ('growth', 'fsm.commercial.quotations.enabled', null, true),
    ('growth', 'fsm.commercial.invoices.enabled', null, true),
    ('growth', 'fsm.channel.whatsapp.enabled', 1, true),
    ('growth', 'fsm.channel.whatsapp.ai_triage.enabled', null, true),
    ('growth', 'fsm.channel.email.enabled', null, true),
    ('growth', 'fsm.channel.portal.basic.enabled', null, true),
    ('growth', 'fsm.module.pm', null, true),
    ('growth', 'fsm.module.sla', null, true),
    ('growth', 'fsm.module.inspections', null, true),
    ('growth', 'fsm.module.contracts', null, true),
    ('growth', 'fsm.assets.full.enabled', null, true),
    ('growth', 'fsm.route_optimization.enabled', null, true),
    ('growth', 'fsm.roi.full.enabled', null, true),
    ('growth', 'fsm.ai_reports.enabled', null, true),
    ('growth', 'fsm.voice.addon.available', null, true),
    ('enterprise', 'fsm.users.field.max', null, true),
    ('enterprise', 'fsm.users.office.max', null, true),
    ('enterprise', 'fsm.core.jobs.enabled', null, true),
    ('enterprise', 'fsm.core.scheduling.enabled', null, true),
    ('enterprise', 'fsm.core.customers.enabled', null, true),
    ('enterprise', 'fsm.commercial.quotations.enabled', null, true),
    ('enterprise', 'fsm.commercial.invoices.enabled', null, true),
    ('enterprise', 'fsm.channel.whatsapp.enabled', null, true),
    ('enterprise', 'fsm.channel.whatsapp.ai_triage.enabled', null, true),
    ('enterprise', 'fsm.channel.whatsapp.templates.enabled', null, true),
    ('enterprise', 'fsm.channel.email.enabled', null, true),
    ('enterprise', 'fsm.channel.voice.enabled', null, true),
    ('enterprise', 'fsm.channel.portal.branded.enabled', null, true),
    ('enterprise', 'fsm.module.pm', null, true),
    ('enterprise', 'fsm.module.sla', null, true),
    ('enterprise', 'fsm.module.sla.custom_matrices.enabled', null, true),
    ('enterprise', 'fsm.module.inspections', null, true),
    ('enterprise', 'fsm.module.contracts', null, true),
    ('enterprise', 'fsm.module.compliance', null, true),
    ('enterprise', 'fsm.assets.full.enabled', null, true),
    ('enterprise', 'fsm.assets.warranty_serial.enabled', null, true),
    ('enterprise', 'fsm.route_optimization.enabled', null, true),
    ('enterprise', 'fsm.roi.full.enabled', null, true),
    ('enterprise', 'fsm.client_report_packs.enabled', null, true),
    ('enterprise', 'fsm.ai_reports.enabled', null, true),
    ('enterprise', 'fsm.sub_organizations.enabled', null, true),
    ('enterprise', 'fsm.api_access.enabled', null, true),
    ('enterprise', 'fsm.sso.enabled', null, true),
    ('enterprise', 'fsm.white_label.portal.enabled', null, true)
) as features(plan_key, feature_key, limit_value, enabled)
  on features.plan_key = plans.key
where products.key = 'fsm'
on conflict (plan_id, feature_key) do update set
  limit_value = excluded.limit_value,
  enabled = excluded.enabled,
  updated_at = now();

insert into public.subscription_entitlements (
  tenant_id,
  subscription_id,
  feature_key,
  limit_value,
  enabled,
  created_by,
  updated_by
)
select
  subscriptions.tenant_id,
  subscriptions.id,
  plan_features.feature_key,
  plan_features.limit_value,
  plan_features.enabled,
  subscriptions.created_by,
  subscriptions.updated_by
from public.subscriptions
join public.products on products.id = subscriptions.product_id
join public.plan_features on plan_features.plan_id = subscriptions.plan_id
where products.key = 'fsm'
  and subscriptions.status in ('trial', 'active')
on conflict (subscription_id, feature_key) do update set
  limit_value = excluded.limit_value,
  enabled = excluded.enabled,
  updated_by = excluded.updated_by,
  updated_at = now();
