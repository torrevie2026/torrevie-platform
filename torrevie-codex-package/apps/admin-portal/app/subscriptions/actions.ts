"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { getSupabaseAdminClient } from "../../lib/admin-client";
import { sendTenantAdminInvitationEmail } from "../../lib/onboarding-invitations";
import { getPlatformSession } from "../../lib/session";
import { assignSubscription, subscriptionStatuses, type SubscriptionStatus } from "../../lib/subscription-management";

export async function assignSubscriptionAction(formData: FormData) {
  const session = await requirePlatformSession();
  const tenantId = stringValue(formData, "tenantId");

  await assignSubscription(
    getSupabaseAdminClient(),
    {
      tenantId,
      planId: stringValue(formData, "planId"),
      status: statusValue(formData),
      startsAt: stringValue(formData, "startsAt"),
      expiresAt: stringValue(formData, "expiresAt")
    },
    session.userId
  );

  revalidatePath("/subscriptions");
  redirect(`/subscriptions?assigned=1&tenantId=${encodeURIComponent(tenantId)}`);
}

export async function inviteTenantAdminAction(formData: FormData) {
  const session = await requirePlatformSession();
  const tenantId = stringValue(formData, "tenantId");

  await sendTenantAdminInvitationEmail(getSupabaseAdminClient(), tenantId, session.userId);
  revalidatePath("/subscriptions");
  redirect(`/subscriptions?invited=1&tenantId=${encodeURIComponent(tenantId)}`);
}

async function requirePlatformSession() {
  const session = await getPlatformSession();

  if (!session) {
    notFound();
  }

  return session;
}

function stringValue(formData: FormData, key: string) {
  return String(formData.get(key) ?? "");
}

function statusValue(formData: FormData): SubscriptionStatus {
  const status = stringValue(formData, "status");

  if (!subscriptionStatuses.includes(status as SubscriptionStatus)) {
    throw new Error(`Unsupported subscription status: ${status}`);
  }

  return status as SubscriptionStatus;
}
