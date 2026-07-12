import { dirForLocale, getMessages, isLocale, type Locale } from "@torrevie/localization";
import { withTenantContext } from "@torrevie/tenant-context";
import { notFound, redirect } from "next/navigation";
import { listTexBootstrap, resolveTexActorContext, type TexActorContext } from "../../../lib/tex";
import {
  isCustomerSessionError,
  requireVerifiedCustomerSession,
  resolveCustomerTenantContext
} from "../../../lib/server/customer-session";
import { PostgresTenantQueryClient } from "../../../lib/server/tenant-query-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TexDashboard = {
  tenantName: string;
  openExpenses: number;
  pendingApprovals: number;
  receiptFiles: number;
  trips: number;
  whatsappOpen: number;
  notifications: number;
  recentExpenses: TexRecentExpense[];
};

type TexRecentExpense = {
  id: string;
  employeeName: string | null;
  vendor: string | null;
  amount: string;
  currency: string;
  status: string;
};

type DashboardRow = {
  tenant_name: string;
  open_expenses: number;
  pending_approvals: number;
  receipt_files: number;
  trips: number;
  whatsapp_open: number;
  notifications: number;
};

type ExpenseRow = {
  id: string;
  employee_name: string | null;
  vendor: string | null;
  amount: string;
  currency: string;
  status: string;
};

