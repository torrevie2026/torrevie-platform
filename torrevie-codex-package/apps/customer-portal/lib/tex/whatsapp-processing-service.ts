import { withTenantContext, type TenantQueryClient } from "@torrevie/tenant-context";
import type { TexReceiptExtraction } from "../tex-ai";
import { assertTexPermission } from "./access";
import { writeTexAuditEvent } from "./audit";
import { findDuplicateExpense } from "./duplicate-detection";
import type { TexUnregisteredWhatsappSubmissionRow, TexWebhookSubmissionRow } from "./db-types";
import { sanitizeWebhookSubmission } from "./expense-input";
import { getTexIntegrationSettingsForProcessing } from "./integration-settings-queries";
import { createTexEmployeeProfileFromWhatsapp, getTexEmployeeProfile } from "./people-queries";
import {
  extractionForWhatsappReviewSubmission,
  extractReceiptForSubmission
} from "./receipt-extraction";
import { assertUuid, cleanOptional, cleanRequired, requireSingleRow } from "./shared";
import { buildWhatsappReceiptSubmittedReply, classifyWhatsappMessage } from "./whatsapp-messages";
import { buildWhatsappStatusReply, deliverTexWhatsappReply } from "./whatsapp-delivery";
import {
  findEmployeeBySubmissionSender,
  findEmployeeIdForSubmissionRow,
  listEmployeePhoneMatchRows
} from "./whatsapp-senders";
import { insertWhatsappSubmission, sanitizeSubmissionStatusFilter } from "./whatsapp-submissions";
import {
  defaultReceiptCurrency,
  hasReceiptAttachmentForOcr,
  missingReceiptAttachmentError,
  resolveWhatsappExpenseFields
} from "./whatsapp-receipts";
import {
  createExpenseFromWhatsappReceipt,
  insertResolvedWhatsappExpense
} from "./whatsapp-expenses";
import { buildReceiptBatchResult, mapUnregisteredWhatsappSubmission } from "./whatsapp-review";
import type {
  TexActorContext,
  TexExpenseRecord,
  TexUnregisteredWhatsappResolveInput,
  TexUnregisteredWhatsappResolveResult,
  TexUnregisteredWhatsappSubmission,
  TexWebhookSubmissionInput,
  TexWebhookSubmissionRecord,
  TexWhatsappReceiptResult
} from "./types";

