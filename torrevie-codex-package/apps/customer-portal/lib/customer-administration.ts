import { createClient } from "@supabase/supabase-js";
import { dispatchEmailNotification } from "@torrevie/notifications";
import { assertPermission, roleKeys, type RoleKey } from "@torrevie/permissions";
import { withTenantContext, type ResolvedTenantContext, type TenantQueryClient } from "@torrevie/tenant-context";

export const assignableCustomerRoles = roleKeys.filter(
  (role) => role.startsWith("customer_") && role !== "integration_service"
) as RoleKey[];

export const membershipStatuses = ["active", "invited", "disabled"] as const;
export type MembershipStatus = (typeof membershipStatuses)[number];

const fsmFieldRoles = new Set<RoleKey>(["customer_standard_user"]);
const fsmOfficeRoles = new Set<RoleKey>([
  "customer_admin",
  "customer_module_admin",
  "customer_manager",
  "customer_readonly"
]);

export type CustomerAdminContext = ResolvedTenantContext & {
  roles: readonly RoleKey[];
};

export type CustomerMemberRecord = {
  userId: string;
  email: string;
  displayName: string | null;
  status: MembershipStatus;
  roles: RoleKey[];
  requireMfa: boolean;
  mfaEnrolled: boolean;
};

export type TenantUsageLimits = {
  webUsersLimit: number | null;
  webUsersUsed: number;
  whatsappProviderProfilesLimit: number | null;
  emailNotificationsMonthlyLimit: number | null;
  databaseStorageMbLimit: number | null;
  enabledModules: string[];
  capabilities: Array<{ key: string; limit: number | null }>;
};

export type CustomerInviteInput = {
  email: string;
  displayName?: string | null;
  role: RoleKey;
};

type CustomerInviteIdentity = {
  userId: string;
  actionLink: string;
  kind: "new_invitation" | "existing_user";
};

type CustomerInviteEmailInput = {
  email: string;
  tenantName: string;
  actionLink: string;
  kind: CustomerInviteIdentity["kind"];
};

type CustomerPasswordResetEmailInput = {
  email: string;
  tenantName: string;
  actionLink: string;
};

export type WhatsappProvider = "ultramsg" | "wappfly" | "meta";

export type TenantWhatsappSettings = {
  provider: WhatsappProvider;
  webhookUrl: string;
  whatsappInstanceId: string;
  wappflySessionId: string;
  metaPhoneNumberId: string;
  metaWhatsappBusinessAccountId: string;
  googleMapsEnabled: boolean;
  apiKeyConfigured: boolean;
  apiKeyLast4: string;
  appSecretConfigured: boolean;
  appSecretLast4: string;
  webhookVerifyTokenConfigured: boolean;
  webhookVerifyTokenLast4: string;
  aiReceiptExtractionEnabled: boolean;
  duplicateDetectionEnabled: boolean;
  duplicateAutoRejectEnabled: boolean;
  emailNotificationsEnabled: boolean;
  emailReportFrequency: "off" | "daily" | "weekly" | "monthly";
  emailReportRecipients: string[];
};

export type TenantWhatsappSettingsInput = {
  provider: WhatsappProvider;
  webhookUrl?: string | null;
  whatsappInstanceId?: string | null;
  wappflySessionId?: string | null;
  metaPhoneNumberId?: string | null;
  metaWhatsappBusinessAccountId?: string | null;
  googleMapsEnabled: boolean;
  apiKey?: string | null;
  appSecret?: string | null;
  webhookVerifyToken?: string | null;
  aiReceiptExtractionEnabled?: boolean;
  duplicateDetectionEnabled?: boolean;
  duplicateAutoRejectEnabled?: boolean;
  emailNotificationsEnabled?: boolean;
  emailReportFrequency?: "off" | "daily" | "weekly" | "monthly";
  emailReportRecipients?: string[];
};

export type WhatsappProviderProfile = {
  id: string;
  label: string;
  provider: WhatsappProvider;
  status: "active" | "inactive";
  isDefault: boolean;
  webhookUrl: string;
  whatsappInstanceId: string;
  wappflySessionId: string;
  metaPhoneNumberId: string;
  metaWhatsappBusinessAccountId: string;
  apiKeyConfigured: boolean;
  apiKeyLast4: string;
};

export type WhatsappProviderProfileInput = Omit<WhatsappProviderProfile, "id" | "apiKeyConfigured" | "apiKeyLast4"> & {
  apiKey?: string | null;
};

const unlimitedFeatureKeys = new Set([
  "tex.receipts.ocr.enabled",
  "tex.whatsapp.enabled",
  "tex.trips.enabled",
  "tex.finance.settlements.enabled"
]);

let customerInviteIdentityCreator = createCustomerInviteIdentity;
let customerInviteEmailDispatcher = sendCustomerInviteEmail;
let customerPasswordResetLinkCreator = createCustomerPasswordResetLink;
let customerPasswordResetEmailDispatcher = sendCustomerPasswordResetEmail;

export function setCustomerInviteIdentityCreatorForTests(
  creator: typeof createCustomerInviteIdentity | null
) {
  customerInviteIdentityCreator = creator ?? createCustomerInviteIdentity;
}

export function setCustomerInviteEmailDispatcherForTests(
  dispatcher: typeof sendCustomerInviteEmail | null
) {
  customerInviteEmailDispatcher = dispatcher ?? sendCustomerInviteEmail;
}

export function setCustomerPasswordResetLinkCreatorForTests(
  creator: typeof createCustomerPasswordResetLink | null
) {
  customerPasswordResetLinkCreator = creator ?? createCustomerPasswordResetLink;
}

export function setCustomerPasswordResetEmailDispatcherForTests(
  dispatcher: typeof sendCustomerPasswordResetEmail | null
) {
  customerPasswordResetEmailDispatcher = dispatcher ?? sendCustomerPasswordResetEmail;
}

export function resolveCustomerPasswordSetupCallbackUrlForTests() {
  return customerPasswordSetupCallbackUrl();
}

export async function listCustomerMembers(
  client: TenantQueryClient,
  actor: CustomerAdminContext
): Promise<CustomerMemberRecord[]> {
  assertCustomerPermission(actor, "tenant.user.manage");

  return withTenantContext(client, actor, async () => {
    const result = await client.query<MemberRow>(
      `
        select
          u.id as user_id,
          u.email,
          u.mfa_enrolled,
          tm.status,
          up.display_name,
          up.require_mfa,
          r.key as role_key
        from public.tenant_memberships tm
        join public.users u on u.id = tm.user_id
        left join public.user_profiles up
          on up.tenant_id = tm.tenant_id
         and up.user_id = tm.user_id
        left join public.user_role_assignments ura
          on ura.tenant_id = tm.tenant_id
         and ura.user_id = tm.user_id
        left join public.roles r on r.id = ura.role_id
        where tm.tenant_id = public.current_tenant_id()
        order by u.email asc, r.key asc
      `
    );

    return groupMemberRows(result.rows);
  });
}

