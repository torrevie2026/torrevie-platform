import type { SupabaseClient } from "@supabase/supabase-js";
import { Resend } from "resend";

export const platformRoleKeys = [
  "torrevie_platform_admin",
  "torrevie_operations_admin",
  "torrevie_support_agent",
  "torrevie_billing_admin",
  "torrevie_security_admin"
] as const;

export const platformMembershipStatuses = ["active", "invited", "disabled"] as const;

export type PlatformRoleKey = (typeof platformRoleKeys)[number];
export type PlatformMembershipStatus = (typeof platformMembershipStatuses)[number];

export type PlatformUserRecord = {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  position: string;
  mobileNumber: string;
  recoveryEmail: string;
  profileCompletedAt: string | null;
  mfaEnrolled: boolean;
  status: string;
  role: PlatformRoleKey;
  membershipStatus: PlatformMembershipStatus;
  createdAt: string;
};

type PlatformTenantRow = {
  id: string;
  name: string;
  slug: string;
};

type RoleRow = {
  id: string;
  key: PlatformRoleKey;
};

type MembershipRow = {
  user_id: string;
  status: PlatformMembershipStatus;
  created_at: string | null;
};

type UserRow = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  position: string | null;
  mobile_number: string | null;
  recovery_email: string | null;
  profile_completed_at: string | null;
  mfa_enrolled: boolean;
  status: string;
};

type RoleAssignmentRow = {
  user_id: string;
  roles?: { key?: string; scope?: string } | Array<{ key?: string; scope?: string }>;
};

type PlatformInviteKind = "new_invitation" | "existing_user";

type PlatformInviteIdentity = {
  userId: string;
  actionLink: string;
  kind: PlatformInviteKind;
};

export async function listPlatformUsers(client: SupabaseClient): Promise<PlatformUserRecord[]> {
  const tenant = await getPlatformTenant(client);
  const { data: memberships, error: membershipsError } = await client
    .from("tenant_memberships")
    .select("user_id,status,created_at")
    .eq("tenant_id", tenant.id)
    .order("created_at", { ascending: false });

  if (membershipsError) {
    throw new Error(`Unable to list platform memberships: ${membershipsError.message}`);
  }

  const membershipRows = (memberships ?? []) as MembershipRow[];
  const userIds = membershipRows.map((membership) => membership.user_id);

  if (userIds.length === 0) {
    return [];
  }

  const [{ data: users, error: usersError }, { data: assignments, error: assignmentsError }] = await Promise.all([
    client
      .from("users")
      .select("id,email,first_name,last_name,position,mobile_number,recovery_email,profile_completed_at,mfa_enrolled,status")
      .in("id", userIds),
    client
      .from("user_role_assignments")
      .select("user_id,roles!inner(key,scope)")
      .eq("tenant_id", tenant.id)
      .in("user_id", userIds)
      .eq("roles.scope", "platform")
  ]);

  if (usersError) {
    throw new Error(`Unable to list platform user profiles: ${usersError.message}`);
  }

  if (assignmentsError) {
    throw new Error(`Unable to list platform role assignments: ${assignmentsError.message}`);
  }

  const usersById = new Map(((users ?? []) as UserRow[]).map((user) => [user.id, user]));
  const roleByUserId = new Map<string, PlatformRoleKey>();

  for (const assignment of (assignments ?? []) as RoleAssignmentRow[]) {
    const role = normalizeRoleKey(assignment.roles);

    if (role) {
      roleByUserId.set(assignment.user_id, role);
    }
  }

  return membershipRows.flatMap((membership) => {
    const user = usersById.get(membership.user_id);
    const role = roleByUserId.get(membership.user_id);

    if (!user || !role) {
      return [];
    }

    return [
      {
        userId: membership.user_id,
        email: user.email,
        firstName: user.first_name ?? "",
        lastName: user.last_name ?? "",
        position: user.position ?? "",
        mobileNumber: user.mobile_number ?? "",
        recoveryEmail: user.recovery_email ?? "",
        profileCompletedAt: user.profile_completed_at,
        mfaEnrolled: user.mfa_enrolled,
        status: user.status,
        membershipStatus: membership.status,
        role,
        createdAt: membership.created_at ?? ""
      }
    ];
  });
}