export async function processTexWhatsappSubmission(
  client: TenantQueryClient,
  actor: TexActorContext,
  input: TexWebhookSubmissionInput
): Promise<TexWhatsappReceiptResult> {
  assertTexPermission(actor, "tex.integration.manage");
  const submission = sanitizeWebhookSubmission(input);
  const messageType = classifyWhatsappMessage(submission);

  if (messageType === "status") {
    return withTenantContext(client, actor, async () => {
      const replyText = await buildWhatsappStatusReply(client, submission.senderPhone);
      const row = await insertWhatsappSubmission(client, actor, submission, {
        messageType,
        ocrStatus: "not_applicable",
        ocrResult: {},
        replyText
      });
      const delivery = await deliverTexWhatsappReply(client, actor, submission, replyText, row.id);

      return { submission: row, replyText, expense: null, ocrStatus: "not_applicable", delivery };
    });
  }

  return withTenantContext(client, actor, async () => {
    const settings = await getTexIntegrationSettingsForProcessing(client);
    const employee = await findEmployeeBySubmissionSender(client, submission);
    const { extraction, extractions, extractionError, multipleReceipts } =
      await extractReceiptForSubmission(client, submission);
    const missingReceiptAttachment =
      messageType === "receipt" && !hasReceiptAttachmentForOcr(submission);

    if (!employee) {
      const replyText = missingReceiptAttachment
        ? "Receipt message received, but TEX could not access the image or PDF attachment. Please resend the receipt as a photo or PDF attachment."
        : "Receipt received, but this WhatsApp number is not enrolled for TEX. Please ask your tenant admin to enroll your number.";
      const row = await insertWhatsappSubmission(client, actor, submission, {
        messageType,
        ocrStatus: "manual_review",
        ocrResult: extraction ?? {},
        ocrError: missingReceiptAttachment
          ? missingReceiptAttachmentError(submission)
          : extractionError,
        replyText
      });
      const delivery = await deliverTexWhatsappReply(client, actor, submission, replyText, row.id);

      return { submission: row, replyText, expense: null, ocrStatus: "manual_review", delivery };
    }

    if (missingReceiptAttachment) {
      const replyText =
        "Receipt message received, but TEX could not access the image or PDF attachment. Please resend the receipt as a photo or PDF attachment. Status: waiting for receipt attachment.";
      const row = await insertWhatsappSubmission(client, actor, submission, {
        messageType,
        ocrStatus: "manual_review",
        ocrResult: extraction ?? {},
        ocrError: missingReceiptAttachmentError(submission),
        replyText,
        resolvedEmployeeProfileId: employee.id
      });
      const delivery = await deliverTexWhatsappReply(client, actor, submission, replyText, row.id);

      return { submission: row, replyText, expense: null, ocrStatus: "manual_review", delivery };
    }

    if (!settings.ai_receipt_extraction_enabled) {
      const replyText =
        "Receipt received. AI extraction is disabled for your company, so the finance team will review it manually.";
      const row = await insertWhatsappSubmission(client, actor, submission, {
        messageType,
        ocrStatus: "manual_review",
        ocrResult: extraction ?? {},
        ocrError: extractionError,
        replyText,
        resolvedEmployeeProfileId: employee.id
      });
      const delivery = await deliverTexWhatsappReply(client, actor, submission, replyText, row.id);

      return { submission: row, replyText, expense: null, ocrStatus: "manual_review", delivery };
    }

    if (multipleReceipts) {
      const replyText = `Receipt PDF received. TEX detected ${extractions.length} separate receipts and sent them for manager review before creating expenses.`;
      const row = await insertWhatsappSubmission(client, actor, submission, {
        messageType,
        ocrStatus: "manual_review",
        ocrResult: buildReceiptBatchResult(extractions),
        ocrError: extractionError,
        replyText,
        resolvedEmployeeProfileId: employee.id
      });
      const delivery = await deliverTexWhatsappReply(client, actor, submission, replyText, row.id);

      return {
        submission: row,
        replyText,
        expense: null,
        expenses: [],
        ocrStatus: "manual_review",
        delivery
      };
    }

    const extractionForProcessing = defaultReceiptCurrency(extraction);

    const hasCompleteExtraction = Boolean(
      extractionForProcessing?.expenseDate &&
        extractionForProcessing.amount &&
        extractionForProcessing.currency
    );
    const duplicateExtraction = hasCompleteExtraction ? extractionForProcessing : null;
    const duplicate =
      settings.duplicate_detection_enabled && duplicateExtraction
        ? await findDuplicateExpense(client, employee.id, duplicateExtraction)
        : null;
    const shouldAutoReject = Boolean(duplicate && settings.duplicate_auto_reject_enabled);
    const expense = await createExpenseFromWhatsappReceipt(client, actor, {
      employee,
      extraction: extractionForProcessing,
      submission,
      duplicate,
      shouldAutoReject
    });
    const replyText = buildWhatsappReceiptSubmittedReply({
      extraction: extractionForProcessing,
      duplicate,
      extractionError,
      shouldAutoReject
    });
    const row = await insertWhatsappSubmission(client, actor, submission, {
      messageType,
      ocrStatus: hasCompleteExtraction ? "extracted" : extractionError ? "failed" : "manual_review",
      ocrResult: extractionForProcessing ?? extraction ?? {},
      ocrError: extractionError,
      replyText,
      resolvedExpenseId: expense.id,
      resolvedEmployeeProfileId: employee.id
    });
    const delivery = await deliverTexWhatsappReply(client, actor, submission, replyText, row.id);

    await writeTexAuditEvent(
      client,
      actor,
      "tex.whatsapp.receipt_processed",
      "tex_expense",
      expense.id,
      {
        duplicate_status: duplicate ? (shouldAutoReject ? "duplicate" : "suspected") : "clear"
      }
    );

    return {
      submission: row,
      replyText,
      expense,
      ocrStatus: hasCompleteExtraction ? "extracted" : extractionError ? "failed" : "manual_review",
      delivery
    };
  });
}

