import { createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
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
  reason: string;
  expires_at: string;
};

type UserRow = {
  email: string;
};

let serviceClient: SupabaseClient | null = null;

export async function acceptSupportAccessToken(token: string): Promise<SupportAccessSession> {
  const session = await findActiveSupportAccessSession(token);

  const client = getSupabaseServiceClient();
  const { error: updateError } = await client
    .from("support_access_sessions")
    .update({
      last_used_at: new Date().toISOString(),
      updated_by: session.actorUserId
    })
    .eq("id", session.id);

  if (updateError) {
    throw new Error(`Unable to mark support access session as used: ${updateError.message}`);
  }

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
  const client = getSupabaseServiceClient();
  const { data: row, error } = await client
    .from("support_access_sessions")
    .select("id,tenant_id,actor_user_id,reason,expires_at")
    .eq("token_hash", tokenHash)
    .eq("status", "active")
    .gt("expires_at", new Date().toISOString())
    .maybeSingle<SupportAccessRow>();

  if (error || !row) {
    throw new Error("Support access session is invalid or expired.");
  }

  const { data: user, error: userError } = await client
    .from("users")
    .select("email")
    .eq("id", row.actor_user_id)
    .maybeSingle<UserRow>();

  if (userError || !user) {
    throw new Error("Support access actor could not be resolved.");
  }

  return {
    id: row.id,
    tenantId: row.tenant_id,
    actorUserId: row.actor_user_id,
    actorEmail: user.email,
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

function getSupabaseServiceClient() {
  if (serviceClient) {
    return serviceClient;
  }

  const url = process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !key) {
    throw new Error("Supabase service environment variables are not configured for support access.");
  }

  serviceClient = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  return serviceClient;
}
