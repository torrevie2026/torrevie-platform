import { createHmac, timingSafeEqual } from "node:crypto";
import type { QueryValue, TenantQueryClient } from "@torrevie/tenant-context";
import {
  defaultTexPlanContext,
  processTexWhatsappSubmission,
  type TexActorContext,
  type TexWebhookSubmissionInput
} from "./tex";

export type TexWebhookProvider = "ultramsg" | "wappfly" | "meta";

export type TexWebhookRequest = {
  provider: string;
  method: string;
  url: string;
  headers: Headers;
  bodyText: string;
};

export type TexWebhookResponse = {
  status: number;
  body: unknown;
};

type ResolvedWebhookTenant = {
  tenantId: string;
  actorUserId: string;
  webhookVerifyToken: string | null;
  appSecret: string | null;
};

type NormalizedWebhookMessage =
  | {
      process: true;
      submission: TexWebhookSubmissionInput;
    }
  | {
      process: false;
      skipped: string;
    };

export async function handleTexWebhookRequest(
  client: TenantQueryClient,
  request: TexWebhookRequest
): Promise<TexWebhookResponse> {
  const provider = parseProvider(request.provider);
  const url = new URL(request.url);

  if (provider === "meta" && request.method === "GET") {
    return verifyMetaChallenge(client, url);
  }

  if (request.method === "OPTIONS") {
    return json(200, { ok: true });
  }

  if (request.method !== "POST") {
    return json(405, { error: "Unsupported TEX webhook method." });
  }

  const payload = parseJsonBody(request.bodyText);
  const tenant = await resolveWebhookTenant(client, provider, payload);

  await verifyWebhookAuthenticity(client, provider, tenant, request);

  const normalized = normalizeWebhookMessage(provider, payload);
  if (!normalized.process) {
    return json(200, { ok: true, skipped: normalized.skipped });
  }

  const actor: TexActorContext = {
    tenantId: tenant.tenantId,
    userId: tenant.actorUserId,
    roleScope: "customer",
    roles: ["integration_service"],
    entitledProducts: ["tex"],
    texPlan: defaultTexPlanContext(),
    integrationPermissions: ["tex.integration.manage"]
  };
  const result = await processTexWhatsappSubmission(client, actor, normalized.submission);

  return json(200, {
    ok: true,
    status: result.submission.status,
    submissionId: result.submission.id,
    replyText: result.replyText,
    expense: result.expense,
    ocrStatus: result.ocrStatus
  });
}

function parseProvider(value: string): TexWebhookProvider {
  if (value === "ultramsg" || value === "wappfly" || value === "meta") {
    return value;
  }

  throw statusError(404, "Unknown TEX webhook provider.");
}

async function verifyMetaChallenge(client: TenantQueryClient, url: URL) {
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode !== "subscribe" || !token || !challenge) {
    return json(400, { error: "Invalid Meta webhook verification request." });
  }

  const tenant = await resolveTenantByVerifyToken(client, token, "meta");
  if (!tenant) {
    return json(403, { error: "Meta webhook verification failed." });
  }

  return {
    status: 200,
    body: challenge
  };
}

async function resolveWebhookTenant(
  client: TenantQueryClient,
  provider: TexWebhookProvider,
  payload: Record<string, unknown>
): Promise<ResolvedWebhookTenant> {
  const providerIdentifier = providerIdentifierFromPayload(provider, payload);
  const query = webhookTenantQuery(provider, providerIdentifier);
  const result = await client.query<WebhookTenantRow>(query.sql, query.values);
  const row = result.rows[0];

  if (!row?.actor_user_id) {
    throw statusError(202, `TEX ${provider} webhook could not be mapped to a tenant.`);
  }

  return mapWebhookTenant(row);
}

async function resolveTenantByVerifyToken(
  client: TenantQueryClient,
  token: string,
  provider: TexWebhookProvider
): Promise<ResolvedWebhookTenant | null> {
  const result = await client.query<WebhookTenantRow>(
    `
      select
        tis.tenant_id,
        coalesce(tis.updated_by, tis.created_by, actor.user_id) as actor_user_id,
        verify_secret.secret_value as webhook_verify_token,
        app_secret.secret_value as app_secret
      from public.tex_integration_settings tis
      join public.tenant_integration_secrets verify_secret
        on verify_secret.tenant_id = tis.tenant_id
       and verify_secret.product_key = 'tex'
       and verify_secret.integration_key = 'whatsapp'
       and verify_secret.secret_name = 'webhook_verify_token'
       and verify_secret.secret_value = $1
      left join public.tenant_integration_secrets app_secret
        on app_secret.tenant_id = tis.tenant_id
       and app_secret.product_key = 'tex'
       and app_secret.integration_key = 'whatsapp'
       and app_secret.secret_name = 'app_secret'
      left join lateral (
        select tm.user_id
        from public.tenant_memberships tm
        where tm.tenant_id = tis.tenant_id
          and tm.status = 'active'
        order by tm.joined_at desc nulls last, tm.created_at desc
        limit 1
      ) actor on true
      where tis.whatsapp_provider = $2
      limit 1
    `,
    [token, provider]
  );
  const row = result.rows[0];

  return row?.actor_user_id ? mapWebhookTenant(row) : null;
}

