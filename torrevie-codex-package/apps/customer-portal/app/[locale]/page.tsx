import { dirForLocale, getMessages, isLocale, type Locale } from "@torrevie/localization";
import { withTenantContext, type ResolvedTenantContext } from "@torrevie/tenant-context";
import { notFound, redirect } from "next/navigation";
import {
  getCustomerAccessRequirements,
  isCustomerSessionError,
  requireVerifiedCustomerSession,
  resolveCustomerTenantContext
} from "../../lib/server/customer-session";
import { PostgresTenantQueryClient } from "../../lib/server/tenant-query-client";
import { CustomerSessionActions } from "./CustomerSessionActions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ProductKey = "crm" | "fsm" | "tex" | "cme" | "lqs";

type LauncherApp = {
  key: ProductKey;
  label: string;
  description: string;
  href: string | null;
  status: "online" | "coming_soon";
  metricLabel: string;
  metricValue: string;
  accent: "teal" | "blue" | "navy";
};

type LauncherData = {
  tenantName: string;
  apps: LauncherApp[];
  activityCount: number;
  actionCount: number;
};

type SubscriptionRow = {
  key: ProductKey;
};

type DashboardRow = {
  tenant_name: string;
  crm_open_opportunities: number;
  activity_count: number;
};

const appCatalog: Record<ProductKey, Omit<LauncherApp, "metricValue">> = {
  crm: {
    key: "crm",
    label: "CRM",
    description: "Accounts, contacts, opportunities, and relationship activity.",
    href: "/crm",
    status: "online",
    metricLabel: "Open opportunities",
    accent: "blue"
  },
  fsm: {
    key: "fsm",
    label: "FSM",
    description: "Field service work orders, assignments, and site activity.",
    href: "/fsm",
    status: "online",
    metricLabel: "Work orders",
    accent: "navy"
  },
  tex: {
    key: "tex",
    label: "TEX",
    description: "Travel, expenses, receipts, trips, approvals, and finance review.",
    href: "/tex",
    status: "online",
    metricLabel: "Open expenses",
    accent: "teal"
  },
  cme: {
    key: "cme",
    label: "CME",
    description: "Content planning, drafts, approvals, and publishing workflow.",
    href: null,
    status: "coming_soon",
    metricLabel: "Content items",
    accent: "blue"
  },
  lqs: {
    key: "lqs",
    label: "LQS",
    description: "Lead qualification, scoring, routing, and follow-up queue.",
    href: null,
    status: "coming_soon",
    metricLabel: "Qualified leads",
    accent: "navy"
  }
};

