import { dirForLocale, getMessages, isLocale, type Locale } from "@torrevie/localization";
import { withTenantContext } from "@torrevie/tenant-context";
import type { Metadata } from "next";
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
import { CustomerSessionActions } from "../CustomerSessionActions";
import { TexExpensesClient } from "./TexExpensesClient";
import { TexFinanceClient } from "./TexFinanceClient";
import { TexTripsClient } from "./TexTripsClient";
import { saveTexEmployeeProfileAction } from "./actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Torrevie TEX",
  description: "Travel and expense workspace for receipt OCR, trips, approvals, and finance review."
};

type TexSection = "dashboard" | "expenses" | "trips" | "finance" | "people" | "whatsapp" | "notifications" | "settings";

type TexNavItem = {
  section: TexSection;
  label: string;
  href: string;
  icon: TexIconName;
  primary?: boolean;
};

type TexIconName = "dashboard" | "plus" | "receipt" | "route" | "team" | "finance" | "whatsapp" | "bell" | "settings";

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
  legCount: number;
  totalDistanceKm: number;
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
  leg_count: number;
  total_distance_km: string;
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
  searchParams?: Promise<{ section?: string; people?: string; message?: string }>;
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
                  <TexIcon name={item.icon} />
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
          <CustomerSessionActions locale={locale} />
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

          {renderTexSection(section, dashboard, bootstrap, financeReview, locale, resolvedSearchParams)}

          <nav className="tex-mobile-nav" aria-label="Primary TEX sections">
            {navItems
              .filter((item) => item.primary || item.section === "dashboard" || item.section === "expenses" || item.section === "finance")
              .map((item) => (
                <a key={`mobile-${item.section}-${item.label}`} href={item.href} aria-current={section === item.section ? "page" : undefined}>
                  <span className="tex-nav-icon" aria-hidden="true">
                    <TexIcon name={item.icon} />
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
    { section: "dashboard", label: "Dashboard", href: base, icon: "dashboard" },
    { section: "expenses", label: "New Expense", href: `${base}?section=expenses#tex-new-expense-title`, icon: "plus", primary: true },
    { section: "expenses", label: "My Expenses", href: `${base}?section=expenses#tex-expense-list-title`, icon: "receipt" },
    { section: "trips", label: "Trips", href: `${base}?section=trips`, icon: "route" },
    { section: "people", label: "My Team", href: `${base}?section=people`, icon: "team" },
    { section: "finance", label: "Finance Review", href: `${base}?section=finance`, icon: "finance" },
    { section: "whatsapp", label: "WhatsApp Config", href: `${base}?section=whatsapp`, icon: "whatsapp" },
    { section: "notifications", label: "Notifications", href: `${base}?section=notifications`, icon: "bell" },
    { section: "settings", label: "Settings", href: `${base}?section=settings`, icon: "settings" }
  ];
}

function sectionTitle(section: TexSection) {
  const titles: Record<TexSection, string> = {
    dashboard: "Dashboard",
    expenses: "My Expenses",
    trips: "Trips",
    finance: "Finance Review",
    people: "My Team",
    whatsapp: "WhatsApp Config",
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
    whatsapp: "Configure WhatsApp receipt OCR, STATUS replies, providers, and intake monitoring.",
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
  financeReview: Awaited<ReturnType<typeof listTexFinanceReview>> | null,
  locale: Locale,
  status?: { people?: string; message?: string }
) {
  if (section === "expenses") {
    return (
      <section className="customer-section activity-panel tex-section-panel" aria-labelledby="tex-expenses-title">
        <TexSectionIntro
          icon="receipt"
          eyebrow="Expense workspace"
          title="Expenses"
          id="tex-expenses-title"
          text="Capture receipts, review AI extracted fields, and follow each claim through approval and payout."
        />
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
      <section className="customer-section activity-panel tex-section-panel" aria-labelledby="tex-trips-title">
        <TexSectionIntro
          icon="route"
          eyebrow="Trip control"
          title="Trips"
          id="tex-trips-title"
          text="Plan trips, manage route legs, track advances against spend, and keep driver costs visible."
        />
        <TexTripsClient teams={bootstrap.teams} employees={bootstrap.employeeProfiles} initialTrips={dashboard.tripsList.map(mapTripForClient)} />
      </section>
    );
  }

  if (section === "finance") {
    return (
      <section className="customer-section activity-panel tex-section-panel" aria-labelledby="tex-finance-title">
        <TexSectionIntro
          icon="finance"
          eyebrow="Finance desk"
          title="Finance review"
          id="tex-finance-title"
          text="Approve payment-ready expenses, spot missing documentation, and keep settlement work moving."
        />
        {financeReview ? <TexFinanceClient initialReview={financeReview} /> : <p>Finance review is not available.</p>}
      </section>
    );
  }

  if (section === "people") {
    return (
      <section className="customer-section activity-panel tex-section-panel" aria-labelledby="tex-people-title">
        <TexSectionIntro
          icon="team"
          eyebrow="Team access"
          title="People"
          id="tex-people-title"
          text="Maintain the tenant's TEX users, WhatsApp numbers, departments, and app access."
        />
        {status?.people === "updated" ? <p className="tex-notice">Team member access updated.</p> : null}
        {status?.people === "deleted" ? <p className="tex-notice">Team member deleted.</p> : null}
        {status?.people === "failed" ? <p className="tex-error">{status.message ?? "Team member update failed."}</p> : null}
        <TexPeopleEditor locale={locale} employees={dashboard.employees} />
      </section>
    );
  }

  if (section === "whatsapp") {
    const settings = bootstrap.integrationSettings;

    return (
      <section className="customer-section activity-panel tex-section-panel" aria-labelledby="tex-whatsapp-title">
        <div className="tex-section-intro-row">
          <TexSectionIntro
            icon="whatsapp"
            eyebrow="Receipt intake"
            title="WhatsApp configuration"
            id="tex-whatsapp-title"
            text="Configure provider profiles, webhook security, AI OCR, duplicate handling, and automated replies."
          />
          <a className="tex-action-link" href={`/${locale}/admin/users#tex-whatsapp-settings`}>
            Open setup panel
          </a>
        </div>
        <div className="tex-settings-summary" aria-label="Active WhatsApp configuration">
          <article>
            <span>Active provider</span>
            <strong>{settings ? formatProvider(settings.whatsappProvider) : "Not configured"}</strong>
          </article>
          <article>
            <span>AI receipt OCR</span>
            <strong>{settings?.aiReceiptExtractionEnabled ? "Enabled" : "Disabled"}</strong>
          </article>
          <article>
            <span>Duplicate handling</span>
            <strong>
              {settings?.duplicateDetectionEnabled ? (settings.duplicateAutoRejectEnabled ? "Auto-reject duplicates" : "Flag for manager") : "Disabled"}
            </strong>
          </article>
          <article>
            <span>Provider identity</span>
            <strong>{providerIdentity(settings)}</strong>
          </article>
        </div>
        <p>
          Use the setup panel to configure provider keys, webhook verify tokens, multiple WhatsApp provider profiles, OCR, duplicate detection,
          auto-reject behavior, and email reports.
        </p>
        <h3>Incoming WhatsApp intake</h3>
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
      <section className="customer-section activity-panel tex-section-panel" aria-labelledby="tex-notifications-title">
        <TexSectionIntro
          icon="bell"
          eyebrow="Alerts"
          title="Notifications"
          id="tex-notifications-title"
          text="Review email and app notifications generated for this tenant's TEX activity."
        />
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
      <section className="customer-section activity-panel tex-section-panel" aria-labelledby="tex-settings-title">
        <TexSectionIntro
          icon="settings"
          eyebrow="Tenant setup"
          title="Settings"
          id="tex-settings-title"
          text="A quick operational summary for the current tenant's TEX setup and connected admin controls."
        />
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

function TexSectionIntro({
  icon,
  eyebrow,
  title,
  text,
  id
}: {
  icon: TexIconName;
  eyebrow: string;
  title: string;
  text: string;
  id: string;
}) {
  return (
    <header className="tex-section-intro">
      <span className="tex-section-intro-icon" aria-hidden="true">
        <TexIcon name={icon} />
      </span>
      <div>
        <span>{eyebrow}</span>
        <h2 id={id}>{title}</h2>
        <p>{text}</p>
      </div>
    </header>
  );
}

function TexPeopleEditor({ locale, employees }: { locale: Locale; employees: TexEmployee[] }) {
  if (employees.length === 0) {
    return <p>No employee profiles are available for this tenant.</p>;
  }

  return (
    <div className="member-table tex-people-table" role="table" aria-label="TEX team members">
      <div role="row" className="member-row member-row-head tex-people-row">
        <span role="columnheader">Name</span>
        <span role="columnheader">WhatsApp phone</span>
        <span role="columnheader">Department</span>
        <span role="columnheader">Access</span>
        <span role="columnheader">Actions</span>
      </div>
      {employees.map((employee) => (
        <form action={saveTexEmployeeProfileAction} role="row" className="member-row tex-people-row" key={employee.id}>
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="employeeProfileId" value={employee.id} />
          <span role="cell">
            <input name="name" defaultValue={employee.name} aria-label={`${employee.name} name`} required />
          </span>
          <span role="cell">
            <input name="phoneNumber" defaultValue={employee.phoneNumber} aria-label={`${employee.name} WhatsApp phone`} dir="ltr" required />
          </span>
          <span role="cell">
            <input name="department" defaultValue={employee.department ?? ""} aria-label={`${employee.name} department`} />
          </span>
          <span role="cell">
            <label className="tex-access-toggle">
              <input name="isActive" type="checkbox" defaultChecked={employee.isActive} />
              <span>{employee.isActive ? "Active" : "Inactive"}</span>
            </label>
          </span>
          <span role="cell" className="tex-row-actions">
            <button type="submit" name="intent" value="save">
              Edit access
            </button>
            <button type="submit" name="intent" value="delete" className="tex-danger-button">
              Delete
            </button>
          </span>
        </form>
      ))}
    </div>
  );
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
          <p className="eyebrow">TEX control center</p>
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
          <span className="tex-signal-icon" aria-hidden="true">
            <TexIcon name="receipt" />
          </span>
          <span>Spend captured</span>
          <strong>{formatAmount(dashboard.totalSpend)} AED</strong>
          <div className="tex-signal-ring" aria-hidden="true">
            <span>{dashboard.pendingApprovals}</span>
          </div>
          <small>pending approvals</small>
        </div>
      </section>

      <section className="tex-kpi-grid" aria-label="TEX metrics">
        <KpiCard icon="receipt" label="Open expenses" value={dashboard.openExpenses} detail={`${formatAmount(dashboard.approvedSpend)} AED approved`} tone="teal" />
        <KpiCard icon="bell" label="Pending approvals" value={dashboard.pendingApprovals} detail="Waiting for manager or finance action" tone="gold" />
        <KpiCard icon="route" label="Active trips" value={dashboard.trips} detail={`${formatAmount(dashboard.openTripSpend)} AED open trip spend`} tone="blue" />
        <KpiCard icon="whatsapp" label="WhatsApp queue" value={dashboard.whatsappOpen} detail={`${dashboard.receiptFiles} receipt records available`} tone="green" />
      </section>

      <section className="tex-flow-strip" aria-label="TEX process flow">
        <FlowStep icon="whatsapp" label="WhatsApp intake" value={dashboard.whatsappOpen} />
        <FlowStep icon="receipt" label="Expense capture" value={dashboard.openExpenses} />
        <FlowStep icon="team" label="Approval" value={dashboard.pendingApprovals} />
        <FlowStep icon="finance" label="Finance payout" value={`${formatAmount(dashboard.approvedSpend)} AED`} />
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
          <ModuleCard icon="receipt" title="My Expenses" text="Expense queue, status, and approvals." value={dashboard.openExpenses} href="?section=expenses" />
          <ModuleCard icon="route" title="Trips" text="Trip files, budget use, and driver context." value={dashboard.trips} href="?section=trips" />
          <ModuleCard icon="finance" title="Finance Review" text="Approved spend and payouts ready for settlement." value={dashboard.pendingApprovals} href="?section=finance" />
          <ModuleCard icon="team" title="My Team" text="Employee records linked to TEX submissions." value={dashboard.employees.length} href="?section=people" />
          <ModuleCard icon="whatsapp" title="WhatsApp Config" text="Provider setup, AI OCR, duplicate rules, and intake." value={dashboard.whatsappOpen} href="?section=whatsapp" />
        </div>
      </section>
    </>
  );
}

function ModuleCard({ icon, title, text, value, href }: { icon: TexIconName; title: string; text: string; value: number; href: string }) {
  return (
    <a className="module-card module-card-link" href={href}>
      <span className="tex-module-icon" aria-hidden="true">
        <TexIcon name={icon} />
      </span>
      <h3>{title}</h3>
      <p>{text}</p>
      <strong>{value}</strong>
    </a>
  );
}

function KpiCard({
  icon,
  label,
  value,
  detail,
  tone
}: {
  icon: TexIconName;
  label: string;
  value: number;
  detail: string;
  tone: "teal" | "gold" | "blue" | "green";
}) {
  return (
    <article className={`tex-kpi-card tex-kpi-${tone}`}>
      <span className="tex-kpi-icon" aria-hidden="true">
        <TexIcon name={icon} />
      </span>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function FlowStep({ icon, label, value }: { icon: TexIconName; label: string; value: number | string }) {
  return (
    <article>
      <span className="tex-flow-icon" aria-hidden="true">
        <TexIcon name={icon} />
      </span>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function TexIcon({ name }: { name: TexIconName }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 2,
    viewBox: "0 0 24 24"
  };

  return (
    <svg aria-hidden="true" {...common}>
      {name === "dashboard" ? (
        <>
          <rect x="3" y="3" width="7" height="8" rx="1.5" />
          <rect x="14" y="3" width="7" height="5" rx="1.5" />
          <rect x="14" y="12" width="7" height="9" rx="1.5" />
          <rect x="3" y="15" width="7" height="6" rx="1.5" />
        </>
      ) : null}
      {name === "plus" ? (
        <>
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </>
      ) : null}
      {name === "receipt" ? (
        <>
          <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z" />
          <path d="M9 8h6" />
          <path d="M9 12h6" />
          <path d="M9 16h3" />
        </>
      ) : null}
      {name === "route" ? (
        <>
          <circle cx="6" cy="6" r="2" />
          <circle cx="18" cy="18" r="2" />
          <path d="M8 6h5a3 3 0 0 1 0 6h-2a3 3 0 0 0 0 6h5" />
        </>
      ) : null}
      {name === "team" ? (
        <>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </>
      ) : null}
      {name === "finance" ? (
        <>
          <path d="M4 19V5" />
          <path d="M4 19h16" />
          <path d="M8 15v-4" />
          <path d="M12 15V8" />
          <path d="M16 15v-6" />
        </>
      ) : null}
      {name === "whatsapp" ? (
        <>
          <path d="M20 11.5a8 8 0 0 1-11.7 7.1L4 20l1.4-4.1A8 8 0 1 1 20 11.5z" />
          <path d="M9 8.5c.4 2 2.1 3.9 4.2 4.7l1.3-1.1 2 1.1c-.3 1.4-1.4 2.2-2.8 2-3.8-.4-6.8-3.4-7.2-7.2-.2-1.4.6-2.5 2-2.8l1.1 2-1.1 1.3z" />
        </>
      ) : null}
      {name === "bell" ? (
        <>
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
          <path d="M10 21h4" />
        </>
      ) : null}
      {name === "settings" ? (
        <>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.1 2.1-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V20h-3v-.2a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1-2.1-2.1.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H4v-3h.2a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1 2.1-2.1.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6V4h3v.2a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1 2.1 2.1-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v3h-.2a1.7 1.7 0 0 0-1.6 1z" />
        </>
      ) : null}
    </svg>
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

function formatProvider(provider: string) {
  if (provider === "wappfly") return "Wappfly";
  if (provider === "meta") return "Meta Cloud API";
  return "UltraMsg";
}

function providerIdentity(settings: Awaited<ReturnType<typeof listTexBootstrap>>["integrationSettings"]) {
  if (!settings) {
    return "Not configured";
  }

  return (
    settings.whatsappInstanceId ??
    settings.wappflySessionId ??
    settings.metaPhoneNumberId ??
    settings.metaWhatsappBusinessAccountId ??
    "Missing provider ID"
  );
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
          (select count(*)::int from public.tex_trip_legs leg where leg.tenant_id = t.tenant_id and leg.trip_id = t.id) as leg_count,
          (
            select coalesce(sum(coalesce(leg.total_distance_km, leg.distance_km, 0)), 0)::text
            from public.tex_trip_legs leg
            where leg.tenant_id = t.tenant_id
              and leg.trip_id = t.id
          ) as total_distance_km,
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
        legCount: trip.leg_count,
        totalDistanceKm: Number(trip.total_distance_km),
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
    legCount: trip.legCount,
    totalDistanceKm: trip.totalDistanceKm,
    expenseCount: trip.expenseCount,
    spendAmount: Number(trip.spendAmount)
  };
}
