begin;

do $$
declare
  v_actor_user_id uuid := '00000000-0000-4000-8000-000000023001';
  v_owner_user_id uuid := '00000000-0000-4000-8000-000000023002';
  v_other_user_id uuid := '00000000-0000-4000-8000-000000023003';
  v_tenant_id uuid := '00000000-0000-4000-8000-000000023101';
  v_other_tenant_id uuid := '00000000-0000-4000-8000-000000023102';
  v_qualified_stage_id uuid := '00000000-0000-4000-8000-000000023201';
  v_proposal_stage_id uuid := '00000000-0000-4000-8000-000000023202';
  v_other_stage_id uuid := '00000000-0000-4000-8000-000000023203';
  v_account_id uuid := '00000000-0000-4000-8000-000000023301';
  v_other_account_id uuid := '00000000-0000-4000-8000-000000023302';
  v_contact_id uuid := '00000000-0000-4000-8000-000000023401';
  v_opportunity_id uuid := '00000000-0000-4000-8000-000000023501';
  v_job_id uuid := '00000000-0000-4000-8000-000000023601';
  v_failed_step_id uuid := '00000000-0000-4000-8000-000000023701';
  v_succeeding_step_id uuid := '00000000-0000-4000-8000-000000023702';
  v_crm_plan_id uuid;
  v_crm_product_id uuid;
  v_subscription_id uuid := '00000000-0000-4000-8000-000000023801';
  v_entitlement_count integer;
  v_audit_count integer;
  v_visible_accounts integer;
  v_leaked_accounts integer;
