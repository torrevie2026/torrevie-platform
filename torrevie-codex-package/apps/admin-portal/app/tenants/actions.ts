"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { getSupabaseAdminClient } from "../../lib/admin-client";
import { getPlatformSession } from "../../lib/session";
import { hardDeleteTenantData } from "../../lib/tenant-data-management";
import {
  createTenant,
  setTenantStatus,
  tenantStatuses,
  updateTenant,
  type TenantStatus
} from "../../lib/tenant-lifecycle";

export async function createTenantAction(formData: FormData) {
  const session = await requirePlatformSession();

  await createTenant(
    getSupabaseAdminClient(),
    {
      name: stringValue(formData, "name"),
      slug: stringValue(formData, "slug"),
      status: statusValue(formData, "status"),
      region: stringValue(formData, "region"),
      legalEntityName: stringValue(formData, "legalEntityName"),
      billingEmail: stringValue(formData, "billingEmail")
    },
    {
      defaultLocale: localeValue(formData),
      timezone: stringValue(formData, "timezone") || "Asia/Dubai"
    },
    session.userId
  );

  revalidatePath("/tenants");
  redirect("/tenants");
}

export async function updateTenantAction(formData: FormData) {
  const session = await requirePlatformSession();

  await updateTenant(
    getSupabaseAdminClient(),
    stringValue(formData, "tenantId"),
    {
      name: stringValue(formData, "name"),
      slug: stringValue(formData, "slug"),
      status: statusValue(formData, "status"),
      region: stringValue(formData, "region"),
      legalEntityName: stringValue(formData, "legalEntityName"),
      billingEmail: stringValue(formData, "billingEmail")
    },
    session.userId
  );

  revalidatePath("/tenants");
  redirect("/tenants");
}

export async function setTenantStatusAction(formData: FormData) {
  const session = await requirePlatformSession();

  await setTenantStatus(
    getSupabaseAdminClient(),
    stringValue(formData, "tenantId"),
    statusValue(formData, "status"),
    session.userId
  );

  revalidatePath("/tenants");
  redirect("/tenants");
}

export async function hardDeleteTenantAction(formData: FormData) {
  await requirePlatformSession();

  await hardDeleteTenantData(
    getSupabaseAdminClient(),
    stringValue(formData, "tenantId"),
    stringValue(formData, "confirmationSlug").trim()
  );

  revalidatePath("/tenants");
  redirect("/tenants?deleted=1");
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

function statusValue(formData: FormData, key: string): TenantStatus {
  const status = stringValue(formData, key);

  if (!tenantStatuses.includes(status as TenantStatus)) {
    throw new Error(`Unsupported tenant status: ${status}`);
  }

  return status as TenantStatus;
}

function localeValue(formData: FormData): "en" | "ar" {
  return stringValue(formData, "defaultLocale") === "ar" ? "ar" : "en";
}
