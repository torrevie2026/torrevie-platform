import { getMessages, isLocale, type Locale } from "@torrevie/localization";
import { roleKeys, type RoleKey } from "@torrevie/permissions";
import { notFound, redirect } from "next/navigation";
import {
  getTenantWhatsappSettings,
  listCustomerMembers,
  type CustomerAdminContext
} from "../../../../lib/customer-administration";
import {
  isCustomerSessionError,
  requireVerifiedCustomerSession,
  resolveCustomerTenantContext
} from "../../../../lib/server/customer-session";
import { PostgresTenantQueryClient } from "../../../../lib/server/tenant-query-client";
import { updateTenantWhatsappSettingsAction } from "./actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function CustomerUsersPage({
  params,
  searchParams
}: {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<{ integration?: string }>;
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
    const members = await listCustomerMembers(client, actor);
    const whatsappSettings = await getTenantWhatsappSettings(client, actor);

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
        </aside>

        <section className="customer-main">
          <header className="customer-topbar">
            <div>
              <p className="eyebrow">{admin.eyebrow}</p>
              <h1>Tenant setup</h1>
              <p>Manage tenant users and app-level configuration for subscribed Torrevie modules.</p>
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
          {status?.integration === "failed" ? <p className="tex-error">WhatsApp integration settings could not be updated.</p> : null}

          <section className="admin-layout tenant-setup-layout" aria-label="Tenant administration">
            <section className="admin-panel tenant-integration-panel" aria-labelledby="whatsapp-settings-title">
              <div className="section-heading-row">
                <h2 id="whatsapp-settings-title">TEX WhatsApp setup</h2>
                <span className="module-status module-status-active">tenant scoped</span>
              </div>
              <p className="admin-panel-copy">
                Configure webhook routing and provider keys at tenant level. Existing secrets are never shown after saving.
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
                <button type="submit">Save WhatsApp setup</button>
              </form>
            </section>

            <section className="admin-panel member-panel" aria-labelledby="members-title">
              <h2 id="members-title">{admin.tenantUsers}</h2>
              <div className="member-table" role="table" aria-label={admin.tenantUsers}>
                <div role="row" className="member-row member-row-head">
                  <span role="columnheader">{admin.user}</span>
                  <span role="columnheader">{admin.status}</span>
                  <span role="columnheader">{admin.role}</span>
                  <span role="columnheader">{admin.action}</span>
                </div>
                {members.map((member) => (
                  <div role="row" className="member-row" key={member.userId}>
                    <span role="cell">
                      <strong>{member.displayName ?? member.email}</strong>
                      <small>{member.email}</small>
                    </span>
                    <span role="cell">
                      <mark>{member.status}</mark>
                    </span>
                    <span role="cell">{member.roles.join(", ") || "No role"}</span>
                    <span role="cell">
                      <button type="button">{admin.update}</button>
                    </span>
                  </div>
                ))}
              </div>
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
