import { withTenantContext, type TenantQueryClient } from "@torrevie/tenant-context";
import { assertTexPermission } from "./access";
import { writeTexAuditEvent } from "./audit";
import type {
  TexBudgetRow,
  TexExpenseCategoryRow,
  TexProcessingSettingsRow,
  TexSpendPolicyRow
} from "./db-types";
import {
  mapBudget,
  mapCategory,
  mapProcessingSettings,
  mapSpendPolicy,
  mergePoliciesWithCategories
} from "./mappers";
import {
  sanitizeBudgetInput,
  sanitizeExpenseCategoryInput,
  sanitizeSpendPolicyInput
} from "./settings-input";
import { getTexTenantBranding } from "./branding-service";
import { assertUuid, requireSingleRow } from "./shared";
import type {
  TexActorContext,
  TexBudget,
  TexBudgetInput,
  TexExpenseCategory,
  TexExpenseCategoryInput,
  TexProcessingSettings,
  TexProcessingSettingsInput,
  TexSettingsWorkspace,
  TexSpendPolicy,
  TexSpendPolicyInput
} from "./types";
import { sanitizeMonth, sanitizeYear } from "./validation";

export async function listTexSettingsWorkspace(
  client: TenantQueryClient,
  actor: TexActorContext,
  month = new Date().getUTCMonth() + 1,
  year = new Date().getUTCFullYear()
): Promise<TexSettingsWorkspace> {
  assertTexPermission(actor, "tex.expense.read");
  const normalizedMonth = sanitizeMonth(month);
  const normalizedYear = sanitizeYear(year);

  return withTenantContext(client, actor, async () => {
    const categoriesResult = await client.query<TexExpenseCategoryRow>(
      `
          select id, name, is_active, is_system, sort_order
          from public.tex_expense_categories
          where tenant_id = public.current_tenant_id()
          order by sort_order asc, name asc
        `
    );
    const policiesResult = await client.query<TexSpendPolicyRow>(
      `
          select
            id,
            category,
            daily_limit::float as daily_limit,
            monthly_limit::float as monthly_limit,
            requires_notes_above::float as requires_notes_above,
            is_blocked
          from public.tex_spend_policies
          where tenant_id = public.current_tenant_id()
          order by category asc
        `
    );
    const budgetsResult = await client.query<TexBudgetRow>(
      `
          select
            b.id,
            b.department,
            b.month,
            b.year,
            b.budget_amount::float as budget_amount,
            coalesce(spent.spent_amount, 0)::float as spent_amount
          from public.tex_budgets b
          left join lateral (
            select coalesce(sum(coalesce(e.base_amount, e.amount)), 0) as spent_amount
            from public.tex_expenses e
            left join public.tex_employee_profiles ep
              on ep.tenant_id = e.tenant_id
             and ep.id = e.employee_profile_id
            where e.tenant_id = public.current_tenant_id()
              and e.status <> 'rejected'
              and extract(month from e.expense_date)::int = b.month
              and extract(year from e.expense_date)::int = b.year
              and coalesce(ep.department, '') = b.department
          ) spent on true
          where b.tenant_id = public.current_tenant_id()
            and b.month = $1
            and b.year = $2
          order by b.department asc
        `,
      [normalizedMonth, normalizedYear]
    );
    const departmentsResult = await client.query<{ department: string }>(
      `
          select distinct department
          from public.tex_employee_profiles
          where tenant_id = public.current_tenant_id()
            and department is not null
            and trim(department) <> ''
          order by department asc
        `
    );
    const processingResult = await client.query<TexProcessingSettingsRow>(
      `
          select
            ai_receipt_extraction_enabled,
            duplicate_detection_enabled,
            duplicate_auto_reject_enabled,
            duplicate_similarity_threshold::float as duplicate_similarity_threshold
          from public.tex_integration_settings
          where tenant_id = public.current_tenant_id()
          limit 1
        `
    );

    return {
      branding: await getTexTenantBranding(client, actor),
      categories: categoriesResult.rows.map(mapCategory),
      policies: mergePoliciesWithCategories(categoriesResult.rows, policiesResult.rows),
      budgets: budgetsResult.rows.map(mapBudget),
      departments: departmentsResult.rows.map((row) => row.department),
      processingSettings: mapProcessingSettings(processingResult.rows[0]),
      month: normalizedMonth,
      year: normalizedYear
    };
  });
}

