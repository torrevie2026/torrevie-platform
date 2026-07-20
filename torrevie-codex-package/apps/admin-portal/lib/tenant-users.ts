import type { SupabaseClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { createCustomerAuthActionShortLink, customerPasswordSetupCallbackUrl } from "./customer-portal-url";

export const customerRoleKeys = [
  "customer_admin",
  "customer_module_admin",
  "customer_manager",
  "customer_standard_user",
  "customer_readonly"
] as const;

export const tenantMembershipStatuses = ["active", "invited", "disabled"] as const;

export type CustomerRoleKey = (typeof customerRoleKeys)[number];
export type TenantMembershipStatus = (typeof tenantMembershipStatuses)[number];

const fsmFieldRoles = new Set<CustomerRoleKey>(["customer_standard_user"]);
const fsmOfficeRoles = new Set<CustomerRoleKey>([
  "customer_admin",
  "customer_module_admin",
  "customer_manager",
  "customer_readonly"
]);

export type TenantUserRecord = {
  userId: string;
  email: string;
  status: TenantMembershipStatus;
  role: CustomerRoleKey | null;
  displayName: string;
  webAccessEnabled: boolean;
  whatsappAccessEnabled: boolean;
  whatsappPhoneNumber: string;
  requireProfileCompletion: boolean;
  requirePasswordChange: boolean;
  requireMfa: boolean;
  profileCompletedAt: string | null;
  mfaEnrolled: boolean;
};

type TenantUserInviteInput = {
  tenantId: string;
  email: string;
  displayName?: string;
  role: CustomerRoleKey;
  webAccessEnabled: boolean;
  whatsappAccessEnabled: boolean;
  whatsappPhoneNumber?: string;
  requireProfileCompletion: boolean;
  requirePasswordChange: boolean;
  requireMfa: boolean;
};

type TenantUserAccessInput = {
  tenantId: string;
  userId: string;
  role: CustomerRoleKey;
  status: TenantMembershipStatus;
  displayName?: string;
  webAccessEnabled: boolean;
  whatsappAccessEnabled: boolean;
  whatsappPhoneNumber?: string;
  requireProfileCompletion: boolean;
  requirePasswordChange: boolean;
  requireMfa: boolean;
};

type TenantRow = {
  id: string;
  name: string;
  slug: string;
};

type MembershipRow = {
  user_id: string;
  status: TenantMembershipStatus;
};

type UserRow = {
  id: string;
  email: string;
  profile_completed_at: string | null;
  mfa_enrolled: boolean;
};

type ProfileRow = {
  user_id: string;
  display_name: string | null;
  web_access_enabled: boolean | null;
  whatsapp_access_enabled: boolean | null;
  whatsapp_phone_number: string | null;
  require_profile_completion: boolean | null;
  require_password_change: boolean | null;
  require_mfa: boolean | null;
};

type RoleAssignmentRow = {
  user_id: string;
  role_id: string;
};

type RoleRow = {
  id: string;
  key: CustomerRoleKey;
};

type EntitlementRow = {
  feature_key: string;
  limit_value: number | null;
};

export async function listTenantUsers(client: SupabaseClient, tenantId: string): Promise<TenantUserRecord[]> {
  assertUuid(tenantId, "tenant id");
  const [{ data: memberships, error: membershipsError }, { data: roles, error: rolesError }] = await Promise.all([
    client.from("tenant_memberships").select("user_id,status").eq("tenant_id", tenantId).order("created_at"),
    client.from("roles").select("id,key").eq("scope", "customer")
  ]);

  if (membershipsError) {
    throw new Error(`Unable to list tenant memberships: ${membershipsError.message}`);
  }

  if (rolesError) {
    throw new Error(`Unable to list customer roles: ${rolesError.message}`);
  }

  const membershipRows = (memberships ?? []) as MembershipRow[];
  const userIds = membershipRows.map((membership) => membership.user_id);

  if (userIds.length === 0) {
    return [];
  }

  const [users, profiles, assignments] = await Promise.all([
    client.from("users").select("id,email,profile_completed_at,mfa_enrolled").in("id", userIds),
    client
      .from("user_profiles")
      .select(
        "user_id,display_name,web_access_enabled,whatsapp_access_enabled,whatsapp_phone_number,require_profile_completion,require_password_change,require_mfa"
      )
      .eq("tenant_id", tenantId)
      .in("user_id", userIds),
    client.from("user_role_assignments").select("user_id,role_id").eq("tenant_id", tenantId).in("user_id", userIds)
  ]);

  if (users.error) {
    throw new Error(`Unable to list tenant users: ${users.error.message}`);
  }

  if (profiles.error) {
    throw new Error(`Unable to list tenant user profiles: ${profiles.error.message}`);
  }

  if (assignments.error) {
    throw new Error(`Unable to list tenant user roles: ${assignments.error.message}`);
  }

  const usersById = new Map(((users.data ?? []) as UserRow[]).map((user) => [user.id, user]));
  const profilesByUserId = new Map(((profiles.data ?? []) as ProfileRow[]).map((profile) => [profile.user_id, profile]));
  const rolesById = new Map(((roles ?? []) as RoleRow[]).map((role) => [role.id, role.key]));
  const roleByUserId = new Map(
    ((assignments.data ?? []) as RoleAssignmentRow[]).map((assignment) => [
      assignment.user_id,
      rolesById.get(assignment.role_id) ?? null
    ])
  );

  return membershipRows.flatMap((membership) => {
    const user = usersById.get(membership.user_id);

    if (!user) {
      return [];
    }

    const profile = profilesByUserId.get(membership.user_id);

    return [
      {
        userId: membership.user_id,
        email: user.email,
        status: membership.status,
        role: roleByUserId.get(membership.user_id) ?? null,
        displayName: profile?.display_name ?? "",
        webAccessEnabled: profile?.web_access_enabled ?? true,
        whatsappAccessEnabled: profile?.whatsapp_access_enabled ?? false,
        whatsappPhoneNumber: profile?.whatsapp_phone_number ?? "",
        requireProfileCompletion: profile?.require_profile_completion ?? true,
        requirePasswordChange: profile?.require_password_change ?? false,
        requireMfa: profile?.require_mfa ?? false,
        profileCompletedAt: user.profile_completed_at,
        mfaEnrolled: user.mfa_enrolled
      }
    ];
  });
}

export async function inviteTenantUser(client: SupabaseClient, input: TenantUserInviteInput, actorUserId: string) {
  const tenant = await getTenant(client, input.tenantId);
  const email = sanitizeEmail(input.email);
  const role = sanitizeCustomerRole(input.role);
  await assertFsmSeatLimitAllowsTenantInvite(client, tenant.id, email, role);

  const { userId, actionLink } = await createInviteLink(client, email);

  await upsertUser(client, userId, email, actorUserId);
  await upsertMembership(client, tenant.id, userId, "invited", actorUserId);
  await upsertProfile(client, tenant.id, userId, input, actorUserId);
  await replaceTenantRole(client, tenant.id, userId, role, actorUserId);
  await writeTenantUserAuditEvent(client, tenant.id, actorUserId, "tenant.user.invited", userId, {
    email,
    role
  });
  await sendTenantInviteEmail({
    email,
    tenantName: tenant.name,
    actionLink
  });
}

export async function updateTenantUserAccess(client: SupabaseClient, input: TenantUserAccessInput, actorUserId: string) {
  assertUuid(input.tenantId, "tenant id");
  assertUuid(input.userId, "user id");
  const status = sanitizeMembershipStatus(input.status);
  const role = sanitizeCustomerRole(input.role);

  await updateMembershipStatus(client, input.tenantId, input.userId, status, actorUserId);
  await upsertProfile(client, input.tenantId, input.userId, input, actorUserId);
  await replaceTenantRole(client, input.tenantId, input.userId, role, actorUserId);
  await writeTenantUserAuditEvent(client, input.tenantId, actorUserId, "tenant.user.updated", input.userId, {
    role,
    status
  });
}

export async function removeTenantUser(client: SupabaseClient, tenantId: string, userId: string, actorUserId: string) {
  assertUuid(tenantId, "tenant id");
  assertUuid(userId, "user id");

  const [{ error: roleError }, { error: profileError }, { error: membershipError }] = await Promise.all([
    client.from("user_role_assignments").delete().eq("tenant_id", tenantId).eq("user_id", userId),
    client.from("user_profiles").delete().eq("tenant_id", tenantId).eq("user_id", userId),
    client.from("tenant_memberships").delete().eq("tenant_id", tenantId).eq("user_id", userId)
  ]);

  if (roleError || profileError || membershipError) {
    throw new Error(roleError?.message ?? profileError?.message ?? membershipError?.message ?? "Unable to remove user.");
  }

  await writeTenantUserAuditEvent(client, tenantId, actorUserId, "tenant.user.removed", userId, {});
}

export async function sendTenantPasswordReset(client: SupabaseClient, tenantId: string, userId: string, actorUserId: string) {
  assertUuid(tenantId, "tenant id");
  assertUuid(userId, "user id");
  const tenant = await getTenant(client, tenantId);
  const user = await getUser(client, userId);
  const { data, error } = await client.auth.admin.generateLink({
    type: "recovery",
    email: user.email,
    options: {
      redirectTo: customerPasswordSetupCallbackUrl()
    }
  });

  if (error || !data.properties?.action_link) {
    throw new Error(`Unable to create password reset link: ${error?.message ?? "missing action link"}`);
  }

  await setRequirePasswordChange(client, tenantId, userId, true, actorUserId);
  await sendPasswordResetEmail({
    email: user.email,
    tenantName: tenant.name,
    actionLink: await createCustomerAuthActionShortLink(client, data.properties.action_link, "recovery")
  });
  await writeTenantUserAuditEvent(client, tenantId, actorUserId, "tenant.user.password_reset_sent", userId, {
    email: user.email
  });
}

async function getTenant(client: SupabaseClient, tenantId: string) {
  assertUuid(tenantId, "tenant id");
  const { data, error } = await client.from("tenants").select("id,name,slug").eq("id", tenantId).single();

  if (error) {
    throw new Error(`Unable to load tenant: ${error.message}`);
  }

  return data as TenantRow;
}

async function getUser(client: SupabaseClient, userId: string) {
  const { data, error } = await client.from("users").select("id,email").eq("id", userId).single();

  if (error) {
    throw new Error(`Unable to load user: ${error.message}`);
  }

  return data as { id: string; email: string };
}

async function createInviteLink(client: SupabaseClient, email: string) {
  const { data, error } = await client.auth.admin.generateLink({
    type: "invite",
    email,
    options: {
      redirectTo: customerPasswordSetupCallbackUrl()
    }
  });

  if (error || !data.user?.id || !data.properties?.action_link) {
    throw new Error(`Unable to create invitation link: ${error?.message ?? "missing invite response"}`);
  }

  return {
    userId: data.user.id,
    actionLink: await createCustomerAuthActionShortLink(client, data.properties.action_link, "invite")
  };
}

async function upsertUser(client: SupabaseClient, userId: string, email: string, actorUserId: string) {
  const { error } = await client.from("users").upsert(
    {
      id: userId,
      email,
      status: "active",
      created_by: actorUserId,
      updated_by: actorUserId
    },
    { onConflict: "id" }
  );

  if (error) {
    throw new Error(`Unable to create user profile: ${error.message}`);
  }
}

async function upsertMembership(
  client: SupabaseClient,
  tenantId: string,
  userId: string,
  status: TenantMembershipStatus,
  actorUserId: string
) {
  const { error } = await client.from("tenant_memberships").upsert(
    {
      tenant_id: tenantId,
      user_id: userId,
      status,
      invited_by: actorUserId,
      created_by: actorUserId,
      updated_by: actorUserId
    },
    { onConflict: "tenant_id,user_id" }
  );

  if (error) {
    throw new Error(`Unable to create tenant membership: ${error.message}`);
  }
}

async function updateMembershipStatus(
  client: SupabaseClient,
  tenantId: string,
  userId: string,
  status: TenantMembershipStatus,
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
    throw new Error(`Unable to update tenant membership: ${error.message}`);
  }
}

