"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { getSupabaseAdminClient } from "../../lib/admin-client";
import { getPlatformSession } from "../../lib/session";
import { assignSubscription, subscriptionStatuses, type SubscriptionStatus } from "../../lib/subscription-management";

export async function assignSubscriptionAction(formData: FormData) {
  const session = await requirePlatformSession();

  await assignSubscription(
    getSupabaseAdminClient(),
    {
      tenantId: stringValue(formData, "tenantId"),
      planId: stringValue(formData, "planId"),
      status: statusValue(formData),
      startsAt: stringValue(formData, "startsAt"),
      expiresAt: stringValue(formData, "expiresAt")
    },
    session.userId
  );

  revalidatePath("/subscriptions");
  redirect("/subscriptions");
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
