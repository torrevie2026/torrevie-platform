import { dirForLocale, getMessages, isLocale, type Locale } from "@torrevie/localization";
import { withTenantContext } from "@torrevie/tenant-context";
import { notFound, redirect } from "next/navigation";
import {
  listTexBootstrap,
  listTexFinanceReview,
  resolveTexActorContext,
  type TexActorContext,
  type TexExpenseListItem
} from "../../../lib/tex";
import {
  getCustomerAccessRequirements,
  isCustomerSessionError,
  requireVerifiedCustomerSession,
  resolveCustomerTenantContext
} from "../../../lib/server/customer-session";
import { PostgresTenantQueryClient } from "../../../lib/server/tenant-query-client";
import { TexExpensesClient } from "./TexExpensesClient";
import { TexFinanceClient } from "./TexFinanceClient";
import { TexTripsClient } from "./TexTripsClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TexSection = "dashboard" | "expenses" | "trips" | "finance" | "people" | "whatsapp" | "notifications" | "settings";

type TexNavItem = {
  section: TexSection;
  label: string;
  href: string;
  icon: string;
  primary?: boolean;
};

type TexDashboard = {
  tenantName: string;
  openExpenses: number;
  pendingApprovals: number;
  receiptFiles: number;
  trips: number;
  whatsappOpen: number;
  notifications: number;
  totalSpend: number;
  approvedSpend: number;
  openTripSpend: number;
  recentExpenses: TexRecentExpense[];
  tripsList: TexTrip[];
  employees: TexEmployee[];
  whatsappSubmissions: TexWhatsappSubmission[];
  notificationList: TexNotification[];
};

type TexRecentExpense = {
  id: string;
  employeeName: string | null;
  vendor: string | null;
  amount: number;
  currency: string;
  status: string;
  expenseDate: string;
  category: string | null;
  tripName: string | null;
  notes: string | null;
  createdAt: string;
  duplicateStatus: string;
  duplicateReason: string | null;
  managerReviewRequired: boolean;
};

type TexTrip = {
  id: string;
  name: string;
  origin: string | null;
  destination: string | null;
  status: string;
  startDate: string | null;
  endDate: string | null;
  budgetAmount: string | null;
  expenseCount: number;
  spendAmount: string;
  spendAmountAsNumber: number;
};

type TexEmployee = {
  id: string;
  name: string;
  phoneNumber: string;
  department: string | null;
  isActive: boolean;
};

type TexWhatsappSubmission = {
  id: string;
  senderPhone: string | null;
  messageText: string | null;
  status: string;
  messageType: string;
  ocrStatus: string;
  replyText: string | null;
  createdAt: string;
};

type TexNotification = {
  id: string;
  title: string;
  body: string | null;
  isRead: boolean;
  createdAt: string;
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
  amount: number;
  currency: string;
  status: string;
  expense_date: string;
  category: string | null;
  trip_name: string | null;
  notes: string | null;
  created_at: string;
  duplicate_status: string;
  duplicate_reason: string | null;
  manager_review_required: boolean;
};

type TripRow = {
  id: string;
  name: string;
  origin: string | null;
  destination: string | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
  budget_amount: string | null;
  expense_count: number;
  spend_amount: string;
};

type EmployeeRow = {
  id: string;
  name: string;
  phone_number: string;
  department: string | null;
  is_active: boolean;
};

type WhatsappSubmissionRow = {
  id: string;
  sender_phone: string | null;
  message_text: string | null;
  status: string;
  message_type: string;
  ocr_status: string;
  whatsapp_reply_text: string | null;
  created_at: string;
};

type NotificationRow = {
  id: string;
  title: string;
  body: string | null;
  is_read: boolean;
  created_at: string;
};

