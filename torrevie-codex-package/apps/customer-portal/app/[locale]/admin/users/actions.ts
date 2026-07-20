"use server";

import { roleKeys, type RoleKey } from "@torrevie/permissions";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  assignCustomerUserRole,
  assignableCustomerRoles,
  inviteCustomerUser,
  membershipStatuses,
  removeCustomerUser,
  saveWhatsappProviderProfile,
  sendCustomerPasswordReset,
  setCustomerMembershipStatus,
  setCustomerUserMfaRequirement,
  updateTenantWhatsappSettings,
  type CustomerAdminContext,
  type MembershipStatus,
  type TenantWhatsappSettingsInput,
  type WhatsappProviderProfileInput,
  type WhatsappProvider
} from "../../../../lib/customer-administration";
import {
  isCustomerSessionError,
  requireVerifiedCustomerSession,
  resolveCustomerTenantContext
} from "../../../../lib/server/customer-session";
import { PostgresTenantQueryClient } from "../../../../lib/server/tenant-query-client";

export async function updateTenantWhatsappSettingsAction(formData: FormData) {
  const locale = stringValue(formData, "locale") || "en";

  try {
    const { client, actor } = await resolveActor();
    const provider = sanitizeProvider(stringValue(formData, "provider"));
    const input: TenantWhatsappSettingsInput = {
      provider,
      webhookUrl: stringValue(formData, "webhookUrl"),
      whatsappInstanceId: stringValue(formData, "whatsappInstanceId"),
      wappflySessionId: stringValue(formData, "wappflySessionId"),
      metaPhoneNumberId: stringValue(formData, "metaPhoneNumberId"),
      metaWhatsappBusinessAccountId: stringValue(formData, "metaWhatsappBusinessAccountId"),
      googleMapsEnabled: formData.get("googleMapsEnabled") === "on",
      apiKey: stringValue(formData, "apiKey"),
      appSecret: stringValue(formData, "appSecret"),
      webhookVerifyToken: stringValue(formData, "webhookVerifyToken"),
      aiReceiptExtractionEnabled: formData.get("aiReceiptExtractionEnabled") === "on",
      duplicateDetectionEnabled: formData.get("duplicateDetectionEnabled") === "on",
      duplicateAutoRejectEnabled: formData.get("duplicateAutoRejectEnabled") === "on",
      emailNotificationsEnabled: formData.get("emailNotificationsEnabled") === "on",
      emailReportFrequency: frequencyValue(formData),
      emailReportRecipients: stringValue(formData, "emailReportRecipients")
        .split(/[,\n]/)
        .map((value) => value.trim())
        .filter(Boolean)
    };

    await updateTenantWhatsappSettings(client, actor, input);
    revalidatePath(`/${locale}/admin/users`);
  } catch (error) {
    if (isCustomerSessionError(error)) {
      redirect("/login");
    }

    redirect(`/${locale}/admin/users?integration=failed`);
  }

  redirect(`/${locale}/admin/users?integration=updated`);
}

export async function inviteCustomerUserAction(formData: FormData) {
  const locale = stringValue(formData, "locale") || "en";

  try {
    const { client, actor } = await resolveActor();

    await inviteCustomerUser(client, actor, {
      email: stringValue(formData, "email"),
      displayName: stringValue(formData, "displayName"),
      role: roleValue(formData)
    });

    revalidatePath(`/${locale}/admin/users`);
  } catch (error) {
    if (isCustomerSessionError(error)) {
      redirect("/login");
    }

    const message = error instanceof Error ? error.message : "Invite failed";
    redirect(`/${locale}/admin/users?users=failed&message=${encodeURIComponent(message)}`);
  }

  redirect(`/${locale}/admin/users?users=invited`);
}

