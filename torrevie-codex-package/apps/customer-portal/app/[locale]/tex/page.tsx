import { CheckCircle2, Clock, MapPin, Receipt, WalletCards } from "lucide-react";
import { redirect } from "next/navigation";
import {
  getTexOnboardingStatus,
  listTexBootstrap,
  listTexExpenses,
  listTexFinanceReview,
  listTexReportWorkspace,
  listTexTrips
} from "../../../lib/tex";
import { TexRoleDashboard } from "./TexRoleDashboard";
import { isTexSessionError, requireTexRequestContext } from "./tex-request-context";

export const runtime = "nodejs";

export default async function TexPage({
  params
}: {
  params: Promise<{ locale: string }>;
}) {
  try {
    const { locale } = await params;
    const { actor, client, session } = await requireTexRequestContext();
    const now = new Date();
    const growthFeaturesEnabled = actor.texPlan.growthFeaturesEnabled;
    const bootstrap = await listTexBootstrap(client, actor);
    const expenses = await listTexExpenses(client, actor);
    const onboarding = await getTexOnboardingStatus(client, actor, { markDashboardViewed: true });
    const trips = growthFeaturesEnabled ? await listTexTrips(client, actor) : [];
    const financeReview = growthFeaturesEnabled
      ? await listTexFinanceReview(client, actor, now.getUTCMonth() + 1, now.getUTCFullYear())
      : emptyFinanceReview(now);
    const reportWorkspace = await listTexReportWorkspace(client, actor).catch(() => null);
    const reportExpenses = reportWorkspace?.expenses ?? [];
    const pendingCount = expenses.filter((expense) => expense.status === "pending").length;
    const approvedCount = expenses.filter((expense) => expense.status === "approved").length;
    const openTripCount = trips.filter((trip) => trip.status === "open").length;
    const paidCount = reportExpenses.filter((expense) => expense.status === "paid").length;
    const rejectedCount = reportExpenses.filter((expense) => expense.status === "rejected").length;
    const categorySpend = buildCategorySpend(reportExpenses);
    const maxCategorySpend = Math.max(...categorySpend.map((item) => item.amount), 1);

    return (
      <>
        <header className="customer-topbar tex-topbar">
          <div>
            <p className="eyebrow">TEX workspace</p>
            <h1>{growthFeaturesEnabled ? "Travel and expense operations" : "TEX expense workspace"}</h1>
            <p>
              {growthFeaturesEnabled
                ? "Start from the role dashboard, then use the TEX menu to move into expenses, trips, finance review, people, reports, integrations, and settings."
                : "Start with WhatsApp setup, invite employees, and review receipts from a compact Trial workspace."}
            </p>
          </div>
          <div className="customer-context tex-context" aria-label="TEX context">
            <span>Tenant scoped by RLS</span>
            <span>
              {actor.entitledProducts.includes("tex")
                ? "TEX entitlement active"
                : "TEX entitlement missing"}
            </span>
            <span>{bootstrap.integrationSettings?.whatsappProvider ?? "No WhatsApp provider"}</span>
          </div>
        </header>

        <section className="tex-analytics-panel" aria-label="TEX onboarding progress">
          <div className="section-heading-row">
            <div>
              <p className="eyebrow">{actor.texPlan.planKey} plan</p>
              <h2>Set up TEX</h2>
            </div>
            <strong>{onboarding.progress}%</strong>
          </div>
          <div className="tex-bar-row">
            <span>Onboarding</span>
            <span className="tex-bar-track">
              <i style={{ inlineSize: `${onboarding.progress}%` }} />
            </span>
            <strong>{actor.texPlan.employeeLimit || "Unlimited"} seats</strong>
          </div>
          <div className="tex-role-shortcuts">
            <a href={`/${locale}/tex/integrations`}>Connect WhatsApp</a>
            <a href={`/${locale}/tex/people`}>Add employees</a>
            <a href={`/${locale}/tex/expenses`}>Review expenses</a>
            {growthFeaturesEnabled ? (
              <a href={`/${locale}/tex/trips`}>Open trips</a>
            ) : (
              <a href={`/${locale}/tex?upgrade=growth`}>Growth modules</a>
            )}
          </div>
        </section>

        <section className="tex-kpi-grid" aria-label="TEX summary">
          <article className="tex-kpi-card tex-kpi-teal">
            <span className="tex-kpi-icon" aria-hidden="true">
              <Clock />
            </span>
            <span>Pending</span>
            <strong>{pendingCount}</strong>
            <small>Expenses waiting for review</small>
          </article>
          <article className="tex-kpi-card tex-kpi-green">
            <span className="tex-kpi-icon" aria-hidden="true">
              <CheckCircle2 />
            </span>
            <span>Approved</span>
            <strong>{approvedCount}</strong>
            <small>Ready for finance settlement</small>
          </article>
          <article className="tex-kpi-card tex-kpi-blue">
            <span className="tex-kpi-icon" aria-hidden="true">
              <MapPin />
            </span>
            <span>{growthFeaturesEnabled ? "Open trips" : "Employees"}</span>
            <strong>{growthFeaturesEnabled ? openTripCount : bootstrap.employeeProfiles.length}</strong>
            <small>{growthFeaturesEnabled ? "Active trip budgets and legs" : "People in this TEX workspace"}</small>
          </article>
          <article className="tex-kpi-card tex-kpi-gold">
            <span className="tex-kpi-icon" aria-hidden="true">
              <WalletCards />
            </span>
            <span>Net payable</span>
            <strong>{formatAmount(financeReview.totals.netPayable)}</strong>
            <small>{financeReview.currency} this period</small>
          </article>
        </section>

        <section className="tex-dashboard-grid" aria-label="TEX analytics">
          <article className="tex-analytics-panel">
            <div className="section-heading-row">
              <div>
                <p className="eyebrow">Expense flow</p>
                <h2>Status distribution</h2>
              </div>
              <a href={`/${locale}/tex/reports`}>Open reports</a>
            </div>
            <div className="tex-status-chart" aria-label="Expense status chart">
              {[
                { label: "Pending", value: pendingCount, tone: "var(--color-status-warning)" },
                { label: "Approved", value: approvedCount, tone: "var(--color-status-success)" },
                { label: "Paid", value: paidCount, tone: "var(--color-accent)" },
                { label: "Rejected", value: rejectedCount, tone: "var(--color-status-error)" }
              ].map((item) => (
                <div className="tex-status-column" key={item.label}>
                  <span
                    style={{
                      background: item.tone,
                      blockSize: `${Math.max(14, item.value * 24)}px`
                    }}
                  />
                  <strong>{item.value}</strong>
                  <small>{item.label}</small>
                </div>
              ))}
            </div>
          </article>

          <article className="tex-analytics-panel">
            <div className="section-heading-row">
              <div>
                <p className="eyebrow">Spend signal</p>
                <h2>Top categories</h2>
              </div>
              <span className="tex-kpi-icon" aria-hidden="true">
                <Receipt />
              </span>
            </div>
            <div className="tex-bar-list">
              {categorySpend.length ? (
                categorySpend.map((item) => (
                  <div className="tex-bar-row" key={item.category}>
                    <span>{item.category}</span>
                    <span className="tex-bar-track">
                      <i style={{ inlineSize: `${(item.amount / maxCategorySpend) * 100}%` }} />
                    </span>
                    <strong>{formatAmount(item.amount)}</strong>
                  </div>
                ))
              ) : (
                <p className="tex-empty-state">No report-period category spend yet.</p>
              )}
            </div>
          </article>
        </section>

        <TexRoleDashboard
          bootstrap={bootstrap}
          currentUserId={session.userId}
          expenses={expenses}
          financeReview={financeReview}
          report={reportWorkspace}
          roles={actor.roles}
          trips={trips}
        />
      </>
    );
  } catch (error) {
    if (isTexSessionError(error)) {
      redirect("/login");
    }

    throw error;
  }
}

function formatAmount(value: number) {
  return new Intl.NumberFormat("en", { maximumFractionDigits: 0 }).format(value);
}

function buildCategorySpend(expenses: Array<{ baseAmount: number; category: string | null }>) {
  const spendByCategory = new Map<string, number>();

  for (const expense of expenses) {
    const category = expense.category || "Uncategorized";
    spendByCategory.set(category, (spendByCategory.get(category) ?? 0) + expense.baseAmount);
  }

  return [...spendByCategory.entries()]
    .map(([category, amount]) => ({ amount, category }))
    .sort((left, right) => right.amount - left.amount)
    .slice(0, 5);
}

function emptyFinanceReview(now: Date) {
  return {
    month: now.getUTCMonth() + 1,
    year: now.getUTCFullYear(),
    currency: "AED",
    approvedExpenses: [],
    tripPayouts: [],
    totals: {
      approvedExpenseAmount: 0,
      tripPayoutAmount: 0,
      netPayable: 0
    }
  };
}
