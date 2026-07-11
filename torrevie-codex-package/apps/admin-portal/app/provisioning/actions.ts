"use server";

import {
  createProvisioningJob,
  retryProvisioningStep,
  runProvisioningJob,
  SupabaseProvisioningStore
} from "@torrevie/provisioning";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { getSupabaseAdminClient } from "../../lib/admin-client";
import { getPlatformSession } from "../../lib/session";

export async function startProvisioningJobAction(formData: FormData) {
  const session = await requirePlatformSession();
  const store = new SupabaseProvisioningStore(getSupabaseAdminClient());
  const job = await createProvisioningJob(store, {
    tenantId: stringValue(formData, "tenantId"),
    actorUserId: session.userId
  });

  await runProvisioningJob(store, job.id, session.userId);
  revalidatePath("/provisioning");
  redirect("/provisioning");
}

export async function retryProvisioningStepAction(formData: FormData) {
  const session = await requirePlatformSession();
  const store = new SupabaseProvisioningStore(getSupabaseAdminClient());

  await retryProvisioningStep(store, stringValue(formData, "stepId"), session.userId);
  revalidatePath("/provisioning");
  redirect("/provisioning");
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
