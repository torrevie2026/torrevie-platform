import { getMessages, isLocale, type Locale } from "@torrevie/localization";
import { hasPermission } from "@torrevie/permissions";
import { notFound, redirect } from "next/navigation";
import {
  isCustomerSessionError,
  requireVerifiedCustomerSession,
  resolveCustomerTenantContext
} from "../../../lib/server/customer-session";
import { PostgresTenantQueryClient } from "../../../lib/server/tenant-query-client";
import {
  listTexBootstrap,
  listTexExpenses,
  listTexFinanceReview,
  listTexIntegrationWorkspace,
  listTexReportWorkspace,
  listTexSettingsWorkspace,
  listTexTrips,
  listTexUnregisteredWhatsappSubmissions,
  resolveTexActorContext
} from "../../../lib/tex";
import { TexExpensesClient } from "./TexExpensesClient";
import { TexFinanceClient } from "./TexFinanceClient";
import { TexIntegrationsClient } from "./TexIntegrationsClient";
import { TexPeopleClient } from "./TexPeopleClient";
import { TexReportsClient } from "./TexReportsClient";
import { TexSettingsClient } from "./TexSettingsClient";
import { TexTripsClient } from "./TexTripsClient";
import { TexWhatsappReviewClient } from "./TexWhatsappReviewClient";

export const runtime = "nodejs";

export default async function TexPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;

  if (!isLocale(rawLocale)) {
    notFound();
  }

  const locale = rawLocale as Locale;
  const t = getMessages(locale);

  try {
    const session = await requireVerifiedCustomerSession();
    const client = new PostgresTenantQueryClient(session.userId);
    const tenantContext = await resolveCustomerTenantContext(client, session);
    const actor = await resolveTexActorContext(client, tenantContext);
    const now = new Date();
    const bootstrap = await listTexBootstrap(client, actor);
    const expenses = await listTexExpenses(client, actor);
    const trips = await listTexTrips(client, actor);
    const financeReview = await listTexFinanceReview(
      client,
      actor,
      now.getUTCMonth() + 1,
      now.getUTCFullYear()
    );
    const whatsappSubmissions = await listTexUnregisteredWhatsappSubmissions(
      client,
      actor,
      "open"
    ).catch(() => []);
    const reportWorkspace = await listTexReportWorkspace(client, actor).catch(() => null);
    const integrationWorkspace = await listTexIntegrationWorkspace(client, actor).catch(() => null);
    const settingsWorkspace = await listTexSettingsWorkspace(
      client,
      actor,
      now.getUTCMonth() + 1,
      now.getUTCFullYear()
    ).catch(() => null);
    const pendingCount = expenses.filter((expense) => expense.status === "pending").length;
    const approvedCount = expenses.filter((expense) => expense.status === "approved").length;
    const openTripCount = trips.filter((trip) => trip.status === "open").length;
    const canManagePolicies = actor.roles.some((role) =>
      ["customer_admin", "customer_module_admin", "torrevie_platform_admin"].includes(role)
    );
    const canManagePeople = hasPermission({
      roles: actor.roles,
      permission: "tex.people.manage",
      entitledProducts: actor.entitledProducts,
      moduleAdminProducts: actor.moduleAdminProducts,
      integrationPermissions: actor.integrationPermissions
    }).allowed;

    return (
      <main className="customer-shell tex-shell" data-visual-check="tex-platform">
        <aside className="customer-sidebar tex-sidebar" aria-label="TEX sections">
          <div className="tex-sidebar-header">
            <a className="customer-brand tex-brand" href={`/${locale}`} aria-label={t.appName}>
              <img src="/logo/torrevie_logo_color.png" alt="" width="36" height="36" />
              <span>
                <strong>Torrevie TEX</strong>
                <small>Travel and Expense</small>
              </span>
            </a>
            <div className="tex-company-chip">{actor.tenantId}</div>
          </div>
          <nav className="tex-nav">
            <a href={`/${locale}`}>{t.nav.overview}</a>
            <a href={`/${locale}/crm`}>{t.nav.crm}</a>
            <a href={`/${locale}/fsm`}>{t.nav.fsm}</a>
            <a href={`/${locale}/tex`} aria-current="page">
              TEX
            </a>
            <a href={`/${locale}/admin/users`}>{t.nav.admin}</a>
          </nav>
          <div className="tex-sidebar-user">
            <span className="tex-avatar">{session.email?.slice(0, 1).toUpperCase() ?? "T"}</span>
            <span>
              <strong>{session.email ?? "Customer user"}</strong>
              <small>{actor.roles.join(", ") || "TEX user"}</small>
            </span>
          </div>
        </aside>

        <section className="customer-main tex-main">
          <header className="customer-topbar tex-topbar">
            <div>
              <p className="eyebrow">TEX migration preview</p>
              <h1>Travel and expense operations</h1>
              <p>
                Review receipts, trip costs, driver payouts, and finance settlement inside the
                shared Torrevie tenant boundary.
              </p>
            </div>
            <div className="customer-context tex-context" aria-label="TEX context">
              <span>Tenant scoped by RLS</span>
              <span>
                {actor.entitledProducts.includes("tex")
                  ? "TEX entitlement active"
                  : "TEX entitlement missing"}
              </span>
              <span>
                {bootstrap.integrationSettings?.whatsappProvider ?? "No WhatsApp provider"}
              </span>
            </div>
          </header>

          <section className="tex-kpi-grid" aria-label="TEX summary">
            <article className="tex-kpi-card tex-kpi-teal">
              <span>Pending</span>
              <strong>{pendingCount}</strong>
              <small>Expenses waiting for review</small>
            </article>
            <article className="tex-kpi-card tex-kpi-green">
              <span>Approved</span>
              <strong>{approvedCount}</strong>
              <small>Ready for finance settlement</small>
            </article>
            <article className="tex-kpi-card tex-kpi-blue">
              <span>Open trips</span>
              <strong>{openTripCount}</strong>
              <small>Active trip budgets and legs</small>
            </article>
            <article className="tex-kpi-card tex-kpi-gold">
              <span>Net payable</span>
              <strong>{formatAmount(financeReview.totals.netPayable)}</strong>
              <small>{financeReview.currency} this period</small>
            </article>
          </section>

          <section className="tex-dashboard-grid" aria-label="TEX workspace">
            <TexExpensesClient
              categories={bootstrap.categories}
              employees={bootstrap.employeeProfiles}
              trips={trips}
              initialExpenses={expenses}
            />
            <TexTripsClient
              teams={bootstrap.teams}
              employees={bootstrap.employeeProfiles}
              initialTrips={trips}
            />
          </section>

          <TexFinanceClient initialReview={financeReview} />
          <TexReportsClient initialReport={reportWorkspace} />
          <TexPeopleClient
            adminUsersHref={`/${locale}/admin/users`}
            canManage={canManagePeople}
            initialEmployees={bootstrap.employeeProfiles}
          />
          <TexWhatsappReviewClient
            employees={bootstrap.employeeProfiles}
            initialSubmissions={whatsappSubmissions}
          />
          <TexIntegrationsClient
            adminIntegrationsHref={`/${locale}/admin/users#tex-whatsapp-settings`}
            initialWorkspace={integrationWorkspace}
          />
          <TexSettingsClient initialSettings={settingsWorkspace} canManage={canManagePolicies} />
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

function formatAmount(value: number) {
  return new Intl.NumberFormat("en", { maximumFractionDigits: 0 }).format(value);
}
