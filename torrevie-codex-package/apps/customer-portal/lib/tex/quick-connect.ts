import type { TenantQueryClient } from "@torrevie/tenant-context";
import type { TexQuickConnectEventRow, TexQuickConnectSessionRow } from "./db-types";
import { mapQuickConnectEvent, mapQuickConnectSession } from "./mappers";
import type { TexActorContext, TexIntegrationWorkspace } from "./types";

export async function listTexQuickConnectWorkspace(
  client: TenantQueryClient
): Promise<TexIntegrationWorkspace["quickConnect"]> {
  try {
    const sessionResult = await client.query<TexQuickConnectSessionRow>(
      `
          select
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
          from public.tex_quick_connect_sessions
          where tenant_id = public.current_tenant_id()
          limit 1
        `
    );
    const eventResult = await client.query<TexQuickConnectEventRow>(
      `
          select
            id,
            event_type,
            direction,
            status,
            message,
            occurred_at::text as occurred_at
          from public.tex_quick_connect_events
          where tenant_id = public.current_tenant_id()
            and event_type <> 'quick_connect.connector_heartbeat'
          order by occurred_at desc
          limit 8
        `
    );

    return {
      available: true,
      connectorActive: isTexQuickConnectConnectorActive(),
      session: sessionResult.rows[0] ? mapQuickConnectSession(sessionResult.rows[0]) : null,
      events: eventResult.rows.map(mapQuickConnectEvent)
    };
  } catch (error) {
    if (isMissingQuickConnectSchemaError(error)) {
      return {
        available: false,
        connectorActive: false,
        session: null,
        events: []
      };
    }

    throw error;
  }
}

export function isTexQuickConnectConnectorActive() {
  return process.env.TEX_QUICK_CONNECT_CONNECTOR_ACTIVE === "true";
}

export async function recordQuickConnectEvent(
  client: TenantQueryClient,
  actor: TexActorContext,
  sessionId: string,
  event: {
    eventType: string;
    status: string | null;
    message: string;
    metadata: Record<string, string>;
  }
) {
  await client.query(
    `
      insert into public.tex_quick_connect_events (
        tenant_id,
        session_id,
        event_type,
        direction,
        status,
        message,
        metadata,
        created_by
      )
      values (
        public.current_tenant_id(),
        $1::uuid,
        $2,
        'system',
        $3,
        $4,
        $5::jsonb,
        $6::uuid
      )
    `,
    [
      sessionId,
      event.eventType,
      event.status,
      event.message,
      JSON.stringify(event.metadata),
      actor.userId
    ]
  );
}

function isMissingQuickConnectSchemaError(error: unknown) {
  const record = error as { code?: unknown; message?: unknown };
  const message = typeof record.message === "string" ? record.message : "";

  return (
    record.code === "42P01" ||
    message.includes("tex_quick_connect_sessions") ||
    message.includes("tex_quick_connect_events")
  );
}
