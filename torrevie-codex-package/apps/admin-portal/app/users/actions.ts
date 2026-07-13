"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { getSupabaseAdminClient } from "../../lib/admin-client";
import { getPlatformSession } from "../../lib/session";
import {
  invitePlatformUser,
  platformMembershipStatuses,
  platformRoleKeys,
  removePlatformUser,
  updatePlatformUserAccess,
  type PlatformMembershipStatus,
  type PlatformRoleKey
} from "../../lib/platform-users";

export async function invitePlatformUserAction(formData: FormData) {
  const session = await requirePlatformSession();

  await invitePlatformUser(getSupabaseAdminClient(), {
    email: stringValue(formData, "email"),
    role: roleValue(formData, "role"),
    actorUserId: session.userId
  });

  revalidatePath("/users");
  redirect("/users?invited=1");
}

export async function updatePlatformUserAccessAction(formData: FormData) {
  const session = await requirePlatformSession();

  await updatePlatformUserAccess(getSupabaseAdminClient(), {
    userId: stringValue(formData, "userId"),
    role: roleValue(formData, "role"),
    status: statusValue(formData, "status"),
    actorUserId: session.userId
  });

  revalidatePath("/users");
  redirect("/users?updated=1");
}

export async function removePlatformUserAction(formData: FormData) {
  const session = await requirePlatformSession();

  await removePlatformUser(getSupabaseAdminClient(), {
    userId: stringValue(formData, "userId"),
    actorUserId: session.userId
  });

  revalidatePath("/users");
  redirect("/users?removed=1");
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

function roleValue(formData: FormData, key: string): PlatformRoleKey {
  const role = stringValue(formData, key);

  if (!platformRoleKeys.includes(role as PlatformRoleKey)) {
    throw new Error(`Unsupported platform role: ${role}`);
  }

  return role as PlatformRoleKey;
}

function statusValue(formData: FormData, key: string): PlatformMembershipStatus {
  const status = stringValue(formData, key);

  if (!platformMembershipStatuses.includes(status as PlatformMembershipStatus)) {
    throw new Error(`Unsupported platform membership status: ${status}`);
  }

  return status as PlatformMembershipStatus;
}
