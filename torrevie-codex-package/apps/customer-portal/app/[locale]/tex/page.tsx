import { getMessages, isLocale, type Locale } from "@torrevie/localization";
import { notFound } from "next/navigation";

const workflowCards = [
  { key: "expenses", value: "0", label: "Open expenses" },
  { key: "approvals", value: "0", label: "Pending approvals" },
  { key: "receipts", value: "0", label: "Receipts in review" }
] as const;

const migrationReadiness = [
  "Tenant-scoped TEX schema",
  "RLS isolation tests",
  "Subscription entitlement guard",
  "Webhook replay protection"
] as const;

export default async function TexPage({
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

  return (
    <main className="customer-shell" data-visual-check="tex-module-shell">
      <aside className="customer-sidebar" aria-label="Customer Portal sections">
        <a className="customer-brand" href={`/${locale}`} aria-label={t.appName}>
          <img src="/logo/torrevie_logo_color.png" alt="" width="36" height="36" />
          <span>{t.appName}</span>
        </a>
        <nav>
          <a href={`/${locale}`}>{t.nav.overview}</a>
          <a href={`/${locale}/crm`}>{t.nav.crm}</a>
          <a href={`/${locale}/tex`} aria-current="page">
            {t.nav.tex}
          </a>
          <a href={`/${locale}/admin/users`}>{t.nav.admin}</a>
          <a href={`/${locale}`}>{t.nav.settings}</a>
        </nav>
      </aside>

      <section className="customer-main">
        <header className="customer-topbar">
          <div>
            <p className="eyebrow">{t.nav.tex}</p>
            <h1>Travel and expense</h1>
            <p>Expenses, trips, receipt review, finance settlement, and WhatsApp intake will live here under the shared tenant model.</p>
          </div>
          <div className="customer-context" aria-label="TEX migration status">
            <span>{t.shell.activeTenant}: Gulf Demo</span>
            <span>Entitlement: TEX Growth</span>
            <span>Status: Migration foundation</span>
          </div>
        </header>

        <section className="metric-grid" aria-label="TEX metrics">
          {workflowCards.map((card) => (
            <article key={card.key}>
              <span>{card.label}</span>
              <strong>{card.value}</strong>
            </article>
          ))}
        </section>

        <section className="customer-section" aria-labelledby="tex-readiness-title">
          <h2 id="tex-readiness-title">Migration foundation</h2>
          <div className="module-grid">
            {migrationReadiness.map((item) => (
              <article key={item} className="module-card">
                <span className="module-status module-status-active">active</span>
                <h3>{item}</h3>
                <p>TEX is being brought into the platform without bypassing tenant isolation, auth, or audit controls.</p>
              </article>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
