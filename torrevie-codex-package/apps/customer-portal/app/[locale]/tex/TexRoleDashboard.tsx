import type {
  TexBootstrap,
  TexExpenseListItem,
  TexFinanceReview,
  TexPlanKey,
  TexReportExpense,
  TexReportWorkspace,
  TexTripListItem
} from "../../../lib/tex";
import Link from "next/link";

type TexRoleDashboardProps = {
  bootstrap: TexBootstrap;
  currentUserId: string;
  expenses: TexExpenseListItem[];
  financeReview: TexFinanceReview;
  locale: string;
  planKey: TexPlanKey;
  report: TexReportWorkspace | null;
  roles: readonly string[];
  trips: TexTripListItem[];
};

type DashboardMode = "admin" | "finance" | "manager" | "employee";

export function TexRoleDashboard({
  bootstrap,
  currentUserId,
  expenses,
  financeReview,
  locale,
  planKey,
  report,
  roles,
  trips
}: TexRoleDashboardProps) {
  const mode = resolveDashboardMode(roles);
  const currentEmployee = bootstrap.employeeProfiles.find(
    (employee) => employee.userId === currentUserId
  );
  const reportExpenses = report?.expenses ?? [];
  const ownExpenses = currentEmployee
    ? reportExpenses.filter((expense) => expense.employeeProfileId === currentEmployee.id)
    : [];
  const flaggedExpenses = reportExpenses.filter((expense) => expense.policyFlag);
  const pendingExpenses = expenses.filter((expense) => expense.status === "pending");
  const approvedExpenses = expenses.filter((expense) => expense.status === "approved");
  const paidExpenses = reportExpenses.filter((expense) => expense.status === "paid");
  const openTrips = trips.filter((trip) => trip.status === "open");
  const currentSpend = sumReportSpend(reportExpenses);
  const ownSpend = sumReportSpend(ownExpenses);

  if (mode === "finance") {
    return (
      <section className="tex-role-dashboard" aria-labelledby="tex-role-dashboard-title">
        <RoleHeader
          title="Finance dashboard"
          subtitle="Settlement, payment, and flagged receipt focus"
        />
        <div className="tex-role-card-grid">
          <RoleCard
            label="Awaiting payment"
            value={financeReview.approvedExpenses.length}
            tone="warning"
            detail={`${formatMoney(financeReview.totals.approvedExpenseAmount, financeReview.currency)} approved`}
          />
          <RoleCard
            label="Trip payouts"
            value={financeReview.tripPayouts.length}
            detail={formatMoney(financeReview.totals.tripPayoutAmount, financeReview.currency)}
          />
          <RoleCard
            label="Net payable"
            value={formatMoney(financeReview.totals.netPayable, financeReview.currency)}
            tone="accent"
            detail="Current finance period"
          />
          <RoleCard
            label="Paid in report period"
            value={paidExpenses.length}
            detail={formatMoney(sumReportSpend(paidExpenses), financeReview.currency)}
          />
        </div>
        <RoleList
          title="Payment queue"
          empty="No approved expenses are waiting for payment."
          rows={financeReview.approvedExpenses.slice(0, 4).map((expense) => ({
            id: expense.id,
            title: expense.vendor || expense.category || "Approved expense",
            meta: `${expense.employeeName || "Unknown employee"} / ${expense.expenseDate}`,
            amount: formatMoney(expense.baseAmount, financeReview.currency)
          }))}
        />
      </section>
    );
  }

  if (mode === "manager") {
    return (
      <section className="tex-role-dashboard" aria-labelledby="tex-role-dashboard-title">
        <RoleHeader title="Manager dashboard" subtitle="Approval queue and team spend signal" />
        <div className="tex-role-card-grid">
          <RoleCard
            label="Awaiting approval"
            value={pendingExpenses.length}
            tone="warning"
            detail={`${formatMoney(sumExpenses(pendingExpenses), "AED")} pending`}
          />
          <RoleCard
            label="Flagged receipts"
            value={flaggedExpenses.length}
            tone={flaggedExpenses.length ? "danger" : "neutral"}
            detail="Policy or duplicate review"
          />
          <RoleCard label="Open trips" value={openTrips.length} detail="Trips still active" />
          <RoleCard
            label="Report-period spend"
            value={formatMoney(currentSpend, report?.currency ?? "AED")}
            detail="Rejected expenses excluded"
          />
        </div>
        <RoleList
          title="Recent pending expenses"
          empty="No expenses are waiting for review."
          rows={pendingExpenses.slice(0, 4).map((expense) => ({
            id: expense.id,
            title: expense.vendor || expense.category || "Pending expense",
            meta: `${expense.employeeName || "Unknown employee"} / ${expense.expenseDate}`,
            amount: `${formatAmount(expense.amount)} ${expense.currency}`
          }))}
        />
      </section>
    );
  }

  if (mode === "admin") {
    return (
      <section className="tex-role-dashboard" aria-labelledby="tex-role-dashboard-title">
        <RoleHeader title="Admin dashboard" subtitle="Tenant-wide TEX control tower" />
        <div className="tex-role-card-grid">
          <RoleCard
            label="Total spend"
            value={formatMoney(currentSpend, report?.currency ?? "AED")}
            tone="accent"
            detail="Current report period"
          />
          <RoleCard
            label="Pending approval"
            value={pendingExpenses.length}
            tone="warning"
            detail={`${formatMoney(sumExpenses(pendingExpenses), "AED")} pending`}
          />
          <RoleCard
            label="Awaiting payment"
            value={approvedExpenses.length}
            detail={`${formatMoney(sumExpenses(approvedExpenses), "AED")} approved`}
          />
          <RoleCard
            label="Flagged receipts"
            value={flaggedExpenses.length}
            tone={flaggedExpenses.length ? "danger" : "neutral"}
            detail="Policy and duplicate signals"
          />
        </div>
        <RoleShortcuts locale={locale} planKey={planKey} />
      </section>
    );
  }

  return (
    <section className="tex-role-dashboard" aria-labelledby="tex-role-dashboard-title">
      <RoleHeader
        title="My dashboard"
        subtitle={
          currentEmployee
            ? `Linked to ${currentEmployee.name}`
            : "WhatsApp employee profile not linked yet"
        }
      />
      <div className="tex-role-card-grid">
        <RoleCard
          label="My spend"
          value={formatMoney(ownSpend, report?.currency ?? "AED")}
          tone="accent"
          detail="Current report period"
        />
        <RoleCard label="My expenses" value={ownExpenses.length} detail="Submitted in period" />
        <RoleCard
          label="Pending"
          value={ownExpenses.filter((expense) => expense.status === "pending").length}
          tone="warning"
          detail="Awaiting review"
        />
        <RoleCard
          label="Approved or paid"
          value={
            ownExpenses.filter(
              (expense) => expense.status === "approved" || expense.status === "paid"
            ).length
          }
          detail="Ready or settled"
        />
      </div>
      <RoleList
        title="My recent expenses"
        empty={
          currentEmployee
            ? "No expenses found for your linked TEX profile."
            : "Ask an admin to link your platform user to a TEX employee profile."
        }
        rows={ownExpenses.slice(0, 4).map((expense) => ({
          id: expense.id,
          title: expense.vendor || expense.category || "Expense",
          meta: `${expense.expenseDate} / ${expense.status}`,
          amount: formatMoney(expense.baseAmount, report?.currency ?? "AED")
        }))}
      />
    </section>
  );
}

