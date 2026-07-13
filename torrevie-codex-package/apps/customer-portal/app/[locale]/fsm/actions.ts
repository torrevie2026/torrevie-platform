"use server";

import { isLocale } from "@torrevie/localization";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { buildOnboardingInput, saveFsmOnboarding } from "../../../lib/fsm";
import { createManualIntakeRequest, type ChannelType } from "../../../lib/fsm/channels";
import {
  getCustomerAccessRequirements,
  requireVerifiedCustomerSession,
  resolveCustomerTenantContext
} from "../../../lib/server/customer-session";
import { PostgresTenantQueryClient } from "../../../lib/server/tenant-query-client";

export async function saveFsmOnboardingAction(formData: FormData) {
  const locale = stringValue(formData, "locale");

  if (!isLocale(locale)) {
    notFound();
  }

  const session = await requireVerifiedCustomerSession();
  const client = new PostgresTenantQueryClient(session.userId);
  const tenantContext = await resolveCustomerTenantContext(client, session);
  const requirements = await getCustomerAccessRequirements(client, tenantContext);

  if (requirements.requireProfileCompletion && !requirements.profileComplete) {
    redirect(`/${locale}/account?profile=required`);
  }

  if (requirements.requirePasswordChange) {
    redirect(`/${locale}/account?password=required`);
  }

  if (requirements.requireMfa && !requirements.mfaEnrolled) {
    redirect(`/${locale}/account?mfa=required`);
  }

  await saveFsmOnboarding(
    client,
    tenantContext,
    buildOnboardingInput({
      serve: stringValue(formData, "serve"),
      intake: stringValue(formData, "intake"),
      fieldSize: stringValue(formData, "fieldSize"),
      confirmedSegment: stringValue(formData, "confirmedSegment"),
      planTier: stringValue(formData, "planTier"),
      jobsPerMonthToday: stringValue(formData, "jobsPerMonthToday"),
      averageResponseHoursToday: stringValue(formData, "averageResponseHoursToday"),
      activatedChannel: stringValue(formData, "activatedChannel"),
      growthTrial: formData.get("growthTrial") === "on"
    })
  );

  revalidatePath(`/${locale}/fsm`);
  redirect(`/${locale}/fsm?section=onboarding&saved=1`);
}

export async function createManualIntakeRequestAction(formData: FormData) {
  const locale = stringValue(formData, "locale");

  if (!isLocale(locale)) {
    notFound();
  }

  const session = await requireVerifiedCustomerSession();
  const client = new PostgresTenantQueryClient(session.userId);
  const tenantContext = await resolveCustomerTenantContext(client, session);
  const requirements = await getCustomerAccessRequirements(client, tenantContext);

  if (requirements.requireProfileCompletion && !requirements.profileComplete) {
    redirect(`/${locale}/account?profile=required`);
  }

  await createManualIntakeRequest(client, tenantContext, {
    channelType: channelTypeValue(formData),
    contactName: stringValue(formData, "contactName"),
    contactPhone: stringValue(formData, "contactPhone"),
    contactEmail: stringValue(formData, "contactEmail"),
    summary: stringValue(formData, "summary")
  });

  revalidatePath(`/${locale}/fsm`);
  redirect(`/${locale}/fsm?section=channels&intake=created`);
}

function stringValue(formData: FormData, key: string) {
  return String(formData.get(key) ?? "");
}

function channelTypeValue(formData: FormData): ChannelType {
  const value = stringValue(formData, "channelType");

  if (value === "whatsapp" || value === "voice" || value === "email" || value === "portal") {
    return value;
  }

  return "portal";
}