export default async function TexPage({
  params
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;

  if (!isLocale(rawLocale)) {
    notFound();
  }

  const locale = rawLocale as Locale;
  const t = getMessages(locale);
  const otherLocale = locale === "en" ? "ar" : "en";

  try {
    const session = await requireVerifiedCustomerSession();
    const client = new PostgresTenantQueryClient(session.userId);
    const tenantContext = await resolveCustomerTenantContext(client, session);
    const actor = await resolveTexActorContext(client, tenantContext);
    const [bootstrap, dashboard] = await Promise.all([listTexBootstrap(client, actor), listTexDashboard(client, actor)]);

    return (
      <main className="customer-shell" data-visual-check="tex-module-shell" lang={locale} dir={dirForLocale(locale)}>
        <aside className="customer-sidebar" aria-label="Customer Portal sections">
          <a className="customer-brand" href={`/${locale}`} aria-label={t.appName}>
            <img src="/logo/torrevie_logo_color.png" alt="" width="36" height="36" />
            <span>{t.appName}</span>
          </a>
          <nav>
            <a href={`/${locale}`}>{t.nav.overview}</a>
            <a href={`/${locale}/crm`}>{t.nav.crm}</a>
            <a href={`/${locale}`}>{t.nav.fsm}</a>
            <a href={`/${locale}/tex`} aria-current="page">
              {t.nav.tex}
            </a>
            <a href={`/${locale}`}>{t.nav.cme}</a>
            <a href={`/${locale}`}>{t.nav.lqs}</a>
            <a href={`/${locale}/admin/users`}>{t.nav.admin}</a>
            <a href={`/${locale}`}>{t.nav.settings}</a>
          </nav>
        </aside>

        <section className="customer-main">
          <header className="customer-topbar">
            <div>
              <p className="eyebrow">{t.nav.tex}</p>
              <h1>Travel and expense</h1>
              <p>Tenant-scoped trips, expenses, receipt intake, approvals, and WhatsApp submissions.</p>
            </div>
            <div className="customer-context" aria-label="TEX session context">
              <span>
                {t.shell.activeTenant}: {dashboard.tenantName}
              </span>
              <span>
                {t.shell.signedInAs}: {session.email ?? session.userId}
              </span>
              <a href={`/${otherLocale}/tex`} hrefLang={otherLocale}>
                {t.languageLabel}: {otherLocale.toUpperCase()}
              </a>
            </div>
          </header>

          <section className="metric-grid" aria-label="TEX metrics">
            <article>
              <span>Open expenses</span>
              <strong>{dashboard.openExpenses}</strong>
            </article>
            <article>
              <span>Pending approvals</span>
              <strong>{dashboard.pendingApprovals}</strong>
            </article>
            <article>
              <span>Receipt records</span>
              <strong>{dashboard.receiptFiles}</strong>
            </article>
          </section>

          <section className="customer-section" aria-labelledby="tex-work-title">
            <h2 id="tex-work-title">TEX workspace</h2>
            <div className="module-grid">
              <article className="module-card">
                <span className="module-status module-status-active">active</span>
                <h3>Employees</h3>
                <p>Migrated tenant employee profiles available for expense submission.</p>
                <strong>{bootstrap.employeeProfiles.length}</strong>
              </article>
              <article className="module-card">
                <span className="module-status module-status-active">active</span>
                <h3>Categories</h3>
                <p>Expense categories preserved from TEX for reporting continuity.</p>
                <strong>{bootstrap.categories.length}</strong>
              </article>
              <article className="module-card">
                <span className="module-status module-status-active">active</span>
                <h3>Trips</h3>
                <p>Trip and leg records now live under the platform tenant model.</p>
                <strong>{dashboard.trips}</strong>
              </article>
              <article className="module-card">
                <span className="module-status module-status-active">active</span>
                <h3>WhatsApp intake</h3>
                <p>Open unregistered WhatsApp submissions requiring finance review.</p>
                <strong>{dashboard.whatsappOpen}</strong>
              </article>
            </div>
          </section>

          <section className="customer-section activity-panel" aria-labelledby="recent-expenses-title">
            <h2 id="recent-expenses-title">Recent expenses</h2>
            {dashboard.recentExpenses.length === 0 ? (
              <p>No migrated expenses are available for this tenant.</p>
            ) : (
              <div className="member-table" role="table" aria-label="Recent TEX expenses">
                {dashboard.recentExpenses.map((expense) => (
                  <div key={expense.id} className="member-row" role="row">
                    <span>{expense.employeeName ?? "Unassigned"}</span>
                    <span>{expense.vendor ?? "No vendor"}</span>
                    <span>
                      {expense.amount} {expense.currency}
                    </span>
                    <span>{expense.status}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="customer-section activity-panel" aria-labelledby="tex-integration-title">
            <h2 id="tex-integration-title">Integration status</h2>
            <p>
              WhatsApp provider: {bootstrap.integrationSettings?.whatsappProvider ?? "not configured"} - Notifications:{" "}
              {dashboard.notifications}
            </p>
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

async function listTexDashboard(client: PostgresTenantQueryClient, actor: TexActorContext): Promise<TexDashboard> {
  return withTenantContext(client, actor, async () => {
    const [dashboard, recentExpenses] = await Promise.all([
      client.query<DashboardRow>(
        `
          select
            coalesce((select name from public.tenants where id = public.current_tenant_id()), 'Current tenant') as tenant_name,
            (select count(*)::int from public.tex_expenses where tenant_id = public.current_tenant_id() and status in ('pending', 'approved')) as open_expenses,
            (select count(*)::int from public.tex_expenses where tenant_id = public.current_tenant_id() and status = 'pending') as pending_approvals,
            (select count(*)::int from public.tex_legacy_files where tenant_id = public.current_tenant_id()) as receipt_files,
            (select count(*)::int from public.tex_trips where tenant_id = public.current_tenant_id()) as trips,
            (select count(*)::int from public.tex_unregistered_whatsapp_submissions where tenant_id = public.current_tenant_id() and status = 'open') as whatsapp_open,
            (select count(*)::int from public.tex_notifications where tenant_id = public.current_tenant_id()) as notifications
        `
      ),
      client.query<ExpenseRow>(
        `
          select
            e.id,
            ep.name as employee_name,
            e.vendor,
            e.amount::text as amount,
            e.currency,
            e.status
          from public.tex_expenses e
          left join public.tex_employee_profiles ep
            on ep.tenant_id = e.tenant_id
           and ep.id = e.employee_profile_id
          where e.tenant_id = public.current_tenant_id()
          order by e.created_at desc
          limit 5
        `
      )
    ]);
    const row = dashboard.rows[0];

    return {
      tenantName: row?.tenant_name ?? "Current tenant",
      openExpenses: row?.open_expenses ?? 0,
      pendingApprovals: row?.pending_approvals ?? 0,
      receiptFiles: row?.receipt_files ?? 0,
      trips: row?.trips ?? 0,
      whatsappOpen: row?.whatsapp_open ?? 0,
      notifications: row?.notifications ?? 0,
      recentExpenses: recentExpenses.rows.map((expense) => ({
        id: expense.id,
        employeeName: expense.employee_name,
        vendor: expense.vendor,
        amount: expense.amount,
        currency: expense.currency,
        status: expense.status
      }))
    };
  });
}
