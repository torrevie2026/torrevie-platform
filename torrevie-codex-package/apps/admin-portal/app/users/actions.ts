"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { getSupabaseAdminClient } from "../../lib/admin-client";
import { getPlatformSession } from "../../lib/session";
import { invitePlatformUser, platformRoleKeys, type PlatformRoleKey } from "../../lib/platform-users";

export async function invitePlatformUserAction(formData: FormData) {
  const session = await getPlatformSession();

  if (!session) {
    notFound();
  }

  await invitePlatformUser(getSupabaseAdminClient(), {
    email: stringValue(formData, "email"),
    role: roleValue(formData, "role"),
    actorUserId: session.userId
  });

  revalidatePath("/users");
  redirect("/users?invited=1");
}

function stringValue(formData: FormData, key: string) {
  return String(formData.get(key) ?? "");
}

function roleValue(formData: FormData, key: string): PlatformRoleKey {
  const role = stringValue(formData, key);

  if (!platformRoleKeys.includes(role as PlatformRoleKey)) {
    throw new Error(`Unsupported platform role: ${role}`);
  }

  return role as PlatformRoleKey;
}
