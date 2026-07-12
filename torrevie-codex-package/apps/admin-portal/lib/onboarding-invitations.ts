import type { SupabaseClient } from "@supabase/supabase-js";
import { Resend } from "resend";

export type TenantAdminInvitation = {
  tenantId: string;
  tenantName: string;
  email: string;
  userId: string;
  actionLink: string;
};

type TenantInviteRow = {
  id: string;
  name: string;
  billing_email: string | null;
};

type RoleRow = {
  id: string;
};

export async function ensureTenantAdminInvitation(
  client: SupabaseClient,
  tenantId: string,
  actorUserId: string
): Promise<TenantAdminInvitation> {
  assertUuid(tenantId, "tenant id");
  assertUuid(actorUserId, "actor user id");

  const tenant = await getTenantForInvitation(client, tenantId);
  const email = sanitizeEmail(tenant.billing_email);
  const { userId, actionLink } = await createSupabaseInviteLink(client, email);

  await upsertPlatformUser(client, userId, email, actorUserId);
  await upsertTenantMembership(client, tenant.id, userId, actorUserId);
  await upsertCustomerAdminRole(client, tenant.id, userId, actorUserId);
  await writeInvitationAuditEvent(client, tenant.id, actorUserId, "tenant.admin_invitation.created", userId, {
    email,
    role: "customer_admin"
  });

  return {
    tenantId: tenant.id,
    tenantName: tenant.name,
    email,
    userId,
    actionLink
  };
}

export async function sendTenantAdminInvitationEmail(
  client: SupabaseClient,
  tenantId: string,
  actorUserId: string
): Promise<void> {
  const invitation = await ensureTenantAdminInvitation(client, tenantId, actorUserId);
  const resendApiKey = process.env.RESEND_API_KEY ?? process.env.EMAIL_PROVIDER_API_KEY;

  if (!resendApiKey) {
    throw new Error("Resend API key is not configured.");
  }

  const resend = new Resend(resendApiKey);
  const from = process.env.RESEND_FROM_EMAIL ?? process.env.EMAIL_FROM_ADDRESS ?? "Torrevie <hello@torrevie.com>";
  const { error } = await resend.emails.send({
    from,
    to: invitation.email,
    subject: `Your Torrevie invitation for ${invitation.tenantName}`,
    html: renderInvitationHtml(invitation),
    text: renderInvitationText(invitation)
  });

  if (error) {
    throw new Error(`Unable to send onboarding email: ${error.message}`);
  }

  await writeInvitationAuditEvent(client, invitation.tenantId, actorUserId, "tenant.admin_invitation.sent", invitation.userId, {
    email: invitation.email,
    provider: "resend"
  });
}

async function getTenantForInvitation(client: SupabaseClient, tenantId: string) {
  const { data, error } = await client
    .from("tenants")
    .select("id,name,billing_email")
    .eq("id", tenantId)
    .single();

  if (error) {
    throw new Error(`Unable to load tenant for invitation: ${error.message}`);
  }

  return data as TenantInviteRow;
}

async function createSupabaseInviteLink(client: SupabaseClient, email: string) {
  const redirectTo = `${customerPortalUrl()}/login`;
  const { data, error } = await client.auth.admin.generateLink({
    type: "invite",
    email,
    options: {
      redirectTo
    }
  });

  if (error) {
    throw new Error(`Unable to create Supabase invitation link: ${error.message}`);
  }

  const userId = data.user?.id;
  const actionLink = data.properties?.action_link;

  if (!userId || !actionLink) {
    throw new Error("Supabase did not return a complete invitation link.");
  }

  return {
    userId,
    actionLink
  };
}