export async function inviteCustomerUser(
  client: TenantQueryClient,
  actor: CustomerAdminContext,
  input: CustomerInviteInput
): Promise<CustomerMemberRecord> {
  assertCustomerPermission(actor, "tenant.user.invite");
  assertCustomerPermission(actor, "tenant.role.assign");

  const email = sanitizeEmail(input.email);
  const displayName = cleanOptional(input.displayName);
  const role = sanitizeAssignableRole(input.role);

  return withTenantContext(client, actor, async () => {
    await assertWebUserLimitAllowsInvite(client, email);
    await assertFsmSeatLimitAllowsInvite(client, email, role);

    const tenantName = await getCurrentTenantName(client);
    const identity = await customerInviteIdentityCreator(email);
    const userId = await upsertUserIdentity(client, email, actor.userId, identity.userId);

    await client.query(
      `
        insert into public.tenant_memberships (tenant_id, user_id, status, invited_by, created_by, updated_by)
        values (public.current_tenant_id(), $1, 'invited', $2, $2, $2)
        on conflict (tenant_id, user_id)
        do update set status = 'invited', invited_by = $2, updated_by = $2
      `,
      [userId, actor.userId]
    );

    if (displayName) {
      await client.query(
        `
          insert into public.user_profiles (tenant_id, user_id, display_name, created_by, updated_by)
          select public.current_tenant_id(), $1, $2, $3, $3
          where not exists (
            select 1
            from public.user_profiles
            where tenant_id = public.current_tenant_id()
              and user_id = $1
          )
        `,
        [userId, displayName, actor.userId]
      );
    }

    await replaceCustomerRole(client, userId, role, actor.userId);
    await writeCustomerAdminAuditEvent(client, actor, "tenant.user.invited", "user", userId, {
      email,
      role,
      invite_kind: identity.kind
    });
    await customerInviteEmailDispatcher({
      email,
      tenantName,
      actionLink: identity.actionLink,
      kind: identity.kind
    });

    return {
      userId,
      email,
      displayName,
      status: "invited",
      roles: [role],
      requireMfa: false,
      mfaEnrolled: false
    };
  });
}

export async function getTenantUsageLimits(
  client: TenantQueryClient,
  actor: CustomerAdminContext
): Promise<TenantUsageLimits> {
  assertCustomerPermission(actor, "tenant.user.manage");

  return withTenantContext(client, actor, async () => {
    const entitlements = await client.query<EntitlementRow>(
      `
        select se.feature_key, se.limit_value
        from public.subscription_entitlements se
        join public.subscriptions s on s.id = se.subscription_id
        where se.tenant_id = public.current_tenant_id()
          and s.status in ('trial', 'active')
        order by se.feature_key asc
      `
    );
    const userUsage = await client.query<{ count: number }>(
      `
        select count(*)::int as count
        from public.tenant_memberships
        where tenant_id = public.current_tenant_id()
          and status in ('active', 'invited')
      `
    );

    return mapUsageLimits(entitlements.rows, userUsage.rows[0]?.count ?? 0);
  });
}

export async function getTenantWhatsappSettings(
  client: TenantQueryClient,
  actor: CustomerAdminContext
): Promise<TenantWhatsappSettings> {
  assertTenantSettingsPermission(actor);

  return withTenantContext(client, actor, async () => {
    const result = await client.query<WhatsappSettingsRow>(
      `
        select
          whatsapp_provider,
          whatsapp_instance_id,
          wappfly_session_id,
          meta_phone_number_id,
          meta_whatsapp_business_account_id,
          google_maps_enabled,
          whatsapp_webhook_url,
          whatsapp_webhook_verify_token_last4,
          whatsapp_api_key_last4,
          whatsapp_app_secret_last4,
          whatsapp_keys_configured,
          ai_receipt_extraction_enabled,
          duplicate_detection_enabled,
          duplicate_auto_reject_enabled,
          email_notifications_enabled,
          email_report_frequency,
          email_report_recipients
        from public.tex_integration_settings
        where tenant_id = public.current_tenant_id()
        limit 1
      `
    );

    return mapWhatsappSettings(result.rows[0]);
  });
}