export async function updateCustomerUserAction(formData: FormData) {
  const locale = stringValue(formData, "locale") || "en";

  try {
    const { client, actor } = await resolveActor();
    const userId = stringValue(formData, "userId");
    const intent = stringValue(formData, "intent") || "update";

    if (intent === "delete") {
      await removeCustomerUser(client, actor, userId);
    } else if (intent === "password_reset") {
      await sendCustomerPasswordReset(client, actor, userId);
    } else {
      await assignCustomerUserRole(client, actor, userId, roleValue(formData));
      await setCustomerMembershipStatus(client, actor, userId, membershipStatusValue(formData));
      await setCustomerUserMfaRequirement(client, actor, userId, formData.get("requireMfa") === "on");
    }
    revalidatePath(`/${locale}/admin/users`);
  } catch (error) {
    if (isCustomerSessionError(error)) {
      redirect("/login");
    }

    const message = error instanceof Error ? error.message : "User update failed";
    redirect(`/${locale}/admin/users?users=failed&message=${encodeURIComponent(message)}`);
  }

  const result =
    stringValue(formData, "intent") === "delete"
      ? "deleted"
      : stringValue(formData, "intent") === "password_reset"
        ? "password_reset"
        : "updated";
  redirect(`/${locale}/admin/users?users=${result}`);
}

export async function saveWhatsappProviderProfileAction(formData: FormData) {
  const locale = stringValue(formData, "locale") || "en";

  try {
    const { client, actor } = await resolveActor();
    const input: WhatsappProviderProfileInput = {
      label: stringValue(formData, "profileLabel"),
      provider: sanitizeProvider(stringValue(formData, "profileProvider")),
      status: formData.get("profileStatus") === "inactive" ? "inactive" : "active",
      isDefault: formData.get("profileIsDefault") === "on",
      webhookUrl: stringValue(formData, "profileWebhookUrl"),
      whatsappInstanceId: stringValue(formData, "profileWhatsappInstanceId"),
      wappflySessionId: stringValue(formData, "profileWappflySessionId"),
      metaPhoneNumberId: stringValue(formData, "profileMetaPhoneNumberId"),
      metaWhatsappBusinessAccountId: stringValue(formData, "profileMetaWhatsappBusinessAccountId"),
      apiKey: stringValue(formData, "profileApiKey")
    };

    await saveWhatsappProviderProfile(client, actor, input);
    revalidatePath(`/${locale}/admin/users`);
  } catch (error) {
    if (isCustomerSessionError(error)) {
      redirect("/login");
    }

    const message = error instanceof Error ? error.message : "Provider profile update failed";
    redirect(`/${locale}/admin/users?integration=failed&message=${encodeURIComponent(message)}`);
  }

  redirect(`/${locale}/admin/users?integration=profile_saved`);
}

async function resolveActor() {
  const session = await requireVerifiedCustomerSession();
  const client = new PostgresTenantQueryClient(session.userId);
  const tenantContext = await resolveCustomerTenantContext(client, session);
  const rolesResult = await client.query<{ key: string }>(
    `
      select r.key
      from public.user_role_assignments ura
      join public.roles r on r.id = ura.role_id
      where ura.tenant_id = $1
        and ura.user_id = $2
    `,
    [tenantContext.tenantId, tenantContext.userId]
  );
  const actor: CustomerAdminContext = {
    ...tenantContext,
    roles:
      tenantContext.roleScope === "platform"
        ? ["torrevie_platform_admin"]
        : rolesResult.rows.map((row) => row.key).filter(isRoleKey)
  };

  return { client, actor };
}

function stringValue(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function sanitizeProvider(value: string): WhatsappProvider {
  if (value === "ultramsg" || value === "wappfly" || value === "meta") {
    return value;
  }

  return "ultramsg";
}

function frequencyValue(formData: FormData): "off" | "daily" | "weekly" | "monthly" {
  const value = stringValue(formData, "emailReportFrequency");

  if (value === "off" || value === "daily" || value === "weekly" || value === "monthly") {
    return value;
  }

  return "weekly";
}

function roleValue(formData: FormData): RoleKey {
  const role = stringValue(formData, "role");

  if (assignableCustomerRoles.includes(role as RoleKey)) {
    return role as RoleKey;
  }

  return "customer_standard_user";
}

function membershipStatusValue(formData: FormData): MembershipStatus {
  const status = stringValue(formData, "status");

  if (membershipStatuses.includes(status as MembershipStatus)) {
    return status as MembershipStatus;
  }

  return "active";
}

function isRoleKey(value: string): value is RoleKey {
  return roleKeys.includes(value as RoleKey);
}
