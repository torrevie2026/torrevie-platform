import { notFound, redirect } from "next/navigation";
import { AdminSidebar } from "../components/AdminSidebar";
import { getSupabaseAdminClient } from "../../lib/admin-client";
import { listBillingOverview, type BillingOverviewRecord } from "../../lib/billing-admin";
import { getPlatformSession } from "../../lib/session";
import { requirePlatformPermission } from "../../lib/tex-admin";

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const session = await getPlatformSession();

  if (!session) {
    redirect("/login");
  }

  const client = getSupabaseAdminClient();
  const billingRows = await requirePlatformPermission(
    client,
    session.userId,
    "platform.subscription.manage"
  )
    .then(() => listBillingOverview(client))
    .catch(() => {
      notFound();
    });

  const connected = billingRows.filter((row) => row.provider_subscription_id).length;
  const cancelling = billingRows.filter((row) => row.cancel_at_period_end).length;
  const failedEvents = billingRows.reduce((total, row) => total + row.failed_event_count, 0);
  const products = new Set(billingRows.map((row) => row.product_key)).size;

  return (
    <main className="admin-shell">
      <AdminSidebar activeHref="/billing" session={session} />
      <section className="admin-main">
        <header className="topbar">
          <div>
            <p className="eyebrow">Control Plane</p>
            <h1>Billing</h1>
          </div>
          <span>Payments and invoices</span>
        </header>

        <section className="summary-grid" aria-label="Billing summary">
          <Metric label="Billing tenants" value={String(billingRows.length)} />
          <Metric label="Products" value={String(products)} />
          <Metric label="Connected subs" value={String(connected)} />
          <Metric label="Failed events" value={String(failedEvents)} />
        </section>

        <section className="panel" aria-label="Payment provider visibility">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Stripe</p>
              <h2>Payment provider visibility</h2>
              <span className="panel-subtitle">
                Subscription state, invoice references, and webhook processing health
              </span>
            </div>
            {cancelling > 0 ? <span className="status-pill warning">{cancelling} cancelling</span> : null}
          </div>
          <BillingOverview rows={billingRows} />
        </section>

        <section className="panel" aria-label="Invoicing process">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Invoices</p>
              <h2>Invoicing process</h2>
              <span className="panel-subtitle">
                Invoice issuing, PDFs, manual payment tracking, and resend flows will live here in
                the next billing phase.
              </span>
            </div>
          </div>
          <p className="empty">
            No invoice operations are enabled yet. Stripe invoice IDs are visible above when webhooks
            record them.
          </p>
        </section>

        <section className="panel" aria-label="Manual billing operations">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Operations</p>
              <h2>Manual billing operations</h2>
              <span className="panel-subtitle">
                Grace periods, offline payments, plan suspension, and billing follow-up queues will
                be added here after the visibility foundation is stable.
              </span>
            </div>
          </div>
          <p className="empty">This area is intentionally read-only for the first Billing release.</p>
        </section>
      </section>
    </main>
  );
}

function BillingOverview({ rows }: { rows: BillingOverviewRecord[] }) {
  return (
    <div className="billing-overview">
      <div className="subscription-list">
        {rows.length === 0 ? <p className="empty">No Stripe billing activity has been recorded yet.</p> : null}
        {rows.map((row) => (
          <article key={`${row.product_key}-${row.tenant_id}`} className="subscription-row billing-row">
            <div>
              <strong>{row.tenant_name}</strong>
              <span>{row.billing_email || "No billing email captured"}</span>
            </div>
            <div>
              <strong>{productLabel(row.product_key)}</strong>
              <span>{label(row.provider)}</span>
            </div>
            <div>
              <strong>{label(row.provider_status)}</strong>
              <span>
                {row.plan_key ? `${label(row.plan_key)} / ${currencyLabel(row.subscription_currency)}` : "No paid plan"}
              </span>
            </div>
            <div>
              <strong>{row.current_period_end ? formatDate(row.current_period_end) : "No period end"}</strong>
              <span>{row.cancel_at_period_end ? "Cancels at period end" : "Auto-renewing or unmanaged"}</span>
            </div>
            <div>
              <strong>{row.latest_invoice_id || "No invoice"}</strong>
              <span>{row.provider_subscription_id || "No subscription"}</span>
            </div>
            <div>
              <strong>{row.latest_event_type ? label(row.latest_event_type) : "No webhook yet"}</strong>
              <span>
                {row.latest_event_status ? label(row.latest_event_status) : "Waiting"}
                {row.latest_event_processed_at ? ` / ${formatDateTime(row.latest_event_processed_at)}` : ""}
              </span>
            </div>
            <div>
              <strong>{row.failed_event_count} failed</strong>
              <span>
                {row.processed_event_count} processed / {row.ignored_event_count} ignored
              </span>
            </div>
            {row.latest_event_error ? <p className="billing-error">{row.latest_event_error}</p> : null}
          </article>
        ))}
      </div>
    </div>
  );
}

function Metric({ label: metricLabel, value }: { label: string; value: string }) {
  return (
    <article>
      <span>{metricLabel}</span>
      <strong>{value}</strong>
    </article>
  );
}

function productLabel(value: string) {
  return value.toUpperCase();
}

function label(value: string) {
  return value.replaceAll("_", " ").replaceAll("-", " ").replace(/\b\w/g, (match) => match.toUpperCase());
}

function currencyLabel(value: string) {
  return value ? value.toUpperCase() : "No currency";
}

function formatDate(value: string) {
  return new Date(value).toISOString().slice(0, 10);
}

function formatDateTime(value: string) {
  return new Date(value).toISOString().slice(0, 16).replace("T", " ");
}