export default async function TexPage({
  params,
  searchParams
}: {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<{ section?: string }>;
}) {
  const { locale: rawLocale } = await params;
  const resolvedSearchParams = await searchParams;

  if (!isLocale(rawLocale)) {
    notFound();
  }

  const locale = rawLocale as Locale;
  const t = getMessages(locale);
  const otherLocale = locale === "en" ? "ar" : "en";
  const section = readSection(resolvedSearchParams?.section);

  try {
    const session = await requireVerifiedCustomerSession();
    const client = new PostgresTenantQueryClient(session.userId);
    const tenantContext = await resolveCustomerTenantContext(client, session);
    const requirements = await getCustomerAccessRequirements(client, tenantContext);

    if (requirements.requireProfileCompletion && !requirements.profileComplete) {
      redirect(`/${locale}/account?profile=required`);
    }

    if (requirements.requirePasswordChange) {
      redirect(`/${locale}/account?password=required`);
    }

    if (requirements.requireMfa && !requirements.mfaEnrolled) {
      redirect(`/${locale}/account?mfa=required`);
    }

    const actor = await resolveTexActorContext(client, tenantContext);
    const bootstrap = await listTexBootstrap(client, actor);
    const dashboard = await listTexDashboard(client, actor);
    const financeReview = section === "finance" ? await listCurrentTexFinanceReview(client, actor) : null;

    const navItems = texNavItems(locale);

    return (
      <main className="customer-shell tex-shell" data-visual-check="tex-module-shell" lang={locale} dir={dirForLocale(locale)}>
        <aside className="customer-sidebar tex-sidebar" aria-label="TEX sections">
          <div className="tex-sidebar-header">
            <a className="customer-brand tex-brand" href={`/${locale}/tex`} aria-label="Torrevie TEX">
              <img src="/logo/torrevie_logo_color.png" alt="" width="36" height="36" />
              <span>
                <strong>Torrevie TEX</strong>
                <small>The Optimized Way</small>
              </span>
            </a>
            <div className="tex-company-chip">
              <span>{dashboard.tenantName}</span>
            </div>
          </div>

          <nav className="tex-nav">
            {navItems.map((item) => (
              <a
                key={`${item.section}-${item.label}`}
                className={item.primary ? "tex-nav-primary" : undefined}
                href={item.href}
                aria-current={section === item.section ? "page" : undefined}
              >
                <span className="tex-nav-icon" aria-hidden="true">
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </a>
            ))}
          </nav>

          <div className="tex-sidebar-user" aria-label="Signed in user">
            <span className="tex-avatar" aria-hidden="true">
              {(session.email ?? session.userId).slice(0, 1).toUpperCase()}
            </span>
            <span>
              <strong>{session.email ?? "Signed in"}</strong>
              <small>{t.shell.activeTenant}</small>
            </span>
          </div>
        </aside>

        <section className="customer-main tex-main">
          <header className="customer-topbar tex-topbar">
            <div>
              <p className="eyebrow">TEX operations</p>
              <h1>{sectionTitle(section)}</h1>
              <p>{sectionSubtitle(section)}</p>
            </div>
            <div className="customer-context tex-context" aria-label="TEX session context">
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

          {renderTexSection(section, dashboard, bootstrap, financeReview)}

          <nav className="tex-mobile-nav" aria-label="Primary TEX sections">
            {navItems
              .filter((item) => item.primary || item.section === "dashboard" || item.section === "expenses" || item.section === "finance")
              .map((item) => (
                <a key={`mobile-${item.section}-${item.label}`} href={item.href} aria-current={section === item.section ? "page" : undefined}>
                  <span className="tex-nav-icon" aria-hidden="true">
                    {item.icon}
                  </span>
                  <span>{item.label.replace("New ", "")}</span>
                </a>
              ))}
          </nav>
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

function texNavItems(locale: Locale): TexNavItem[] {
  const base = `/${locale}/tex`;

  return [
    { section: "dashboard", label: "Dashboard", href: base, icon: "DB" },
    { section: "expenses", label: "New Expense", href: `${base}?section=expenses#tex-new-expense-title`, icon: "+", primary: true },
    { section: "expenses", label: "My Expenses", href: `${base}?section=expenses#tex-expense-list-title`, icon: "EX" },
    { section: "trips", label: "Trips", href: `${base}?section=trips`, icon: "TR" },
    { section: "people", label: "My Team", href: `${base}?section=people`, icon: "TM" },
    { section: "finance", label: "Finance Review", href: `${base}?section=finance`, icon: "FN" },
    { section: "whatsapp", label: "WhatsApp Intake", href: `${base}?section=whatsapp`, icon: "WA" },
    { section: "notifications", label: "Notifications", href: `${base}?section=notifications`, icon: "NT" },
    { section: "settings", label: "Settings", href: `${base}?section=settings`, icon: "ST" }
  ];
}

function sectionTitle(section: TexSection) {
  const titles: Record<TexSection, string> = {
    dashboard: "Dashboard",
    expenses: "My Expenses",
    trips: "Trips",
    finance: "Finance Review",
    people: "My Team",
    whatsapp: "WhatsApp Intake",
    notifications: "Notifications",
    settings: "Settings"
  };

  return titles[section];
}

function sectionSubtitle(section: TexSection) {
  const subtitles: Record<TexSection, string> = {
    dashboard: "Your travel, expense, approvals, and receipt activity in one operating view.",
    expenses: "Submit expenses, review the queue, and keep receipt records moving.",
    trips: "Create trip files, track spend, and manage driver settlement context.",
    finance: "Review approved expenses and trip payouts before marking them paid.",
    people: "Employee and team records available for TEX expense operations.",
    whatsapp: "Incoming WhatsApp receipt submissions that need review or assignment.",
    notifications: "Operational notices created by TEX workflows and integrations.",
    settings: "Tenant TEX settings and integration status."
  };

  return subtitles[section];
}

function readSection(value: string | undefined): TexSection {
  if (
    value === "expenses" ||
    value === "trips" ||
    value === "finance" ||
    value === "people" ||
    value === "whatsapp" ||
    value === "notifications" ||
    value === "settings"
  ) {
    return value;
  }

  return "dashboard";
}

function renderTexSection(
  section: TexSection,
  dashboard: TexDashboard,
  bootstrap: Awaited<ReturnType<typeof listTexBootstrap>>,
  financeReview: Awaited<ReturnType<typeof listTexFinanceReview>> | null
) {
  if (section === "expenses") {
    return (
      <section className="customer-section activity-panel" aria-labelledby="tex-expenses-title">
        <h2 id="tex-expenses-title">Expenses</h2>
        <TexExpensesClient
          categories={bootstrap.categories}
          employees={bootstrap.employeeProfiles}
          trips={dashboard.tripsList.map(mapTripForClient)}
          initialExpenses={dashboard.recentExpenses.map(mapRecentExpenseForClient)}
        />
      </section>
    );
  }

  if (section === "trips") {
    return (
      <section className="customer-section activity-panel" aria-labelledby="tex-trips-title">
        <h2 id="tex-trips-title">Trips</h2>
        <TexTripsClient teams={bootstrap.teams} employees={bootstrap.employeeProfiles} initialTrips={dashboard.tripsList.map(mapTripForClient)} />
      </section>
    );
  }

  if (section === "finance") {
    return (
      <section className="customer-section activity-panel" aria-labelledby="tex-finance-title">
        <h2 id="tex-finance-title">Finance review</h2>
        {financeReview ? <TexFinanceClient initialReview={financeReview} /> : <p>Finance review is not available.</p>}
      </section>
    );
  }

  if (section === "people") {
    return (
      <section className="customer-section activity-panel" aria-labelledby="tex-people-title">
        <h2 id="tex-people-title">People</h2>
        <TexTable
          empty="No employee profiles are available for this tenant."
          rows={dashboard.employees.map((employee) => [
            employee.name,
            employee.phoneNumber,
            employee.department ?? "No department",
            employee.isActive ? "active" : "inactive"
          ])}
        />
      </section>
    );
  }

  if (section === "whatsapp") {
    return (
      <section className="customer-section activity-panel" aria-labelledby="tex-whatsapp-title">
        <h2 id="tex-whatsapp-title">WhatsApp intake</h2>
        <TexTable
          empty="No open WhatsApp submissions are waiting for review."
          rows={dashboard.whatsappSubmissions.map((submission) => [
            submission.senderPhone ?? "Unknown sender",
            submission.messageText ?? "No message text",
            `${submission.messageType} / ${submission.ocrStatus}`,
            submission.replyText ?? "No reply generated",
            formatDate(submission.createdAt),
            submission.status
          ])}
        />
      </section>
    );
  }

  if (section === "notifications") {
    return (
      <section className="customer-section activity-panel" aria-labelledby="tex-notifications-title">
        <h2 id="tex-notifications-title">Notifications</h2>
        <TexTable
          empty="No notifications are available for this tenant."
          rows={dashboard.notificationList.map((notification) => [
            notification.title,
            notification.body ?? "",
            formatDate(notification.createdAt),
            notification.isRead ? "read" : "unread"
          ])}
        />
      </section>
    );
  }

  if (section === "settings") {
    return (
      <section className="customer-section activity-panel" aria-labelledby="tex-settings-title">
        <h2 id="tex-settings-title">Settings</h2>
        <div className="tex-settings-grid">
          <article>
            <span>WhatsApp provider</span>
            <strong>{bootstrap.integrationSettings?.whatsappProvider ?? "not configured"}</strong>
          </article>
          <article>
            <span>Expense categories</span>
            <strong>{bootstrap.categories.length}</strong>
          </article>
          <article>
            <span>Admin management</span>
            <a href="https://admin.torrevie.com">Open admin.torrevie.com</a>
          </article>
        </div>
      </section>
    );
  }

  return <TexDashboardHome dashboard={dashboard} />;
}

function TexDashboardHome({ dashboard }: { dashboard: TexDashboard }) {
  const categorySpend = topCategorySpend(dashboard.recentExpenses);
  const statusCounts = statusBreakdown(dashboard.recentExpenses);
  const busiestTrips = [...dashboard.tripsList]
    .sort((first, second) => second.spendAmountAsNumber - first.spendAmountAsNumber)
    .slice(0, 4);
  const maxCategorySpend = Math.max(...categorySpend.map((item) => item.amount), 1);
  const maxStatusCount = Math.max(...statusCounts.map((item) => item.count), 1);

  return (
    <>
      <section className="tex-dashboard-hero" aria-label="TEX command summary">
        <div className="tex-hero-copy">
          <p className="eyebrow">Live operating center</p>
          <h2>{dashboard.tenantName} expense flow</h2>
          <p>Track WhatsApp receipts, employee spend, trips, approvals, and finance payout readiness in one focused TEX cockpit.</p>
          <div className="tex-hero-actions">
            <a className="tex-action" href="?section=expenses#tex-new-expense-title">
              Create expense
            </a>
            <a className="tex-secondary-link" href="?section=finance">
              Review finance
            </a>
          </div>
        </div>
        <div className="tex-hero-signal" aria-label="Operational signal">
          <span>Spend captured</span>
          <strong>{formatAmount(dashboard.totalSpend)} AED</strong>
          <div className="tex-signal-ring" aria-hidden="true">
            <span>{dashboard.pendingApprovals}</span>
          </div>
          <small>pending approvals</small>
        </div>
      </section>

      <section className="tex-kpi-grid" aria-label="TEX metrics">
        <KpiCard label="Open expenses" value={dashboard.openExpenses} detail={`${formatAmount(dashboard.approvedSpend)} AED approved`} tone="teal" />
        <KpiCard label="Pending approvals" value={dashboard.pendingApprovals} detail="Waiting for manager or finance action" tone="gold" />
        <KpiCard label="Active trips" value={dashboard.trips} detail={`${formatAmount(dashboard.openTripSpend)} AED open trip spend`} tone="blue" />
        <KpiCard label="WhatsApp queue" value={dashboard.whatsappOpen} detail={`${dashboard.receiptFiles} receipt records available`} tone="green" />
      </section>

      <section className="tex-flow-strip" aria-label="TEX process flow">
        <FlowStep label="WhatsApp intake" value={dashboard.whatsappOpen} />
        <FlowStep label="Expense capture" value={dashboard.openExpenses} />
        <FlowStep label="Approval" value={dashboard.pendingApprovals} />
        <FlowStep label="Finance payout" value={`${formatAmount(dashboard.approvedSpend)} AED`} />
      </section>

      <section className="tex-analytics-grid" aria-label="TEX analytics">
        <article className="tex-analytics-panel">
          <div className="section-heading-row">
            <h2>Spend by category</h2>
            <a href="?section=expenses">Open expenses</a>
          </div>
          <div className="tex-bar-list">
            {categorySpend.length > 0 ? (
              categorySpend.map((item) => (
                <div className="tex-bar-row" key={item.label}>
                  <span>{item.label}</span>
                  <div className="tex-bar-track" aria-label={`${item.label} ${formatAmount(item.amount)} AED`}>
                    <i style={{ inlineSize: `${Math.max((item.amount / maxCategorySpend) * 100, 8)}%` }} />
                  </div>
                  <strong>{formatAmount(item.amount)}</strong>
                </div>
              ))
            ) : (
              <p>No spend categories are available yet.</p>
            )}
          </div>
        </article>

        <article className="tex-analytics-panel">
          <div className="section-heading-row">
            <h2>Status mix</h2>
            <a href="?section=finance">Finance review</a>
          </div>
          <div className="tex-status-chart">
            {statusCounts.length > 0 ? (
              statusCounts.map((item) => (
                <div className="tex-status-column" key={item.label}>
                  <span style={{ blockSize: `${Math.max((item.count / maxStatusCount) * 100, 12)}%` }} />
                  <strong>{item.count}</strong>
                  <small>{item.label}</small>
                </div>
              ))
            ) : (
              <p>No status activity is available yet.</p>
            )}
          </div>
        </article>
      </section>

      <section className="tex-dashboard-grid" aria-label="TEX work queues">
        <article className="tex-work-panel">
          <div className="section-heading-row">
            <h2>Recent expense flow</h2>
            <a href="?section=expenses">View all</a>
          </div>
          <div className="tex-feed-list">
            {dashboard.recentExpenses.slice(0, 6).map((expense) => (
              <a className="tex-feed-item" href="?section=expenses" key={expense.id}>
                <span className={`tex-status-dot tex-status-dot-${expense.status}`} aria-hidden="true" />
                <span>
                  <strong>{expense.vendor ?? expense.category ?? "Expense"}</strong>
                  <small>
                    {expense.employeeName ?? "Unassigned"} - {formatDate(expense.createdAt)}
                    {expense.duplicateStatus !== "clear" ? ` - ${expense.duplicateStatus} duplicate` : ""}
                  </small>
                </span>
                <b>{formatAmount(expense.amount)} {expense.currency}</b>
              </a>
            ))}
            {dashboard.recentExpenses.length === 0 ? <p>No migrated expenses are available for this tenant.</p> : null}
          </div>
        </article>

        <article className="tex-work-panel">
          <div className="section-heading-row">
            <h2>Trip spend board</h2>
            <a href="?section=trips">Open trips</a>
          </div>
          <div className="tex-trip-snapshot-list">
            {busiestTrips.map((trip) => (
              <a className="tex-trip-snapshot" href="?section=trips" key={trip.id}>
                <span>
                  <strong>{trip.name}</strong>
                  <small>{trip.origin ?? "-"} to {trip.destination ?? "-"}</small>
                </span>
                <b>{formatAmount(trip.spendAmountAsNumber)}</b>
                <div className="tex-budget-bar" aria-label={`${trip.name} budget usage`}>
                  <span style={{ inlineSize: `${tripBudgetUsage(trip)}%` }} />
                </div>
              </a>
            ))}
            {busiestTrips.length === 0 ? <p>No trips are available yet.</p> : null}
          </div>
        </article>
      </section>

      <section className="customer-section tex-quick-actions" aria-labelledby="tex-work-title">
        <div className="section-heading-row">
          <h2 id="tex-work-title">Work shortcuts</h2>
          <a className="tex-action" href="?section=expenses#tex-new-expense-title">
            New expense
          </a>
        </div>
        <div className="module-grid tex-action-grid">
          <ModuleCard title="My Expenses" text="Expense queue, status, and approvals." value={dashboard.openExpenses} href="?section=expenses" />
          <ModuleCard title="Trips" text="Trip files, budget use, and driver context." value={dashboard.trips} href="?section=trips" />
          <ModuleCard title="Finance Review" text="Approved spend and payouts ready for settlement." value={dashboard.pendingApprovals} href="?section=finance" />
          <ModuleCard title="My Team" text="Employee records linked to TEX submissions." value={dashboard.employees.length} href="?section=people" />
          <ModuleCard title="WhatsApp Intake" text="Receipt messages waiting for assignment." value={dashboard.whatsappOpen} href="?section=whatsapp" />
        </div>
      </section>
    </>
  );
}

function ModuleCard({ title, text, value, href }: { title: string; text: string; value: number; href: string }) {
  return (
    <a className="module-card module-card-link" href={href}>
      <span className="module-status module-status-active">active</span>
      <h3>{title}</h3>
      <p>{text}</p>
      <strong>{value}</strong>
    </a>
  );
}

function KpiCard({ label, value, detail, tone }: { label: string; value: number; detail: string; tone: "teal" | "gold" | "blue" | "green" }) {
  return (
    <article className={`tex-kpi-card tex-kpi-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function FlowStep({ label, value }: { label: string; value: number | string }) {
  return (
    <article>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function TexTable({ rows, empty }: { rows: string[][]; empty: string }) {
  if (rows.length === 0) {
    return <p>{empty}</p>;
  }

  return (
    <div className="member-table tex-table" role="table">
      {rows.map((row, index) => (
        <div key={`${row.join("-")}-${index}`} className="member-row" role="row">
          {row.map((cell, cellIndex) => (
            <span key={`${cell}-${cellIndex}`}>{cell}</span>
          ))}
        </div>
      ))}
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatAmount(value: number) {
  return new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(value);
}

function topCategorySpend(expenses: TexRecentExpense[]) {
  const totals = new Map<string, number>();

  for (const expense of expenses) {
    const label = expense.category ?? "Uncategorized";
    totals.set(label, (totals.get(label) ?? 0) + expense.amount);
  }

  return [...totals.entries()]
    .map(([label, amount]) => ({ label, amount }))
    .sort((first, second) => second.amount - first.amount)
    .slice(0, 5);
}

function statusBreakdown(expenses: TexRecentExpense[]) {
  const totals = new Map<string, number>();

  for (const expense of expenses) {
    totals.set(expense.status, (totals.get(expense.status) ?? 0) + 1);
  }

  return [...totals.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((first, second) => second.count - first.count);
}

function tripBudgetUsage(trip: TexTrip & { spendAmountAsNumber: number }) {
  const budget = trip.budgetAmount ? Number(trip.budgetAmount) : 0;

  if (budget <= 0) {
    return 0;
  }

  return Math.min((trip.spendAmountAsNumber / budget) * 100, 100);
}

async function listCurrentTexFinanceReview(client: PostgresTenantQueryClient, actor: TexActorContext) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en", {
    month: "numeric",
    timeZone: "Asia/Dubai",
    year: "numeric"
  }).formatToParts(now);
  const month = Number(parts.find((part) => part.type === "month")?.value ?? now.getUTCMonth() + 1);
  const year = Number(parts.find((part) => part.type === "year")?.value ?? now.getUTCFullYear());

  return listTexFinanceReview(client, actor, month, year);
}

async function listTexDashboard(client: PostgresTenantQueryClient, actor: TexActorContext): Promise<TexDashboard> {
  return withTenantContext(client, actor, async () => {
    const dashboard = await client.query<DashboardRow>(
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
    );
    const recentExpenses = await client.query<ExpenseRow>(
      `
        select
          e.id,
          ep.name as employee_name,
          e.vendor,
          e.amount::float as amount,
          e.currency,
          e.status,
          e.expense_date::text as expense_date,
          e.category,
          coalesce(t.name, e.trip_name) as trip_name,
          e.notes,
          e.created_at::text as created_at,
          e.duplicate_status,
          e.duplicate_reason,
          e.manager_review_required
        from public.tex_expenses e
        left join public.tex_employee_profiles ep
          on ep.tenant_id = e.tenant_id
         and ep.id = e.employee_profile_id
        left join public.tex_trips t
          on t.tenant_id = e.tenant_id
         and t.id = e.trip_id
        where e.tenant_id = public.current_tenant_id()
        order by e.created_at desc
        limit 50
      `
    );
    const trips = await client.query<TripRow>(
      `
        select
          t.id,
          t.name,
          t.origin,
          t.destination,
          t.status,
          t.start_date::text as start_date,
          t.end_date::text as end_date,
          t.budget_amount::text as budget_amount,
          count(e.id)::int as expense_count,
          coalesce(sum(e.amount), 0)::text as spend_amount
        from public.tex_trips t
        left join public.tex_expenses e
          on e.tenant_id = t.tenant_id
         and e.trip_id = t.id
        where t.tenant_id = public.current_tenant_id()
        group by t.id
        order by t.created_at desc
        limit 25
      `
    );
    const employees = await client.query<EmployeeRow>(
      `
        select id, name, phone_number, department, is_active
        from public.tex_employee_profiles
        where tenant_id = public.current_tenant_id()
        order by is_active desc, name asc
        limit 50
      `
    );
    const whatsappSubmissions = await client.query<WhatsappSubmissionRow>(
      `
        select id, sender_phone, message_text, status, message_type, ocr_status, whatsapp_reply_text, created_at::text as created_at
        from public.tex_unregistered_whatsapp_submissions
        where tenant_id = public.current_tenant_id()
        order by created_at desc
        limit 25
      `
    );
    const notifications = await client.query<NotificationRow>(
      `
        select id, title, body, is_read, created_at::text as created_at
        from public.tex_notifications
        where tenant_id = public.current_tenant_id()
        order by created_at desc
        limit 25
      `
    );
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
        status: expense.status,
        expenseDate: expense.expense_date,
        category: expense.category,
        tripName: expense.trip_name,
        notes: expense.notes,
        createdAt: expense.created_at,
        duplicateStatus: expense.duplicate_status,
        duplicateReason: expense.duplicate_reason,
        managerReviewRequired: expense.manager_review_required
      })),
      tripsList: trips.rows.map((trip) => ({
        id: trip.id,
        name: trip.name,
        origin: trip.origin,
        destination: trip.destination,
        status: trip.status,
        startDate: trip.start_date,
        endDate: trip.end_date,
        budgetAmount: trip.budget_amount,
        expenseCount: trip.expense_count,
        spendAmount: trip.spend_amount,
        spendAmountAsNumber: Number(trip.spend_amount)
      })),
      employees: employees.rows.map((employee) => ({
        id: employee.id,
        name: employee.name,
        phoneNumber: employee.phone_number,
        department: employee.department,
        isActive: employee.is_active
      })),
      whatsappSubmissions: whatsappSubmissions.rows.map((submission) => ({
        id: submission.id,
        senderPhone: submission.sender_phone,
        messageText: submission.message_text,
        status: submission.status,
        messageType: submission.message_type,
        ocrStatus: submission.ocr_status,
        replyText: submission.whatsapp_reply_text,
        createdAt: submission.created_at
      })),
      notificationList: notifications.rows.map((notification) => ({
        id: notification.id,
        title: notification.title,
        body: notification.body,
        isRead: notification.is_read,
        createdAt: notification.created_at
      })),
      totalSpend: recentExpenses.rows.reduce((sum, expense) => sum + expense.amount, 0),
      approvedSpend: recentExpenses.rows
        .filter((expense) => expense.status === "approved" || expense.status === "paid")
        .reduce((sum, expense) => sum + expense.amount, 0),
      openTripSpend: trips.rows.reduce((sum, trip) => sum + Number(trip.spend_amount), 0)
    };
  });
}

function mapRecentExpenseForClient(expense: TexRecentExpense): TexExpenseListItem {
  return {
    id: expense.id,
    status: expense.status as TexExpenseListItem["status"],
    amount: expense.amount,
    currency: expense.currency,
    employeeName: expense.employeeName,
    vendor: expense.vendor,
    expenseDate: expense.expenseDate,
    category: expense.category,
    tripName: expense.tripName,
    notes: expense.notes,
    createdAt: expense.createdAt,
    duplicateStatus: expense.duplicateStatus as TexExpenseListItem["duplicateStatus"],
    duplicateReason: expense.duplicateReason,
    managerReviewRequired: expense.managerReviewRequired
  };
}

function mapTripForClient(trip: TexTrip) {
  return {
    id: trip.id,
    name: trip.name,
    description: null,
    tripType: "general" as const,
    origin: trip.origin,
    destination: trip.destination,
    status: trip.status,
    startDate: trip.startDate,
    endDate: trip.endDate,
    budgetAmount: trip.budgetAmount ? Number(trip.budgetAmount) : null,
    enforceCurrency: false,
    enforcedCurrency: null,
    teamId: null,
    teamName: null,
    containerNumber: null,
    driverEmployeeProfileId: null,
    driverName: null,
    driverTripAmount: 0,
    subcontractorDriverName: null,
    subcontractorAmount: 0,
    driverPayoutStatus: "unpaid",
    expenseCount: trip.expenseCount,
    spendAmount: Number(trip.spendAmount)
  };
}
