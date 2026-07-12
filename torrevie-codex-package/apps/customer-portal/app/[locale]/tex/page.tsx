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
    { section: "dashboard", label: "Dashboard", href: base, icon: "D" },
    { section: "expenses", label: "New Expense", href: `${base}?section=expenses#tex-new-expense-title`, icon: "+", primary: true },
    { section: "expenses", label: "My Expenses", href: `${base}?section=expenses#tex-expense-list-title`, icon: "R" },
    { section: "trips", label: "Trips", href: `${base}?section=trips`, icon: "T" },
    { section: "people", label: "My Team", href: `${base}?section=people`, icon: "M" },
    { section: "finance", label: "Finance Review", href: `${base}?section=finance`, icon: "$" },
    { section: "whatsapp", label: "WhatsApp Intake", href: `${base}?section=whatsapp`, icon: "W" },
    { section: "notifications", label: "Notifications", href: `${base}?section=notifications`, icon: "N" },
    { section: "settings", label: "Settings", href: `${base}?section=settings`, icon: "S" }
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

  return (
    <>
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

      <section className="customer-section activity-panel" aria-labelledby="recent-expenses-title">
        <h2 id="recent-expenses-title">Recent expenses</h2>
        <TexTable
          empty="No migrated expenses are available for this tenant."
          rows={dashboard.recentExpenses.map((expense) => [
            expense.employeeName ?? "Unassigned",
            expense.vendor ?? "No vendor",
            `${formatAmount(expense.amount)} ${expense.currency}`,
            expense.status
          ])}
        />
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
    const [dashboard, recentExpenses, trips, employees, whatsappSubmissions, notifications] = await Promise.all([
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
            e.amount::float as amount,
            e.currency,
            e.status,
            e.expense_date::text as expense_date,
            e.category,
            coalesce(t.name, e.trip_name) as trip_name,
            e.notes,
            e.created_at::text as created_at
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
      ),
      client.query<TripRow>(
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
      ),
      client.query<EmployeeRow>(
        `
          select id, name, phone_number, department, is_active
          from public.tex_employee_profiles
          where tenant_id = public.current_tenant_id()
          order by is_active desc, name asc
          limit 50
        `
      ),
      client.query<WhatsappSubmissionRow>(
        `
          select id, sender_phone, message_text, status, created_at::text as created_at
          from public.tex_unregistered_whatsapp_submissions
          where tenant_id = public.current_tenant_id()
          order by created_at desc
          limit 25
        `
      ),
      client.query<NotificationRow>(
        `
          select id, title, body, is_read, created_at::text as created_at
          from public.tex_notifications
          where tenant_id = public.current_tenant_id()
          order by created_at desc
          limit 25
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
        status: expense.status,
        expenseDate: expense.expense_date,
        category: expense.category,
        tripName: expense.trip_name,
        notes: expense.notes,
        createdAt: expense.created_at
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
        spendAmount: trip.spend_amount
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
        createdAt: submission.created_at
      })),
      notificationList: notifications.rows.map((notification) => ({
        id: notification.id,
        title: notification.title,
        body: notification.body,
        isRead: notification.is_read,
        createdAt: notification.created_at
      }))
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
    createdAt: expense.createdAt
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
