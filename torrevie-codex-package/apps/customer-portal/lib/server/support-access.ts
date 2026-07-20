import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import type { ResolvedTenantContext } from "@torrevie/tenant-context";
import { queryServerDatabase } from "./tenant-query-client";

export const supportAccessCookieName = "torrevie_support_access";

export type SupportAccessSession = {
  id: string;
  tenantId: string;
  actorUserId: string;
  actorEmail: string;
  reason: string;
  expiresAt: string;
};

type SupportAccessRow = {
  id: string;
  tenant_id: string;
  actor_user_id: string;
  actor_email: string;
  reason: string;
  expires_at: string;
};

export async function acceptSupportAccessToken(token: string): Promise<SupportAccessSession> {
  const session = await findActiveSupportAccessSession(token);

  await queryServerDatabase(
    `
      update public.support_access_sessions
         set last_used_at = now(),
             updated_by = actor_user_id
       where id = $1
    `,
    [session.id]
  );
  await writeSupportAuditEvent(session, "support_access.accepted");
  const cookieStore = await cookies();
  cookieStore.set(supportAccessCookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(session.expiresAt)
  });

  return session;
}

export async function getActiveSupportAccessSession(): Promise<SupportAccessSession | null> {
  const token = (await cookies()).get(supportAccessCookieName)?.value;
  if (!token) return null;

  return findActiveSupportAccessSession(token).catch(async () => {
    await clearSupportAccessCookie();
    return null;
  });
}

export async function clearSupportAccessCookie() {
  (await cookies()).delete(supportAccessCookieName);
}

export function supportAccessTenantContext(session: SupportAccessSession): ResolvedTenantContext {
  return {
    tenantId: session.tenantId,
    userId: session.actorUserId,
    roleScope: "platform"
  };
}

async function findActiveSupportAccessSession(token: string): Promise<SupportAccessSession> {
  const tokenHash = hashToken(token);
  const result = await queryServerDatabase<SupportAccessRow>(
    `
      select
        sas.id,
        sas.tenant_id,
        sas.actor_user_id,
        u.email as actor_email,
        sas.reason,
        sas.expires_at::text
      from public.support_access_sessions sas
      join public.users u on u.id = sas.actor_user_id
      where sas.token_hash = $1
        and sas.status = 'active'
        and sas.expires_at > now()
      limit 1
    `,
    [tokenHash]
  );
  const row = result.rows[0];

  if (!row) {
    throw new Error("Support access session is invalid or expired.");
  }

  return {
    id: row.id,
    tenantId: row.tenant_id,
    actorUserId: row.actor_user_id,
    actorEmail: row.actor_email,
    reason: row.reason,
    expiresAt: row.expires_at
  };
}

async function writeSupportAuditEvent(session: SupportAccessSession, action: string) {
  await queryServerDatabase(
    `
      insert into public.audit_events (tenant_id, actor_user_id, action, target_type, target_id, metadata)
      values ($1, $2, $3, 'support_access_session', $4, $5::jsonb)
    `,
    [
      session.tenantId,
      session.actorUserId,
      action,
      session.id,
      JSON.stringify({
        reason: session.reason,
        expires_at: session.expiresAt
      })
    ]
  );
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
