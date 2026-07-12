"use server";

import { roleKeys, type RoleKey } from "@torrevie/permissions";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  updateTenantWhatsappSettings,
  type CustomerAdminContext,
  type TenantWhatsappSettingsInput,
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
      webhookVerifyToken: stringValue(formData, "webhookVerifyToken")
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
    roles: rolesResult.rows.map((row) => row.key).filter(isRoleKey)
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

function isRoleKey(value: string): value is RoleKey {
  return roleKeys.includes(value as RoleKey);
}