function webhookTenantQuery(
  provider: TexWebhookProvider,
  providerIdentifier: string | null
): { sql: string; values: QueryValue[] } {
  const providerPredicate = providerIdentifier
    ? `
        and (
          ($1 = 'ultramsg' and tis.whatsapp_instance_id = $2)
          or ($1 = 'wappfly' and tis.wappfly_session_id = $2)
          or ($1 = 'meta' and tis.meta_phone_number_id = $2)
        )
      `
    : "";

  return {
    sql: `
      select
        tis.tenant_id,
        coalesce(tis.updated_by, tis.created_by, actor.user_id) as actor_user_id,
        verify_secret.secret_value as webhook_verify_token,
        app_secret.secret_value as app_secret
      from public.tex_integration_settings tis
      left join public.tenant_integration_secrets verify_secret
        on verify_secret.tenant_id = tis.tenant_id
       and verify_secret.product_key = 'tex'
       and verify_secret.integration_key = 'whatsapp'
       and verify_secret.secret_name = 'webhook_verify_token'
      left join public.tenant_integration_secrets app_secret
        on app_secret.tenant_id = tis.tenant_id
       and app_secret.product_key = 'tex'
       and app_secret.integration_key = 'whatsapp'
       and app_secret.secret_name = 'app_secret'
      left join lateral (
        select tm.user_id
        from public.tenant_memberships tm
        where tm.tenant_id = tis.tenant_id
          and tm.status = 'active'
        order by tm.joined_at desc nulls last, tm.created_at desc
        limit 1
      ) actor on true
      where tis.whatsapp_provider = $1
      ${providerPredicate}
      order by tis.updated_at desc
      limit 1
    `,
    values: providerIdentifier ? [provider, providerIdentifier] : [provider]
  };
}

async function verifyWebhookAuthenticity(
  client: TenantQueryClient,
  provider: TexWebhookProvider,
  tenant: ResolvedWebhookTenant,
  request: TexWebhookRequest
) {
  if (provider === "meta") {
    if (!tenant.appSecret) {
      throw statusError(401, "Meta webhook app secret is not configured.");
    }

    const signature = request.headers.get("x-hub-signature-256") ?? "";
    if (!verifyMetaSignature(request.bodyText, tenant.appSecret, signature)) {
      throw statusError(401, "Meta webhook signature verification failed.");
    }
    return;
  }

  const token = readWebhookToken(request);
  const resolvedToken =
    !tenant.webhookVerifyToken && token
      ? await resolveTenantByVerifyToken(client, token, provider)
      : null;

  if (!tenant.webhookVerifyToken && resolvedToken?.tenantId === tenant.tenantId) {
    return;
  }

  if (!tenant.webhookVerifyToken || !secureEqual(token, tenant.webhookVerifyToken)) {
    throw statusError(401, `TEX ${provider} webhook token verification failed.`);
  }
}

function normalizeWebhookMessage(
  provider: TexWebhookProvider,
  payload: Record<string, unknown>
): NormalizedWebhookMessage {
  if (provider === "wappfly") {
    return normalizeWappflyMessage(payload);
  }

  if (provider === "ultramsg") {
    return normalizeUltramsgMessage(payload);
  }

  return normalizeMetaMessage(payload);
}

function normalizeWappflyMessage(payload: Record<string, unknown>): NormalizedWebhookMessage {
  const event = readString(payload.event);
  if (event && event !== "messages.received") {
    return { process: false, skipped: event };
  }

  const message = readRecord(readRecord(payload.data).messages);
  const key = readRecord(message.key);
  if (key.fromMe === true) {
    return { process: false, skipped: "from_me" };
  }

  const senderRaw = firstString(key.cleanedSenderPn, key.senderPn, key.remoteJid);
  const senderPhone = normalizeWhatsappPhone(senderRaw);
  if (!senderPhone) {
    return { process: false, skipped: "no_sender" };
  }

  const messageNode = readRecord(message.message);
  const image = readRecord(messageNode.imageMessage);
  const messageText =
    firstString(
      messageNode.conversation,
      readRecord(messageNode.extendedTextMessage).text,
      message.messageBody
    ) ?? null;

  return {
    process: true,
    submission: {
      senderRaw,
      senderPhone,
      whatsappChatJid: readString(key.remoteJid),
      messageId: readString(key.id),
      sessionId: firstString(readRecord(payload.session).id, payload.sessionId),
      messageText,
      mediaUrl: firstString(image.url, image.directPath),
      mediaMimeType: readString(image.mimetype),
      payload
    }
  };
}

