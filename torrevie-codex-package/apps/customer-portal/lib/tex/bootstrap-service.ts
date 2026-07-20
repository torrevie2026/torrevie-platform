import {
  withTenantContext,
  type ResolvedTenantContext,
  type TenantQueryClient
} from "@torrevie/tenant-context";
import type { ProductKey } from "@torrevie/permissions";
import { assertTexPermission, isProductKey, isRoleKey } from "./access";
import type {
  TexEmployeeProfileRow,
  TexExpenseCategoryRow,
  TexIntegrationSettingsRow,
  TexManagerUserRow,
  TexMembershipValidationRow,
  TexOnboardingStatusRow,
  TexPlanContextRow,
  TexProductRow,
  TexTeamRow,
  TexTenantRow
} from "./db-types";
import {
  mapCategory,
  mapEmployeeProfile,
  mapIntegrationSettings,
  mapManagerUser,
  mapTeam
} from "./mappers";
import { mapOnboardingStatus } from "./onboarding";
import { mapTexPlanContext } from "./plan-context";
import { assertUuid, requireSingleRow } from "./shared";
import type { TexActorContext, TexBootstrap, TexOnboardingStatus, TexPlanContext } from "./types";

export async function resolveTexActorContext(
  client: TenantQueryClient,
  context: ResolvedTenantContext
): Promise<TexActorContext> {
  assertUuid(context.tenantId, "tenant id");
  assertUuid(context.userId, "user id");

  if (context.roleScope === "platform") {
    const supportContext = await resolveTexSupportContext(client, context);

    return {
      ...context,
      roles: ["torrevie_platform_admin"],
      entitledProducts: supportContext.entitledProducts,
      texPlan: supportContext.texPlan,
      tenantName: supportContext.tenantName,
      moduleAdminProducts: supportContext.entitledProducts
    };
  }

  return withTenantContext(client, context, async () => {
    const membership = await client.query<TexMembershipValidationRow>(
      `
        select tm.status as membership_status, u.status as user_status
        from public.tenant_memberships tm
        join public.users u on u.id = tm.user_id
        where tm.tenant_id = public.current_tenant_id()
          and tm.user_id = $1
        limit 1
      `,
      [context.userId]
    );
    const membershipRow = membership.rows[0];

    if (!membershipRow || membershipRow.membership_status !== "active") {
      throw new Error("No active tenant membership was found.");
    }

    if (membershipRow.user_status !== "active") {
      throw new Error("The user is deactivated.");
    }

    const contextResult = await client.query<TexActorContextWorkspaceRow>(
      `
        select
          (
            select name
            from public.tenants
            where id = public.current_tenant_id()
            limit 1
          ) as tenant_name,
          coalesce((
            select array_agg(r.key order by r.key)
            from public.user_role_assignments ura
            join public.roles r on r.id = ura.role_id
            where ura.tenant_id = public.current_tenant_id()
              and ura.user_id = $1
          ), '{}') as roles,
          coalesce((
            select array_agg(p.key order by p.key)
            from public.subscriptions s
            join public.products p on p.id = s.product_id
            where s.tenant_id = public.current_tenant_id()
              and s.status in ('trial', 'active')
              and s.starts_at <= now()
              and (s.expires_at is null or s.expires_at > now())
          ), '{}') as entitled_products,
          (
            select to_jsonb(plan_row)
            from (
              select
                coalesce(tpc.plan_key::text, plans.key, 'trial') as plan_key,
                coalesce(
                  tpc.plan_status::text,
                  case when s.status = 'trial' then 'trialing' else s.status end,
                  'trialing'
                ) as plan_status,
                coalesce(tpc.trial_start_date::text, s.starts_at::date::text) as trial_start_date,
                coalesce(tpc.trial_end_date::text, s.expires_at::date::text) as trial_end_date,
                coalesce(tpc.employee_limit, pf.limit_value, 5)::int as employee_limit,
                coalesce(tpc.seat_count, 0)::int as seat_count,
                coalesce(tpc.whatsapp_provider_scope::text, 'not_configured') as whatsapp_provider_scope
              from public.subscriptions s
              join public.products products
                on products.id = s.product_id
              join public.plans plans
                on plans.id = s.plan_id
              left join public.tex_plan_controls tpc
                on tpc.tenant_id = s.tenant_id
              left join public.plan_features pf
                on pf.plan_id = plans.id
               and pf.feature_key = 'tex.employee_limit'
              where s.tenant_id = public.current_tenant_id()
                and products.key = 'tex'
                and s.status in ('trial', 'active')
                and s.starts_at <= now()
                and (s.expires_at is null or s.expires_at > now())
              order by s.created_at desc
              limit 1
            ) plan_row
          ) as tex_plan
      `,
      [context.userId]
    );
    const contextRow = contextResult.rows[0];
    const resolvedRoles = (contextRow?.roles ?? []).filter(isRoleKey);
    const resolvedProducts = (contextRow?.entitled_products ?? []).filter(isProductKey);
    const resolvedTexPlan = mapTexPlanContext(contextRow?.tex_plan ?? undefined);
    const tenantName = contextRow?.tenant_name?.trim() || context.tenantId;

    return {
      ...context,
      roles: resolvedRoles,
      entitledProducts: resolvedProducts,
      texPlan: resolvedTexPlan,
      tenantName,
      moduleAdminProducts: resolvedRoles.includes("customer_module_admin") ? resolvedProducts : []
    };
  });
}

