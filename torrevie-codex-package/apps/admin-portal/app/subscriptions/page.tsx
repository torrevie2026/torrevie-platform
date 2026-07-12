import { notFound, redirect } from "next/navigation";
import { AdminSidebar } from "../components/AdminSidebar";
import { getSupabaseAdminClient } from "../../lib/admin-client";
import { getPlatformSession } from "../../lib/session";
import { listSubscriptionCatalog, listSubscriptions, subscriptionStatuses } from "../../lib/subscription-management";
import { listTenants } from "../../lib/tenant-lifecycle";
import { assignSubscriptionAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function SubscriptionsPage() {
  const session = await getPlatformSession();

  if (!session) {
    redirect("/login");
  }

  const client = getSupabaseAdminClient();
  const [tenants, plans, subscriptions] = await Promise.all([
    listTenants(client),
    listSubscriptionCatalog(client),
    listSubscriptions(client)
  ]).catch(() => {
    notFound();
  });
  const tenantNames = new Map(tenants.map((tenant) => [tenant.id, tenant.name]));
  const today = new Date().toISOString().slice(0, 10);

  return (
    <main className="admin-shell">
      <AdminSidebar activeHref="/subscriptions" />
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
