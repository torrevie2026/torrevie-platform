import { withTenantContext, type TenantQueryClient } from "@torrevie/tenant-context";
import {
  assertStandardUserExpenseProfileScope,
  assertTexAnyPermission,
  assertTexPermission,
  isTexStandardUserOnly
} from "./access";
import { writeTexAuditEvent } from "./audit";
import type { TexExpenseListRow, TexExpenseRow } from "./db-types";
import { assertExpenseStatus, sanitizeExpense, sanitizeExpenseUpdate } from "./expense-input";
import { mapExpense, mapExpenseListItem } from "./mappers";
import { assertUuid, cleanOptional, requireSingleRow } from "./shared";
import type {
  TexActorContext,
  TexExpenseInput,
  TexExpenseListItem,
  TexExpenseRecord,
  TexExpenseStatus,
  TexExpenseUpdateInput
} from "./types";
import { deliverExpenseStatusWhatsappReply } from "./whatsapp-delivery";

export async function listTexExpenses(
  client: TenantQueryClient,
  actor: TexActorContext
): Promise<TexExpenseListItem[]> {
  assertTexPermission(actor, "tex.expense.read");
  const scopeToOwnExpenses = isTexStandardUserOnly(actor);

  return withTenantContext(client, actor, async () => {
    const result = await client.query<TexExpenseListRow>(
      `
        select
          e.id,
          e.employee_profile_id,
          coalesce(ep.name, e.employee_name) as employee_name,
          e.vendor,
          e.expense_date::text as expense_date,
          e.amount::float as amount,
          e.currency,
          e.category,
          e.trip_id,
          coalesce(t.name, e.trip_name) as trip_name,
          e.notes,
          e.payment_method,
          e.tax_id_number,
          e.tax_amount::float as tax_amount,
          e.receipt_file_id,
          e.status,
          e.created_at::text as created_at,
          e.duplicate_status,
          e.duplicate_reason,
          e.manager_review_required
        from public.tex_expenses e
        left join public.tex_employee_profiles ep
          on ep.tenant_id = e.tenant_id
         and ep.id = e.employee_profile_id
        left join public.tex_trips t
          on t.tenant_id = e.tenant_id
         and t.id = e.trip_id
        where e.tenant_id = public.current_tenant_id()
          and (
            $1::boolean = false
            or e.submitter_user_id = $2
            or ep.user_id = $2
          )
        order by e.created_at desc
        limit 100
      `,
      [scopeToOwnExpenses, actor.userId]
    );

    return result.rows.map(mapExpenseListItem);
  });
}

export async function createTexExpense(
  client: TenantQueryClient,
  actor: TexActorContext,
  input: TexExpenseInput
): Promise<TexExpenseRecord> {
  assertTexPermission(actor, "tex.expense.submit");
  const expense = sanitizeExpense(input);

  return withTenantContext(client, actor, async () => {
    await assertStandardUserExpenseProfileScope(client, actor, expense.employeeProfileId);

    const result = await client.query<TexExpenseRow>(
      `
        insert into public.tex_expenses (
          tenant_id,
          submitter_user_id,
          employee_profile_id,
          vendor,
          expense_date,
          amount,
          currency,
          category,
          trip_id,
          trip_leg_id,
          notes,
          payment_method,
          tax_id_number,
          tax_amount,
          receipt_file_id,
          source,
          extraction_source,
          extraction_confidence,
          extraction_payload,
          duplicate_status,
          duplicate_of_expense_id,
          duplicate_reason,
          manager_review_required,
          created_by,
          updated_by
        )
        values (
          public.current_tenant_id(),
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11,
          $12,
          $13,
          $14,
          $15,
          $16,
          $17,
          $18::jsonb,
          'clear',
          null,
          null,
          false,
          $1,
          $1
        )
        returning id, status, amount::float as amount, currency
      `,
      [
        actor.userId,
        expense.employeeProfileId,
        expense.vendor,
        expense.expenseDate,
        expense.amount,
        expense.currency,
        expense.category,
        expense.tripId,
        expense.tripLegId,
        expense.notes,
        expense.paymentMethod,
        expense.taxIdNumber,
        expense.taxAmount,
        expense.receiptFileId,
        expense.source,
        expense.extractionSource,
        expense.extractionConfidence,
        JSON.stringify(expense.extractionPayload ?? {})
      ]
    );
    const row = requireSingleRow(result.rows, "expense");
    await writeTexAuditEvent(client, actor, "tex.expense.created", "tex_expense", row.id, {
      amount: String(row.amount),
      currency: row.currency,
      source: expense.source ?? "web"
    });

    return mapExpense(row);
  });
}