async function upsertPlatformUser(client: SupabaseClient, userId: string, email: string, actorUserId: string) {
  const { data: existingUser, error: existingError } = await client
    .from("users")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Unable to check invited user: ${existingError.message}`);
  }

  if (existingUser && existingUser.id !== userId) {
    throw new Error("A platform user already exists for this email with a different Auth identity.");
  }

  const { error } = await client.from("users").upsert(
    {
      id: userId,
      email,
      updated_by: actorUserId,
      created_by: actorUserId
    },
    {
      onConflict: "id"
    }
  );

  if (error) {
    throw new Error(`Unable to create invited platform user: ${error.message}`);
  }
}

async function upsertTenantMembership(client: SupabaseClient, tenantId: string, userId: string, actorUserId: string) {
  const { error } = await client.from("tenant_memberships").upsert(
    {
      tenant_id: tenantId,
      user_id: userId,
      status: "invited",
      invited_by: actorUserId,
      created_by: actorUserId,
      updated_by: actorUserId
    },
    {
      onConflict: "tenant_id,user_id"
    }
  );

  if (error) {
    throw new Error(`Unable to create invited tenant membership: ${error.message}`);
  }
}

async function upsertCustomerAdminRole(client: SupabaseClient, tenantId: string, userId: string, actorUserId: string) {
  const { data, error } = await client.from("roles").select("id").eq("key", "customer_admin").single();

  if (error) {
    throw new Error(`Unable to load customer admin role: ${error.message}`);
  }

  const role = data as RoleRow;
  const { error: assignmentError } = await client.from("user_role_assignments").upsert(
    {
      tenant_id: tenantId,
      user_id: userId,
      role_id: role.id,
      assigned_by: actorUserId,
      created_by: actorUserId,
      updated_by: actorUserId
    },
    {
      onConflict: "tenant_id,user_id,role_id"
    }
  );

  if (assignmentError) {
    throw new Error(`Unable to assign invited customer admin role: ${assignmentError.message}`);
  }
}

async function writeInvitationAuditEvent(
  client: SupabaseClient,
  tenantId: string,
  actorUserId: string,
  action: string,
  targetId: string,
  metadata: Record<string, string>
) {
  const { error } = await client.from("audit_events").insert({
    tenant_id: tenantId,
    actor_user_id: actorUserId,
    action,
    target_type: "user",
    target_id: targetId,
    metadata
  });

  if (error) {
    throw new Error(`Unable to write invitation audit event: ${error.message}`);
  }
}

function renderInvitationHtml(invitation: TenantAdminInvitation) {
  const portalUrl = customerPortalUrl();

  return `
    <div style="font-family: Inter, Arial, sans-serif; color: #162449; line-height: 1.5;">
      <h1 style="font-size: 22px;">Welcome to Torrevie</h1>
      <p>You have been invited as the customer administrator for ${escapeHtml(invitation.tenantName)}.</p>
      <p>Accept the invitation, set your password, then open ${escapeHtml(portalUrl)} to start using your workspace.</p>
      <p>
        <a href="${escapeHtml(invitation.actionLink)}" style="background: #0D9488; color: #FFFFFF; padding: 12px 18px; text-decoration: none; border-radius: 6px; display: inline-block;">
          Accept invitation and set password
        </a>
      </p>
      <p>If the button does not work, open this link:</p>
      <p><a href="${escapeHtml(invitation.actionLink)}">${escapeHtml(invitation.actionLink)}</a></p>
      <p>Customer portal: <a href="${escapeHtml(portalUrl)}">${escapeHtml(portalUrl)}</a></p>
    </div>
  `;
}

function renderInvitationText(invitation: TenantAdminInvitation) {
  const portalUrl = customerPortalUrl();

  return [
    "Welcome to Torrevie",
    "",
    `You have been invited as the customer administrator for ${invitation.tenantName}.`,
    "",
    "Accept the invitation, set your password, then open the customer portal to start using your workspace.",
    "",
    `Accept invitation and set password: ${invitation.actionLink}`,
    `Customer portal: ${portalUrl}`
  ].join("\n");
}

function customerPortalUrl() {
  return (process.env.NEXT_PUBLIC_CUSTOMER_PORTAL_URL ?? "https://app.torrevie.com").replace(/\/+$/, "");
}

function sanitizeEmail(value: string | null) {
  const email = value?.trim().toLowerCase();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Tenant billing email must be set before creating an admin invitation.");
  }

  return email;
}

function assertUuid(value: string, label: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(value)) {
    throw new Error(`Invalid ${label}.`);
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