export async function listTexBootstrap(
  client: TenantQueryClient,
  actor: TexActorContext
): Promise<TexBootstrap> {
  assertTexPermission(actor, "tex.expense.read");

  return withTenantContext(client, actor, async () => {
    const result = await client.query<TexBootstrapWorkspaceRow>(
      `
        select
          (
            select coalesce(jsonb_agg(to_jsonb(category_row)), '[]'::jsonb)
            from (
              select id, name, is_active, is_system, sort_order
              from public.tex_expense_categories
              where tenant_id = public.current_tenant_id()
              order by sort_order asc, name asc
            ) category_row
          ) as categories,
          (
            select coalesce(jsonb_agg(to_jsonb(employee_row)), '[]'::jsonb)
            from (
              select
                ep.id,
                ep.user_id,
                ep.name,
                ep.phone_number,
                ep.department,
                ep.monthly_salary::float as monthly_salary,
                ep.manager_user_id,
                manager_profile.display_name as manager_name,
                manager_user.email as manager_email,
                ep.submission_frequency,
                ep.is_active
              from public.tex_employee_profiles ep
              left join public.users manager_user
                on manager_user.id = ep.manager_user_id
              left join public.user_profiles manager_profile
                on manager_profile.tenant_id = ep.tenant_id
               and manager_profile.user_id = ep.manager_user_id
              where ep.tenant_id = public.current_tenant_id()
              order by ep.name asc
            ) employee_row
          ) as employee_profiles,
          (
            select coalesce(jsonb_agg(to_jsonb(manager_row)), '[]'::jsonb)
            from (
              select
                u.id,
                u.email,
                up.display_name,
                coalesce(array_agg(r.key order by r.key) filter (where r.key is not null), '{}') as roles
              from public.tenant_memberships tm
              join public.users u on u.id = tm.user_id
              left join public.user_profiles up
                on up.tenant_id = tm.tenant_id
               and up.user_id = tm.user_id
              left join public.user_role_assignments ura
                on ura.tenant_id = tm.tenant_id
               and ura.user_id = tm.user_id
              left join public.roles r on r.id = ura.role_id
              where tm.tenant_id = public.current_tenant_id()
                and tm.status = 'active'
                and u.status = 'active'
              group by u.id, u.email, up.display_name
              order by coalesce(up.display_name, u.email) asc
            ) manager_row
          ) as manager_users,
          (
            select coalesce(jsonb_agg(to_jsonb(team_row)), '[]'::jsonb)
            from (
              select
                t.id,
                t.name,
                t.description,
                t.manager_employee_profile_id,
                manager.name as manager_name,
                coalesce(
                  string_agg(member.id::text, ',' order by member.name)
                    filter (where member.id is not null),
                  ''
                ) as member_employee_profile_ids,
                coalesce(
                  string_agg(member.name, '|' order by member.name)
                    filter (where member.id is not null),
                  ''
                ) as member_names,
                count(member.id)::int as member_count
              from public.tex_teams t
              left join public.tex_employee_profiles manager
                on manager.tenant_id = t.tenant_id
               and manager.id = t.manager_employee_profile_id
              left join public.tex_team_members tm
                on tm.tenant_id = t.tenant_id
               and tm.team_id = t.id
              left join public.tex_employee_profiles member
                on member.tenant_id = tm.tenant_id
               and member.id = tm.employee_profile_id
              where t.tenant_id = public.current_tenant_id()
              group by t.id, manager.name
              order by t.name asc
            ) team_row
          ) as teams,
          (
            select to_jsonb(settings_row)
            from (
              select
                whatsapp_provider,
                whatsapp_instance_id,
                wappfly_session_id,
                meta_phone_number_id,
                meta_whatsapp_business_account_id,
                ai_receipt_extraction_enabled,
                duplicate_detection_enabled,
                duplicate_auto_reject_enabled,
                duplicate_similarity_threshold::float as duplicate_similarity_threshold
              from public.tex_integration_settings
              where tenant_id = public.current_tenant_id()
              limit 1
            ) settings_row
          ) as integration_settings
      `
    );
    const workspace = normalizeTexBootstrapWorkspace(result.rows[0]);

    return {
      categories: workspace.categories.map(mapCategory),
      employeeProfiles: workspace.employee_profiles.map(mapEmployeeProfile),
      managerUsers: workspace.manager_users.map(mapManagerUser),
      teams: workspace.teams.map(mapTeam),
      integrationSettings: workspace.integration_settings
        ? mapIntegrationSettings(workspace.integration_settings)
        : null
    };
  });
}