export async function updateTenantWhatsappSettings(
  client: TenantQueryClient,
  actor: CustomerAdminContext,
  input: TenantWhatsappSettingsInput
): Promise<TenantWhatsappSettings> {
  assertTenantSettingsPermission(actor);

  const provider = sanitizeWhatsappProvider(input.provider);
  const webhookUrl = cleanOptional(input.webhookUrl);
  const whatsappInstanceId = cleanOptional(input.whatsappInstanceId);
  const wappflySessionId = cleanOptional(input.wappflySessionId);
  const metaPhoneNumberId = cleanOptional(input.metaPhoneNumberId);
  const metaWhatsappBusinessAccountId = cleanOptional(input.metaWhatsappBusinessAccountId);
  const apiKey = cleanOptional(input.apiKey);
  const appSecret = cleanOptional(input.appSecret);
  const webhookVerifyToken = cleanOptional(input.webhookVerifyToken);

  validateWebhookUrl(webhookUrl);

  return withTenantContext(client, actor, async () => {
    if (apiKey) {
      await upsertTenantIntegrationSecret(client, actor, "api_key", apiKey);
    }

    if (appSecret) {
      await upsertTenantIntegrationSecret(client, actor, "app_secret", appSecret);
    }

    if (webhookVerifyToken) {
      await upsertTenantIntegrationSecret(client, actor, "webhook_verify_token", webhookVerifyToken);
    }

    const apiKeyLast4 = apiKey ? last4(apiKey) : undefined;
    const appSecretLast4 = appSecret ? last4(appSecret) : undefined;
    const webhookVerifyTokenLast4 = webhookVerifyToken ? last4(webhookVerifyToken) : undefined;

    const result = await client.query<WhatsappSettingsRow>(
      `
        insert into public.tex_integration_settings (
          tenant_id,
          whatsapp_provider,
          whatsapp_instance_id,
          wappfly_session_id,
          meta_phone_number_id,
          meta_whatsapp_business_account_id,
          google_maps_enabled,
          whatsapp_webhook_url,
          whatsapp_api_key_last4,
          whatsapp_app_secret_last4,
          whatsapp_webhook_verify_token_last4,
          whatsapp_keys_configured,
          ai_receipt_extraction_enabled,
          duplicate_detection_enabled,
          duplicate_auto_reject_enabled,
          email_notifications_enabled,
          email_report_frequency,
          email_report_recipients,
          created_by,
          updated_by
        )
        values (
          public.current_tenant_id(),
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11,
          $12,
          $13,
          $14,
          $15,
          $16,
          $17::text[],
          $18,
          $18
        )
        on conflict (tenant_id)
        do update set
          whatsapp_provider = excluded.whatsapp_provider,
          whatsapp_instance_id = excluded.whatsapp_instance_id,
          wappfly_session_id = excluded.wappfly_session_id,
          meta_phone_number_id = excluded.meta_phone_number_id,
          meta_whatsapp_business_account_id = excluded.meta_whatsapp_business_account_id,
          google_maps_enabled = excluded.google_maps_enabled,
          whatsapp_webhook_url = excluded.whatsapp_webhook_url,
          whatsapp_api_key_last4 = coalesce(excluded.whatsapp_api_key_last4, public.tex_integration_settings.whatsapp_api_key_last4),
          whatsapp_app_secret_last4 = coalesce(excluded.whatsapp_app_secret_last4, public.tex_integration_settings.whatsapp_app_secret_last4),
          whatsapp_webhook_verify_token_last4 = coalesce(
            excluded.whatsapp_webhook_verify_token_last4,
            public.tex_integration_settings.whatsapp_webhook_verify_token_last4
          ),
          whatsapp_keys_configured = public.tex_integration_settings.whatsapp_keys_configured or excluded.whatsapp_keys_configured,
          ai_receipt_extraction_enabled = excluded.ai_receipt_extraction_enabled,
          duplicate_detection_enabled = excluded.duplicate_detection_enabled,
          duplicate_auto_reject_enabled = excluded.duplicate_auto_reject_enabled,
          email_notifications_enabled = excluded.email_notifications_enabled,
          email_report_frequency = excluded.email_report_frequency,
          email_report_recipients = excluded.email_report_recipients,
          updated_by = excluded.updated_by
        returning
          whatsapp_provider,
          whatsapp_instance_id,
          wappfly_session_id,
          meta_phone_number_id,
          meta_whatsapp_business_account_id,
          google_maps_enabled,
          whatsapp_webhook_url,
          whatsapp_webhook_verify_token_last4,
          whatsapp_api_key_last4,
          whatsapp_app_secret_last4,
          whatsapp_keys_configured,
          ai_receipt_extraction_enabled,
          duplicate_detection_enabled,
          duplicate_auto_reject_enabled,
          email_notifications_enabled,
          email_report_frequency,
          email_report_recipients
      `,
      [
        provider,
        whatsappInstanceId,
        wappflySessionId,
        metaPhoneNumberId,
        metaWhatsappBusinessAccountId,
        input.googleMapsEnabled,
        webhookUrl,
        apiKeyLast4 ?? null,
        appSecretLast4 ?? null,
        webhookVerifyTokenLast4 ?? null,
        Boolean(apiKey || appSecret || webhookVerifyToken),
        input.aiReceiptExtractionEnabled ?? true,
        input.duplicateDetectionEnabled ?? true,
        input.duplicateAutoRejectEnabled ?? false,
        input.emailNotificationsEnabled ?? false,
        sanitizeEmailReportFrequency(input.emailReportFrequency ?? "weekly"),
        toPostgresTextArrayLiteral(sanitizeEmailRecipients(input.emailReportRecipients ?? [])),
        actor.userId
      ]
    );

    await writeCustomerAdminAuditEvent(client, actor, "tenant.integration.whatsapp.updated", "tex_integration_settings", actor.tenantId, {
      provider
    });

    return mapWhatsappSettings(result.rows[0]);
  });
}

export async function listWhatsappProviderProfiles(
  client: TenantQueryClient,
  actor: CustomerAdminContext
): Promise<WhatsappProviderProfile[]> {
  assertTenantSettingsPermission(actor);

  return withTenantContext(client, actor, async () => {
    const result = await client.query<WhatsappProviderProfileRow>(
      `
        select
          id,
          label,
          provider,
          status,
          is_default,
          webhook_url,
          whatsapp_instance_id,
          wappfly_session_id,
          meta_phone_number_id,
          meta_whatsapp_business_account_id,
          api_key_last4,
          keys_configured
        from public.tenant_whatsapp_provider_profiles
        where tenant_id = public.current_tenant_id()
        order by is_default desc, label asc
      `
    );

    return result.rows.map(mapWhatsappProviderProfile);
  });
}

export async function saveWhatsappProviderProfile(
  client: TenantQueryClient,
  actor: CustomerAdminContext,
  input: WhatsappProviderProfileInput
): Promise<WhatsappProviderProfile> {
  assertTenantSettingsPermission(actor);
  const provider = sanitizeWhatsappProvider(input.provider);
  const label = cleanRequired(input.label, "Provider profile name");
  const webhookUrl = cleanOptional(input.webhookUrl);
  const apiKey = cleanOptional(input.apiKey);
  const status = input.status === "active" ? "active" : "inactive";

  validateWebhookUrl(webhookUrl);

  return withTenantContext(client, actor, async () => {
    await assertWhatsappProviderProfileLimitAllowsSave(client, label);

    if (input.isDefault) {
      await client.query(
        `
          update public.tenant_whatsapp_provider_profiles
             set is_default = false,
                 updated_by = $1
           where tenant_id = public.current_tenant_id()
        `,
        [actor.userId]
      );
    }

    const result = await client.query<WhatsappProviderProfileRow>(
      `
        insert into public.tenant_whatsapp_provider_profiles (
          tenant_id,
          label,
          provider,
          status,
          is_default,
          webhook_url,
          whatsapp_instance_id,
          wappfly_session_id,
          meta_phone_number_id,
          meta_whatsapp_business_account_id,
          api_key_last4,
          keys_configured,
          created_by,
          updated_by
        )
        values (
          public.current_tenant_id(),
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11,
          $12,
          $12
        )
        on conflict (tenant_id, label)
        do update set
          provider = excluded.provider,
          status = excluded.status,
          is_default = excluded.is_default,
          webhook_url = excluded.webhook_url,
          whatsapp_instance_id = excluded.whatsapp_instance_id,
          wappfly_session_id = excluded.wappfly_session_id,
          meta_phone_number_id = excluded.meta_phone_number_id,
          meta_whatsapp_business_account_id = excluded.meta_whatsapp_business_account_id,
          api_key_last4 = coalesce(excluded.api_key_last4, public.tenant_whatsapp_provider_profiles.api_key_last4),
          keys_configured = public.tenant_whatsapp_provider_profiles.keys_configured or excluded.keys_configured,
          updated_by = excluded.updated_by
        returning
          id,
          label,
          provider,
          status,
          is_default,
          webhook_url,
          whatsapp_instance_id,
          wappfly_session_id,
          meta_phone_number_id,
          meta_whatsapp_business_account_id,
          api_key_last4,
          keys_configured
      `,
      [
        label,
        provider,
        status,
        input.isDefault,
        webhookUrl,
        cleanOptional(input.whatsappInstanceId),
        cleanOptional(input.wappflySessionId),
        cleanOptional(input.metaPhoneNumberId),
        cleanOptional(input.metaWhatsappBusinessAccountId),
        apiKey ? last4(apiKey) : null,
        Boolean(apiKey),
        actor.userId
      ]
    );

    const profile = result.rows[0];

    if (!profile) {
      throw new Error("Unable to save WhatsApp provider profile.");
    }

    if (apiKey) {
      await upsertTenantIntegrationSecret(client, actor, "api_key", apiKey, profile.id);
    }

    if (profile.is_default) {
      await syncDefaultWhatsappProfileToActiveSettings(client, actor, profile);
    }

    await writeCustomerAdminAuditEvent(client, actor, "tenant.integration.whatsapp.profile.saved", "tenant_whatsapp_provider_profiles", profile.id, {
      provider,
      label
    });

    return mapWhatsappProviderProfile(profile);
  });
}