export async function listTexUnregisteredWhatsappSubmissions(
  client: TenantQueryClient,
  actor: TexActorContext,
  status: "open" | "resolved" | "ignored" | "all" = "open"
): Promise<TexUnregisteredWhatsappSubmission[]> {
  assertTexPermission(actor, "tex.receipt.review");
  const normalizedStatus = sanitizeSubmissionStatusFilter(status);

  return withTenantContext(client, actor, async () => {
    const result = await client.query<TexUnregisteredWhatsappSubmissionRow>(
      `
        select
          id,
          sender_raw,
          sender_phone,
          whatsapp_chat_jid,
          message_id,
          session_id,
          message_text,
          receipt_file_id,
          media_url,
          media_mime_type,
          message_type,
          ocr_status,
          ocr_result,
          ocr_error,
          payload,
          whatsapp_reply_text,
          status,
          resolved_expense_id,
          resolved_employee_profile_id,
          resolved_at::text as resolved_at,
          created_at::text as created_at
        from public.tex_unregistered_whatsapp_submissions
        where tenant_id = public.current_tenant_id()
          and ($1::text is null or status = $1)
        order by created_at desc
        limit 100
      `,
      [normalizedStatus === "all" ? null : normalizedStatus]
    );

    const employees = await listEmployeePhoneMatchRows(client);

    return result.rows.map((row) =>
      mapUnregisteredWhatsappSubmission({
        ...row,
        resolved_employee_profile_id:
          row.resolved_employee_profile_id ?? findEmployeeIdForSubmissionRow(row, employees)
      })
    );
  });
}

export async function ignoreTexUnregisteredWhatsappSubmission(
  client: TenantQueryClient,
  actor: TexActorContext,
  submissionId: string,
  reason?: string | null
): Promise<TexWebhookSubmissionRecord> {
  assertTexPermission(actor, "tex.receipt.review");
  assertUuid(submissionId, "WhatsApp submission id");

  return withTenantContext(client, actor, async () => {
    const result = await client.query<TexWebhookSubmissionRow>(
      `
        update public.tex_unregistered_whatsapp_submissions
           set status = 'ignored',
               resolved_by = $1,
               resolved_at = now(),
               updated_by = $1
         where tenant_id = public.current_tenant_id()
           and id = $2
           and status = 'open'
        returning id, status
      `,
      [actor.userId, submissionId]
    );
    const row = requireSingleRow(result.rows, "WhatsApp submission");

    await writeTexAuditEvent(
      client,
      actor,
      "tex.whatsapp_submission.ignored",
      "tex_unregistered_whatsapp_submission",
      row.id,
      {
        reason: cleanOptional(reason) ?? ""
      }
    );

    return {
      id: row.id,
      status: row.status
    };
  });
}