function normalizeUltramsgMessage(payload: Record<string, unknown>): NormalizedWebhookMessage {
  const data = readRecord(payload.data);
  if (data.fromMe === true) {
    return { process: false, skipped: "from_me" };
  }

  const senderRaw = firstString(data.from, data.author);
  const senderPhone = normalizeWhatsappPhone(senderRaw);
  if (!senderPhone) {
    return { process: false, skipped: "no_sender" };
  }

  return {
    process: true,
    submission: {
      senderRaw,
      senderPhone,
      whatsappChatJid: readString(data.chatId) ?? readString(data.from),
      messageId: firstString(data.id, data.messageId),
      sessionId: firstString(payload.instanceId, data.instanceId),
      messageText: readString(data.body),
      mediaUrl: firstString(data.media, data.mediaUrl, readRecord(data.attachment).url),
      mediaMimeType: firstString(data.mimetype, data.mimeType),
      payload
    }
  };
}

function normalizeMetaMessage(payload: Record<string, unknown>): NormalizedWebhookMessage {
  const value = firstMetaChangeValue(payload);
  const statuses = readArray(value.statuses);
  if (statuses.length > 0) {
    return { process: false, skipped: "status_update" };
  }

  const message = readRecord(readArray(value.messages)[0]);
  if (Object.keys(message).length === 0) {
    return { process: false, skipped: "no_message" };
  }

  const senderPhone = normalizeWhatsappPhone(message.from);
  if (!senderPhone) {
    return { process: false, skipped: "no_sender" };
  }

  const image = readRecord(message.image);
  return {
    process: true,
    submission: {
      senderRaw: readString(message.from),
      senderPhone,
      whatsappChatJid: readString(readRecord(value.metadata).phone_number_id),
      messageId: readString(message.id),
      sessionId: readString(readRecord(value.metadata).phone_number_id),
      messageText: readString(readRecord(message.text).body),
      mediaUrl: readString(image.id),
      mediaMimeType: readString(image.mime_type),
      payload
    }
  };
}

function providerIdentifierFromPayload(
  provider: TexWebhookProvider,
  payload: Record<string, unknown>
): string | null {
  if (provider === "wappfly") {
    return firstString(readRecord(payload.session).id, payload.sessionId);
  }

  if (provider === "ultramsg") {
    const data = readRecord(payload.data);
    return firstString(payload.instanceId, data.instanceId);
  }

  return readString(readRecord(firstMetaChangeValue(payload).metadata).phone_number_id);
}

function firstMetaChangeValue(payload: Record<string, unknown>): Record<string, unknown> {
  const entry = readRecord(readArray(payload.entry)[0]);
  const change = readRecord(readArray(entry.changes)[0]);
  return readRecord(change.value);
}

function readWebhookToken(request: TexWebhookRequest) {
  const url = new URL(request.url);
  return (
    url.searchParams.get("token") ??
    request.headers.get("x-webhook-token") ??
    request.headers.get("x-ultramsg-token") ??
    request.headers.get("x-wappfly-token") ??
    ""
  );
}

function verifyMetaSignature(bodyText: string, appSecret: string, signatureHeader: string) {
  const signature = signatureHeader.startsWith("sha256=")
    ? signatureHeader.slice("sha256=".length)
    : "";
  if (!signature || !/^[a-f0-9]+$/i.test(signature)) {
    return false;
  }

  const expected = createHmac("sha256", appSecret).update(bodyText).digest("hex");
  return secureEqual(signature, expected);
}

function secureEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function normalizeWhatsappPhone(value: unknown) {
  const raw = readString(value);
  if (!raw) {
    return null;
  }

  const withoutJid = raw.replace(/@(c|s)\.whatsapp\.net$/i, "").replace(/@c\.us$/i, "");
  const digits = withoutJid.replace(/\D/g, "");
  return digits ? `+${digits}` : null;
}

function mapWebhookTenant(row: WebhookTenantRow): ResolvedWebhookTenant {
  return {
    tenantId: row.tenant_id,
    actorUserId: row.actor_user_id,
    webhookVerifyToken: row.webhook_verify_token,
    appSecret: row.app_secret
  };
}

function parseJsonBody(bodyText: string) {
  try {
    return JSON.parse(bodyText || "{}") as Record<string, unknown>;
  } catch {
    throw statusError(400, "TEX webhook body must be valid JSON.");
  }
}

function json(status: number, body: unknown): TexWebhookResponse {
  return { status, body };
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    const text = readString(value);
    if (text) {
      return text;
    }
  }

  return null;
}

function statusError(statusCode: number, message: string) {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = statusCode;
  return error;
}

type WebhookTenantRow = {
  tenant_id: string;
  actor_user_id: string;
  webhook_verify_token: string | null;
  app_secret: string | null;
};
