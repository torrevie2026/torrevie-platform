"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { getSupabaseAdminClient } from "../../lib/admin-client";
import { sendTenantAdminInvitationEmail } from "../../lib/onboarding-invitations";
import { getPlatformSession } from "../../lib/session";
import {
  assignSubscription,
  businessSegments,
  fsmPlanTiers,
  subscriptionStatuses,
  type BusinessSegment,
  type FsmPlanTier,
  type SubscriptionStatus,
  updateFsmTenantControls,
  upsertFeatureOverride
} from "../../lib/subscription-management";

export async function assignSubscriptionAction(formData: FormData) {
  const session = await requirePlatformSession();
  const tenantId = stringValue(formData, "tenantId");
  const section = sectionValue(formData);

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
  redirect(`/subscriptions?${sectionQuery(section)}assigned=1&tenantId=${encodeURIComponent(tenantId)}#subscriptions-top`);
}

export async function inviteTenantAdminAction(formData: FormData) {
  const session = await requirePlatformSession();
  const tenantId = stringValue(formData, "tenantId");

  await sendTenantAdminInvitationEmail(getSupabaseAdminClient(), tenantId, session.userId);
  revalidatePath("/subscriptions");
  redirect(`/subscriptions?invited=1&tenantId=${encodeURIComponent(tenantId)}#subscriptions-top`);
}

export async function updateFsmTenantControlsAction(formData: FormData) {
  const session = await requirePlatformSession();
  await updateFsmTenantControls(
    getSupabaseAdminClient(),
    {
      tenantId: stringValue(formData, "tenantId"),
      businessSegment: businessSegmentValue(formData),
      planTier: fsmPlanTierValue(formData)
    },
    session.userId
  );

  revalidatePath("/subscriptions");
  redirect(`/subscriptions?fsmControls=1&tenantId=${encodeURIComponent(stringValue(formData, "tenantId"))}#subscriptions-top`);
}

export async function upsertFeatureOverrideAction(formData: FormData) {
  const session = await requirePlatformSession();
  await upsertFeatureOverride(
    getSupabaseAdminClient(),
    {
      tenantId: stringValue(formData, "tenantId"),
      featureKey: stringValue(formData, "featureKey"),
      enabled: stringValue(formData, "enabled") === "true",
      limitValue: optionalIntegerValue(formData, "limitValue"),
      reason: stringValue(formData, "reason"),
      expiresAt: stringValue(formData, "expiresAt")
    },
    session.userId
  );

  revalidatePath("/subscriptions");
  redirect(`/subscriptions?override=1&tenantId=${encodeURIComponent(stringValue(formData, "tenantId"))}#subscriptions-top`);
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

function businessSegmentValue(formData: FormData): BusinessSegment {
  const segment = stringValue(formData, "businessSegment");

  if (!businessSegments.includes(segment as BusinessSegment)) {
    throw new Error(`Unsupported business segment: ${segment}`);
  }

  return segment as BusinessSegment;
}

function fsmPlanTierValue(formData: FormData): FsmPlanTier {
  const planTier = stringValue(formData, "planTier");

  if (!fsmPlanTiers.includes(planTier as FsmPlanTier)) {
    throw new Error(`Unsupported FSM plan tier: ${planTier}`);
  }

  return planTier as FsmPlanTier;
}

function optionalIntegerValue(formData: FormData, key: string) {
  const raw = stringValue(formData, key).trim();
  if (!raw) return null;
  const value = Number(raw);

  if (!Number.isInteger(value)) {
    throw new Error(`${key} must be an integer.`);
  }

  return value;
}

function sectionValue(formData: FormData) {
  const section = stringValue(formData, "section").trim().toLowerCase();
  return ["crm", "fsm", "tex", "cme", "lqs"].includes(section) ? section : "";
}

function sectionQuery(section: string) {
  return section ? `section=${encodeURIComponent(section)}&` : "";
}
