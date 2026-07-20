import { withTenantContext, type TenantQueryClient } from "@torrevie/tenant-context";
import { assertTexPermission } from "./access";
import { writeTexAuditEvent } from "./audit";
import type { TexWebhookSubmissionRow } from "./db-types";
import { sanitizeWebhookSubmission } from "./expense-input";
import { classifyWhatsappMessage } from "./whatsapp-messages";
import { requireSingleRow } from "./shared";
import type {
  TexActorContext,
  TexWebhookSubmissionInput,
  TexWebhookSubmissionRecord
} from "./types";

export async function recordTexWebhookSubmission(
  client: TenantQueryClient,
  actor: TexActorContext,
  input: TexWebhookSubmissionInput
): Promise<TexWebhookSubmissionRecord> {
  assertTexPermission(actor, "tex.integration.manage");
  const submission = sanitizeWebhookSubmission(input);

  return withTenantContext(client, actor, async () => {
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
          payload,
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
          $12::jsonb,
          $13,
          $13
        )
        on conflict (tenant_id, message_id)
        where message_id is not null
        do update set
          payload = excluded.payload,
          receipt_file_id = excluded.receipt_file_id,
          message_type = excluded.message_type,
          media_url = excluded.media_url,
          media_mime_type = excluded.media_mime_type,
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
        classifyWhatsappMessage(submission),
        submission.mediaUrl,
        submission.mediaMimeType,
        "manual_review",
        JSON.stringify(submission.payload),
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
  });
}