function RoleShortcuts({ locale, planKey }: { locale: string; planKey: TexPlanKey }) {
  const hasGrowthModules = planKey === "growth" || planKey === "enterprise";
  const shortcuts = [
    { href: `/${locale}/tex/reports`, label: "Open reports" },
    ...(hasGrowthModules
      ? [{ href: `/${locale}/tex/finance-review`, label: "Open finance review" }]
      : [{ href: `/${locale}/tex/settings#tex-billing`, label: "View Growth options" }]),
    { href: `/${locale}/tex/people`, label: "Open people" },
    { href: `/${locale}/tex/integrations`, label: "Open WhatsApp setup" }
  ];

  return (
    <div className="tex-role-shortcuts">
      {shortcuts.map((shortcut) => (
        <Link href={shortcut.href} key={shortcut.href}>
          {shortcut.label}
        </Link>
      ))}
    </div>
  );
}

function RoleHeader({ subtitle, title }: { subtitle: string; title: string }) {
  return (
    <header className="tex-role-header">
      <div>
        <p className="eyebrow">Role dashboard</p>
        <h2 id="tex-role-dashboard-title">{title}</h2>
        <p>{subtitle}</p>
      </div>
    </header>
  );
}

function RoleCard({
  detail,
  label,
  tone = "neutral",
  value
}: {
  detail: string;
  label: string;
  tone?: "accent" | "danger" | "neutral" | "warning";
  value: number | string;
}) {
  return (
    <article className={`tex-role-card tex-role-card-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function RoleList({
  empty,
  rows,
  title
}: {
  empty: string;
  rows: Array<{ amount: string; id: string; meta: string; title: string }>;
  title: string;
}) {
  return (
    <section className="tex-role-list" aria-label={title}>
      <h3>{title}</h3>
      {rows.length ? (
        rows.map((row) => (
          <article key={row.id}>
            <span>
              <strong>{row.title}</strong>
              <small>{row.meta}</small>
            </span>
            <b>{row.amount}</b>
          </article>
        ))
      ) : (
        <p className="tex-empty-state">{empty}</p>
      )}
    </section>
  );
}

function resolveDashboardMode(roles: readonly string[]): DashboardMode {
  if (
    roles.some(
      (role) =>
        role === "customer_admin" ||
        role === "customer_module_admin" ||
        role === "torrevie_platform_admin"
    )
  ) {
    return "admin";
  }
  if (roles.includes("customer_finance")) {
    return "finance";
  }
  if (roles.includes("customer_manager")) {
    return "manager";
  }
  return "employee";
}

function sumExpenses(expenses: TexExpenseListItem[]) {
  return expenses.reduce((total, expense) => total + expense.amount, 0);
}

function sumReportSpend(expenses: TexReportExpense[]) {
  return expenses
    .filter((expense) => expense.status !== "rejected")
    .reduce((total, expense) => total + expense.baseAmount, 0);
}

function formatAmount(value: number) {
  return new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(value);
}

function formatMoney(value: number, currency: string) {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
    maximumFractionDigits: 0
  }).format(value);
}
