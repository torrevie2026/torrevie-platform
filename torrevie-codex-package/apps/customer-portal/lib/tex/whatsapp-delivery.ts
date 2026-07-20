import { dispatchWhatsAppNotification, type WhatsAppDispatchResult } from "@torrevie/notifications";
import type { TenantQueryClient } from "@torrevie/tenant-context";
import { writeTexAuditEvent } from "./audit";
import type { TexWhatsappExpenseStatusReplyRow } from "./db-types";
import { getTexWhatsappNotificationSettings } from "./integration-settings-queries";
import { findEmployeeByPhone } from "./whatsapp-senders";
import { buildExpenseStatusReply, isQuickConnectSubmissionPayload } from "./whatsapp-messages";
import { formatMoney, requireSingleRow } from "./shared";
import type { TexActorContext, TexExpenseStatus, TexWebhookSubmissionInput } from "./types";

let texWhatsappNotificationDispatcher = dispatchWhatsAppNotification;

export function setTexWhatsappNotificationDispatcherForTest(
  dispatcher: typeof dispatchWhatsAppNotification | null
) {
  texWhatsappNotificationDispatcher = dispatcher ?? dispatchWhatsAppNotification;
}

export async function deliverTexWhatsappReply(
  client: TenantQueryClient,
  actor: TexActorContext,
  submission: Pick<TexWebhookSubmissionInput, "senderPhone" | "senderRaw" | "whatsappChatJid">,
  replyText: string,
  submissionId: string
): Promise<WhatsAppDispatchResult | null> {
  const to = submission.senderPhone ?? submission.senderRaw ?? submission.whatsappChatJid ?? null;

  if (!to || !replyText.trim()) {
    return null;
  }

  const settings = await getTexWhatsappNotificationSettings(client);
  const result = settings
    ? await texWhatsappNotificationDispatcher({
        provider: settings.whatsapp_provider,
        to,
        message: replyText,
        apiKey: settings.api_key,
        instanceId: settings.whatsapp_instance_id,
        wappflySessionId: settings.wappfly_session_id,
        metaPhoneNumberId: settings.meta_phone_number_id
      })
    : {
        ok: false,
        provider: "ultramsg" as const,
        status: "skipped" as const,
        messageId: null,
        error: "TEX WhatsApp integration is not configured.",
        httpStatus: null
      };

  await writeTexAuditEvent(
    client,
    actor,
    `tex.notification.whatsapp_reply_${result.status}`,
    "tex_unregistered_whatsapp_submission",
    submissionId,
    {
      provider: result.provider,
      message_id: result.messageId ?? "",
      error: result.error ?? "",
      http_status: result.httpStatus === null ? "" : String(result.httpStatus)
    }
  );

  return result;
}

export async function deliverExpenseStatusWhatsappReply(
  client: TenantQueryClient,
  actor: TexActorContext,
  expenseId: string,
  status: Exclude<TexExpenseStatus, "pending">
) {
  const result = await client.query<TexWhatsappExpenseStatusReplyRow>(
    `
      select
        s.id as submission_id,
        s.sender_raw,
        s.sender_phone,
        s.whatsapp_chat_jid,
        s.session_id,
        s.payload,
        e.vendor,
        e.amount::float as amount,
        e.currency,
        e.expense_date::text as expense_date
      from public.tex_unregistered_whatsapp_submissions s
      join public.tex_expenses e
        on e.tenant_id = s.tenant_id
       and e.id = s.resolved_expense_id
      where s.tenant_id = public.current_tenant_id()
        and s.resolved_expense_id = $1
      order by s.resolved_at desc nulls last, s.created_at desc
      limit 1
    `,
    [expenseId]
  );
  const row = result.rows[0];
  if (!row) {
    return null;
  }

  const replyText = buildExpenseStatusReply(row, status);
  if (isQuickConnectSubmissionPayload(row.payload)) {
    await enqueueQuickConnectOutboundMessage(client, actor, row, replyText, expenseId);
    return null;
  }

  return deliverTexWhatsappReply(
    client,
    actor,
    {
      senderRaw: row.sender_raw,
      senderPhone: row.sender_phone,
      whatsappChatJid: row.whatsapp_chat_jid
    },
    replyText,
    row.submission_id
  );
}

export async function buildWhatsappStatusReply(client: TenantQueryClient, phone: string | null) {
  const employee = await findEmployeeByPhone(client, phone);

  if (!employee) {
    return "No TEX employee profile is enrolled for this WhatsApp number.";
  }

  const result = await client.query<{ status: TexExpenseStatus; count: number; total: number }>(
    `
      select status, count(*)::int as count, coalesce(sum(amount), 0)::float as total
      from public.tex_expenses
      where tenant_id = public.current_tenant_id()
        and employee_profile_id = $1
      group by status
    `,
    [employee.id]
  );
  const totals = new Map(result.rows.map((row) => [row.status, row]));
  const pending = totals.get("pending");
  const approved = totals.get("approved");
  const rejected = totals.get("rejected");
  const paid = totals.get("paid");

  return [
    `TEX status for ${employee.name}:`,
    `Pending: ${pending?.count ?? 0} (${formatMoney(pending?.total ?? 0, "AED")})`,
    `Approved: ${approved?.count ?? 0} (${formatMoney(approved?.total ?? 0, "AED")})`,
    `Rejected: ${rejected?.count ?? 0} (${formatMoney(rejected?.total ?? 0, "AED")})`,
    `Paid: ${paid?.count ?? 0} (${formatMoney(paid?.total ?? 0, "AED")})`
  ].join("\n");
}

async function enqueueQuickConnectOutboundMessage(
  client: TenantQueryClient,
  actor: TexActorContext,
  row: Pick<
    TexWhatsappExpenseStatusReplyRow,
    "submission_id" | "session_id" | "sender_phone" | "whatsapp_chat_jid"
  >,
  messageText: string,
  expenseId: string
) {
  const result = await client.query<{ id: string }>(
    `
      insert into public.tex_quick_connect_outbox (
        tenant_id,
        session_id,
        submission_id,
        expense_id,
        recipient_phone,
        whatsapp_chat_jid,
        message_text,
        created_by,
        updated_by
      )
      values (
        public.current_tenant_id(),
        $1::uuid,
        $2::uuid,
        $3::uuid,
        $4,
        $5,
        $6,
        $7::uuid,
        $7::uuid
      )
      returning id
    `,
    [
      row.session_id,
      row.submission_id,
      expenseId,
      row.sender_phone,
      row.whatsapp_chat_jid,
      messageText,
      actor.userId
    ]
  );
  const outbox = requireSingleRow(result.rows, "Quick Connect outbox message");

  await writeTexAuditEvent(
    client,
    actor,
    "tex.quick_connect.outbound_queued",
    "tex_unregistered_whatsapp_submission",
    row.submission_id,
    {
      expense_id: expenseId,
      outbox_id: outbox.id
    }
  );
}
