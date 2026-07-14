import { redirect } from "next/navigation";
import {
  listTexBootstrap,
  listTexExpenses,
  listTexFinanceReview,
  listTexReportWorkspace,
  listTexTrips
} from "../../../lib/tex";
import { TexRoleDashboard } from "./TexRoleDashboard";
import { isTexSessionError, requireTexRequestContext } from "./tex-request-context";

export const runtime = "nodejs";

export default async function TexPage() {
  try {
    const { actor, client, session } = await requireTexRequestContext();
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
    const reportWorkspace = await listTexReportWorkspace(client, actor).catch(() => null);
    const pendingCount = expenses.filter((expense) => expense.status === "pending").length;
    const approvedCount = expenses.filter((expense) => expense.status === "approved").length;
    const openTripCount = trips.filter((trip) => trip.status === "open").length;

    return (
      <>
        <header className="customer-topbar tex-topbar">
          <div>
            <p className="eyebrow">TEX workspace</p>
            <h1>Travel and expense operations</h1>
            <p>
              Start from the role dashboard, then use the TEX menu to move into expenses, trips,
              finance review, people, reports, integrations, and settings.
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