export default async function CustomerPortalShell({
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

    const launcher = await listLauncherData(client, tenantContext, locale);
    const onlineApps = launcher.apps.filter((app) => app.status === "online" && app.href);

    if (onlineApps.length === 1 && onlineApps[0]?.href) {
      redirect(`/${locale}${onlineApps[0].href}`);
    }

    return (
      <main className="customer-shell app-launcher-shell" data-visual-check="customer-shell" lang={locale} dir={dirForLocale(locale)}>
        <aside className="customer-sidebar app-launcher-sidebar" aria-label="Customer Portal sections">
          <a className="customer-brand" href={`/${locale}`} aria-label={t.appName}>
            <img src="/logo/torrevie_logo_color.png" alt="" width="36" height="36" />
            <span>{t.appName}</span>
          </a>
          <nav>
            <a href={`/${locale}`} aria-current="page">
              {t.nav.overview}
            </a>
            {launcher.apps.map((app) =>
              app.href ? (
                <a key={app.key} href={`/${locale}${app.href}`}>
                  {app.label}
                </a>
              ) : (
                <span key={app.key} className="customer-sidebar-disabled">
                  {app.label}
                </span>
              )
            )}
            <a href={`/${locale}/account`}>Account</a>
          </nav>
          <CustomerSessionActions locale={locale} />
        </aside>

        <section className="customer-main app-launcher-main">
          <header className="customer-topbar app-launcher-topbar">
            <div>
              <p className="eyebrow">{t.shell.eyebrow}</p>
              <h1>App launcher</h1>
              <p>Choose an enrolled Torrevie app for {launcher.tenantName}.</p>
            </div>
            <div className="customer-context" aria-label="Session context">
              <span>
                {t.shell.activeTenant}: {launcher.tenantName}
              </span>
              <span>
                {t.shell.signedInAs}: {session.email ?? session.userId}
              </span>
              <a href={`/${otherLocale}`} hrefLang={otherLocale}>
                {t.languageLabel}: {otherLocale.toUpperCase()}
              </a>
            </div>
          </header>

          <section className="metric-grid" aria-label="Customer metrics">
            <article>
              <span>Enrolled apps</span>
              <strong>{launcher.apps.length}</strong>
            </article>
            <article>
              <span>Open actions</span>
              <strong>{launcher.actionCount}</strong>
            </article>
            <article>
              <span>Recent activity</span>
              <strong>{launcher.activityCount}</strong>
            </article>
          </section>

          <section className="customer-section app-launcher-section" aria-labelledby="apps-title">
            <h2 id="apps-title">Your apps</h2>
            {launcher.apps.length === 0 ? (
              <div className="activity-panel app-launcher-empty">
                <p>No apps are enrolled for this tenant yet. Contact your tenant administrator.</p>
              </div>
            ) : (
              <div className="app-widget-grid">
                {launcher.apps.map((app) => (
                  <AppWidget key={app.key} app={app} locale={locale} />
                ))}
              </div>
            )}
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

function AppWidget({ app, locale }: { app: LauncherApp; locale: Locale }) {
  const content = (
    <>
      <span className={`app-widget-mark app-widget-mark-${app.accent}`} aria-hidden="true">
        {app.key.toUpperCase()}
      </span>
      <span className={`module-status module-status-${app.status === "online" ? "active" : "pending"}`}>
        {app.status === "online" ? "active" : "coming online"}
      </span>
      <h3>{app.label}</h3>
      <p>{app.description}</p>
      <footer>
        <span>{app.metricLabel}</span>
        <strong>{app.metricValue}</strong>
      </footer>
      <b>{app.href ? "Open app" : "Setup pending"}</b>
    </>
  );

  if (app.href) {
    return (
      <a className="app-widget app-widget-link" href={`/${locale}${app.href}`}>
        {content}
      </a>
    );
  }

  return <article className="app-widget app-widget-disabled">{content}</article>;
}

async function listLauncherData(
  client: PostgresTenantQueryClient,
  context: ResolvedTenantContext,
  locale: Locale
): Promise<LauncherData> {
  return withTenantContext(client, context, async () => {
    const subscriptions = await client.query<SubscriptionRow>(
      `
        select p.key
        from public.subscriptions s
        join public.products p on p.id = s.product_id
        where s.tenant_id = public.current_tenant_id()
          and s.status in ('trial', 'active')
          and s.starts_at <= now()
          and (s.expires_at is null or s.expires_at > now())
        order by p.key
      `
    );
    const dashboard = await client.query<DashboardRow>(
      `
        select
          coalesce((select name from public.tenants where id = public.current_tenant_id()), 'Current tenant') as tenant_name,
          (select count(*)::int from public.opportunities where tenant_id = public.current_tenant_id()) as crm_open_opportunities,
          (select count(*)::int from public.audit_events where tenant_id = public.current_tenant_id() and occurred_at >= now() - interval '7 days') as activity_count
      `
    );
    const dashboardRow = dashboard.rows[0];
    const subscribedKeys = subscriptions.rows.map((row) => row.key).filter(isProductKey);

    return {
      tenantName: dashboardRow?.tenant_name ?? "Current tenant",
      apps: subscribedKeys.map((key) => ({
        ...appCatalog[key],
        metricValue: metricForProduct(key, dashboardRow, locale)
      })),
      actionCount: 0,
      activityCount: dashboardRow?.activity_count ?? 0
    };
  });
}

function metricForProduct(key: ProductKey, dashboard: DashboardRow | undefined, locale: Locale) {
  const numberFormat = new Intl.NumberFormat(locale);

  if (!dashboard) {
    return "0";
  }

  if (key === "crm") {
    return numberFormat.format(dashboard.crm_open_opportunities);
  }

  return "0";
}

function isProductKey(value: string): value is ProductKey {
  return value === "crm" || value === "fsm" || value === "tex" || value === "cme" || value === "lqs";
}
