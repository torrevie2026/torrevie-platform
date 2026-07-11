import { dirForLocale, getMessages, isLocale, type Locale } from "@torrevie/localization";
import { notFound } from "next/navigation";

const modules = [
  { key: "crm", metric: "18", status: "active" },
  { key: "fsm", metric: "7", status: "active" },
  { key: "tex", metric: "4", status: "pending" },
  { key: "cme", metric: "0", status: "inactive" },
  { key: "lqs", metric: "0", status: "inactive" }
] as const;

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

  return (
    <main className="customer-shell" data-visual-check="customer-shell" lang={locale} dir={dirForLocale(locale)}>
      <aside className="customer-sidebar" aria-label="Customer Portal sections">
        <a className="customer-brand" href={`/${locale}`} aria-label={t.appName}>
          <img src="/logo/torrevie_logo_color.png" alt="" width="36" height="36" />
          <span>{t.appName}</span>
        </a>
        <nav>
          <a href={`/${locale}`}>{t.nav.overview}</a>
          <a href={`/${locale}/crm`}>{t.nav.crm}</a>
          <a href={`/${locale}`}>{t.nav.fsm}</a>
          <a href={`/${locale}`}>{t.nav.tex}</a>
          <a href={`/${locale}`}>{t.nav.cme}</a>
          <a href={`/${locale}`}>{t.nav.lqs}</a>
          <a href={`/${locale}/admin/users`}>{t.nav.admin}</a>
          <a href={`/${locale}`}>{t.nav.settings}</a>
        </nav>
      </aside>

      <section className="customer-main">
        <header className="customer-topbar">
          <div>
            <p className="eyebrow">{t.shell.eyebrow}</p>
            <h1>{t.shell.title}</h1>
            <p>{t.shell.subtitle}</p>
          </div>
          <div className="customer-context" aria-label="Session context">
            <span>{t.shell.activeTenant}: Gulf Demo</span>
            <span>{t.shell.signedInAs}: admin@example.test</span>
            <a href={`/${otherLocale}`} hrefLang={otherLocale}>
              {t.languageLabel}: {otherLocale.toUpperCase()}
            </a>
          </div>
        </header>

        <section className="metric-grid" aria-label="Customer metrics">
          <article>
            <span>{t.metrics.openItems}</span>
            <strong>29</strong>
          </article>
          <article>
            <span>{t.metrics.approvals}</span>
            <strong>4</strong>
          </article>
          <article>
            <span>{t.metrics.activity}</span>
            <strong>12</strong>
          </article>
        </section>

        <section className="customer-section" aria-labelledby="modules-title">
          <h2 id="modules-title">{t.modules.title}</h2>
          <div className="module-grid">
            {modules.map((module) => (
              <article key={module.key} className="module-card">
                <span className={`module-status module-status-${module.status}`}>{module.status}</span>
                <h3>{t.nav[module.key]}</h3>
                <p>{t.modules[module.key]}</p>
                <strong>{module.status === "inactive" ? t.modules.unavailable : module.metric}</strong>
              </article>
            ))}
          </div>
        </section>

        <section className="customer-section activity-panel" aria-labelledby="activity-title">
          <h2 id="activity-title">{t.activity.title}</h2>
          <p>{t.activity.empty}</p>
        </section>
      </section>
    </main>
  );
}