async function upsertProfile(
  client: SupabaseClient,
  tenantId: string,
  userId: string,
  input: TenantUserInviteInput | TenantUserAccessInput,
  actorUserId: string
) {
  const { error } = await client.from("user_profiles").upsert(
    {
      tenant_id: tenantId,
      user_id: userId,
      display_name: cleanOptional(input.displayName) ?? "Invited user",
      web_access_enabled: input.webAccessEnabled,
      whatsapp_access_enabled: input.whatsappAccessEnabled,
      whatsapp_phone_number: sanitizeOptionalPhone(input.whatsappPhoneNumber),
      require_profile_completion: input.requireProfileCompletion,
      require_password_change: input.requirePasswordChange,
      require_mfa: input.requireMfa,
      created_by: actorUserId,
      updated_by: actorUserId
    },
    { onConflict: "tenant_id,user_id" }
  );

  if (error) {
    throw new Error(`Unable to update tenant user profile: ${error.message}`);
  }
}

async function replaceTenantRole(
  client: SupabaseClient,
  tenantId: string,
  userId: string,
  role: CustomerRoleKey,
  actorUserId: string
) {
  const { data, error } = await client.from("roles").select("id").eq("scope", "customer").eq("key", role).single();

  if (error || !data?.id) {
    throw new Error(`Unable to load customer role: ${error?.message ?? role}`);
  }

  const { error: deleteError } = await client.from("user_role_assignments").delete().eq("tenant_id", tenantId).eq("user_id", userId);

  if (deleteError) {
    throw new Error(`Unable to replace tenant user role: ${deleteError.message}`);
  }

  const { error: insertError } = await client.from("user_role_assignments").insert({
    tenant_id: tenantId,
    user_id: userId,
    role_id: data.id,
    assigned_by: actorUserId,
    created_by: actorUserId,
    updated_by: actorUserId
  });

  if (insertError) {
    throw new Error(`Unable to assign tenant user role: ${insertError.message}`);
  }
}