export async function resolveTexUnregisteredWhatsappSubmission(
  client: TenantQueryClient,
  actor: TexActorContext,
  submissionId: string,
  input: TexUnregisteredWhatsappResolveInput
): Promise<TexUnregisteredWhatsappResolveResult> {
  assertTexPermission(actor, "tex.receipt.review");
  assertUuid(submissionId, "WhatsApp submission id");

  return withTenantContext(client, actor, async () => {
    const submission = requireSingleRow(
      (
        await client.query<TexUnregisteredWhatsappSubmissionRow>(
          `
            select
              id,
              sender_raw,
              sender_phone,
              whatsapp_chat_jid,
              message_id,
              session_id,
              message_text,
              receipt_file_id,
              media_url,
              media_mime_type,
              message_type,
              ocr_status,
              ocr_result,
              ocr_error,
              payload,
              whatsapp_reply_text,
              status,
              resolved_expense_id,
              resolved_employee_profile_id,
              resolved_at::text as resolved_at,
              created_at::text as created_at
            from public.tex_unregistered_whatsapp_submissions
            where tenant_id = public.current_tenant_id()
              and id = $1
            limit 1
          `,
          [submissionId]
        )
      ).rows,
      "WhatsApp submission"
    );

    if (submission.status !== "open") {
      throw new Error("This WhatsApp submission has already been resolved.");
    }

    const employee =
      input.mode === "existing_employee"
        ? await getTexEmployeeProfile(
            client,
            cleanRequired(input.employeeProfileId, "Employee profile")
          )
        : await createTexEmployeeProfileFromWhatsapp(client, actor, {
            name: cleanRequired(input.employeeName, "Employee name"),
            phoneNumber:
              input.phoneNumber ?? submission.sender_phone ?? submission.sender_raw ?? "",
            department: input.department
          });
    const { extraction, extractions, extractionError, multipleReceipts } =
      await extractionForWhatsappReviewSubmission(client, submission);
    if (extraction || extractions.length > 0 || extractionError) {
      await client.query(
        `
          update public.tex_unregistered_whatsapp_submissions
             set ocr_status = $1,
                 ocr_result = $2::jsonb,
                 ocr_error = $3,
                 updated_by = $4,
                 updated_at = now()
           where tenant_id = public.current_tenant_id()
             and id = $5
        `,
        [
          extraction ? (multipleReceipts ? "manual_review" : "extracted") : "failed",
          JSON.stringify(
            multipleReceipts ? buildReceiptBatchResult(extractions) : (extraction ?? {})
          ),
          extractionError,
          actor.userId,
          submission.id
        ]
      );
    }
    const reviewExtractions =
      extractions.length > 0
        ? extractions
        : [extraction].filter((item): item is TexReceiptExtraction => Boolean(item));
    const expenses: TexExpenseRecord[] = [];
    const settings = await getTexIntegrationSettingsForProcessing(client);

    for (const candidate of reviewExtractions.length > 0 ? reviewExtractions : [null]) {
      const resolved = resolveWhatsappExpenseFields(submission, candidate);
      const duplicate =
        settings.duplicate_detection_enabled &&
        candidate?.expenseDate &&
        candidate.amount &&
        candidate.currency
          ? await findDuplicateExpense(client, employee.id, candidate)
          : null;
      const shouldAutoReject = Boolean(duplicate && settings.duplicate_auto_reject_enabled);
      expenses.push(
        await insertResolvedWhatsappExpense(client, actor, {
          submission,
          employee,
          duplicate,
          shouldAutoReject,
          extraction: candidate,
          ...resolved
        })
      );
    }

    const expense = expenses[0];
    if (!expense) {
      throw new Error("Unable to create expense from WhatsApp submission.");
    }
    const updated = requireSingleRow(
      (
        await client.query<TexWebhookSubmissionRow>(
          `
            update public.tex_unregistered_whatsapp_submissions
               set status = 'resolved',
                   resolved_expense_id = $1,
                   resolved_employee_profile_id = $2,
                   resolved_by = $3,
                   resolved_at = now(),
                   updated_by = $3
             where tenant_id = public.current_tenant_id()
               and id = $4
            returning id, status
          `,
          [expense.id, employee.id, actor.userId, submission.id]
        )
      ).rows,
      "WhatsApp submission"
    );

    await writeTexAuditEvent(
      client,
      actor,
      "tex.whatsapp_submission.resolved",
      "tex_unregistered_whatsapp_submission",
      submission.id,
      {
        expense_id: expense.id,
        employee_profile_id: employee.id,
        expense_count: `${expenses.length}`
      }
    );
    const rejectedCount = expenses.filter((item) => item.status === "rejected").length;
    const replyText =
      rejectedCount > 0
        ? rejectedCount === expenses.length
          ? `${expenses.length} receipt${expenses.length === 1 ? "" : "s"} reviewed and auto-rejected as likely duplicate${expenses.length === 1 ? "" : "s"}.`
          : `${expenses.length} receipts reviewed and linked to ${employee.name}. ${rejectedCount} duplicate receipt${rejectedCount === 1 ? "" : "s"} auto-rejected; the rest are pending manager approval.`
        : expenses.length > 1
          ? `${expenses.length} receipts reviewed and linked to ${employee.name}. They are now pending manager approval.`
          : `Receipt reviewed and linked to ${employee.name}. It is now pending manager approval.`;
    const delivery = await deliverTexWhatsappReply(
      client,
      actor,
      {
        senderRaw: submission.sender_raw,
        senderPhone: submission.sender_phone,
        whatsappChatJid: submission.whatsapp_chat_jid
      },
      replyText,
      submission.id
    );

    return {
      submission: updated,
      employee,
      expense,
      expenses,
      delivery
    };
  });
}
