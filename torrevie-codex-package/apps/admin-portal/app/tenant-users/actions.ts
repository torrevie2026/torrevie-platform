"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { getSupabaseAdminClient } from "../../lib/admin-client";
import { getPlatformSession } from "../../lib/session";
import {
  customerRoleKeys,
  inviteTenantUser,
  removeTenantUser,
  sendTenantPasswordReset,
  tenantMembershipStatuses,
  updateTenantUserAccess,
  type CustomerRoleKey,
  type TenantMembershipStatus
} from "../../lib/tenant-users";

export async function inviteTenantUserAction(formData: FormData) {
  const session = await requirePlatformSession();
  const tenantId = stringValue(formData, "tenantId");

  await inviteTenantUser(
    getSupabaseAdminClient(),
    {
      tenantId,
      email: stringValue(formData, "email"),
      displayName: stringValue(formData, "displayName"),
      role: roleValue(formData, "role"),
      webAccessEnabled: boolValue(formData, "webAccessEnabled"),
      whatsappAccessEnabled: boolValue(formData, "whatsappAccessEnabled"),
      whatsappPhoneNumber: stringValue(formData, "whatsappPhoneNumber"),
      requireProfileCompletion: boolValue(formData, "requireProfileCompletion"),
      requirePasswordChange: boolValue(formData, "requirePasswordChange"),
      requireMfa: boolValue(formData, "requireMfa")
    },
    session.userId
  );

  revalidatePath("/tenant-users");
  redirect(`/tenant-users?tenantId=${tenantId}&invited=1`);
}

export async function updateTenantUserAccessAction(formData: FormData) {
  const session = await requirePlatformSession();
  const tenantId = stringValue(formData, "tenantId");

  await updateTenantUserAccess(
    getSupabaseAdminClient(),
    {
      tenantId,
      userId: stringValue(formData, "userId"),
      status: statusValue(formData, "status"),
      role: roleValue(formData, "role"),
      displayName: stringValue(formData, "displayName"),
      webAccessEnabled: boolValue(formData, "webAccessEnabled"),
      whatsappAccessEnabled: boolValue(formData, "whatsappAccessEnabled"),
      whatsappPhoneNumber: stringValue(formData, "whatsappPhoneNumber"),
      requireProfileCompletion: boolValue(formData, "requireProfileCompletion"),
      requirePasswordChange: boolValue(formData, "requirePasswordChange"),
      requireMfa: boolValue(formData, "requireMfa")
    },
    session.userId
  );

  revalidatePath("/tenant-users");
  redirect(`/tenant-users?tenantId=${tenantId}&updated=1`);
}

export async function removeTenantUserAction(formData: FormData) {
  const session = await requirePlatformSession();
  const tenantId = stringValue(formData, "tenantId");

  await removeTenantUser(getSupabaseAdminClient(), tenantId, stringValue(formData, "userId"), session.userId);

  revalidatePath("/tenant-users");
  redirect(`/tenant-users?tenantId=${tenantId}&removed=1`);
}

export async function sendTenantPasswordResetAction(formData: FormData) {
  const session = await requirePlatformSession();
  const tenantId = stringValue(formData, "tenantId");

  await sendTenantPasswordReset(getSupabaseAdminClient(), tenantId, stringValue(formData, "userId"), session.userId);

  revalidatePath("/tenant-users");
  redirect(`/tenant-users?tenantId=${tenantId}&password=sent`);
}

async function requirePlatformSession() {
  const session = await getPlatformSession();

  if (!session) {
    notFound();
  }

  return session;
}

function stringValue(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function boolValue(formData: FormData, key: string) {
  return formData.get(key) === "on";
}

function roleValue(formData: FormData, key: string): CustomerRoleKey {
  const role = stringValue(formData, key);

  if (!customerRoleKeys.includes(role as CustomerRoleKey)) {
    throw new Error(`Unsupported customer role: ${role}`);
  }

  return role as CustomerRoleKey;
}

function statusValue(formData: FormData, key: string): TenantMembershipStatus {
  const status = stringValue(formData, key);

  if (!tenantMembershipStatuses.includes(status as TenantMembershipStatus)) {
    throw new Error(`Unsupported membership status: ${status}`);
  }

  return status as TenantMembershipStatus;
}