async function setRequirePasswordChange(
  client: SupabaseClient,
  tenantId: string,
  userId: string,
  required: boolean,
  actorUserId: string
) {
  const { error } = await client
    .from("user_profiles")
    .update({
      require_password_change: required,
      updated_by: actorUserId
    })
    .eq("tenant_id", tenantId)
    .eq("user_id", userId);

  if (error) {
    throw new Error(`Unable to set password change requirement: ${error.message}`);
  }
}

async function assertFsmSeatLimitAllowsTenantInvite(
  client: SupabaseClient,
  tenantId: string,
  email: string,
  role: CustomerRoleKey
) {
  const seatCategory = getFsmSeatCategory(role);
  if (!seatCategory) {
    return;
  }

  const { data, error } = await client.rpc("get_org_entitlements", { org_id: tenantId });
  if (error) {
    throw new Error(`Unable to resolve FSM entitlements: ${error.message}`);
  }

  const limit = pickExplicitLimit((data ?? []) as EntitlementRow[], seatCategory.featureKey);
  if (limit === undefined || limit === null) {
    return;
  }

  const members = await listTenantUsers(client, tenantId);
  const existing = members.find((member) => member.email.toLowerCase() === email);
  if (existing?.status === "active" || existing?.status === "invited") {
    return;
  }

  const used = members.filter(
    (member) => (member.status === "active" || member.status === "invited") && member.role && seatCategory.roles.has(member.role)
  ).length;

  if (used >= limit) {
    throw new Error(
      `This tenant has reached its FSM ${seatCategory.label} user limit of ${limit}. Upgrade the plan or disable a user before inviting another one.`
    );
  }
}

