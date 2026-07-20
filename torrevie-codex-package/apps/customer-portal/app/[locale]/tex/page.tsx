import { CheckCircle2, Clock, MapPin, Receipt, WalletCards } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  getTexOnboardingStatus,
  listTexBootstrap,
  listTexExpenses,
  listTexFinanceReview,
  listTexReportWorkspace,
  listTexTrips,
  type TexBootstrap,
  type TexExpenseListItem,
  type TexOnboardingStatus
} from "../../../lib/tex";
import { TexRoleDashboard } from "./TexRoleDashboard";
import { isTexSessionError, requireTexRequestContext } from "./tex-request-context";

export const runtime = "nodejs";

export default async function TexPage({ params }: { params: Promise<{ locale: string }> }) {
  try {
    const { locale } = await params;
    const { actor, client, session } = await requireTexRequestContext(
      locale === "ar" ? "ar" : "en",
      "/tex"
    );
    const now = new Date();
    const growthFeaturesEnabled = actor.texPlan.growthFeaturesEnabled;
    const bootstrap = await listTexBootstrap(client, actor);
    const expenses = await listTexExpenses(client, actor);
    const onboarding = await getTexOnboardingStatus(client, actor, { markDashboardViewed: true });
    const pendingCount = expenses.filter((expense) => expense.status === "pending").length;
    const approvedCount = expenses.filter((expense) => expense.status === "approved").length;
    const onboardingTasks = buildOnboardingTasks(
      locale,
      onboarding,
      bootstrap,
      expenses,
      growthFeaturesEnabled
    );
    const requiredOnboardingTasks = onboardingTasks.filter((task) => task.required);
    const completedTasks = requiredOnboardingTasks.filter((task) => task.completed).length;
    const onboardingProgress = Math.round((completedTasks / requiredOnboardingTasks.length) * 100);
    const nextOnboardingTask = onboardingTasks.find((task) => !task.completed);
    const showOnboardingGate =
      (actor.texPlan.planKey === "trial" || actor.texPlan.planKey === "lite") &&
      completedTasks < requiredOnboardingTasks.length;

    if (showOnboardingGate) {
      return (
        <>
          <header className="customer-topbar tex-topbar">
            <div>
              <p className="eyebrow">TEX workspace</p>
              <h1>Set up TEX</h1>
              <p>Complete the starter setup flow, then launch the TEX dashboard.</p>
            </div>
            <div className="customer-context tex-context" aria-label="TEX context">
              <span>Tenant scoped by RLS</span>
              <span>TEX entitlement active</span>
              <span>
                {bootstrap.integrationSettings?.whatsappProvider ?? "No WhatsApp provider"}
              </span>
            </div>
          </header>

          <TexTrialOnboardingGate
            employeeLimit={actor.texPlan.employeeLimit}
            nextTask={nextOnboardingTask}
            progress={onboardingProgress}
            tasks={requiredOnboardingTasks}
          />
        </>
      );
    }

    const trips = growthFeaturesEnabled ? await listTexTrips(client, actor) : [];
    const financeReview = growthFeaturesEnabled
      ? await listTexFinanceReview(client, actor, now.getUTCMonth() + 1, now.getUTCFullYear())
      : emptyFinanceReview(now);
    const reportWorkspace = await listTexReportWorkspace(client, actor).catch(() => null);
    const reportExpenses = reportWorkspace?.expenses ?? [];
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
            <h1>
              {growthFeaturesEnabled ? "Travel and expense operations" : "TEX expense workspace"}
            </h1>
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
            <strong>{onboardingProgress}%</strong>
          </div>
          <div className="tex-bar-row">
            <span>Onboarding</span>
            <span className="tex-bar-track">
              <i style={{ inlineSize: `${onboardingProgress}%` }} />
            </span>
            <strong>{actor.texPlan.employeeLimit || "Unlimited"} seats</strong>
          </div>
          <div className="tex-onboarding-steps">
            {onboardingTasks.map((task) => (
              <Link
                aria-current={nextOnboardingTask?.key === task.key ? "step" : undefined}
                className={`tex-onboarding-step${task.completed ? " tex-onboarding-step-complete" : ""}`}
                href={task.href}
                key={task.key}
              >
                <span>
                  <strong>{task.label}</strong>
                  <small>{task.detail}</small>
                </span>
                <b>
                  {task.completed
                    ? "Completed"
                    : nextOnboardingTask?.key === task.key
                      ? "Next"
                      : "Pending"}
                </b>
              </Link>
            ))}
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
            <strong>
              {growthFeaturesEnabled ? openTripCount : bootstrap.employeeProfiles.length}
            </strong>
            <small>
              {growthFeaturesEnabled
                ? "Active trip budgets and legs"
                : "People in this TEX workspace"}
            </small>
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
              <Link href={`/${locale}/tex/reports`}>Open reports</Link>
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

function TexTrialOnboardingGate({
  employeeLimit,
  nextTask,
  progress,
  tasks
}: {
  employeeLimit: number;
  nextTask: ReturnType<typeof buildOnboardingTasks>[number] | undefined;
  progress: number;
  tasks: ReturnType<typeof buildOnboardingTasks>;
}) {
  return (
    <section
      className="tex-analytics-panel tex-onboarding-gate"
      aria-label="TEX starter onboarding"
    >
      <div className="section-heading-row">
        <div>
          <p className="eyebrow">Starter onboarding</p>
          <h2>Prepare your TEX workspace</h2>
          <p>
            Follow these steps in order so receipts, employees, and approvals are ready before the
            dashboard opens.
          </p>
        </div>
        <strong>{progress}%</strong>
      </div>
      <div className="tex-bar-row">
        <span>Setup progress</span>
        <span className="tex-bar-track">
          <i style={{ inlineSize: `${progress}%` }} />
        </span>
        <strong>{employeeLimit || "Unlimited"} seats</strong>
      </div>
      <div className="tex-onboarding-flow">
        {tasks.map((task, index) => {
          const isNext = nextTask?.key === task.key;

          return (
            <article
              className={`tex-onboarding-flow-step${task.completed ? " tex-onboarding-step-complete" : ""}`}
              key={task.key}
            >
              <b>{index + 1}</b>
              <span>
                <strong>{task.label}</strong>
                <small>{task.detail}</small>
              </span>
              <Link
                aria-disabled={!task.completed && !isNext}
                className={isNext ? "tex-primary-link" : "tex-secondary-link"}
                href={task.completed || isNext ? task.href : "#"}
              >
                {task.completed ? "Review" : isNext ? "Start" : "Next"}
              </Link>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function buildOnboardingTasks(
  locale: string,
  onboarding: TexOnboardingStatus,
  bootstrap: TexBootstrap,
  expenses: TexExpenseListItem[],
  growthFeaturesEnabled: boolean
) {
  const hasWhatsappRoute = Boolean(
    onboarding.whatsappConnectedAt || bootstrap.integrationSettings?.whatsappProvider
  );
  const hasAdditionalEmployee = bootstrap.employeeProfiles.some(
    (employee) => employee.userId === null
  );
  const hasReceipt = Boolean(
    onboarding.firstReceiptReceivedAt || expenses.some((expense) => expense.receiptFileId)
  );
  const hasReviewedExpense = Boolean(
    onboarding.firstExpenseApprovedAt ||
      expenses.some((expense) => expense.status === "approved" || expense.status === "paid")
  );

  return [
    {
      key: "whatsapp",
      label: "Connect WhatsApp",
      detail: hasWhatsappRoute
        ? "Receipt intake route is ready"
        : "Scan Quick Connect and send a test receipt",
      href: `/${locale}/tex/integrations`,
      completed: hasWhatsappRoute,
      required: true
    },
    {
      key: "people",
      label: "Add employees",
      detail: hasAdditionalEmployee
        ? "Driver or employee profile exists"
        : "Add at least one sender profile",
      href: `/${locale}/tex/people`,
      completed: hasAdditionalEmployee,
      required: true
    },
    {
      key: "receipt",
      label: "Receive receipt",
      detail: hasReceipt ? "Receipt file captured" : "Send or upload the first receipt",
      href: `/${locale}/tex/whatsapp-review`,
      completed: hasReceipt,
      required: true
    },
    {
      key: "review",
      label: "Review expense",
      detail: hasReviewedExpense ? "Expense approved for finance" : "Check OCR values and approve",
      href: `/${locale}/tex/expenses`,
      completed: hasReviewedExpense,
      required: true
    },
    {
      key: "modules",
      label: growthFeaturesEnabled ? "Open trips" : "Growth modules",
      detail: growthFeaturesEnabled
        ? "Plan trips and driver payouts"
        : "Upgrade when trips and finance are needed",
      href: growthFeaturesEnabled ? `/${locale}/tex/trips` : `/${locale}/tex?upgrade=growth`,
      completed: growthFeaturesEnabled,
      required: false
    }
  ];
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
