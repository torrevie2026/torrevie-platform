import type { TenantQueryClient } from "@torrevie/tenant-context";
import { writeTexAuditEvent } from "./audit";
import type { TexWebhookSubmissionRow } from "./db-types";
import { cleanOptional, requireSingleRow } from "./shared";
import type {
  TexActorContext,
  TexWebhookSubmissionInput,
  TexWebhookSubmissionRecord,
  TexWhatsappReceiptResult
} from "./types";

export function sanitizeSubmissionStatusFilter(value: "open" | "resolved" | "ignored" | "all") {
  if (value === "open" || value === "resolved" || value === "ignored" || value === "all") {
    return value;
  }

  throw new Error(`Unsupported WhatsApp submission status: ${String(value)}`);
}

export async function insertWhatsappSubmission(
  client: TenantQueryClient,
  actor: TexActorContext,
  submission: Required<TexWebhookSubmissionInput>,
  options: {
    messageType: "receipt" | "status" | "text";
    ocrStatus: TexWhatsappReceiptResult["ocrStatus"];
    ocrResult: unknown;
    ocrError?: string | null;
    replyText: string;
    resolvedExpenseId?: string | null;
    resolvedEmployeeProfileId?: string | null;
  }
): Promise<TexWebhookSubmissionRecord> {
  const result = await client.query<TexWebhookSubmissionRow>(
    `
      insert into public.tex_unregistered_whatsapp_submissions (
        tenant_id,
        sender_raw,
        sender_phone,
        whatsapp_chat_jid,
        message_id,
        session_id,
        message_text,
        receipt_file_id,
        message_type,
        media_url,
        media_mime_type,
        ocr_status,
        ocr_result,
        ocr_error,
        whatsapp_reply_text,
        payload,
        status,
        resolved_expense_id,
        resolved_employee_profile_id,
        resolved_by,
        resolved_at,
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
        $7::uuid,
        $8,
        $9,
        $10,
        $11,
        $12::jsonb,
        $13,
        $14,
        $15::jsonb,
        $16,
        $17::uuid,
        $18::uuid,
        $19::uuid,
        case when $16::text = 'resolved' then now() else null end,
        $19::uuid,
        $19::uuid
      )
      on conflict (tenant_id, message_id)
      where message_id is not null
      do update set
        payload = excluded.payload,
        receipt_file_id = excluded.receipt_file_id,
        message_type = excluded.message_type,
        media_url = excluded.media_url,
        media_mime_type = excluded.media_mime_type,
        ocr_status = excluded.ocr_status,
        ocr_result = excluded.ocr_result,
        ocr_error = excluded.ocr_error,
        whatsapp_reply_text = excluded.whatsapp_reply_text,
        status = excluded.status,
        resolved_expense_id = excluded.resolved_expense_id,
        resolved_employee_profile_id = excluded.resolved_employee_profile_id,
        resolved_by = excluded.resolved_by,
        resolved_at = excluded.resolved_at,
        updated_by = excluded.updated_by,
        updated_at = now()
      returning id, status
    `,
    [
      submission.senderRaw,
      submission.senderPhone,
      submission.whatsappChatJid,
      submission.messageId,
      submission.sessionId,
      submission.messageText,
      submission.receiptFileId,
      options.messageType,
      submission.mediaUrl,
      submission.mediaMimeType,
      options.ocrStatus,
      JSON.stringify(options.ocrResult),
      cleanOptional(options.ocrError),
      options.replyText,
      JSON.stringify(submission.payload),
      options.resolvedExpenseId ? "resolved" : "open",
      options.resolvedExpenseId ?? null,
      options.resolvedEmployeeProfileId ?? null,
      actor.userId
    ]
  );
  const row = requireSingleRow(result.rows, "webhook submission");

  await writeTexAuditEvent(
    client,
    actor,
    "tex.webhook.submission_recorded",
    "tex_unregistered_whatsapp_submission",
    row.id,
    {
      provider: "whatsapp",
      message_id: submission.messageId ?? ""
    }
  );

  return {
    id: row.id,
    status: row.status
  };
}