function pickExplicitLimit(rows: readonly EntitlementRow[], featureKey: string) {
  const matching = rows.filter((row) => row.feature_key === featureKey);

  if (matching.length === 0) {
    return undefined;
  }

  if (matching.some((row) => row.limit_value === null)) {
    return null;
  }

  return Math.max(...matching.map((row) => row.limit_value ?? 0));
}

function getFsmSeatCategory(role: CustomerRoleKey) {
  if (fsmFieldRoles.has(role)) {
    return {
      featureKey: "fsm.users.field.max",
      label: "field",
      roles: fsmFieldRoles
    };
  }

  if (fsmOfficeRoles.has(role)) {
    return {
      featureKey: "fsm.users.office.max",
      label: "office",
      roles: fsmOfficeRoles
    };
  }

  return null;
}

async function writeTenantUserAuditEvent(
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
    throw new Error(`Unable to write tenant user audit event: ${error.message}`);
  }
}

async function sendTenantInviteEmail(input: { email: string; tenantName: string; actionLink: string }) {
  await sendEmail({
    to: input.email,
    subject: `Your ${input.tenantName} Torrevie invitation`,
    html: `
      <div style="font-family: Inter, Arial, sans-serif; color: #162449; line-height: 1.5;">
        <h1 style="font-size: 22px;">Torrevie invitation</h1>
        <p>You have been invited to ${escapeHtml(input.tenantName)}.</p>
        <p><a href="${escapeHtml(input.actionLink)}" style="background:#0D9488;color:#fff;padding:12px 18px;text-decoration:none;border-radius:6px;display:inline-block;">Accept invitation</a></p>
        <p>If the button does not work, open this link:</p>
        <p><a href="${escapeHtml(input.actionLink)}">${escapeHtml(input.actionLink)}</a></p>
      </div>
    `,
    text: `You have been invited to ${input.tenantName}.\n\nAccept invitation: ${input.actionLink}`
  });
}