export async function updateTexProcessingSettings(
  client: TenantQueryClient,
  actor: TexActorContext,
  input: TexProcessingSettingsInput
): Promise<TexProcessingSettings> {
  assertTexPermission(actor, "tex.policy.manage");
  const duplicateAutoRejectEnabled = input.duplicateHandlingMode === "auto_reject";

  return withTenantContext(client, actor, async () => {
    const result = await client.query<TexProcessingSettingsRow>(
      `
        insert into public.tex_integration_settings (
          tenant_id,
          duplicate_detection_enabled,
          duplicate_auto_reject_enabled,
          updated_by
        )
        values (public.current_tenant_id(), true, $1, $2)
        on conflict (tenant_id) do update set
          duplicate_detection_enabled = true,
          duplicate_auto_reject_enabled = excluded.duplicate_auto_reject_enabled,
          updated_by = excluded.updated_by,
          updated_at = now()
        returning
          ai_receipt_extraction_enabled,
          duplicate_detection_enabled,
          duplicate_auto_reject_enabled,
          duplicate_similarity_threshold::float as duplicate_similarity_threshold
      `,
      [duplicateAutoRejectEnabled, actor.userId]
    );
    const settings = mapProcessingSettings(requireSingleRow(result.rows, "processing settings"));

    await writeTexAuditEvent(
      client,
      actor,
      "tex.processing_settings.updated",
      "tex_integration_settings",
      actor.tenantId,
      {
        duplicate_handling_mode: settings.duplicateHandlingMode
      }
    );

    return settings;
  });
}

export async function createTexExpenseCategory(
  client: TenantQueryClient,
  actor: TexActorContext,
  input: TexExpenseCategoryInput
): Promise<TexExpenseCategory> {
  assertTexPermission(actor, "tex.policy.manage");
  const category = sanitizeExpenseCategoryInput(input);

  return withTenantContext(client, actor, async () => {
    const result = await client.query<TexExpenseCategoryRow>(
      `
        insert into public.tex_expense_categories (
          tenant_id,
          name,
          is_active,
          is_system,
          sort_order,
          created_by,
          updated_by
        )
        values (public.current_tenant_id(), $1, $2, false, $3, $4, $4)
        returning id, name, is_active, is_system, sort_order
      `,
      [category.name, category.isActive, category.sortOrder, actor.userId]
    );
    const row = requireSingleRow(result.rows, "expense category");

    await writeTexAuditEvent(
      client,
      actor,
      "tex.category.created",
      "tex_expense_category",
      row.id,
      {
        name: row.name
      }
    );

    return mapCategory(row);
  });
}

export async function updateTexExpenseCategory(
  client: TenantQueryClient,
  actor: TexActorContext,
  categoryId: string,
  input: TexExpenseCategoryInput
): Promise<TexExpenseCategory> {
  assertTexPermission(actor, "tex.policy.manage");
  assertUuid(categoryId, "expense category id");
  const category = sanitizeExpenseCategoryInput(input);

  return withTenantContext(client, actor, async () => {
    const result = await client.query<TexExpenseCategoryRow>(
      `
        update public.tex_expense_categories
           set name = $1,
               is_active = $2,
               sort_order = $3,
               updated_by = $4
         where tenant_id = public.current_tenant_id()
           and id = $5
        returning id, name, is_active, is_system, sort_order
      `,
      [category.name, category.isActive, category.sortOrder, actor.userId, categoryId]
    );
    const row = requireSingleRow(result.rows, "expense category");

    await writeTexAuditEvent(
      client,
      actor,
      "tex.category.updated",
      "tex_expense_category",
      row.id,
      {
        name: row.name
      }
    );

    return mapCategory(row);
  });
}

