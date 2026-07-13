import { notFound, redirect } from "next/navigation";
import { AdminSidebar } from "../components/AdminSidebar";
import { getSupabaseAdminClient } from "../../lib/admin-client";
import { getPlatformSession } from "../../lib/session";
import {
  businessSegments,
  fsmPlanTiers,
  listFeatureOverrides,
  listSubscriptionCatalog,
  listSubscriptions,
  subscriptionStatuses
} from "../../lib/subscription-management";
import { listTenants } from "../../lib/tenant-lifecycle";
import {
  assignSubscriptionAction,
  inviteTenantAdminAction,
  updateFsmTenantControlsAction,
  upsertFeatureOverrideAction
} from "./actions";

export const dynamic = "force-dynamic";

export default async function SubscriptionsPage({
  searchParams
}: {
  searchParams: Promise<{ assigned?: string; invited?: string; tenantId?: string; fsmControls?: string; override?: string }>;
}) {
  const session = await getPlatformSession();

  if (!session) {
    redirect("/login");
  }

  const client = getSupabaseAdminClient();
  const [tenants, plans, subscriptions, overrides] = await Promise.all([
    listTenants(client),
    listSubscriptionCatalog(client),
    listSubscriptions(client),
    listFeatureOverrides(client)
  ]).catch(() => {
    notFound();
  });
  const tenantNames = new Map(tenants.map((tenant) => [tenant.id, tenant.name]));
  const tenantBillingEmails = new Map(tenants.map((tenant) => [tenant.id, tenant.billing_email]));
  const params = await searchParams;
  const selectedTenant = params.tenantId ? tenants.find((tenant) => tenant.id === params.tenantId) : null;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <main className="admin-shell">
      <AdminSidebar activeHref="/subscriptions" session={session} />
      <section className="admin-main">
        <header className="topbar">
          <div>
            <p className="eyebrow">Control Plane</p>
            <h1>Subscriptions</h1>
          </div>
          <span className="status">Product entitlements</span>
        </header>

        <section className="panel" aria-label="Assign subscription">
          <h2>Assign product plan</h2>
          <form action={assignSubscriptionAction} className="subscription-form">
            <label>
              Tenant
              <select name="tenantId" required>
                {tenants.map((tenant) => (
                  <option key={tenant.id} value={tenant.id}>
                    {tenant.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Product plan
              <select name="planId" required>
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.product_label} / {plan.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Status
              <select name="status" defaultValue="active">
                {subscriptionStatuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Starts
              <input name="startsAt" type="date" defaultValue={today} required />
            </label>
            <label>
              Expires
              <input name="expiresAt" type="date" />
            </label>
            <button type="submit" disabled={tenants.length === 0 || plans.length === 0}>
              Assign plan
            </button>
          </form>
          {tenants.length === 0 ? <p className="empty">Create a tenant before assigning subscriptions.</p> : null}
          {plans.length === 0 ? <p className="empty">Seed product plans before assigning subscriptions.</p> : null}
        </section>

        {selectedTenant && params.assigned === "1" ? (
          <section className="panel onboarding-next-step" aria-label="Invite tenant administrator">
            <div>
              <p className="eyebrow">Next step</p>
              <h2>Invite the tenant admin</h2>
              <p>
                {selectedTenant.name} now has a subscription. Send the customer administrator invitation so they can
                accept it, set their password, and start using app.torrevie.com.
              </p>
              <span>Invitation email: {selectedTenant.billing_email ?? "Set tenant billing email first"}</span>
            </div>
            <InviteTenantAdminForm tenantId={selectedTenant.id} disabled={!selectedTenant.billing_email} />
          </section>
        ) : null}

        {selectedTenant && params.invited === "1" ? (
          <p className="notice">
            Customer admin invitation sent to {selectedTenant.billing_email ?? "the tenant billing email"}.
          </p>
        ) : null}

        {selectedTenant && params.fsmControls === "1" ? (
          <p className="notice">FSM controls updated for {selectedTenant.name}.</p>
        ) : null}

        {selectedTenant && params.override === "1" ? (
          <p className="notice">FSM feature override saved for {selectedTenant.name}.</p>
        ) : null}

        <section className="panel" aria-label="FSM controls">
          <h2>FSM segmentation and plan controls</h2>
          <form action={updateFsmTenantControlsAction} className="subscription-form">
            <label>
              Tenant
              <select name="tenantId" required>
                {tenants.map((tenant) => (
                  <option key={tenant.id} value={tenant.id}>
                    {tenant.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Segment
              <select name="businessSegment" defaultValue="TRADE">
                {businessSegments.map((segment) => (
                  <option key={segment} value={segment}>
                    {segment}
                  </option>
                ))}
              </select>
            </label>
            <label>
              FSM plan tier
              <select name="planTier" defaultValue="growth">
                {fsmPlanTiers.map((tier) => (
                  <option key={tier} value={tier}>
                    {tier}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" disabled={tenants.length === 0}>
              Save FSM controls
            </button>
          </form>
        </section>

        <section className="panel" aria-label="FSM feature override">
          <h2>FSM feature override</h2>
          <form action={upsertFeatureOverrideAction} className="subscription-form">
            <label>
              Tenant
              <select name="tenantId" required>
                {tenants.map((tenant) => (
                  <option key={tenant.id} value={tenant.id}>
                    {tenant.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Feature key
              <input name="featureKey" placeholder="fsm.module.pm" required />
            </label>
            <label>
              Enabled
              <select name="enabled" defaultValue="true">
                <option value="true">true</option>
                <option value="false">false</option>
              </select>
            </label>
            <label>
              Limit
              <input name="limitValue" type="number" min="0" />
            </label>
            <label>
              Expires
              <input name="expiresAt" type="date" />
            </label>
            <label>
              Reason
              <input name="reason" placeholder="Growth trial override" required />
            </label>
            <button type="submit" disabled={tenants.length === 0}>
              Save override
            </button>
          </form>
          <div className="subscription-list">
            {overrides.length === 0 ? <p className="empty">No FSM overrides have been granted.</p> : null}
            {overrides.slice(0, 6).map((override) => (
              <article key={override.id} className="subscription-row">
                <div>
                  <strong>{tenantNames.get(override.tenant_id) ?? override.tenant_id}</strong>
                  <span>{override.feature_key}</span>
                </div>
                <div>
                  <strong>{override.enabled ? "enabled" : "disabled"}</strong>
                  <span>{override.limit_value === null ? "No limit override" : `Limit ${override.limit_value}`}</span>
                </div>
                <div>
                  <strong>{override.expires_at ? formatDate(override.expires_at) : "No expiry"}</strong>
                  <span>{override.reason}</span>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="panel" aria-label="Current subscriptions">
          <h2>Current subscriptions</h2>
          <div className="subscription-list">
            {subscriptions.length === 0 ? <p className="empty">No subscriptions have been assigned yet.</p> : null}
            {subscriptions.map((subscription) => (
              <article key={subscription.id} className="subscription-row">
                <div>
                  <strong>{tenantNames.get(subscription.tenant_id) ?? subscription.tenant_id}</strong>
                  <span>
                    {subscription.product_label} / {subscription.plan_label}
                  </span>
                </div>
                <div>
                  <strong>{subscription.status}</strong>
                  <span>
                    {formatDate(subscription.starts_at)}
                    {subscription.expires_at ? ` to ${formatDate(subscription.expires_at)}` : " onward"}
                  </span>
                </div>
                <div>
                  <strong>{subscription.entitlement_count}</strong>
                  <span>entitlements</span>
                </div>
                <div className="subscription-actions">
                  <InviteTenantAdminForm
                    tenantId={subscription.tenant_id}
                    disabled={!tenantBillingEmails.get(subscription.tenant_id)}
                  />
                </div>
              </article>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}

function formatDate(value: string) {
  return new Date(value).toISOString().slice(0, 10);
}

function InviteTenantAdminForm({ tenantId, disabled }: { tenantId: string; disabled: boolean }) {
  return (
    <form action={inviteTenantAdminAction}>
      <input type="hidden" name="tenantId" value={tenantId} />
      <button type="submit" disabled={disabled}>
        Invite admin
      </button>
    </form>
  );
}