export async function assignCustomerUserRole(
  client: TenantQueryClient,
  actor: CustomerAdminContext,
  targetUserId: string,
  role: RoleKey
): Promise<void> {
  assertCustomerPermission(actor, "tenant.role.assign");
  assertUuid(targetUserId, "target user id");
  const sanitizedRole = sanitizeAssignableRole(role);

  await withTenantContext(client, actor, async () => {
    await assertTenantMemberExists(client, targetUserId);
    await replaceCustomerRole(client, targetUserId, sanitizedRole, actor.userId);
    await writeCustomerAdminAuditEvent(client, actor, "tenant.role.assigned", "user", targetUserId, {
      role: sanitizedRole
    });
  });
}

export async function setCustomerMembershipStatus(
  client: TenantQueryClient,
  actor: CustomerAdminContext,
  targetUserId: string,
  status: MembershipStatus
): Promise<void> {
  assertCustomerPermission(actor, "tenant.user.manage");
  assertUuid(targetUserId, "target user id");
  assertMembershipStatus(status);

  if (targetUserId === actor.userId && status === "disabled") {
    throw new Error("Customer administrators cannot disable their own active tenant membership.");
  }

  await withTenantContext(client, actor, async () => {
    const result = await client.query<{ id: string }>(
      `
        update public.tenant_memberships
           set status = $1,
               updated_by = $2
         where tenant_id = public.current_tenant_id()
           and user_id = $3
         returning id
      `,
      [status, actor.userId, targetUserId]
    );

    if (result.rows.length !== 1) {
      throw new Error("Tenant member was not found.");
    }

    await writeCustomerAdminAuditEvent(client, actor, `tenant.user.${status}`, "user", targetUserId, {
      status
    });
  });
}

export async function setCustomerUserMfaRequirement(
  client: TenantQueryClient,
  actor: CustomerAdminContext,
  targetUserId: string,
  required: boolean
): Promise<void> {
  assertCustomerPermission(actor, "tenant.user.manage");
  assertUuid(targetUserId, "target user id");

  await withTenantContext(client, actor, async () => {
    await assertTenantMemberExists(client, targetUserId);
    await client.query(
      `
        insert into public.user_profiles (tenant_id, user_id, display_name, require_mfa, created_by, updated_by)
        values (public.current_tenant_id(), $1, 'Tenant user', $2, $3, $3)
        on conflict (tenant_id, user_id)
        do update set require_mfa = excluded.require_mfa,
                      updated_by = excluded.updated_by
      `,
      [targetUserId, required, actor.userId]
    );
    await writeCustomerAdminAuditEvent(client, actor, "tenant.user.mfa_requirement_updated", "user", targetUserId, {
      require_mfa: String(required)
    });
  });
}

export async function removeCustomerUser(
  client: TenantQueryClient,
  actor: CustomerAdminContext,
  targetUserId: string
): Promise<void> {
  assertCustomerPermission(actor, "tenant.user.manage");
  assertUuid(targetUserId, "target user id");

  if (targetUserId === actor.userId) {
    throw new Error("Customer administrators cannot delete their own tenant access.");
  }

  await withTenantContext(client, actor, async () => {
    await assertTenantMemberExists(client, targetUserId);
    await client.query(
      `
        delete from public.user_role_assignments
         where tenant_id = public.current_tenant_id()
           and user_id = $1
      `,
      [targetUserId]
    );
    await client.query(
      `
        delete from public.user_profiles
         where tenant_id = public.current_tenant_id()
           and user_id = $1
      `,
      [targetUserId]
    );
    await client.query(
      `
        delete from public.tenant_memberships
         where tenant_id = public.current_tenant_id()
           and user_id = $1
      `,
      [targetUserId]
    );
    await writeCustomerAdminAuditEvent(client, actor, "tenant.user.removed", "user", targetUserId, {});
  });
}

export async function sendCustomerPasswordReset(
  client: TenantQueryClient,
  actor: CustomerAdminContext,
  targetUserId: string
): Promise<void> {
  assertCustomerPermission(actor, "tenant.user.manage");
  assertUuid(targetUserId, "target user id");

  await withTenantContext(client, actor, async () => {
    await assertTenantMemberExists(client, targetUserId);
    const tenantName = await getCurrentTenantName(client);
    const email = await getCustomerUserEmail(client, targetUserId);
    const actionLink = await customerPasswordResetLinkCreator(email);

    await client.query(
      `
        insert into public.user_profiles (tenant_id, user_id, display_name, require_password_change, created_by, updated_by)
        values (public.current_tenant_id(), $1, 'Tenant user', true, $2, $2)
        on conflict (tenant_id, user_id)
        do update set require_password_change = true,
                      updated_by = excluded.updated_by
      `,
      [targetUserId, actor.userId]
    );
    await customerPasswordResetEmailDispatcher({
      email,
      tenantName,
      actionLink
    });
    await writeCustomerAdminAuditEvent(client, actor, "tenant.user.password_reset_sent", "user", targetUserId, {
      email
    });
  });
}

function assertCustomerPermission(actor: CustomerAdminContext, permission: "tenant.user.invite" | "tenant.user.manage" | "tenant.role.assign") {
  if (actor.roleScope !== "customer") {
    throw new Error("Customer administration requires a customer tenant context.");
  }

  assertPermission({
    roles: actor.roles,
    permission
  });
}

function assertTenantSettingsPermission(actor: CustomerAdminContext) {
  if (actor.roleScope !== "customer") {
    throw new Error("Tenant integration setup requires a customer tenant context.");
  }

  assertPermission({
    roles: actor.roles,
    permission: "tenant.settings.manage"
  });
}

