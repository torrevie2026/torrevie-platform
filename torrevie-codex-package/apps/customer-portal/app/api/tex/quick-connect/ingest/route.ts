import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import {
  processTexWhatsappSubmission,
  uploadTexReceiptFile,
  type TexActorContext,
  type TexWebhookSubmissionInput
} from "../../../../../lib/tex";
import { PostgresTenantQueryClient } from "../../../../../lib/server/tenant-query-client";

export const runtime = "nodejs";

type QuickConnectIngestBody = {
  tenantId?: string;
  senderRaw?: string | null;
  senderPhone?: string | null;
  whatsappChatJid?: string | null;
  messageId?: string | null;
  sessionId?: string | null;
  messageText?: string | null;
  media?: {
    dataBase64?: string | null;
    fileName?: string | null;
    mimeType?: string | null;
  } | null;
  payload?: Record<string, unknown>;
};

const INTEGRATION_ACTOR_USER_ID = "00000000-0000-4000-8000-000000000000";

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const body = (await request.json()) as QuickConnectIngestBody;
    const tenantId = assertUuid(body.tenantId, "tenant id");
    const client = new PostgresTenantQueryClient(INTEGRATION_ACTOR_USER_ID);
    const actorUserId = await resolveIntegrationActorUserId(client, tenantId);
    const actor: TexActorContext = {
      tenantId,
      userId: actorUserId,
      roleScope: "customer",
      roles: ["integration_service"],
      entitledProducts: ["tex"],
      integrationPermissions: ["tex.expense.submit", "tex.integration.manage"]
    };
    const media = body.media?.dataBase64
      ? await uploadTexReceiptFile(client, actor, {
          contentType: body.media.mimeType ?? "image/jpeg",
          dataBase64: body.media.dataBase64,
          fileName: body.media.fileName ?? "whatsapp-receipt"
        })
      : null;
    const mediaUrl =
      body.media?.dataBase64 && body.media.mimeType
        ? `data:${body.media.mimeType};base64,${body.media.dataBase64}`
        : null;
    const submission: TexWebhookSubmissionInput = {
      senderRaw: body.senderRaw ?? body.senderPhone ?? null,
      senderPhone: body.senderPhone ?? null,
      whatsappChatJid: body.whatsappChatJid ?? null,
      messageId: body.messageId ?? null,
      sessionId: body.sessionId ?? null,
      messageText: body.messageText ?? null,
      receiptFileId: media?.id ?? null,
      mediaUrl,
      mediaMimeType: body.media?.mimeType ?? null,
      payload: {
        ...(body.payload ?? {}),
        quick_connect: true,
        receipt_file_id: media?.id ?? null
      }
    };
    const result = await processTexWhatsappSubmission(client, actor, submission);

    return NextResponse.json(
      {
        ok: true,
        delivery: result.delivery,
        expense: result.expense,
        ocrStatus: result.ocrStatus,
        receipt: media,
        replyText: result.replyText,
        submission: result.submission
      },
      { status: 201 }
    );
  } catch (error) {
    const status = error instanceof Error && "statusCode" in error ? Number(error.statusCode) : 400;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Quick Connect ingest failed." },
      { status: Number.isInteger(status) && status >= 400 && status < 600 ? status : 400 }
    );
  }
}

async function resolveIntegrationActorUserId(client: PostgresTenantQueryClient, tenantId: string) {
  const result = await client.query<{ user_id: string }>(
    `
      select tm.user_id
      from public.tenant_memberships tm
      join public.users u on u.id = tm.user_id
      where tm.tenant_id = $1
        and tm.status = 'active'
        and u.status = 'active'
      order by tm.joined_at desc nulls last, tm.created_at desc
      limit 1
    `,
    [tenantId]
  );
  const userId = result.rows[0]?.user_id;

  if (!userId) {
    throw new Error("No active tenant user is available for Quick Connect ingest.");
  }

  return userId;
}

function isAuthorized(request: Request) {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";

  if (!serviceRoleKey || !token) {
    return false;
  }

  const left = Buffer.from(token);
  const right = Buffer.from(serviceRoleKey);
  return left.length === right.length && timingSafeEqual(left, right);
}

function assertUuid(value: string | null | undefined, label: string) {
  if (!value || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(`Invalid ${label}.`);
  }

  return value;
}
