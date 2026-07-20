import { createHash, randomBytes } from "node:crypto";
import { assertPermission, type RoleKey } from "@torrevie/permissions";
import type { SupabaseClient } from "@supabase/supabase-js";

const supportAccessMinutes = 30;

export type SupportAccessLaunch = {
  sessionId: string;
  url: string;
  expiresAt: string;
};

type RoleRow = {
  roles: { key: string } | Array<{ key: string }> | null;
};

type SessionRow = {
  id: string;
  expires_at: string;
};

export async function createSupportAccessLaunch(
  client: SupabaseClient,
  input: {
    tenantId: string;
    actorUserId: string;
    reason: string;
    customerPortalBaseUrl?: string | null;
  }
): Promise<SupportAccessLaunch> {
  assertUuid(input.tenantId, "tenant id");
  assertUuid(input.actorUserId, "actor user id");
  const reason = cleanRequired(input.reason, "Support reason");
  const roles = await listPlatformRoles(client, input.actorUserId);

  assertPermission({
    roles,
    permission: "platform.support_access.grant"
  });

  await ensureLocalReviewActor(client, input.actorUserId);
  await assertTenantExists(client, input.tenantId);

  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + supportAccessMinutes * 60 * 1000).toISOString();
  const { data, error } = await client
    .from("support_access_sessions")
    .insert({
      tenant_id: input.tenantId,
      actor_user_id: input.actorUserId,
      token_hash: tokenHash,
      reason,
      expires_at: expiresAt,
      created_by: input.actorUserId,
      updated_by: input.actorUserId
    })
    .select("id,expires_at")
    .single();

  if (error) {
    throw new Error(`Unable to create support access session: ${error.message}`);
  }

  const row = data as SessionRow;
  await writeSupportAuditEvent(client, input.tenantId, input.actorUserId, "support_access.created", row.id, {
    reason,
    expires_at: row.expires_at
  });

  return {
    sessionId: row.id,
    expiresAt: row.expires_at,
    url: `${customerPortalBaseUrl(input.customerPortalBaseUrl)}/support-access/accept?token=${encodeURIComponent(token)}`
  };
}

async function listPlatformRoles(client: SupabaseClient, actorUserId: string): Promise<RoleKey[]> {
  if (process.env.ADMIN_LOCAL_REVIEW_BYPASS === "true" && actorUserId === "00000000-0000-4000-8000-000000000001") {
    return ["torrevie_platform_admin"];
  }

  const { data, error } = await client
    .from("user_role_assignments")
    .select("roles(key)")
    .eq("user_id", actorUserId);

  if (error) {
    throw new Error(`Unable to resolve platform roles: ${error.message}`);
  }

  return ((data ?? []) as RoleRow[])
    .flatMap((row) => {
      const roles = Array.isArray(row.roles) ? row.roles : row.roles ? [row.roles] : [];
      return roles.map((role) => role.key);
    })
    .filter(isRoleKey);
}

async function ensureLocalReviewActor(client: SupabaseClient, actorUserId: string) {
  if (process.env.ADMIN_LOCAL_REVIEW_BYPASS !== "true" || actorUserId !== "00000000-0000-4000-8000-000000000001") {
    return;
  }

  const { error } = await client.from("users").upsert(
    {
      id: actorUserId,
      email: "local-review@torrevie.test",
      status: "active"
    },
    { onConflict: "id" }
  );

  if (error) {
    throw new Error(`Unable to prepare local support actor: ${error.message}`);
  }
}

async function assertTenantExists(client: SupabaseClient, tenantId: string) {
  const { error } = await client.from("tenants").select("id").eq("id", tenantId).single();

  if (error) {
    throw new Error(`Unable to resolve tenant for support access: ${error.message}`);
  }
}

async function writeSupportAuditEvent(
  client: SupabaseClient,
  tenantId: string,
  actorUserId: string,
  action: string,
  sessionId: string,
  metadata: Record<string, string>
) {
  const { error } = await client.from("audit_events").insert({
    tenant_id: tenantId,
    actor_user_id: actorUserId,
    action,
    target_type: "support_access_session",
    target_id: sessionId,
    metadata
  });

  if (error) {
    throw new Error(`Unable to write support access audit event: ${error.message}`);
  }
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function customerPortalBaseUrl(value: string | null | undefined) {
  const configured =
    value?.trim() ||
    process.env.CUSTOMER_PORTAL_URL?.trim() ||
    process.env.NEXT_PUBLIC_CUSTOMER_PORTAL_URL?.trim() ||
    (process.env.NODE_ENV === "production" ? "https://app.torrevie.com" : "http://localhost:3000");

  return configured.replace(/\/+$/, "");
}

function cleanRequired(value: string, label: string) {
  const trimmed = value.trim();
  if (trimmed.length < 3) {
    throw new Error(`${label} must be at least 3 characters.`);
  }
  return trimmed;
}

function assertUuid(value: string, label: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(`Invalid ${label}.`);
  }
}

function isRoleKey(value: string): value is RoleKey {
  return [
    "torrevie_platform_admin",
    "torrevie_operations_admin",
    "torrevie_support_agent",
    "torrevie_billing_admin",
    "torrevie_security_admin",
    "customer_admin",
    "customer_module_admin",
    "customer_manager",
    "customer_standard_user",
    "customer_readonly",
    "integration_service"
  ].includes(value);
}
