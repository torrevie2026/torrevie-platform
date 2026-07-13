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
import { ensureTenantAdminInvitation, sendTenantAdminInvitationEmail } from "../../lib/onboarding-invitations";
import { getPlatformSession } from "../../lib/session";
import { listTenants } from "../../lib/tenant-lifecycle";

export async function startProvisioningJobAction(formData: FormData) {
  const session = await requirePlatformSession();
  const client = getSupabaseAdminClient();
  const tenantId = stringValue(formData, "tenantId");
  const tenants = await listTenants(client);
  const tenant = tenants.find((candidate) => candidate.id === tenantId);

  if (!tenant?.billing_email) {
    redirect("/provisioning?error=missing_billing_email");
  }

  const store = new SupabaseProvisioningStore(client);
  let redirectUrl = "/provisioning";

  try {
    const job = await createProvisioningJob(store, {
      tenantId,
      actorUserId: session.userId
    });

    await runProvisioningJob(store, job.id, session.userId, {
      create_admin_invitation: async ({ job: provisioningJob, actorUserId }) => {
        await ensureTenantAdminInvitation(client, provisioningJob.tenantId, actorUserId);
      },
      send_onboarding_email: async ({ job: provisioningJob, actorUserId }) => {
        await sendTenantAdminInvitationEmail(client, provisioningJob.tenantId, actorUserId);
      }
    });
  } catch {
    redirectUrl = "/provisioning?error=failed";
  }

  revalidatePath("/provisioning");
  redirect(redirectUrl);
}

export async function retryProvisioningStepAction(formData: FormData) {
  const session = await requirePlatformSession();
  const client = getSupabaseAdminClient();
  const store = new SupabaseProvisioningStore(client);
  let redirectUrl = "/provisioning";

  try {
    await retryProvisioningStep(store, stringValue(formData, "stepId"), session.userId, {
      create_admin_invitation: async ({ job, actorUserId }) => {
        await ensureTenantAdminInvitation(client, job.tenantId, actorUserId);
      },
      send_onboarding_email: async ({ job, actorUserId }) => {
        await sendTenantAdminInvitationEmail(client, job.tenantId, actorUserId);
      }
    });
  } catch {
    redirectUrl = "/provisioning?error=failed";
  }

  revalidatePath("/provisioning");
  redirect(redirectUrl);
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
