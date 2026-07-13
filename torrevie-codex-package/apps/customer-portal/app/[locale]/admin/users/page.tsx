import { getMessages, isLocale, type Locale } from "@torrevie/localization";
import { roleKeys, type RoleKey } from "@torrevie/permissions";
import { notFound, redirect } from "next/navigation";
import {
  assignableCustomerRoles,
  getTenantWhatsappSettings,
  getTenantUsageLimits,
  listWhatsappProviderProfiles,
  listCustomerMembers,
  type CustomerAdminContext
} from "../../../../lib/customer-administration";
import {
  isCustomerSessionError,
  requireVerifiedCustomerSession,
  resolveCustomerTenantContext
} from "../../../../lib/server/customer-session";
import { PostgresTenantQueryClient } from "../../../../lib/server/tenant-query-client";
import { CustomerSessionActions } from "../../CustomerSessionActions";
import {
  inviteCustomerUserAction,
  saveWhatsappProviderProfileAction,
  updateCustomerUserAction,
  updateTenantWhatsappSettingsAction
} from "./actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function CustomerUsersPage({
  params,
  searchParams
}: {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<{ integration?: string; users?: string; message?: string }>;
}) {
  const { locale: rawLocale } = await params;
  const status = await searchParams;

  if (!isLocale(rawLocale)) {
    notFound();
  }

  const locale = rawLocale as Locale;
  const t = getMessages(locale);
  const admin = t.adminUsers;

  try {
    const { actor, client, tenantName } = await resolveActor();
    const [members, whatsappSettings, usageLimits, providerProfiles] = await Promise.all([
      listCustomerMembers(client, actor),
      getTenantWhatsappSettings(client, actor),
      getTenantUsageLimits(client, actor),
      listWhatsappProviderProfiles(client, actor)
    ]);

    return (
      <main className="customer-shell admin-users-shell" data-visual-check="customer-admin-users">
        <aside className="customer-sidebar" aria-label="Customer Portal sections">
          <a className="customer-brand" href={`/${locale}`} aria-label={t.appName}>
            <img src="/logo/torrevie_logo_color.png" alt="" width="36" height="36" />
            <span>{t.appName}</span>
          </a>
          <nav>
            <a href={`/${locale}`}>{t.nav.overview}</a>
            <a href={`/${locale}/admin/users`} aria-current="page">
              Tenant admin
            </a>
            <a href={`/${locale}/account`}>Account</a>
          </nav>
          <CustomerSessionActions locale={locale} />
        </aside>

        <section className="customer-main">
          <header className="customer-topbar">
            <div>
              <p className="eyebrow">{admin.eyebrow}</p>
              <h1>App-level tenant setup</h1>
              <p>Manage web users, TEX WhatsApp hooks, provider profiles, and email notifications inside the customer app.</p>
            </div>
            <div className="customer-context" aria-label="Administration guardrails">
              <span>{admin.requiredRole}: customer_admin</span>
              <span>
                {admin.tenantScope}: {tenantName}
              </span>
              <span>{admin.rlsContext}: tenant only</span>
            </div>
          </header>

          {status?.integration === "updated" ? <p className="tex-notice">WhatsApp integration settings updated.</p> : null}
          {status?.integration === "profile_saved" ? <p className="tex-notice">WhatsApp provider profile saved.</p> : null}
          {status?.integration === "failed" ? <p className="tex-error">WhatsApp integration settings could not be updated.</p> : null}
          {status?.users === "invited" ? <p className="tex-notice">Tenant web user invitation created.</p> : null}
          {status?.users === "updated" ? <p className="tex-notice">Tenant web user updated.</p> : null}
          {status?.users === "failed" ? <p className="tex-error">{status.message ?? "Tenant web user update failed."}</p> : null}

          <section className="tenant-limit-strip" aria-label="Plan limits">
            <LimitCard label="Web users" used={usageLimits.webUsersUsed} limit={usageLimits.webUsersLimit} />
            <LimitCard label="WhatsApp providers" used={providerProfiles.length} limit={usageLimits.whatsappProviderProfilesLimit} />
            <LimitCard label="Email notifications" usedLabel="monthly" limit={usageLimits.emailNotificationsMonthlyLimit} />
            <LimitCard label="Database storage" usedLabel="tenant DB" limit={usageLimits.databaseStorageMbLimit} suffix="MB" />
          </section>

          <section className="admin-layout tenant-setup-layout" aria-label="Tenant administration">
            <section className="admin-panel member-panel" aria-labelledby="members-title">
              <div className="section-heading-row">
                <h2 id="members-title">Web users</h2>
                <span className="module-status module-status-active">app managed</span>
              </div>
              <p className="admin-panel-copy">
                Tenant admins create customer portal users here. Invitations count against the active tier user limit.
              </p>
              <form action={inviteCustomerUserAction} className="tenant-integration-form invite-user-form">
                <input type="hidden" name="locale" value={locale} />
                <label>
                  Email
                  <input name="email" type="email" required dir="ltr" placeholder="employee@customer.com" />
                </label>
                <label>
                  Name
                  <input name="displayName" placeholder="Full name" />
                </label>
                <label>
                  Role
                  <select name="role" defaultValue="customer_standard_user">
                    {assignableCustomerRoles.map((role) => (
                      <option key={role} value={role}>
                        {formatRole(role)}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="submit" disabled={usageLimits.webUsersLimit !== null && usageLimits.webUsersUsed >= usageLimits.webUsersLimit}>
                  Invite web user
                </button>
              </form>

              <div className="member-table" role="table" aria-label={admin.tenantUsers}>
                <div role="row" className="member-row member-row-head">
                  <span role="columnheader">{admin.user}</span>
                  <span role="columnheader">{admin.status}</span>
                  <span role="columnheader">{admin.role}</span>
                  <span role="columnheader">{admin.action}</span>
                </div>
                {members.map((member) => (
                  <form action={updateCustomerUserAction} role="row" className="member-row" key={member.userId}>
                    <input type="hidden" name="locale" value={locale} />
                    <input type="hidden" name="userId" value={member.userId} />
                    <span role="cell">
                      <strong>{member.displayName ?? member.email}</strong>
                      <small>{member.email}</small>
                    </span>
                    <span role="cell">
                      <select name="status" defaultValue={member.status}>
                        <option value="active">Active</option>
                        <option value="invited">Invited</option>
                        <option value="disabled">Disabled</option>
                      </select>
                    </span>
                    <span role="cell">
                      <select name="role" defaultValue={member.roles[0] ?? "customer_standard_user"}>
                        {assignableCustomerRoles.map((role) => (
                          <option key={role} value={role}>
                            {formatRole(role)}
                          </option>
                        ))}
                      </select>
                    </span>
                    <span role="cell">
                      <button type="submit">{admin.update}</button>
                    </span>
                  </form>
                ))}
              </div>
            </section>

            <section className="admin-panel tenant-integration-panel" id="tex-whatsapp-settings" aria-labelledby="whatsapp-settings-title">
              <div className="section-heading-row">
                <h2 id="whatsapp-settings-title">TEX WhatsApp hooks</h2>
                <span className="module-status module-status-active">tenant scoped</span>
              </div>
              <p className="admin-panel-copy">
                Configure the active webhook route used by receipt OCR and STATUS replies. Existing secrets are never shown after saving.
              </p>
              <form action={updateTenantWhatsappSettingsAction} className="tenant-integration-form">
                <input type="hidden" name="locale" value={locale} />
                <label>
                  Provider
                  <select name="provider" defaultValue={whatsappSettings.provider}>
                    <option value="ultramsg">UltraMsg</option>
                    <option value="wappfly">Wappfly</option>
                    <option value="meta">Meta WhatsApp Cloud API</option>
                  </select>
                </label>
                <label>
                  Webhook URL
                  <input name="webhookUrl" type="url" defaultValue={whatsappSettings.webhookUrl} placeholder="https://app.torrevie.com/api/tex/webhook" dir="ltr" />
                </label>
                <div className="tenant-integration-grid">
                  <label>
                    UltraMsg instance ID
                    <input name="whatsappInstanceId" defaultValue={whatsappSettings.whatsappInstanceId} dir="ltr" />
                  </label>
                  <label>
                    Wappfly session ID
                    <input name="wappflySessionId" defaultValue={whatsappSettings.wappflySessionId} dir="ltr" />
                  </label>
                  <label>
                    Meta phone number ID
                    <input name="metaPhoneNumberId" defaultValue={whatsappSettings.metaPhoneNumberId} dir="ltr" />
                  </label>
                  <label>
                    Meta business account ID
                    <input name="metaWhatsappBusinessAccountId" defaultValue={whatsappSettings.metaWhatsappBusinessAccountId} dir="ltr" />
                  </label>
                </div>
                <div className="tenant-secret-grid" aria-label="Write-only WhatsApp secrets">
                  <SecretInput
                    name="apiKey"
                    label="Provider API key"
                    configured={whatsappSettings.apiKeyConfigured}
                    last4={whatsappSettings.apiKeyLast4}
                  />
                  <SecretInput
                    name="appSecret"
                    label="App secret"
                    configured={whatsappSettings.appSecretConfigured}
                    last4={whatsappSettings.appSecretLast4}
                  />
                  <SecretInput
                    name="webhookVerifyToken"
                    label="Webhook verify token"
                    configured={whatsappSettings.webhookVerifyTokenConfigured}
                    last4={whatsappSettings.webhookVerifyTokenLast4}
                  />
                </div>
                <label className="tex-checkbox-row">
                  <input name="googleMapsEnabled" type="checkbox" defaultChecked={whatsappSettings.googleMapsEnabled} />
                  Enable Google Maps enrichment for WhatsApp trip messages
                </label>
                <label className="tex-checkbox-row">
                  <input name="aiReceiptExtractionEnabled" type="checkbox" defaultChecked={whatsappSettings.aiReceiptExtractionEnabled} />
                  Enable AI receipt OCR from WhatsApp media
                </label>
                <label className="tex-checkbox-row">
                  <input name="duplicateDetectionEnabled" type="checkbox" defaultChecked={whatsappSettings.duplicateDetectionEnabled} />
                  Flag likely duplicate receipts for manager review
                </label>
                <label className="tex-checkbox-row">
                  <input name="duplicateAutoRejectEnabled" type="checkbox" defaultChecked={whatsappSettings.duplicateAutoRejectEnabled} />
                  Auto-reject likely duplicates instead of sending them to manager review
                </label>
                <div className="tenant-email-settings">
                  <h3>Email reports and notifications</h3>
                  <label className="tex-checkbox-row">
                    <input name="emailNotificationsEnabled" type="checkbox" defaultChecked={whatsappSettings.emailNotificationsEnabled} />
                    Send automatic TEX notifications by email
                  </label>
                  <label>
                    Report frequency
                    <select name="emailReportFrequency" defaultValue={whatsappSettings.emailReportFrequency}>
                      <option value="off">Off</option>
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </label>
                  <label>
                    Report recipients
                    <textarea
                      name="emailReportRecipients"
                      defaultValue={whatsappSettings.emailReportRecipients.join("\n")}
                      placeholder="finance@customer.com"
                      rows={4}
                      dir="ltr"
                    />
                  </label>
                </div>
                <button type="submit">Save WhatsApp setup</button>
              </form>
            </section>

            <section className="admin-panel tenant-integration-panel" aria-labelledby="provider-profiles-title">
              <div className="section-heading-row">
                <h2 id="provider-profiles-title">WhatsApp provider profiles</h2>
                <span className="module-status module-status-pending">multi-provider</span>
              </div>
              <p className="admin-panel-copy">
                Keep multiple provider configurations ready, then mark the live one as default. The default profile also updates active TEX webhook settings.
              </p>
              <div className="provider-profile-list">
                {providerProfiles.length === 0 ? <p className="empty">No provider profiles saved yet.</p> : null}
                {providerProfiles.map((profile) => (
                  <article key={profile.id} className="provider-profile-card">
                    <div>
                      <strong>{profile.label}</strong>
                      <span>{formatProvider(profile.provider)} / {profile.status}</span>
                    </div>
                    <mark>{profile.isDefault ? "Default" : "Standby"}</mark>
                    <small>{profile.apiKeyConfigured ? `API key ending ${profile.apiKeyLast4 || "****"}` : "API key not saved"}</small>
                  </article>
                ))}
              </div>
              <form action={saveWhatsappProviderProfileAction} className="tenant-integration-form">
                <input type="hidden" name="locale" value={locale} />
                <div className="tenant-integration-grid">
                  <label>
                    Profile name
                    <input name="profileLabel" required placeholder="Primary UltraMsg" />
                  </label>
                  <label>
                    Provider
                    <select name="profileProvider" defaultValue="ultramsg">
                      <option value="ultramsg">UltraMsg</option>
                      <option value="wappfly">Wappfly</option>
                      <option value="meta">Meta WhatsApp Cloud API</option>
                    </select>
                  </label>
                  <label>
                    Status
                    <select name="profileStatus" defaultValue="active">
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </label>
                  <label>
                    Webhook URL
                    <input name="profileWebhookUrl" type="url" placeholder="https://app.torrevie.com/api/tex/webhook" dir="ltr" />
                  </label>
                </div>
                <div className="tenant-integration-grid">
                  <label>
                    UltraMsg instance ID
                    <input name="profileWhatsappInstanceId" dir="ltr" />
                  </label>
                  <label>
                    Wappfly session ID
                    <input name="profileWappflySessionId" dir="ltr" />
                  </label>
                  <label>
                    Meta phone number ID
                    <input name="profileMetaPhoneNumberId" dir="ltr" />
                  </label>
                  <label>
                    Meta business account ID
                    <input name="profileMetaWhatsappBusinessAccountId" dir="ltr" />
                  </label>
                </div>
                <label>
                  Provider API key
                  <input name="profileApiKey" type="password" autoComplete="new-password" dir="ltr" />
                </label>
                <label className="tex-checkbox-row">
                  <input name="profileIsDefault" type="checkbox" defaultChecked />
                  Use this profile as the live TEX WhatsApp provider
                </label>
                <button type="submit" disabled={usageLimits.whatsappProviderProfilesLimit !== null && providerProfiles.length >= usageLimits.whatsappProviderProfilesLimit}>
                  Save provider profile
                </button>
              </form>
            </section>
          </section>
        </section>
      </main>
    );
  } catch (error) {
    if (isCustomerSessionError(error)) {
      redirect("/login");
    }

    throw error;
  }
}

function SecretInput({
  configured,
  label,
  last4,
  name
}: {
  configured: boolean;
  label: string;
  last4: string;
  name: string;
}) {
  return (
    <label>
      {label}
      <input name={name} type="password" autoComplete="new-password" placeholder={configured ? `Configured ending ${last4 || "****"}` : "Not configured"} dir="ltr" />
    </label>
  );
}

function LimitCard({
  label,
  limit,
  suffix = "",
  used,
  usedLabel
}: {
  label: string;
  limit: number | null;
  suffix?: string;
  used?: number;
  usedLabel?: string;
}) {
  const limitLabel = limit === null ? "Unlimited" : `${limit}${suffix ? ` ${suffix}` : ""}`;
  const usageLabel = used !== undefined ? `${used} / ${limitLabel}` : limitLabel;

  return (
    <article className="tenant-limit-card">
      <span>{label}</span>
      <strong>{usageLabel}</strong>
      {usedLabel ? <small>{usedLabel}</small> : null}
    </article>
  );
}

function formatProvider(provider: string) {
  if (provider === "wappfly") return "Wappfly";
  if (provider === "meta") return "Meta Cloud API";
  return "UltraMsg";
}

function formatRole(role: string) {
  return role
    .replace(/^customer_/, "")
    .split("_")
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
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
  const tenantResult = await client.query<{ name: string }>("select name from public.tenants where id = $1", [tenantContext.tenantId]);
  const actor: CustomerAdminContext = {
    ...tenantContext,
    roles: rolesResult.rows.map((row) => row.key).filter(isRoleKey)
  };

  return {
    actor,
    client,
    tenantName: tenantResult.rows[0]?.name ?? "Current tenant"
  };
}

function isRoleKey(value: string): value is RoleKey {
  return roleKeys.includes(value as RoleKey);
}