begin
  insert into public.users (id, email) values
    (v_actor_user_id, 'wp23-platform-admin@example.test'),
    (v_owner_user_id, 'wp23-crm-owner@example.test'),
    (v_other_user_id, 'wp23-other-tenant@example.test');

  insert into public.tenants (id, name, slug, status, region, legal_entity_name, billing_email, created_by, updated_by)
  values
    (v_tenant_id, 'WP23 Staging Validation', 'wp23-staging-validation', 'trial', 'UAE', 'WP23 Staging Validation LLC', 'billing-wp23@example.test', v_actor_user_id, v_actor_user_id),
    (v_other_tenant_id, 'WP23 Isolation Neighbour', 'wp23-isolation-neighbour', 'active', 'UAE', 'WP23 Isolation Neighbour LLC', 'billing-wp23-other@example.test', v_actor_user_id, v_actor_user_id);

  insert into public.tenant_settings (tenant_id, default_locale, timezone, created_by, updated_by)
  values (v_tenant_id, 'en', 'Asia/Dubai', v_actor_user_id, v_actor_user_id);

  insert into public.audit_events (tenant_id, actor_user_id, action, target_type, target_id, metadata)
  values
    (v_tenant_id, v_actor_user_id, 'tenant.created', 'tenant', v_tenant_id, '{"source":"wp23_staging_validation"}'::jsonb),
    (v_tenant_id, v_actor_user_id, 'tenant.suspended', 'tenant', v_tenant_id, '{"status":"suspended"}'::jsonb),
    (v_tenant_id, v_actor_user_id, 'tenant.active', 'tenant', v_tenant_id, '{"status":"active"}'::jsonb);

  update public.tenants
  set status = 'active',
      updated_by = v_actor_user_id
  where id = v_tenant_id;

  insert into public.tenant_memberships (tenant_id, user_id, status, joined_at, created_by, updated_by)
  values
    (v_tenant_id, v_actor_user_id, 'active', now(), v_actor_user_id, v_actor_user_id),
    (v_tenant_id, v_owner_user_id, 'active', now(), v_actor_user_id, v_actor_user_id),
    (v_other_tenant_id, v_other_user_id, 'active', now(), v_actor_user_id, v_actor_user_id);

  insert into public.user_role_assignments (tenant_id, user_id, role_id, assigned_by, created_by, updated_by)
  select v_tenant_id, v_actor_user_id, roles.id, v_actor_user_id, v_actor_user_id, v_actor_user_id
  from public.roles
  where roles.key = 'customer_admin';

  insert into public.provisioning_jobs (id, tenant_id, status, started_at, completed_at, created_by, updated_by)
  values (v_job_id, v_tenant_id, 'failed', now(), now(), v_actor_user_id, v_actor_user_id);

  insert into public.provisioning_steps (id, provisioning_job_id, tenant_id, step_key, status, attempt_count, error, created_by, updated_by)
  values
    (v_succeeding_step_id, v_job_id, v_tenant_id, 'create_tenant_record', 'succeeded', 1, null, v_actor_user_id, v_actor_user_id),
    (v_failed_step_id, v_job_id, v_tenant_id, 'initialize_product_defaults', 'failed', 1, 'simulated first-attempt failure', v_actor_user_id, v_actor_user_id);

  update public.provisioning_jobs
  set status = 'running',
      completed_at = null,
      updated_by = v_actor_user_id
  where id = v_job_id;

  update public.provisioning_steps
  set status = 'succeeded',
      attempt_count = attempt_count + 1,
      error = null,
      updated_by = v_actor_user_id
  where id = v_failed_step_id;

  update public.provisioning_jobs
  set status = 'succeeded',
      completed_at = now(),
      updated_by = v_actor_user_id
  where id = v_job_id;

  insert into public.audit_events (tenant_id, actor_user_id, action, target_type, target_id, metadata)
  values
    (v_tenant_id, v_actor_user_id, 'provisioning.job.created', 'provisioning_job', v_job_id, '{"step_count":"2"}'::jsonb),
    (v_tenant_id, v_actor_user_id, 'provisioning.step.retried', 'provisioning_step', v_failed_step_id, '{"step_key":"initialize_product_defaults"}'::jsonb),
    (v_tenant_id, v_actor_user_id, 'provisioning.job.succeeded', 'provisioning_job', v_job_id, '{"status":"succeeded"}'::jsonb);

  select plans.id, products.id
  into v_crm_plan_id, v_crm_product_id
  from public.plans
  join public.products on products.id = plans.product_id
  where products.key = 'crm'
    and plans.key = 'growth'
  limit 1;

  if v_crm_plan_id is null or v_crm_product_id is null then
    raise exception 'CRM growth plan is missing from staging seed data.';
  end if;

  insert into public.subscriptions (id, tenant_id, product_id, plan_id, status, starts_at, created_by, updated_by)
  values (v_subscription_id, v_tenant_id, v_crm_product_id, v_crm_plan_id, 'active', now(), v_actor_user_id, v_actor_user_id);

  insert into public.subscription_entitlements (tenant_id, subscription_id, feature_key, limit_value, created_by, updated_by)
  select v_tenant_id, v_subscription_id, plan_features.feature_key, plan_features.limit_value, v_actor_user_id, v_actor_user_id
  from public.plan_features
  where plan_features.plan_id = v_crm_plan_id;

  get diagnostics v_entitlement_count = row_count;

  if v_entitlement_count < 1 then
    raise exception 'CRM subscription assignment did not materialize entitlements.';
  end if;

  insert into public.audit_events (tenant_id, actor_user_id, action, target_type, target_id, metadata)
  values (v_tenant_id, v_actor_user_id, 'subscription.assigned', 'subscription', v_subscription_id, '{"product_key":"crm","plan_key":"growth","status":"active"}'::jsonb);

  set local role authenticated;
  set local app.current_tenant_id = '00000000-0000-4000-8000-000000023101';

  insert into public.pipeline_stages (id, tenant_id, key, label, sort_order, created_by, updated_by)
  values
    (v_qualified_stage_id, v_tenant_id, 'qualified', 'Qualified', 10, v_actor_user_id, v_actor_user_id),
    (v_proposal_stage_id, v_tenant_id, 'proposal', 'Proposal', 20, v_actor_user_id, v_actor_user_id);

  insert into public.accounts (id, tenant_id, name, industry, owner_user_id, created_by, updated_by)
  values (v_account_id, v_tenant_id, 'WP23 Gulf Logistics', 'Logistics', v_owner_user_id, v_actor_user_id, v_actor_user_id);

  insert into public.contacts (id, tenant_id, account_id, first_name, last_name, email, source_module, created_by, updated_by)
  values (v_contact_id, v_tenant_id, v_account_id, 'Maya', 'Haddad', 'maya.wp23@example.test', 'crm', v_actor_user_id, v_actor_user_id);

  insert into public.opportunities (id, tenant_id, account_id, primary_contact_id, pipeline_stage_id, name, amount, currency, owner_user_id, created_by, updated_by)
  values (v_opportunity_id, v_tenant_id, v_account_id, v_contact_id, v_qualified_stage_id, 'WP23 Warehouse rollout', 12000, 'AED', v_owner_user_id, v_actor_user_id, v_actor_user_id);

  update public.opportunities
  set pipeline_stage_id = v_proposal_stage_id,
      version = version + 1,
      updated_by = v_actor_user_id
  where id = v_opportunity_id;

  insert into public.audit_events (tenant_id, actor_user_id, action, target_type, target_id, metadata)
  values (v_tenant_id, v_actor_user_id, 'crm.opportunity.stage_moved', 'opportunity', v_opportunity_id, '{"pipeline_stage":"proposal","version":"2"}'::jsonb);

  reset role;

  insert into public.pipeline_stages (id, tenant_id, key, label, sort_order, created_by, updated_by)
  values (v_other_stage_id, v_other_tenant_id, 'qualified', 'Qualified', 10, v_actor_user_id, v_actor_user_id);

  insert into public.accounts (id, tenant_id, name, industry, owner_user_id, created_by, updated_by)
  values (v_other_account_id, v_other_tenant_id, 'WP23 Hidden Account', 'Services', v_other_user_id, v_actor_user_id, v_actor_user_id);

  set local role authenticated;
  set local app.current_tenant_id = '00000000-0000-4000-8000-000000023101';

  select count(*) into v_visible_accounts
  from public.accounts
  where accounts.tenant_id = v_tenant_id;

  select count(*) into v_leaked_accounts
  from public.accounts
  where accounts.tenant_id = v_other_tenant_id;

  if v_visible_accounts <> 1 then
    raise exception 'Expected Tenant A to see one account, saw %.', v_visible_accounts;
  end if;

  if v_leaked_accounts <> 0 then
    raise exception 'Tenant A can see Tenant B accounts.';
  end if;

  reset role;

  select count(*) into v_audit_count
  from public.audit_events
  where audit_events.tenant_id = v_tenant_id
    and action in (
      'tenant.created',
      'tenant.suspended',
      'tenant.active',
      'provisioning.job.created',
      'provisioning.step.retried',
      'provisioning.job.succeeded',
      'subscription.assigned',
      'crm.opportunity.stage_moved'
    );

  if v_audit_count <> 8 then
    raise exception 'Expected 8 representative audit events, received %.', v_audit_count;
  end if;
end $$;

select
  'wp23_staging_validation_passed' as result,
  'tenant_lifecycle,provisioning,subscription_assignment,crm_opportunity_flow,tenant_isolation,audit_events' as validated_paths;

rollback;
