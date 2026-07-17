"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { getSupabaseAdminClient } from "../../lib/admin-client";
import { getPlatformSession } from "../../lib/session";
import {
  requirePlatformPermission,
  texBillingStatuses,
  texEnterpriseRequestStatuses,
  texPlanKeys,
  texPlanStatuses,
  texWhatsappProviderScopes,
  updateTexEnterpriseRequestStatus,
  upsertTexEnterpriseRequest,
  upsertTexPlanControl,
  type TexBillingStatus,
  type TexEnterpriseRequestStatus,
  type TexPlanKey,
  type TexPlanStatus,
  type TexWhatsappProviderScope
} from "../../lib/tex-admin";

export async function upsertTexPlanControlAction(formData: FormData) {
  const session = await requirePlatformSession();
  const client = getSupabaseAdminClient();
  await requirePlatformPermission(client, session.userId, "platform.subscription.manage");
  const tenantId = stringValue(formData, "tenantId");

  await upsertTexPlanControl(
    client,
    {
      tenantId,
      planKey: planKeyValue(formData),
      planStatus: planStatusValue(formData),
      trialStartDate: stringValue(formData, "trialStartDate"),
      trialEndDate: stringValue(formData, "trialEndDate"),
      employeeLimit: integerValue(formData, "employeeLimit"),
      seatCount: integerValue(formData, "seatCount"),
      whatsappProviderScope: whatsappProviderScopeValue(formData),
      billingStatus: billingStatusValue(formData),
      renewalDate: stringValue(formData, "renewalDate"),
      internalPlanNotes: stringValue(formData, "internalPlanNotes")
    },
    session.userId
  );

  revalidatePath("/subscriptions");
  redirect(`/subscriptions?section=tex&plan=1&tenantId=${encodeURIComponent(tenantId)}#subscriptions-top`);
}

export async function createTexEnterpriseRequestAction(formData: FormData) {
  const session = await requirePlatformSession();
  const client = getSupabaseAdminClient();
  await requirePlatformPermission(client, session.userId, "platform.provision");
  const tenantId = stringValue(formData, "tenantId");

  await upsertTexEnterpriseRequest(
    client,
    {
      tenantId,
      status: enterpriseRequestStatusValue(formData),
      requestedCapabilities: stringValue(formData, "requestedCapabilities").split(","),
      contactName: stringValue(formData, "contactName"),
      contactEmail: stringValue(formData, "contactEmail"),
      contactPhone: stringValue(formData, "contactPhone"),
      contactPosition: stringValue(formData, "contactPosition"),
      internalOwnerUserId: stringValue(formData, "internalOwnerUserId"),
      internalNotes: stringValue(formData, "internalNotes"),
      targetGoLiveDate: stringValue(formData, "targetGoLiveDate"),
      nextFollowUpDate: stringValue(formData, "nextFollowUpDate")
    },
    session.userId
  );

  revalidatePath("/subscriptions");
  redirect(`/subscriptions?section=tex&enterprise=1&tenantId=${encodeURIComponent(tenantId)}#subscriptions-top`);
}

export async function updateTexEnterpriseRequestStatusAction(formData: FormData) {
  const session = await requirePlatformSession();
  const client = getSupabaseAdminClient();
  await requirePlatformPermission(client, session.userId, "platform.provision");

  await updateTexEnterpriseRequestStatus(
    client,
    stringValue(formData, "requestId"),
    enterpriseRequestStatusValue(formData),
    session.userId
  );

  revalidatePath("/subscriptions");
  redirect("/subscriptions?section=tex&enterprise=1#subscriptions-top");
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

function integerValue(formData: FormData, key: string) {
  const value = Number(stringValue(formData, key));

  if (!Number.isInteger(value)) {
    throw new Error(`${key} must be an integer.`);
  }

  return value;
}

function planKeyValue(formData: FormData): TexPlanKey {
  return enumValue(formData, "planKey", texPlanKeys, "TEX plan");
}

function planStatusValue(formData: FormData): TexPlanStatus {
  return enumValue(formData, "planStatus", texPlanStatuses, "TEX plan status");
}

function whatsappProviderScopeValue(formData: FormData): TexWhatsappProviderScope {
  return enumValue(
    formData,
    "whatsappProviderScope",
    texWhatsappProviderScopes,
    "WhatsApp provider scope"
  );
}

function billingStatusValue(formData: FormData): TexBillingStatus {
  return enumValue(formData, "billingStatus", texBillingStatuses, "billing status");
}

function enterpriseRequestStatusValue(formData: FormData): TexEnterpriseRequestStatus {
  return enumValue(formData, "status", texEnterpriseRequestStatuses, "Enterprise request status");
}

function enumValue<T extends readonly string[]>(
  formData: FormData,
  key: string,
  values: T,
  label: string
): T[number] {
  const value = stringValue(formData, key);

  if (!values.includes(value)) {
    throw new Error(`Unsupported ${label}: ${value}`);
  }

  return value;
}