export async function deleteTexExpenseCategory(
  client: TenantQueryClient,
  actor: TexActorContext,
  categoryId: string
): Promise<{ deleted: string }> {
  assertTexPermission(actor, "tex.policy.manage");
  assertUuid(categoryId, "expense category id");

  return withTenantContext(client, actor, async () => {
    const result = await client.query<{ id: string; name: string }>(
      `
        delete from public.tex_expense_categories
        where tenant_id = public.current_tenant_id()
          and id = $1
          and is_system = false
        returning id, name
      `,
      [categoryId]
    );
    const row = requireSingleRow(result.rows, "expense category");

    await writeTexAuditEvent(
      client,
      actor,
      "tex.category.deleted",
      "tex_expense_category",
      row.id,
      {
        name: row.name
      }
    );

    return { deleted: row.id };
  });
}

export async function upsertTexSpendPolicy(
  client: TenantQueryClient,
  actor: TexActorContext,
  input: TexSpendPolicyInput
): Promise<TexSpendPolicy> {
  assertTexPermission(actor, "tex.policy.manage");
  const policy = sanitizeSpendPolicyInput(input);

  return withTenantContext(client, actor, async () => {
    const result = await client.query<TexSpendPolicyRow>(
      `
        insert into public.tex_spend_policies (
          tenant_id,
          category,
          daily_limit,
          monthly_limit,
          requires_notes_above,
          is_blocked,
          created_by,
          updated_by
        )
        values (public.current_tenant_id(), $1, $2, $3, $4, $5, $6, $6)
        on conflict (tenant_id, category)
        do update set
          daily_limit = excluded.daily_limit,
          monthly_limit = excluded.monthly_limit,
          requires_notes_above = excluded.requires_notes_above,
          is_blocked = excluded.is_blocked,
          updated_by = excluded.updated_by,
          updated_at = now()
        returning
          id,
          category,
          daily_limit::float as daily_limit,
          monthly_limit::float as monthly_limit,
          requires_notes_above::float as requires_notes_above,
          is_blocked
      `,
      [
        policy.category,
        policy.dailyLimit,
        policy.monthlyLimit,
        policy.requiresNotesAbove,
        policy.isBlocked,
        actor.userId
      ]
    );
    const row = requireSingleRow(result.rows, "spend policy");

    await writeTexAuditEvent(client, actor, "tex.policy.updated", "tex_spend_policy", row.id, {
      category: row.category
    });

    return mapSpendPolicy(row);
  });
}

export async function upsertTexBudget(
  client: TenantQueryClient,
  actor: TexActorContext,
  input: TexBudgetInput
): Promise<TexBudget> {
  assertTexPermission(actor, "tex.policy.manage");
  const budget = sanitizeBudgetInput(input);

  return withTenantContext(client, actor, async () => {
    const result = await client.query<TexBudgetRow>(
      `
        insert into public.tex_budgets (
          tenant_id,
          department,
          month,
          year,
          budget_amount,
          created_by,
          updated_by
        )
        values (public.current_tenant_id(), $1, $2, $3, $4, $5, $5)
        on conflict (tenant_id, department, month, year)
        do update set
          budget_amount = excluded.budget_amount,
          updated_by = excluded.updated_by,
          updated_at = now()
        returning
          id,
          department,
          month,
          year,
          budget_amount::float as budget_amount,
          0::float as spent_amount
      `,
      [budget.department, budget.month, budget.year, budget.budgetAmount, actor.userId]
    );
    const row = requireSingleRow(result.rows, "budget");

    await writeTexAuditEvent(client, actor, "tex.budget.updated", "tex_budget", row.id, {
      department: row.department,
      month: String(row.month),
      year: String(row.year)
    });

    return mapBudget(row);
  });
}

export async function deleteTexBudget(
  client: TenantQueryClient,
  actor: TexActorContext,
  budgetId: string
): Promise<{ deleted: string }> {
  assertTexPermission(actor, "tex.policy.manage");
  assertUuid(budgetId, "budget id");

  return withTenantContext(client, actor, async () => {
    const result = await client.query<{ id: string; department: string }>(
      `
        delete from public.tex_budgets
        where tenant_id = public.current_tenant_id()
          and id = $1
        returning id, department
      `,
      [budgetId]
    );
    const row = requireSingleRow(result.rows, "budget");

    await writeTexAuditEvent(client, actor, "tex.budget.deleted", "tex_budget", row.id, {
      department: row.department
    });

    return { deleted: row.id };
  });
}