async function sendPasswordResetEmail(input: { email: string; tenantName: string; actionLink: string }) {
  await sendEmail({
    to: input.email,
    subject: `Reset your ${input.tenantName} Torrevie password`,
    html: `
      <div style="font-family: Inter, Arial, sans-serif; color: #162449; line-height: 1.5;">
        <h1 style="font-size: 22px;">Password reset required</h1>
        <p>Your tenant administrator requested a password change for ${escapeHtml(input.tenantName)}.</p>
        <p><a href="${escapeHtml(input.actionLink)}" style="background:#0D9488;color:#fff;padding:12px 18px;text-decoration:none;border-radius:6px;display:inline-block;">Change password</a></p>
        <p>If the button does not work, open this link:</p>
        <p><a href="${escapeHtml(input.actionLink)}">${escapeHtml(input.actionLink)}</a></p>
      </div>
    `,
    text: `Your tenant administrator requested a password change for ${input.tenantName}.\n\nChange password: ${input.actionLink}`
  });
}

async function sendEmail(input: { to: string; subject: string; html: string; text: string }) {
  const resendApiKey = process.env.RESEND_API_KEY ?? process.env.EMAIL_PROVIDER_API_KEY;

  if (!resendApiKey) {
    throw new Error("Resend API key is not configured.");
  }

  const resend = new Resend(resendApiKey);
  const from = process.env.RESEND_FROM_EMAIL ?? process.env.EMAIL_FROM_ADDRESS ?? "Torrevie <noreply@torrevie.com>";
  const { error } = await resend.emails.send({
    from,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text
  });

  if (error) {
    throw new Error(`Unable to send email: ${error.message}`);
  }
}

function sanitizeEmail(value: string) {
  const email = value.trim().toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("A valid email address is required.");
  }

  return email;
}

function sanitizeCustomerRole(role: CustomerRoleKey) {
  if (!customerRoleKeys.includes(role)) {
    throw new Error(`Unsupported customer role: ${role}`);
  }

  return role;
}

function sanitizeMembershipStatus(status: TenantMembershipStatus) {
  if (!tenantMembershipStatuses.includes(status)) {
    throw new Error(`Unsupported membership status: ${status}`);
  }

  return status;
}

function sanitizeOptionalPhone(value: string | null | undefined) {
  const phone = value?.trim();

  if (!phone) {
    return null;
  }

  if (!/^\+[1-9][0-9]{6,31}$/.test(phone)) {
    throw new Error("WhatsApp phone number must be in international format, for example +971501234567.");
  }

  return phone;
}

function cleanOptional(value: string | null | undefined) {
  const clean = value?.trim();

  return clean || null;
}

function assertUuid(value: string, label: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
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