export async function getTexOnboardingStatus(
  client: TenantQueryClient,
  actor: TexActorContext,
  options: { markDashboardViewed?: boolean } = {}
): Promise<TexOnboardingStatus> {
  assertTexPermission(actor, "tex.expense.read");

  return withTenantContext(client, actor, async () => {
    const result = await client.query<TexOnboardingStatusRow>(
      `
        insert into public.tex_onboarding_status (
          tenant_id,
          dashboard_first_viewed_at,
          last_activity_at,
          created_by,
          updated_by
        )
        values (
          public.current_tenant_id(),
          case when $2::boolean then now() else null end,
          now(),
          $1,
          $1
        )
        on conflict (tenant_id) do update set
          dashboard_first_viewed_at = case
            when $2::boolean then coalesce(
              public.tex_onboarding_status.dashboard_first_viewed_at,
              excluded.dashboard_first_viewed_at
            )
            else public.tex_onboarding_status.dashboard_first_viewed_at
          end,
          last_activity_at = excluded.last_activity_at,
          updated_by = excluded.updated_by
        returning
          company_profile_completed_at::text as company_profile_completed_at,
          whatsapp_connected_at::text as whatsapp_connected_at,
          first_employee_invited_at::text as first_employee_invited_at,
          first_receipt_received_at::text as first_receipt_received_at,
          first_expense_approved_at::text as first_expense_approved_at,
          dashboard_first_viewed_at::text as dashboard_first_viewed_at,
          last_activity_at::text as last_activity_at,
          ocr_pending_count,
          manual_review_count
      `,
      [actor.userId, options.markDashboardViewed === true]
    );

    return mapOnboardingStatus(requireSingleRow(result.rows, "TEX onboarding status"));
  });
}

async function resolveTexSupportContext(
  client: TenantQueryClient,
  context: ResolvedTenantContext
): Promise<{ entitledProducts: ProductKey[]; texPlan: TexPlanContext; tenantName: string }> {
  return withTenantContext(client, context, async () => {
    const [tenant, entitledProducts, texPlan] = await Promise.all([
      client.query<TexTenantRow>(
        `
          select name
          from public.tenants
          where id = public.current_tenant_id()
          limit 1
        `
      ),
      client.query<TexProductRow>(
        `
          select p.key
          from public.subscriptions s
          join public.products p on p.id = s.product_id
          where s.tenant_id = public.current_tenant_id()
            and s.status in ('trial', 'active')
            and s.starts_at <= now()
            and (s.expires_at is null or s.expires_at > now())
        `
      ),
      client.query<TexPlanContextRow>(
        `
          select
            coalesce(tpc.plan_key::text, plans.key, 'trial') as plan_key,
            coalesce(
              tpc.plan_status::text,
              case when s.status = 'trial' then 'trialing' else s.status end,
              'trialing'
            ) as plan_status,
            coalesce(tpc.trial_start_date::text, s.starts_at::date::text) as trial_start_date,
            coalesce(tpc.trial_end_date::text, s.expires_at::date::text) as trial_end_date,
            coalesce(tpc.employee_limit, pf.limit_value, 5)::int as employee_limit,
            coalesce(tpc.seat_count, 0)::int as seat_count,
            coalesce(tpc.whatsapp_provider_scope::text, 'not_configured') as whatsapp_provider_scope
          from public.subscriptions s
          join public.products products
            on products.id = s.product_id
          join public.plans plans
            on plans.id = s.plan_id
          left join public.tex_plan_controls tpc
            on tpc.tenant_id = s.tenant_id
          left join public.plan_features pf
            on pf.plan_id = plans.id
           and pf.feature_key = 'tex.employee_limit'
          where s.tenant_id = public.current_tenant_id()
            and products.key = 'tex'
            and s.status in ('trial', 'active')
            and s.starts_at <= now()
            and (s.expires_at is null or s.expires_at > now())
          order by s.created_at desc
          limit 1
        `
      )
    ]);

    return {
      entitledProducts: entitledProducts.rows.map((row) => row.key).filter(isProductKey),
      texPlan: mapTexPlanContext(texPlan.rows[0]),
      tenantName: tenant.rows[0]?.name?.trim() || context.tenantId
    };
  });
}

type TexActorContextWorkspaceRow = {
  tenant_name: string | null;
  roles: string[];
  entitled_products: string[];
  tex_plan: TexPlanContextRow | null;
};

type TexBootstrapWorkspaceRow = {
  categories: TexExpenseCategoryRow[];
  employee_profiles: TexEmployeeProfileRow[];
  manager_users: TexManagerUserRow[];
  teams: TexTeamRow[];
  integration_settings: TexIntegrationSettingsRow | null;
};

function normalizeTexBootstrapWorkspace(
  row: Partial<TexBootstrapWorkspaceRow> | undefined
): TexBootstrapWorkspaceRow {
  return {
    categories: row?.categories ?? [],
    employee_profiles: row?.employee_profiles ?? [],
    manager_users: row?.manager_users ?? [],
    teams: row?.teams ?? [],
    integration_settings: row?.integration_settings ?? null
  };
}
