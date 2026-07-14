"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  deleteTexEmployeeProfile,
  resolveTexActorContext,
  updateTexEmployeeProfile
} from "../../../lib/tex";
import {
  isCustomerSessionError,
  requireVerifiedCustomerSession,
  resolveCustomerTenantContext
} from "../../../lib/server/customer-session";
import { PostgresTenantQueryClient } from "../../../lib/server/tenant-query-client";

export async function saveTexEmployeeProfileAction(formData: FormData) {
  const locale = stringValue(formData, "locale") || "en";
  const employeeProfileId = stringValue(formData, "employeeProfileId");
  const intent = stringValue(formData, "intent");
  let nextStatus = "updated";

  try {
    const { client, actor } = await resolveActor();

    if (intent === "delete") {
      await deleteTexEmployeeProfile(client, actor, employeeProfileId);
      nextStatus = "deleted";
      revalidatePath(`/${locale}/tex`);
    } else {
      await updateTexEmployeeProfile(client, actor, employeeProfileId, {
        name: stringValue(formData, "name"),
        phoneNumber: stringValue(formData, "phoneNumber"),
        department: stringValue(formData, "department"),
        monthlySalary: numberValue(formData, "monthlySalary"),
        submissionFrequency: submissionFrequencyValue(formData, "submissionFrequency"),
        isActive: formData.get("isActive") === "on"
      });
      revalidatePath(`/${locale}/tex`);
    }
  } catch (error) {
    if (isCustomerSessionError(error)) {
      redirect("/login");
    }

    const message = error instanceof Error ? error.message : "Employee update failed";
    redirect(`/${locale}/tex?section=people&people=failed&message=${encodeURIComponent(message)}`);
  }

  redirect(`/${locale}/tex?section=people&people=${nextStatus}`);
}

async function resolveActor() {
  const session = await requireVerifiedCustomerSession();
  const client = new PostgresTenantQueryClient(session.userId);
  const tenantContext = await resolveCustomerTenantContext(client, session);
  const actor = await resolveTexActorContext(client, tenantContext);

  return { client, actor };
}

function stringValue(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function numberValue(formData: FormData, key: string) {
  const value = stringValue(formData, key);
  return value ? Number(value) : null;
}

function submissionFrequencyValue(formData: FormData, key: string) {
  const value = stringValue(formData, key);

  return value === "daily" || value === "weekly" || value === "monthly" || value === "realtime"
    ? value
    : null;
}