export async function invitePlatformUser(
  client: SupabaseClient,
  input: {
    email: string;
    role: PlatformRoleKey;
    actorUserId: string;
  }
) {
  const tenant = await getPlatformTenant(client);
  const email = sanitizeEmail(input.email);
  const role = sanitizePlatformRole(input.role);
  const { userId, actionLink, kind } = await createSupabaseInviteLink(client, email);
  const roleRow = await getPlatformRole(client, role);

  await upsertPlatformUser(client, userId, email, input.actorUserId);
  await upsertActivePlatformMembership(client, tenant.id, userId, input.actorUserId);
  await replacePlatformRole(client, tenant.id, userId, roleRow.id, input.actorUserId);
  await writePlatformUserAuditEvent(client, tenant.id, input.actorUserId, "platform.user.invited", userId, {
    email,
    role
  });
  await sendPlatformUserInviteEmail({
    email,
    tenantName: tenant.name,
    role,
    actionLink,
    kind
  });
  await writePlatformUserAuditEvent(client, tenant.id, input.actorUserId, "platform.user.invitation_sent", userId, {
    email,
    provider: "resend"
  });
}

export async function updatePlatformUserAccess(
  client: SupabaseClient,
  input: {
    userId: string;
    role: PlatformRoleKey;
    status: PlatformMembershipStatus;
    actorUserId: string;
  }
) {
  assertUuid(input.userId, "user id");
  const tenant = await getPlatformTenant(client);
  const role = sanitizePlatformRole(input.role);
  const status = sanitizeMembershipStatus(input.status);
  const roleRow = await getPlatformRole(client, role);

  if (input.userId === input.actorUserId && status !== "active") {
    throw new Error("You cannot disable your own Admin Portal access.");
  }

  await updatePlatformMembershipStatus(client, tenant.id, input.userId, status, input.actorUserId);
  await replacePlatformRole(client, tenant.id, input.userId, roleRow.id, input.actorUserId);
  await writePlatformUserAuditEvent(client, tenant.id, input.actorUserId, "platform.user.updated", input.userId, {
    role,
    status
  });
}

export async function removePlatformUser(
  client: SupabaseClient,
  input: {
    userId: string;
    actorUserId: string;
  }
) {
  assertUuid(input.userId, "user id");

  if (input.userId === input.actorUserId) {
    throw new Error("You cannot remove your own Admin Portal access.");
  }

  const tenant = await getPlatformTenant(client);
  const [{ error: roleError }, { error: membershipError }] = await Promise.all([
    client.from("user_role_assignments").delete().eq("tenant_id", tenant.id).eq("user_id", input.userId),
    client.from("tenant_memberships").delete().eq("tenant_id", tenant.id).eq("user_id", input.userId)
  ]);

  if (roleError || membershipError) {
    throw new Error(roleError?.message ?? membershipError?.message ?? "Unable to remove platform user.");
  }

  await writePlatformUserAuditEvent(client, tenant.id, input.actorUserId, "platform.user.removed", input.userId, {});
}

async function getPlatformTenant(client: SupabaseClient) {
  const { data, error } = await client
    .from("tenants")
    .select("id,name,slug")
    .eq("slug", "torrevie-platform")
    .single();

  if (error) {
    throw new Error(`Unable to load Torrevie platform tenant: ${error.message}`);
  }

  return data as PlatformTenantRow;
}

async function getPlatformRole(client: SupabaseClient, role: PlatformRoleKey) {
  const { data, error } = await client.from("roles").select("id,key").eq("key", role).eq("scope", "platform").single();

  if (error) {
    throw new Error(`Unable to load platform role: ${error.message}`);
  }

  return data as RoleRow;
}

async function createSupabaseInviteLink(client: SupabaseClient, email: string): Promise<PlatformInviteIdentity> {
  const { data, error } = await client.auth.admin.generateLink({
    type: "invite",
    email,
    options: {
      redirectTo: adminInviteRedirectUrl()
    }
  });

  if (error) {
    if (isAlreadyRegisteredError(error.message)) {
      const { userId, actionLink } = await createExistingUserAccessLink(client, email);

      return {
        userId,
        actionLink,
        kind: "existing_user"
      };
    }

    throw new Error(`Unable to create Supabase invitation link: ${error.message}`);
  }

  const userId = data.user?.id;
  const actionLink = data.properties?.action_link;

  if (!userId || !actionLink) {
    throw new Error("Supabase did not return a complete invitation link.");
  }

  return {
    userId,
    actionLink,
    kind: "new_invitation"
  };
}

