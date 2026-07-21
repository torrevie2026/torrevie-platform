import type { TenantQueryClient } from "@torrevie/tenant-context";
import type { TexReceiptExtraction } from "../tex-ai";
import type {
  TexDuplicateCandidateRow,
  TexEmployeeProfileRow,
  TexExpenseRow,
  TexUnregisteredWhatsappSubmissionRow
} from "./db-types";
import { mapExpense } from "./mappers";
import { parseIsoDate, requireSingleRow } from "./shared";
import type {
  TexActorContext,
  TexEmployeeProfile,
  TexExpenseRecord,
  TexWebhookSubmissionInput
} from "./types";
import { resolveKnownSenderWhatsappExpenseFields } from "./whatsapp-receipts";

export async function createExpenseFromWhatsappReceipt(
  client: TenantQueryClient,
  actor: TexActorContext,
  input: {
    employee: TexEmployeeProfileRow;
    extraction: TexReceiptExtraction | null;
    submission: Required<TexWebhookSubmissionInput>;
    duplicate: TexDuplicateCandidateRow | null;
    shouldAutoReject: boolean;
  }
): Promise<TexExpenseRecord> {
  const resolved = resolveKnownSenderWhatsappExpenseFields(input.submission, input.extraction);
  const duplicateStatus = input.duplicate
    ? input.shouldAutoReject
      ? "duplicate"
      : "suspected"
    : "clear";
  const duplicateReason = input.duplicate
    ? `Matched ${duplicateDescription(input.duplicate)} on tenant, date, amount, and currency.`
    : null;
  const result = await client.query<TexExpenseRow>(
    `
      insert into public.tex_expenses (
        tenant_id,
        submitter_user_id,
        employee_profile_id,
        employee_name,
        employee_phone,
        whatsapp_chat_jid,
        vendor,
        expense_date,
        amount,
        currency,
        category,
        notes,
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
        status,
        rejected_by,
        rejected_at,
        rejected_reason,
        created_by,
        updated_by
      )
      values (
        public.current_tenant_id(),
        $1::uuid,
        $2::uuid,
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
        $14::uuid,
        'whatsapp',
        'whatsapp_ai',
        $15,
        $16::jsonb,
        $17,
        $18::uuid,
        $19,
        $20,
        $21,
        case when $21::text = 'rejected' then $1::uuid else null end,
        case when $21::text = 'rejected' then now() else null end,
        case when $21::text = 'rejected' then $19::text else null end,
        $1::uuid,
        $1::uuid
      )
      returning id, status, amount::float as amount, currency
    `,
    [
      actor.userId,
      input.employee.id,
      input.employee.name,
      input.employee.phone_number,
      input.submission.whatsappChatJid,
      resolved.vendor,
      resolved.expenseDate,
      resolved.amount,
      resolved.currency,
      input.extraction?.category ?? null,
      resolved.notes,
      input.extraction?.taxIdNumber ?? null,
      input.extraction?.taxAmount ?? null,
      input.submission.receiptFileId,
      input.extraction?.confidence ?? 0,
      JSON.stringify(input.extraction ?? {}),
      duplicateStatus,
      input.duplicate?.id ?? null,
      duplicateReason,
      Boolean((input.duplicate && !input.shouldAutoReject) || resolved.requiresManualReview),
      input.shouldAutoReject ? "rejected" : "pending"
    ]
  );
  const row = requireSingleRow(result.rows, "expense");

  return mapExpense(row);
}

export async function insertResolvedWhatsappExpense(
  client: TenantQueryClient,
  actor: TexActorContext,
  input: {
    submission: TexUnregisteredWhatsappSubmissionRow;
    employee: TexEmployeeProfile;
    duplicate: TexDuplicateCandidateRow | null;
    shouldAutoReject: boolean;
    extraction: TexReceiptExtraction | null;
    vendor: string | null;
    expenseDate: string;
    amount: number;
    currency: string;
    notes: string;
  }
): Promise<TexExpenseRecord> {
  const duplicateStatus = input.duplicate
    ? input.shouldAutoReject
      ? "duplicate"
      : "suspected"
    : "clear";
  const duplicateReason = input.duplicate
    ? `Possible duplicate of ${duplicateDescription(input.duplicate)} on ${input.duplicate.expense_date} for ${input.duplicate.currency} ${input.duplicate.amount}.`
    : null;
  const policyReason = [
    "Receipt came from an unregistered WhatsApp number and was assigned by a reviewer.",
    duplicateReason
  ]
    .filter(Boolean)
    .join(" ");
  const result = await client.query<TexExpenseRow>(
    `
      insert into public.tex_expenses (
        tenant_id,
        submitter_user_id,
        employee_profile_id,
        employee_name,
        employee_phone,
        whatsapp_chat_jid,
        vendor,
        expense_date,
        amount,
        currency,
        base_amount,
        category,
        payment_method,
        notes,
        tax_id_number,
        tax_amount,
        receipt_file_id,
        status,
        rejected_by,
        rejected_at,
        rejected_reason,
        source,
        extraction_source,
        extraction_confidence,
        extraction_payload,
        duplicate_status,
        duplicate_of_expense_id,
        duplicate_reason,
        policy_flag,
        policy_flag_reason,
        manager_review_required,
        created_by,
        updated_by
      )
      values (
        public.current_tenant_id(),
        $1::uuid,
        $2::uuid,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        $8,
        $10,
        $11,
        $12,
        $13,
        $14,
        $15::uuid,
        $22,
        case when $22::text = 'rejected' then $1::uuid else null end,
        case when $22::text = 'rejected' then now() else null end,
        case when $22::text = 'rejected' then $20::text else null end,
        'whatsapp',
        'whatsapp_ai',
        $16,
        $17::jsonb,
        $18,
        $19::uuid,
        $20,
        true,
        $21,
        $23,
        $1::uuid,
        $1::uuid
      )
      returning id, status, amount::float as amount, currency
    `,
    [
      actor.userId,
      input.employee.id,
      input.employee.name,
      input.employee.phoneNumber,
      input.submission.whatsapp_chat_jid,
      input.vendor,
      parseIsoDate(input.expenseDate, "expense date"),
      input.amount,
      input.currency,
      input.extraction?.category ?? "Receipt",
      null,
      input.notes,
      input.extraction?.taxIdNumber ?? null,
      input.extraction?.taxAmount ?? null,
      input.submission.receipt_file_id,
      input.extraction?.confidence ?? null,
      JSON.stringify(input.extraction ?? {}),
      duplicateStatus,
      input.duplicate?.id ?? null,
      duplicateReason,
      policyReason,
      input.shouldAutoReject ? "rejected" : "pending",
      Boolean((input.duplicate && !input.shouldAutoReject) || input.amount === 0.01)
    ]
  );

  return mapExpense(requireSingleRow(result.rows, "expense"));
}

function duplicateDescription(duplicate: TexDuplicateCandidateRow) {
  const vendor = duplicate.vendor ?? "existing receipt";
  const employee = duplicate.employee_name?.trim();
  return employee ? `${vendor} submitted by ${employee}` : vendor;
}