async function upsertTenantIntegrationSecret(
  client: TenantQueryClient,
  actor: CustomerAdminContext,
  secretName: "api_key" | "app_secret" | "webhook_verify_token",
  secretValue: string,
  profileId: string | null = null
) {
  await client.query(
    `
      delete from public.tenant_integration_secrets
       where tenant_id = public.current_tenant_id()
         and product_key = 'tex'
         and integration_key = 'whatsapp'
         and secret_name = $1
         and (
           (profile_id is null and $2::uuid is null)
           or profile_id = $2::uuid
         )
    `,
    [secretName, profileId]
  );

  await client.query(
    `
      insert into public.tenant_integration_secrets (
        tenant_id,
        product_key,
        integration_key,
        profile_id,
        secret_name,
        secret_value,
        secret_last4,
        created_by,
        updated_by
      )
      values (public.current_tenant_id(), 'tex', 'whatsapp', $1, $2, $3, $4, $5, $5)
    `,
    [profileId, secretName, secretValue, last4(secretValue), actor.userId]
  );
}

async function assertWebUserLimitAllowsInvite(client: TenantQueryClient, email: string) {
  const limitResult = await client.query<EntitlementRow>(
    `
      select se.feature_key, se.limit_value
      from public.subscription_entitlements se
      join public.subscriptions s on s.id = se.subscription_id
      where se.tenant_id = public.current_tenant_id()
        and s.status in ('trial', 'active')
        and se.feature_key = 'tenant.users.web.max'
    `
  );
  const existingUserResult = await client.query<{ id: string; status: MembershipStatus | null }>(
    `
      select u.id, tm.status
      from public.users u
      left join public.tenant_memberships tm
        on tm.tenant_id = public.current_tenant_id()
       and tm.user_id = u.id
      where lower(u.email) = $1
      limit 1
    `,
    [email]
  );

  const limit = pickMostPermissiveLimit(limitResult.rows);

  if (limit === null) {
    return;
  }

  const existing = existingUserResult.rows[0];

  if (existing?.status === "active" || existing?.status === "invited") {
    return;
  }

  const usageResult = await client.query<{ count: number }>(
    `
      select count(*)::int as count
      from public.tenant_memberships
      where tenant_id = public.current_tenant_id()
        and status in ('active', 'invited')
    `
  );

  if ((usageResult.rows[0]?.count ?? 0) >= limit) {
    throw new Error(`This tenant has reached its web user limit of ${limit}. Upgrade the plan or disable a user before inviting another one.`);
  }
}

async function assertFsmSeatLimitAllowsInvite(client: TenantQueryClient, email: string, role: RoleKey) {
  const seatCategory = getFsmSeatCategory(role);
  if (!seatCategory) {
    return;
  }

  const limitResult = await client.query<EntitlementRow>(
    `
      select feature_key, limit_value
      from public.get_org_entitlements(public.current_tenant_id())
      where feature_key = $1
    `,
    [seatCategory.featureKey]
  );
  const limit = pickExplicitLimit(limitResult.rows, seatCategory.featureKey);

  if (limit === undefined || limit === null) {
    return;
  }

  const existingUserResult = await client.query<{ id: string; status: MembershipStatus | null }>(
    `
      select u.id, tm.status
      from public.users u
      left join public.tenant_memberships tm
        on tm.tenant_id = public.current_tenant_id()
       and tm.user_id = u.id
      where lower(u.email) = $1
      limit 1
    `,
    [email]
  );
  const existing = existingUserResult.rows[0];

  if (existing?.status === "active" || existing?.status === "invited") {
    return;
  }

  const usageResult = await client.query<{ count: number }>(
    `
      select count(distinct tm.user_id)::int as count
      from public.tenant_memberships tm
      join public.user_role_assignments ura
        on ura.tenant_id = tm.tenant_id
       and ura.user_id = tm.user_id
      join public.roles r on r.id = ura.role_id
      where tm.tenant_id = public.current_tenant_id()
        and tm.status in ('active', 'invited')
        and ${seatCategory.rolePredicate}
    `
  );

  if ((usageResult.rows[0]?.count ?? 0) >= limit) {
    throw new Error(
      `This tenant has reached its FSM ${seatCategory.label} user limit of ${limit}. Upgrade the plan or disable a user before inviting another one.`
    );
  }
}

async function assertWhatsappProviderProfileLimitAllowsSave(client: TenantQueryClient, label: string) {
  const limitResult = await client.query<EntitlementRow>(
    `
      select se.feature_key, se.limit_value
      from public.subscription_entitlements se
      join public.subscriptions s on s.id = se.subscription_id
      where se.tenant_id = public.current_tenant_id()
        and s.status in ('trial', 'active')
        and se.feature_key = 'tex.whatsapp.provider_profiles.max'
    `
  );
  const existingResult = await client.query<{ id: string }>(
    `
      select id
      from public.tenant_whatsapp_provider_profiles
      where tenant_id = public.current_tenant_id()
        and lower(label) = lower($1)
      limit 1
    `,
    [label]
  );
  const countResult = await client.query<{ count: number }>(
    `
      select count(*)::int as count
      from public.tenant_whatsapp_provider_profiles
      where tenant_id = public.current_tenant_id()
    `
  );

  const limit = pickMostPermissiveLimit(limitResult.rows);

  if (limit === null || existingResult.rows.length > 0) {
    return;
  }

  if ((countResult.rows[0]?.count ?? 0) >= limit) {
    throw new Error(`This tenant has reached its WhatsApp provider profile limit of ${limit}.`);
  }
}

async function syncDefaultWhatsappProfileToActiveSettings(
  client: TenantQueryClient,
  actor: CustomerAdminContext,
  profile: WhatsappProviderProfileRow
) {
  await client.query(
    `
      insert into public.tex_integration_settings (
        tenant_id,
        whatsapp_provider,
        whatsapp_instance_id,
        wappfly_session_id,
        meta_phone_number_id,
        meta_whatsapp_business_account_id,
        whatsapp_webhook_url,
        whatsapp_api_key_last4,
        whatsapp_keys_configured,
        created_by,
        updated_by
      )
      values (
        public.current_tenant_id(),
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        $9
      )
      on conflict (tenant_id)
      do update set
        whatsapp_provider = excluded.whatsapp_provider,
        whatsapp_instance_id = excluded.whatsapp_instance_id,
        wappfly_session_id = excluded.wappfly_session_id,
        meta_phone_number_id = excluded.meta_phone_number_id,
        meta_whatsapp_business_account_id = excluded.meta_whatsapp_business_account_id,
        whatsapp_webhook_url = excluded.whatsapp_webhook_url,
        whatsapp_api_key_last4 = coalesce(excluded.whatsapp_api_key_last4, public.tex_integration_settings.whatsapp_api_key_last4),
        whatsapp_keys_configured = public.tex_integration_settings.whatsapp_keys_configured or excluded.whatsapp_keys_configured,
        updated_by = excluded.updated_by
    `,
    [
      profile.provider,
      profile.whatsapp_instance_id,
      profile.wappfly_session_id,
      profile.meta_phone_number_id,
      profile.meta_whatsapp_business_account_id,
      profile.webhook_url,
      profile.api_key_last4,
      profile.keys_configured,
      actor.userId
    ]
  );
}

