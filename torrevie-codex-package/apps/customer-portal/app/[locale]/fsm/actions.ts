"use server";

import { isLocale } from "@torrevie/localization";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { buildOnboardingInput, saveFsmOnboarding } from "../../../lib/fsm";
import { createManualIntakeRequest, requestVoiceChannelSetup, type ChannelType } from "../../../lib/fsm/channels";
import { normalizeBusinessSegment } from "../../../config/fsmSegments";
import { buildFsmRoiSettingsInput, saveFsmRoiSettings } from "../../../lib/fsm/roi";
import { normalizeVoiceSetupInput } from "../../../lib/fsm/voice";
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

export async function requestVoiceChannelSetupAction(formData: FormData) {
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

  await requestVoiceChannelSetup(client, tenantContext, {
    ...normalizeVoiceSetupInput({
      path: stringValue(formData, "voiceSetupPath"),
      monthlyMinuteCap: stringValue(formData, "monthlyMinuteCap")
    }),
    tenantName: stringValue(formData, "tenantName"),
    segment: normalizeBusinessSegment(stringValue(formData, "segment"))
  });

  revalidatePath(`/${locale}/fsm`);
  redirect(`/${locale}/fsm?section=channels&voice=requested`);
}

export async function saveFsmRoiSettingsAction(formData: FormData) {
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

  await saveFsmRoiSettings(
    client,
    tenantContext,
    buildFsmRoiSettingsInput({
      jobsPerMonthToday: stringValue(formData, "jobsPerMonthToday"),
      averageResponseHoursToday: stringValue(formData, "averageResponseHoursToday"),
      adminMinutesSavedPerRequest: stringValue(formData, "adminMinutesSavedPerRequest")
    })
  );

  revalidatePath(`/${locale}/fsm`);
  redirect(`/${locale}/fsm?section=reports&roi=saved`);
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