export async function updateTexExpense(
  client: TenantQueryClient,
  actor: TexActorContext,
  expenseId: string,
  input: TexExpenseUpdateInput
): Promise<TexExpenseRecord> {
  assertTexPermission(actor, "tex.expense.submit");
  assertUuid(expenseId, "expense id");
  const expense = sanitizeExpenseUpdate(input);
  const scopeToOwnExpenses = isTexStandardUserOnly(actor);

  return withTenantContext(client, actor, async () => {
    await assertStandardUserExpenseProfileScope(client, actor, expense.employeeProfileId);

    const result = await client.query<TexExpenseRow>(
      `
        update public.tex_expenses
           set employee_profile_id = $1,
               vendor = $2,
               expense_date = $3,
               amount = $4,
               currency = $5,
               category = $6,
               trip_id = $7,
               notes = $8,
               payment_method = $9,
               tax_id_number = $10,
               tax_amount = $11,
               receipt_file_id = $12,
               extraction_source = coalesce($13::text, extraction_source),
               extraction_confidence = $14,
               extraction_payload = $15::jsonb,
               manager_review_required = case when status = 'approved' then true else manager_review_required end,
               updated_by = $16
         where tenant_id = public.current_tenant_id()
           and id = $17
           and (
             $18::boolean = false
             or submitter_user_id = $16
             or exists (
               select 1
               from public.tex_employee_profiles ep
               where ep.tenant_id = public.current_tenant_id()
                 and ep.id = public.tex_expenses.employee_profile_id
                 and ep.user_id = $16
             )
           )
         returning id, status, amount::float as amount, currency
      `,
      [
        expense.employeeProfileId,
        expense.vendor,
        expense.expenseDate,
        expense.amount,
        expense.currency,
        expense.category,
        expense.tripId,
        expense.notes,
        expense.paymentMethod,
        expense.taxIdNumber,
        expense.taxAmount,
        expense.receiptFileId,
        expense.extractionSource,
        expense.extractionConfidence,
        JSON.stringify(expense.extractionPayload ?? {}),
        actor.userId,
        expenseId,
        scopeToOwnExpenses
      ]
    );
    const row = requireSingleRow(result.rows, "expense");
    await writeTexAuditEvent(client, actor, "tex.expense.updated", "tex_expense", expenseId, {
      amount: String(row.amount),
      currency: row.currency,
      source: "manual_edit"
    });

    return mapExpense(row);
  });
}

export async function updateTexExpenseStatus(
  client: TenantQueryClient,
  actor: TexActorContext,
  expenseId: string,
  status: Exclude<TexExpenseStatus, "pending">,
  reason?: string | null
): Promise<TexExpenseRecord> {
  assertUuid(expenseId, "expense id");
  assertExpenseStatus(status);

  if (status === "paid") {
    assertTexAnyPermission(actor, ["tex.finance.review", "tex.expense.approve"]);
  } else {
    assertTexPermission(actor, "tex.expense.approve");
  }

  return withTenantContext(client, actor, async () => {
    const result = await client.query<TexExpenseRow>(
      `
        update public.tex_expenses
           set status = $1,
               approved_by = case when $1 = 'approved' then $2 else approved_by end,
               approved_at = case when $1 = 'approved' then now() else approved_at end,
               rejected_by = case when $1 = 'rejected' then $2 else rejected_by end,
               rejected_at = case when $1 = 'rejected' then now() else rejected_at end,
               rejected_reason = case when $1 = 'rejected' then $3 else rejected_reason end,
               paid_by = case when $1 = 'paid' then $2 else paid_by end,
               paid_at = case when $1 = 'paid' then now() else paid_at end,
               updated_by = $2
         where tenant_id = public.current_tenant_id()
           and id = $4
           and ($1 <> 'paid' or status = 'approved')
         returning id, status, amount::float as amount, currency
      `,
      [status, actor.userId, cleanOptional(reason), expenseId]
    );
    const row = requireSingleRow(result.rows, "expense");
    await writeTexAuditEvent(client, actor, `tex.expense.${status}`, "tex_expense", row.id, {
      status
    });
    await deliverExpenseStatusWhatsappReply(client, actor, row.id, status);

    return mapExpense(row);
  });
}
