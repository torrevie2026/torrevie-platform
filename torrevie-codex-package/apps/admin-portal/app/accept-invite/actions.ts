"use server";

import { redirect } from "next/navigation";
import { getSupabaseAdminClient } from "../../lib/admin-client";
import { redeemPlatformInvitationLink } from "../../lib/platform-users";

export async function acceptPlatformInviteAction(formData: FormData) {
  const token = String(formData.get("token") ?? "").trim();

  if (!token) {
    redirect("/accept-invite?error=missing");
  }

  try {
    const actionLink = await redeemPlatformInvitationLink(getSupabaseAdminClient(), token);

    redirect(actionLink);
  } catch {
    redirect("/accept-invite?error=expired");
  }
}