async function getCurrentTenantName(client: TenantQueryClient) {
  const result = await client.query<{ name: string }>(
    "select name from public.tenants where id = public.current_tenant_id() limit 1"
  );

  return result.rows[0]?.name ?? "your Torrevie workspace";
}

async function createCustomerInviteIdentity(email: string): Promise<CustomerInviteIdentity> {
  const client = getSupabaseAdminClient();
  const { data, error } = await client.auth.admin.generateLink({
    type: "invite",
    email,
    options: {
      redirectTo: customerPasswordSetupCallbackUrl()
    }
  });

  if (error) {
    if (isAlreadyRegisteredError(error.message)) {
      const recovery = await client.auth.admin.generateLink({
        type: "recovery",
        email,
        options: {
          redirectTo: customerPasswordSetupCallbackUrl()
        }
      });

      if (recovery.error || !recovery.data.properties?.action_link) {
        throw new Error(
          `Unable to create existing user access link: ${recovery.error?.message ?? "missing action link"}`
        );
      }

      if (!recovery.data.user?.id) {
        throw new Error("Supabase did not return the existing Auth user for the access link.");
      }

      return {
        userId: recovery.data.user.id,
        actionLink: recovery.data.properties.action_link,
        kind: "existing_user"
      };
    }

    throw new Error(`Unable to create Supabase invitation link: ${error.message}`);
  }

  if (!data.user?.id || !data.properties?.action_link) {
    throw new Error("Supabase did not return a complete invitation link.");
  }

  return {
    userId: data.user.id,
    actionLink: data.properties.action_link,
    kind: "new_invitation"
  };
}

async function createCustomerPasswordResetLink(email: string) {
  const client = getSupabaseAdminClient();
  const { data, error } = await client.auth.admin.generateLink({
    type: "recovery",
    email,
    options: {
      redirectTo: customerPasswordSetupCallbackUrl()
    }
  });

  if (error || !data.properties?.action_link) {
    throw new Error(`Unable to create password reset link: ${error?.message ?? "missing action link"}`);
  }

  return data.properties.action_link;
}

async function getCustomerUserEmail(client: TenantQueryClient, userId: string) {
  const result = await client.query<{ email: string }>(
    `
      select email
      from public.users
      where id = $1
      limit 1
    `,
    [userId]
  );
  const email = result.rows[0]?.email;

  if (!email) {
    throw new Error("Tenant user email was not found.");
  }

  return email;
}

async function sendCustomerInviteEmail(input: CustomerInviteEmailInput) {
  const title = input.kind === "existing_user" ? "Torrevie access granted" : "Torrevie invitation";
  const cta = input.kind === "existing_user" ? "Open your workspace" : "Set your password";
  const result = await dispatchEmailNotification({
    to: input.email,
    subject: `${input.tenantName} Torrevie access`,
    html: `
      <div style="font-family: Inter, Arial, sans-serif; color: #162449; line-height: 1.5;">
        <h1 style="font-size: 22px;">${escapeHtml(title)}</h1>
        <p>You have been invited to ${escapeHtml(input.tenantName)} on Torrevie.</p>
        <p><a href="${escapeHtml(input.actionLink)}" style="background:#0D9488;color:#fff;padding:12px 18px;text-decoration:none;border-radius:6px;display:inline-block;">${escapeHtml(cta)}</a></p>
        <p>If the button does not work, open this link:</p>
        <p><a href="${escapeHtml(input.actionLink)}">${escapeHtml(input.actionLink)}</a></p>
      </div>
    `,
    text: `You have been invited to ${input.tenantName} on Torrevie.\n\n${cta}: ${input.actionLink}`
  });

  if (!result.ok) {
    throw new Error(`Unable to send invitation email: ${result.error ?? result.status}`);
  }
}

async function sendCustomerPasswordResetEmail(input: CustomerPasswordResetEmailInput) {
  const result = await dispatchEmailNotification({
    to: input.email,
    subject: `${input.tenantName} password reset`,
    html: `
      <div style="font-family: Inter, Arial, sans-serif; color: #162449; line-height: 1.5;">
        <h1 style="font-size: 22px;">Reset your Torrevie password</h1>
        <p>A tenant administrator requested a password reset for your ${escapeHtml(input.tenantName)} Torrevie account.</p>
        <p><a href="${escapeHtml(input.actionLink)}" style="background:#0D9488;color:#fff;padding:12px 18px;text-decoration:none;border-radius:6px;display:inline-block;">Reset password</a></p>
        <p>If the button does not work, open this link:</p>
        <p><a href="${escapeHtml(input.actionLink)}">${escapeHtml(input.actionLink)}</a></p>
      </div>
    `,
    text: `A tenant administrator requested a password reset for your ${input.tenantName} Torrevie account.\n\nReset password: ${input.actionLink}`
  });

  if (!result.ok) {
    throw new Error(`Unable to send password reset email: ${result.error ?? result.status}`);
  }
}

function getSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Supabase admin environment variables are not configured.");
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

function customerPortalUrl() {
  return (
    normalizeCustomerPortalUrl(process.env.CUSTOMER_PORTAL_URL) ||
    normalizeCustomerPortalUrl(process.env.NEXT_PUBLIC_CUSTOMER_PORTAL_URL) ||
    normalizeCustomerPortalUrl(process.env.NEXT_PUBLIC_APP_URL) ||
    normalizeCustomerPortalUrl(process.env.VERCEL_PROJECT_PRODUCTION_URL) ||
    "https://app.torrevie.com"
  );
}

