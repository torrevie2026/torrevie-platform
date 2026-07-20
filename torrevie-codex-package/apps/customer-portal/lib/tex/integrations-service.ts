import { randomUUID } from "node:crypto";
import { withTenantContext, type TenantQueryClient } from "@torrevie/tenant-context";
import { assertTexPermission } from "./access";
import { writeTexAuditEvent } from "./audit";
import type {
  TexIntegrationSettingsRow,
  TexProviderProfileSummaryRow,
  TexQuickConnectSessionRow
} from "./db-types";
import {
  mapIntegrationSettings,
  mapProviderProfileSummary,
  mapQuickConnectSession
} from "./mappers";
import {
  isTexQuickConnectConnectorActive,
  listTexQuickConnectWorkspace,
  recordQuickConnectEvent
} from "./quick-connect";
import { receiptBucketName } from "./receipt-storage";
import { requireSingleRow } from "./shared";
import type { TexActorContext, TexIntegrationWorkspace, TexQuickConnectSession } from "./types";

export async function listTexIntegrationWorkspace(
  client: TenantQueryClient,
  actor: TexActorContext
): Promise<TexIntegrationWorkspace> {
  assertTexPermission(actor, "tex.integration.manage");

  return withTenantContext(client, actor, async () => {
    const settings = await client.query<TexIntegrationSettingsRow>(
      `
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
        `
    );
    const providerProfiles = await client.query<TexProviderProfileSummaryRow>(
      `
          select
            id,
            label,
            provider,
            status,
            is_default,
            webhook_url,
            api_key_last4,
            keys_configured
          from public.tenant_whatsapp_provider_profiles
          where tenant_id = public.current_tenant_id()
          order by is_default desc, label asc
        `
    );
    const quickConnect = await listTexQuickConnectWorkspace(client);
    const profiles = providerProfiles.rows.map(mapProviderProfileSummary);

    return {
      settings: settings.rows[0] ? mapIntegrationSettings(settings.rows[0]) : null,
      providerProfiles: profiles,
      defaultProviderProfile: profiles.find((profile) => profile.isDefault) ?? null,
      quickConnect,
      receiptStorage: {
        bucket: receiptBucketName(),
        pathPrefix: `tenant/${actor.tenantId}/tex/receipts/`,
        convention: "tenant/{tenant_id}/tex/receipts/{file_id}.{extension}"
      }
    };
  });
}

export async function startTexQuickConnectPairing(
  client: TenantQueryClient,
  actor: TexActorContext
): Promise<TexQuickConnectSession> {
  assertTexPermission(actor, "tex.integration.manage");
  if (!isTexQuickConnectConnectorActive()) {
    const error = new Error("Quick Connect connector is offline.");
    (error as Error & { statusCode?: number }).statusCode = 503;
    throw error;
  }

  return withTenantContext(client, actor, async () => {
    const pairingCode = randomUUID();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const result = await client.query<TexQuickConnectSessionRow>(
      `
        insert into public.tex_quick_connect_sessions (
          tenant_id,
          status,
          pairing_code,
          qr_code_data,
          qr_expires_at,
          connected_phone,
          connected_at,
          last_seen_at,
          error,
          created_by,
          updated_by
        )
        values (
          public.current_tenant_id(),
          'qr_pending',
          $1,
          null,
          $2,
          null,
          null,
          null,
          null,
          $3,
          $3
        )
        on conflict (tenant_id)
        do update set
          status = 'qr_pending',
          pairing_code = excluded.pairing_code,
          qr_code_data = null,
          qr_expires_at = excluded.qr_expires_at,
          connected_phone = null,
          connected_at = null,
          error = null,
          updated_by = excluded.updated_by,
          updated_at = now()
        returning
          id,
          status,
          pairing_code,
          qr_code_data,
          qr_expires_at::text as qr_expires_at,
          connected_phone,
          connected_at::text as connected_at,
          last_seen_at::text as last_seen_at,
          error,
          updated_at::text as updated_at
      `,
      [pairingCode, expiresAt, actor.userId]
    );
    const session = mapQuickConnectSession(requireSingleRow(result.rows, "Quick Connect session"));

    await recordQuickConnectEvent(client, actor, session.id, {
      eventType: "quick_connect.pairing_requested",
      status: session.status,
      message: "Pairing QR request queued for the WhatsApp linked-device connector.",
      metadata: {
        qr_expires_at: expiresAt
      }
    });
    await writeTexAuditEvent(
      client,
      actor,
      "tex.quick_connect.pairing_requested",
      "tex_quick_connect_session",
      session.id,
      {
        status: session.status,
        qr_expires_at: expiresAt
      }
    );

    return session;
  });
}

export async function disconnectTexQuickConnect(
  client: TenantQueryClient,
  actor: TexActorContext
): Promise<TexQuickConnectSession> {
  assertTexPermission(actor, "tex.integration.manage");

  return withTenantContext(client, actor, async () => {
    const result = await client.query<TexQuickConnectSessionRow>(
      `
        insert into public.tex_quick_connect_sessions (
          tenant_id,
          status,
          pairing_code,
          qr_code_data,
          qr_expires_at,
          connected_phone,
          connected_at,
          last_seen_at,
          error,
          created_by,
          updated_by
        )
        values (
          public.current_tenant_id(),
          'disconnected',
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          $1,
          $1
        )
        on conflict (tenant_id)
        do update set
          status = 'disconnected',
          pairing_code = null,
          qr_code_data = null,
          qr_expires_at = null,
          connected_phone = null,
          connected_at = null,
          error = null,
          updated_by = excluded.updated_by,
          updated_at = now()
        returning
          id,
          status,
          pairing_code,
          qr_code_data,
          qr_expires_at::text as qr_expires_at,
          connected_phone,
          connected_at::text as connected_at,
          last_seen_at::text as last_seen_at,
          error,
          updated_at::text as updated_at
      `,
      [actor.userId]
    );
    const session = mapQuickConnectSession(requireSingleRow(result.rows, "Quick Connect session"));

    await recordQuickConnectEvent(client, actor, session.id, {
      eventType: "quick_connect.disconnected",
      status: session.status,
      message: "Quick Connect linked-device session was disconnected from TEX.",
      metadata: {}
    });
    await writeTexAuditEvent(
      client,
      actor,
      "tex.quick_connect.disconnected",
      "tex_quick_connect_session",
      session.id,
      {
        status: session.status
      }
    );

    return session;
  });
}
