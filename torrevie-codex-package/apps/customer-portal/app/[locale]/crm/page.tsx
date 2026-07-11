import { getMessages, isLocale, type Locale } from "@torrevie/localization";
import { notFound } from "next/navigation";

const pipeline = [
  {
    key: "qualified",
    label: "Qualified",
    total: "AED 12,000",
    opportunities: [
      {
        name: "Warehouse rollout",
        account: "Gulf Logistics",
        contact: "Maya Haddad",
        amount: "AED 12,000",
        version: 1
      }
    ]
  },
  {
    key: "proposal",
    label: "Proposal",
    total: "AED 18,500",
    opportunities: [
      {
        name: "Service desk renewal",
        account: "North Star Trading",
        contact: "Omar Faris",
        amount: "AED 18,500",
        version: 3
      }
    ]
  },
  {
    key: "won",
    label: "Won",
    total: "AED 0",
    opportunities: []
  }
] as const;

export default async function CrmPage({
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
  const crm = t.crmSlice;

  return (
    <main className="customer-shell crm-shell" data-visual-check="crm-vertical-slice">
      <aside className="customer-sidebar" aria-label="Customer Portal sections">
        <a className="customer-brand" href={`/${locale}`} aria-label={t.appName}>
          <img src="/logo/torrevie_logo_color.png" alt="" width="36" height="36" />
          <span>{t.appName}</span>
        </a>
        <nav>
          <a href={`/${locale}`}>{t.nav.overview}</a>
          <a href={`/${locale}/crm`} aria-current="page">
            {t.nav.crm}
          </a>
          <a href={`/${locale}/admin/users`}>{t.nav.admin}</a>
          <a href={`/${locale}`}>{t.nav.settings}</a>
        </nav>
      </aside>

      <section className="customer-main">
        <header className="customer-topbar">
          <div>
            <p className="eyebrow">{crm.eyebrow}</p>
            <h1>{crm.title}</h1>
            <p>{crm.subtitle}</p>
          </div>
          <div className="customer-context" aria-label="CRM context">
            <span>{crm.entitlement}: CRM Growth</span>
            <span>{crm.owner}: admin@example.test</span>
            <span>{crm.flow}: {crm.flowValue}</span>
          </div>
        </header>

        <section className="metric-grid" aria-label={crm.metricsLabel}>
          <article>
            <span>{crm.accounts}</span>
            <strong>2</strong>
          </article>
          <article>
            <span>{crm.contacts}</span>
            <strong>2</strong>
          </article>
          <article>
            <span>{crm.opportunities}</span>
            <strong>2</strong>
          </article>
        </section>

        <section className="crm-workspace" aria-label={crm.workspaceLabel}>
          <form className="crm-form" aria-label={crm.createOpportunity}>
            <h2>{crm.createOpportunity}</h2>
            <label>
              {crm.accountName}
              <input name="accountName" type="text" defaultValue="Gulf Logistics" />
            </label>
            <label>
              {crm.contactName}
              <input name="contactName" type="text" defaultValue="Maya Haddad" />
            </label>
            <label>
              {crm.opportunityName}
              <input name="opportunityName" type="text" defaultValue="Warehouse rollout" />
            </label>
            <div className="crm-form-grid">
              <label>
                {crm.amount}
                <input name="amount" type="number" min="0" defaultValue="12000" />
              </label>
              <label>
                {crm.stage}
                <select name="stage" defaultValue="qualified">
                  {pipeline.map((stage) => (
                    <option value={stage.key} key={stage.key}>
                      {stage.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button type="button">{crm.create}</button>
          </form>

          <section className="pipeline-board" aria-label={crm.pipeline}>
            {pipeline.map((stage) => (
              <article className="pipeline-column" key={stage.key}>
                <header>
                  <h2>{stage.label}</h2>
                  <span>{stage.total}</span>
                </header>
                <div className="pipeline-cards">
                  {stage.opportunities.length > 0 ? (
                    stage.opportunities.map((opportunity) => (
                      <div className="opportunity-card" key={opportunity.name}>
                        <strong>{opportunity.name}</strong>
                        <span>{opportunity.account}</span>
                        <span>{opportunity.contact}</span>
                        <footer>
                          <mark>{opportunity.amount}</mark>
                          <small>v{opportunity.version}</small>
                        </footer>
                      </div>
                    ))
                  ) : (
                    <p>{crm.emptyStage}</p>
                  )}
                </div>
              </article>
            ))}
          </section>
        </section>
      </section>
    </main>
  );
}