function normalizeCustomerPortalUrl(value: string | undefined) {
  const clean = value?.trim().replace(/^['"]|['"]$/g, "").replace(/\/$/, "");
  if (!clean) {
    return null;
  }

  const url = /^https?:\/\//i.test(clean) ? clean : `https://${clean}`;

  return isCustomerPortalUrl(url) ? url : null;
}

function customerPasswordSetupCallbackUrl() {
  return `${customerPortalUrl()}/auth/callback?next=${encodeURIComponent("/en/account?setup=password")}`;
}

function isCustomerPortalUrl(value: string) {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return (
      hostname === "app.torrevie.com" ||
      hostname === "torrevie-customer-portal-production.vercel.app" ||
      hostname === "torrevie-customer-portal-staging.vercel.app" ||
      hostname.endsWith("-torrevie-customer-portal-production.vercel.app") ||
      hostname.endsWith("-torrevie-customer-portal-staging.vercel.app")
    );
  } catch {
    return false;
  }
}

function isAlreadyRegisteredError(message: string) {
  return /already.*registered|already.*exists|user.*exists/i.test(message);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function upsertUserIdentity(
  client: TenantQueryClient,
  email: string,
  actorUserId: string,
  authUserId: string
) {
  await client.query("select set_config('app.platform_service_role', 'true', true)");

  let result: { rows: Array<{ id: string }> };

  try {
    await releaseStalePlatformEmail(client, email, authUserId, actorUserId);
    result = await client.query<{ id: string }>(
      `
        insert into public.users (id, email, status, created_by, updated_by)
        values ($1, $2, 'active', $3, $3)
        on conflict (id)
        do update set email = excluded.email,
                      status = 'active',
                      updated_by = $3
        returning id
      `,
      [authUserId, email, actorUserId]
    );
  } finally {
    await client.query("select set_config('app.platform_service_role', 'false', true)");
  }

  const [user] = result.rows;

  if (!user) {
    throw new Error("Unable to create or find invited user.");
  }

  return user.id;
}

async function releaseStalePlatformEmail(
  client: TenantQueryClient,
  email: string,
  authUserId: string,
  actorUserId: string
) {
  const existing = await client.query<{ id: string }>(
    `
      select id
      from public.users
      where lower(email) = $1
      limit 1
    `,
    [email]
  );
  const existingUserId = existing.rows[0]?.id;

  if (!existingUserId || existingUserId === authUserId) {
    return;
  }

  const memberships = await client.query<{ count: number }>(
    `
      select count(*)::int as count
      from public.tenant_memberships
      where user_id = $1
    `,
    [existingUserId]
  );

  if ((memberships.rows[0]?.count ?? 0) > 0) {
    throw new Error("This email is already linked to another Torrevie user. Please use password reset or another email.");
  }

  await client.query(
    `
      update public.users
         set email = $2,
             status = 'deactivated',
             updated_by = $3
       where id = $1
    `,
    [existingUserId, tombstoneEmail(existingUserId), actorUserId]
  );
}

function tombstoneEmail(userId: string) {
  return `deleted+${userId.replace(/-/g, "")}@torrevie.local`;
}

async function replaceCustomerRole(
  client: TenantQueryClient,
  userId: string,
  role: RoleKey,
  actorUserId: string
) {
  const roleResult = await client.query<{ id: string }>(
    "select id from public.roles where key = $1 and scope = 'customer'",
    [role]
  );
  const [roleRow] = roleResult.rows;

  if (!roleRow) {
    throw new Error(`Customer role was not found: ${role}`);
  }

  await client.query(
    `
      delete from public.user_role_assignments
       where tenant_id = public.current_tenant_id()
         and user_id = $1
    `,
    [userId]
  );

  await client.query(
    `
      insert into public.user_role_assignments (tenant_id, user_id, role_id, assigned_by, created_by, updated_by)
      values (public.current_tenant_id(), $1, $2, $3, $3, $3)
    `,
    [userId, roleRow.id, actorUserId]
  );
}

async function assertTenantMemberExists(client: TenantQueryClient, userId: string) {
  const result = await client.query<{ id: string }>(
    `
      select id
      from public.tenant_memberships
      where tenant_id = public.current_tenant_id()
        and user_id = $1
    `,
    [userId]
  );

  if (result.rows.length !== 1) {
    throw new Error("Tenant member was not found.");
  }
}

async function writeCustomerAdminAuditEvent(
  client: TenantQueryClient,
  actor: CustomerAdminContext,
  action: string,
  targetType: string,
  targetId: string,
  metadata: Record<string, string>
) {
  await client.query(
    `
      insert into public.audit_events (tenant_id, actor_user_id, action, target_type, target_id, metadata)
      values (public.current_tenant_id(), $1, $2, $3, $4, $5::jsonb)
    `,
    [actor.userId, action, targetType, targetId, JSON.stringify(metadata)]
  );
}

function groupMemberRows(rows: readonly MemberRow[]) {
  const members = new Map<string, CustomerMemberRecord>();

  for (const row of rows) {
    const member = members.get(row.user_id) ?? {
      userId: row.user_id,
      email: row.email,
      displayName: row.display_name,
      status: row.status,
      roles: [],
      requireMfa: row.require_mfa ?? false,
      mfaEnrolled: row.mfa_enrolled
    };

    member.requireMfa = member.requireMfa || Boolean(row.require_mfa);
    member.mfaEnrolled = member.mfaEnrolled || row.mfa_enrolled;

    if (row.role_key && isRoleKey(row.role_key) && !member.roles.includes(row.role_key)) {
      member.roles.push(row.role_key);
    }

    members.set(row.user_id, member);
  }

  return [...members.values()];
}

function sanitizeEmail(value: string) {
  const email = value.trim().toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("A valid email address is required.");
  }

  return email;
}

function cleanOptional(value: string | null | undefined) {
  const clean = value?.trim();
  return clean ? clean : null;
}

function cleanRequired(value: string | null | undefined, label: string) {
  const clean = cleanOptional(value);

  if (!clean) {
    throw new Error(`${label} is required.`);
  }

  return clean;
}

function sanitizeWhatsappProvider(value: string): WhatsappProvider {
  if (value === "ultramsg" || value === "wappfly" || value === "meta") {
    return value;
  }

  throw new Error(`Unsupported WhatsApp provider: ${value}`);
}

function validateWebhookUrl(value: string | null) {
  if (!value) {
    return;
  }

  try {
    const url = new URL(value);

    if (url.protocol !== "https:") {
      throw new Error("Webhook URL must use HTTPS.");
    }
  } catch {
    throw new Error("Webhook URL must be a valid HTTPS URL.");
  }
}

function last4(value: string) {
  return value.slice(-4);
}

function mapWhatsappSettings(row: WhatsappSettingsRow | undefined): TenantWhatsappSettings {
  return {
    provider: row?.whatsapp_provider ?? "ultramsg",
    webhookUrl: row?.whatsapp_webhook_url ?? "",
    whatsappInstanceId: row?.whatsapp_instance_id ?? "",
    wappflySessionId: row?.wappfly_session_id ?? "",
    metaPhoneNumberId: row?.meta_phone_number_id ?? "",
    metaWhatsappBusinessAccountId: row?.meta_whatsapp_business_account_id ?? "",
    googleMapsEnabled: row?.google_maps_enabled ?? false,
    apiKeyConfigured: Boolean(row?.whatsapp_api_key_last4 || row?.whatsapp_keys_configured),
    apiKeyLast4: row?.whatsapp_api_key_last4 ?? "",
    appSecretConfigured: Boolean(row?.whatsapp_app_secret_last4 || row?.whatsapp_keys_configured),
    appSecretLast4: row?.whatsapp_app_secret_last4 ?? "",
    webhookVerifyTokenConfigured: Boolean(row?.whatsapp_webhook_verify_token_last4 || row?.whatsapp_keys_configured),
    webhookVerifyTokenLast4: row?.whatsapp_webhook_verify_token_last4 ?? "",
    aiReceiptExtractionEnabled: row?.ai_receipt_extraction_enabled ?? true,
    duplicateDetectionEnabled: row?.duplicate_detection_enabled ?? true,
    duplicateAutoRejectEnabled: row?.duplicate_auto_reject_enabled ?? false,
    emailNotificationsEnabled: row?.email_notifications_enabled ?? false,
    emailReportFrequency: sanitizeEmailReportFrequency(row?.email_report_frequency ?? "weekly"),
    emailReportRecipients: sanitizeEmailRecipients(row?.email_report_recipients ?? [])
  };
}

function mapWhatsappProviderProfile(row: WhatsappProviderProfileRow): WhatsappProviderProfile {
  return {
    id: row.id,
    label: row.label,
    provider: row.provider,
    status: row.status,
    isDefault: row.is_default,
    webhookUrl: row.webhook_url ?? "",
    whatsappInstanceId: row.whatsapp_instance_id ?? "",
    wappflySessionId: row.wappfly_session_id ?? "",
    metaPhoneNumberId: row.meta_phone_number_id ?? "",
    metaWhatsappBusinessAccountId: row.meta_whatsapp_business_account_id ?? "",
    apiKeyConfigured: Boolean(row.api_key_last4 || row.keys_configured),
    apiKeyLast4: row.api_key_last4 ?? ""
  };
}

function mapUsageLimits(rows: readonly EntitlementRow[], webUsersUsed: number): TenantUsageLimits {
  const capabilities = rows.map((row) => ({ key: row.feature_key, limit: row.limit_value }));

  return {
    webUsersLimit: pickLimit(rows, "tenant.users.web.max"),
    webUsersUsed,
    whatsappProviderProfilesLimit: pickLimit(rows, "tex.whatsapp.provider_profiles.max"),
    emailNotificationsMonthlyLimit: pickLimit(rows, "tex.email.notifications.monthly_limit"),
    databaseStorageMbLimit: pickLimit(rows, "tenant.database.storage_mb.max"),
    enabledModules: rows
      .filter((row) => unlimitedFeatureKeys.has(row.feature_key))
      .map((row) => row.feature_key.replace(/^tex\./, "").replace(/\.enabled$/, "")),
    capabilities
  };
}

function pickLimit(rows: readonly EntitlementRow[], featureKey: string) {
  return pickMostPermissiveLimit(rows.filter((row) => row.feature_key === featureKey));
}

function pickExplicitLimit(rows: readonly EntitlementRow[], featureKey: string) {
  const matching = rows.filter((row) => row.feature_key === featureKey);

  if (matching.length === 0) {
    return undefined;
  }

  if (matching.some((row) => row.limit_value === null)) {
    return null;
  }

  return Math.max(...matching.map((row) => row.limit_value ?? 0));
}

function pickMostPermissiveLimit(rows: readonly EntitlementRow[]) {
  if (rows.length === 0) {
    return 5;
  }

  if (rows.some((row) => row.limit_value === null)) {
    return null;
  }

  return Math.max(...rows.map((row) => row.limit_value ?? 0));
}

function getFsmSeatCategory(role: RoleKey) {
  if (fsmFieldRoles.has(role)) {
    return {
      featureKey: "fsm.users.field.max",
      label: "field",
      rolePredicate: "r.key = 'customer_standard_user'"
    };
  }

  if (fsmOfficeRoles.has(role)) {
    return {
      featureKey: "fsm.users.office.max",
      label: "office",
      rolePredicate: "r.key in ('customer_admin', 'customer_module_admin', 'customer_manager', 'customer_readonly')"
    };
  }

  return null;
}

function sanitizeEmailReportFrequency(value: string): "off" | "daily" | "weekly" | "monthly" {
  if (value === "off" || value === "daily" || value === "weekly" || value === "monthly") {
    return value;
  }

  return "weekly";
}

function sanitizeEmailRecipients(values: string[] | string) {
  const rawValues = Array.isArray(values) ? values : values.split(/[,\n]/);
  const recipients = rawValues.map((value) => value.trim().toLowerCase()).filter(Boolean);

  for (const email of recipients) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error(`Invalid notification email recipient: ${email}`);
    }
  }

  return [...new Set(recipients)].slice(0, 20);
}

