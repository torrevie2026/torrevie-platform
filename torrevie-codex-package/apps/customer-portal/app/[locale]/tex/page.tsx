import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Receipt,
  TrendingUp,
  WalletCards
} from "lucide-react";
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
import { TexDashboardAutoRefresh } from "./TexDashboardAutoRefresh";
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
    const paidCount = reportExpenses.filter((expense) => expense.status === "paid").length;
    const rejectedCount = reportExpenses.filter((expense) => expense.status === "rejected").length;
    const categorySpend = buildCategorySpend(reportExpenses);
    const totalSpend = reportExpenses
      .filter((expense) => expense.status !== "rejected")
      .reduce((sum, expense) => sum + expense.baseAmount, 0);
    const outstandingSpend = reportExpenses
      .filter((expense) => expense.status === "pending" || expense.status === "approved")
      .reduce((sum, expense) => sum + expense.baseAmount, 0);
    const flaggedCount = expenses.filter(
      (expense) =>
        expense.duplicateStatus !== "clear" ||
        expense.managerReviewRequired ||
        expense.receiptFileId === null
    ).length;
    const approvalRate = reportExpenses.length
      ? Math.round(((approvedCount + paidCount) / reportExpenses.length) * 100)
      : 0;
    const spendTrend = buildSpendTrend(reportExpenses);
    const topEmployees = buildTopEmployees(reportExpenses);
    const topEmployeeAmount = topEmployees[0]?.amount ?? 1;
    const statusItems = [
      { label: "Pending", value: pendingCount, tone: "var(--color-status-warning)" },
      { label: "Approved", value: approvedCount, tone: "var(--color-status-success)" },
      { label: "Paid", value: paidCount, tone: "var(--color-accent)" },
      { label: "Rejected", value: rejectedCount, tone: "var(--color-status-error)" }
    ];
    const maxStatusCount = Math.max(...statusItems.map((item) => item.value), 1);

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
              <WalletCards />
            </span>
            <span>Total spend</span>
            <strong>{formatMoney(totalSpend, reportWorkspace?.currency ?? financeReview.currency)}</strong>
            <small>Current report period</small>
          </article>
          <article className="tex-kpi-card tex-kpi-green">
            <span className="tex-kpi-icon" aria-hidden="true">
              <Clock />
            </span>
            <span>Pending</span>
            <strong>{pendingCount}</strong>
            <small>Expenses waiting for review</small>
          </article>
          <article className="tex-kpi-card tex-kpi-blue">
            <span className="tex-kpi-icon" aria-hidden="true">
              <CheckCircle2 />
            </span>
            <span>Approval rate</span>
            <strong>{approvalRate}%</strong>
            <small>Approved or paid receipts</small>
          </article>
          <article className="tex-kpi-card tex-kpi-gold">
            <span className="tex-kpi-icon" aria-hidden="true">
              <AlertTriangle />
            </span>
            <span>Review signals</span>
            <strong>{flaggedCount}</strong>
            <small>Duplicates or missing receipts</small>
          </article>
        </section>

        <section className="tex-dashboard-grid" aria-label="TEX analytics">
          <article className="tex-analytics-panel tex-trend-panel">
            <div className="section-heading-row">
              <div>
                <p className="eyebrow">Spend trend</p>
                <h2>Daily receipt movement</h2>
              </div>
              <Link href={`/${locale}/tex/reports`}>Open reports</Link>
            </div>
            <TexSpendTrendChart points={spendTrend} />
          </article>

          <article className="tex-analytics-panel tex-category-panel">
            <div className="section-heading-row">
              <div>
                <p className="eyebrow">Spend mix</p>
                <h2>Spend by category</h2>
              </div>
              <span className="tex-kpi-icon" aria-hidden="true">
                <Receipt />
              </span>
            </div>
            <TexCategoryDonut categories={categorySpend} currency={reportWorkspace?.currency ?? financeReview.currency} />
          </article>
        </section>

        <section className="tex-dashboard-grid tex-dashboard-grid-balanced" aria-label="TEX operational analytics">
          <article className="tex-analytics-panel">
            <div className="section-heading-row">
              <div>
                <p className="eyebrow">Expense flow</p>
                <h2>Status funnel</h2>
              </div>
              <strong className="tex-panel-stat">{reportExpenses.length} shown</strong>
            </div>
            <div className="tex-status-funnel" aria-label="Expense status funnel">
              {statusItems.map((item) => (
                <div className="tex-funnel-row" key={item.label}>
                  <span>{item.label}</span>
                  <span className="tex-funnel-track">
                    <i
                      style={{
                        background: item.tone,
                        inlineSize: `${Math.max(8, (item.value / maxStatusCount) * 100)}%`
                      }}
                    />
                  </span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>
          </article>

          <article className="tex-analytics-panel">
            <div className="section-heading-row">
              <div>
                <p className="eyebrow">Team signal</p>
                <h2>Top employees</h2>
              </div>
              <span className="tex-panel-stat">
                {formatMoney(outstandingSpend, reportWorkspace?.currency ?? financeReview.currency)} open
              </span>
            </div>
            <div className="tex-bar-list">
              {topEmployees.length ? (
                topEmployees.map((item) => (
                  <div className="tex-bar-row tex-employee-bar-row" key={item.employee}>
                    <span>{item.employee}</span>
                    <span className="tex-bar-track">
                      <i style={{ inlineSize: `${(item.amount / topEmployeeAmount) * 100}%` }} />
                    </span>
                    <strong>
                      {formatMoney(item.amount, reportWorkspace?.currency ?? financeReview.currency)}
                    </strong>
                  </div>
                ))
              ) : (
                <p className="tex-empty-state">No employee spend in the current report period.</p>
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
        <TexDashboardAutoRefresh />
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

function formatMoney(value: number, currency: string) {
  return `${formatAmount(value)} ${currency}`;
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

function buildTopEmployees(expenses: Array<{ baseAmount: number; employeeName: string | null; status: string }>) {
  const spendByEmployee = new Map<string, number>();

  for (const expense of expenses) {
    if (expense.status === "rejected") {
      continue;
    }

    const employee = expense.employeeName || "Unassigned";
    spendByEmployee.set(employee, (spendByEmployee.get(employee) ?? 0) + expense.baseAmount);
  }

  return [...spendByEmployee.entries()]
    .map(([employee, amount]) => ({ amount, employee }))
    .sort((left, right) => right.amount - left.amount)
    .slice(0, 5);
}

function buildSpendTrend(expenses: Array<{ baseAmount: number; expenseDate: string; status: string }>) {
  const spendByDate = new Map<string, number>();

  for (const expense of expenses) {
    if (expense.status === "rejected") {
      continue;
    }

    const day = expense.expenseDate.slice(0, 10);
    spendByDate.set(day, (spendByDate.get(day) ?? 0) + expense.baseAmount);
  }

  return [...spendByDate.entries()]
    .map(([date, amount]) => ({ amount, date }))
    .sort((left, right) => left.date.localeCompare(right.date))
    .slice(-14);
}

function TexSpendTrendChart({ points }: { points: Array<{ amount: number; date: string }> }) {
  const width = 720;
  const height = 220;
  const paddingX = 24;
  const paddingY = 22;
  const maxAmount = Math.max(...points.map((point) => point.amount), 1);
  const chartWidth = width - paddingX * 2;
  const chartHeight = height - paddingY * 2;
  const coordinates = points.map((point, index) => {
    const x =
      points.length === 1
        ? width / 2
        : paddingX + (index / Math.max(points.length - 1, 1)) * chartWidth;
    const y = height - paddingY - (point.amount / maxAmount) * chartHeight;

    return { ...point, x, y };
  });

  if (!coordinates.length) {
    return (
      <div className="tex-chart-empty">
        <TrendingUp aria-hidden="true" />
        <p>No spend movement yet.</p>
      </div>
    );
  }

  const firstPoint = coordinates[0]!;
  const lastPoint = coordinates[coordinates.length - 1]!;
  const path = coordinates
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ");
  const areaPath = `${path} L ${lastPoint.x.toFixed(2)} ${height - paddingY} L ${firstPoint.x.toFixed(2)} ${height - paddingY} Z`;

  return (
    <div className="tex-line-chart" aria-label="Spend trend chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Daily spend trend">
        <defs>
          <linearGradient id="texSpendArea" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.26" />
            <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3].map((line) => {
          const y = paddingY + (line / 3) * chartHeight;
          return <line className="tex-chart-gridline" key={line} x1={paddingX} x2={width - paddingX} y1={y} y2={y} />;
        })}
        <path className="tex-line-chart-area" d={areaPath} />
        <path className="tex-line-chart-path" d={path} pathLength={1} />
        {coordinates.map((point) => (
          <circle className="tex-line-chart-point" cx={point.x} cy={point.y} key={point.date} r="4" />
        ))}
      </svg>
      <div className="tex-line-chart-axis" aria-hidden="true">
        <span>{formatShortDate(firstPoint.date)}</span>
        <span>{formatShortDate(lastPoint.date)}</span>
      </div>
    </div>
  );
}

function TexCategoryDonut({
  categories,
  currency
}: {
  categories: Array<{ amount: number; category: string }>;
  currency: string;
}) {
  const total = categories.reduce((sum, item) => sum + item.amount, 0);
  const palette = [
    "var(--color-accent)",
    "var(--color-accent-secondary)",
    "var(--color-status-warning)",
    "var(--color-status-error)",
    "#8b5cf6"
  ];

  if (!categories.length || total <= 0) {
    return (
      <div className="tex-chart-empty">
        <Receipt aria-hidden="true" />
        <p>No category spend yet.</p>
      </div>
    );
  }

  let cumulative = 0;
  const segments = categories.map((item, index) => {
    const start = cumulative;
    const portion = (item.amount / total) * 100;
    cumulative += portion;

    return `${palette[index % palette.length]} ${start}% ${cumulative}%`;
  });

  return (
    <div className="tex-donut-layout">
      <div
        className="tex-donut-chart"
        style={{ background: `conic-gradient(${segments.join(", ")})` }}
        aria-label="Spend by category donut"
      >
        <span>
          <strong>{formatMoney(total, currency)}</strong>
          <small>Total</small>
        </span>
      </div>
      <div className="tex-donut-legend">
        {categories.map((item, index) => (
          <div key={item.category}>
            <i style={{ background: palette[index % palette.length] }} />
            <span>{item.category}</span>
            <strong>{formatMoney(item.amount, currency)}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatShortDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value.slice(5);
  }

  return new Intl.DateTimeFormat("en", { day: "2-digit", month: "short" }).format(date);
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