async function createExistingUserAccessLink(client: SupabaseClient, email: string) {
  const existingUser = await findAuthUserByEmail(client, email);

  if (!existingUser) {
    throw new Error("Supabase reported an existing Auth user, but the user could not be found.");
  }

  const { data, error } = await client.auth.admin.generateLink({
    type: "recovery",
    email,
    options: {
      redirectTo: adminInviteRedirectUrl()
    }
  });

  if (error || !data.properties?.action_link) {
    throw new Error(`Unable to create existing user access link: ${error?.message ?? "missing action link"}`);
  }

  return {
    userId: existingUser.id,
    actionLink: data.properties.action_link
  };
}

async function findAuthUserByEmail(client: SupabaseClient, email: string) {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({
      page,
      perPage: 1000
    });

    if (error) {
      throw new Error(`Unable to find existing Supabase Auth user: ${error.message}`);
    }

    const users = data.users ?? [];
    const existingUser = users.find((user) => user.email?.toLowerCase() === email);

    if (existingUser) {
      return existingUser;
    }

    if (users.length < 1000) {
      return null;
    }
  }

  throw new Error("Unable to find existing Supabase Auth user: Auth user list exceeded the search limit.");
}

async function upsertPlatformUser(client: SupabaseClient, userId: string, email: string, actorUserId: string) {
  const { data: existingUser, error: existingError } = await client
    .from("users")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Unable to check platform user: ${existingError.message}`);
  }

  if (existingUser && existingUser.id !== userId) {
    throw new Error("A platform user already exists for this email with a different Auth identity.");
  }

  const { error } = await client.from("users").upsert(
    {
      id: userId,
      email,
      status: "active",
      created_by: actorUserId,
      updated_by: actorUserId
    },
    {
      onConflict: "id"
    }
  );

  if (error) {
    throw new Error(`Unable to create platform user: ${error.message}`);
  }
}

async function upsertActivePlatformMembership(
  client: SupabaseClient,
  tenantId: string,
  userId: string,
  actorUserId: string
) {
  const { error } = await client.from("tenant_memberships").upsert(
    {
      tenant_id: tenantId,
      user_id: userId,
      status: "active",
      invited_by: actorUserId,
      joined_at: new Date().toISOString(),
      created_by: actorUserId,
      updated_by: actorUserId
    },
    {
      onConflict: "tenant_id,user_id"
    }
  );

  if (error) {
    throw new Error(`Unable to create platform membership: ${error.message}`);
  }
}

async function updatePlatformMembershipStatus(
  client: SupabaseClient,
  tenantId: string,
  userId: string,
  status: PlatformMembershipStatus,
  actorUserId: string
) {
  const { error } = await client
    .from("tenant_memberships")
    .update({
      status,
      updated_by: actorUserId
    })
    .eq("tenant_id", tenantId)
    .eq("user_id", userId);

  if (error) {
    throw new Error(`Unable to update platform membership: ${error.message}`);
  }
}

async function replacePlatformRole(
  client: SupabaseClient,
  tenantId: string,
  userId: string,
  roleId: string,
  actorUserId: string
) {
  const { error: deleteError } = await client
    .from("user_role_assignments")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("user_id", userId);

  if (deleteError) {
    throw new Error(`Unable to replace platform role: ${deleteError.message}`);
  }

  const { error } = await client.from("user_role_assignments").insert({
    tenant_id: tenantId,
    user_id: userId,
    role_id: roleId,
    assigned_by: actorUserId,
    created_by: actorUserId,
    updated_by: actorUserId
  });

  if (error) {
    throw new Error(`Unable to assign platform role: ${error.message}`);
  }
}

async function sendPlatformUserInviteEmail(input: {
  email: string;
  tenantName: string;
  role: PlatformRoleKey;
  actionLink: string;
  kind: PlatformInviteKind;
}) {
  const resendApiKey = process.env.RESEND_API_KEY ?? process.env.EMAIL_PROVIDER_API_KEY;

  if (!resendApiKey) {
    throw new Error("Resend API key is not configured.");
  }

  const resend = new Resend(resendApiKey);
  const from = process.env.RESEND_FROM_EMAIL ?? process.env.EMAIL_FROM_ADDRESS ?? "Torrevie <hello@torrevie.com>";
  const { error } = await resend.emails.send({
    from,
    to: input.email,
    subject: input.kind === "existing_user" ? "Your Torrevie Admin Portal access" : "Your Torrevie Admin Portal invitation",
    html: renderPlatformInviteHtml(input),
    text: renderPlatformInviteText(input)
  });

  if (error) {
    throw new Error(`Unable to send platform invitation email: ${error.message}`);
  }
}

async function writePlatformUserAuditEvent(
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
    throw new Error(`Unable to write platform user audit event: ${error.message}`);
  }
}

function renderPlatformInviteHtml(input: {
  tenantName: string;
  role: PlatformRoleKey;
  actionLink: string;
  kind: PlatformInviteKind;
}) {
  const isExistingUser = input.kind === "existing_user";
  const title = isExistingUser ? "Torrevie Admin Portal access" : "Torrevie Admin Portal invitation";
  const body = isExistingUser
    ? `Your existing account has been granted access to ${escapeHtml(input.tenantName)} with the ${escapeHtml(input.role)} role.`
    : `You have been invited to ${escapeHtml(input.tenantName)} with the ${escapeHtml(input.role)} role.`;
  const cta = isExistingUser ? "Open Admin Portal" : "Accept invitation";

  return `
    <div style="font-family: Inter, Arial, sans-serif; color: #162449; line-height: 1.5;">
      <h1 style="font-size: 22px;">${title}</h1>
      <p>${body}</p>
      <p>
        <a href="${escapeHtml(input.actionLink)}" style="background: #0D9488; color: #FFFFFF; padding: 12px 18px; text-decoration: none; border-radius: 6px; display: inline-block;">
          ${cta}
        </a>
      </p>
      <p>If the button does not work, open this link:</p>
      <p><a href="${escapeHtml(input.actionLink)}">${escapeHtml(input.actionLink)}</a></p>
    </div>
  `;
}

function renderPlatformInviteText(input: {
  tenantName: string;
  role: PlatformRoleKey;
  actionLink: string;
  kind: PlatformInviteKind;
}) {
  const isExistingUser = input.kind === "existing_user";

  return [
    isExistingUser ? "Torrevie Admin Portal access" : "Torrevie Admin Portal invitation",
    "",
    isExistingUser
      ? `Your existing account has been granted access to ${input.tenantName} with the ${input.role} role.`
      : `You have been invited to ${input.tenantName} with the ${input.role} role.`,
    "",
    `${isExistingUser ? "Open Admin Portal" : "Accept your invitation"}: ${input.actionLink}`
  ].join("\n");
}

function adminPortalUrl() {
  return (process.env.NEXT_PUBLIC_ADMIN_PORTAL_URL ?? "https://admin.torrevie.com").replace(/\/+$/, "");
}

function adminInviteRedirectUrl() {
  return `${adminPortalUrl()}/auth/callback?next=${encodeURIComponent("/account?setup=password")}`;
}

function sanitizeEmail(value: string) {
  const email = value.trim().toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("A valid email address is required.");
  }

  return email;
}

function sanitizePlatformRole(role: PlatformRoleKey) {
  if (!platformRoleKeys.includes(role)) {
    throw new Error(`Unsupported platform role: ${role}`);
  }

  return role;
}

function sanitizeMembershipStatus(status: PlatformMembershipStatus) {
  if (!platformMembershipStatuses.includes(status)) {
    throw new Error(`Unsupported platform membership status: ${status}`);
  }

  return status;
}

function assertUuid(value: string, label: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(`Invalid ${label}.`);
  }
}

function isAlreadyRegisteredError(message: string) {
  return message.toLowerCase().includes("already been registered");
}

function normalizeRoleKey(value: RoleAssignmentRow["roles"]) {
  const role = Array.isArray(value) ? value[0]?.key : value?.key;

  if (!role || !platformRoleKeys.includes(role as PlatformRoleKey)) {
    return null;
  }

  return role as PlatformRoleKey;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