function toPostgresTextArrayLiteral(values: readonly string[]) {
  return `{${values.map((value) => `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(",")}}`;
}

function sanitizeAssignableRole(role: RoleKey) {
  if (!assignableCustomerRoles.includes(role)) {
    throw new Error(`Role cannot be assigned by a customer administrator: ${role}`);
  }

  return role;
}

function assertMembershipStatus(status: string): asserts status is MembershipStatus {
  if (!membershipStatuses.includes(status as MembershipStatus)) {
    throw new Error(`Unsupported membership status: ${status}`);
  }
}

function assertUuid(value: string, label: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(`Invalid ${label}.`);
  }
}

function isRoleKey(value: string): value is RoleKey {
  return roleKeys.includes(value as RoleKey);
}

type MemberRow = {
  user_id: string;
  email: string;
  mfa_enrolled: boolean;
  display_name: string | null;
  require_mfa: boolean | null;
  status: MembershipStatus;
  role_key: string | null;
};

type WhatsappSettingsRow = {
  whatsapp_provider: WhatsappProvider;
  whatsapp_instance_id: string | null;
  wappfly_session_id: string | null;
  meta_phone_number_id: string | null;
  meta_whatsapp_business_account_id: string | null;
  google_maps_enabled: boolean | null;
  whatsapp_webhook_url: string | null;
  whatsapp_webhook_verify_token_last4: string | null;
  whatsapp_api_key_last4: string | null;
  whatsapp_app_secret_last4: string | null;
  whatsapp_keys_configured: boolean | null;
  ai_receipt_extraction_enabled: boolean | null;
  duplicate_detection_enabled: boolean | null;
  duplicate_auto_reject_enabled: boolean | null;
  email_notifications_enabled: boolean | null;
  email_report_frequency: string | null;
  email_report_recipients: string[] | null;
};

type WhatsappProviderProfileRow = {
  id: string;
  label: string;
  provider: WhatsappProvider;
  status: "active" | "inactive";
  is_default: boolean;
  webhook_url: string | null;
  whatsapp_instance_id: string | null;
  wappfly_session_id: string | null;
  meta_phone_number_id: string | null;
  meta_whatsapp_business_account_id: string | null;
  api_key_last4: string | null;
  keys_configured: boolean | null;
};

type EntitlementRow = {
  feature_key: string;
  limit_value: number | null;
};
