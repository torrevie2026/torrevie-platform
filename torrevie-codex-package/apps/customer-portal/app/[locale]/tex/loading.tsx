export default function TexLoading() {
  return (
    <>
      <header className="customer-topbar tex-topbar">
        <div>
          <p className="eyebrow">TEX workspace</p>
          <h1>Loading TEX</h1>
          <p>Preparing tenant data and workspace controls.</p>
        </div>
        <div className="customer-context tex-context" aria-label="TEX loading context">
          <span>Tenant scoped by RLS</span>
          <span>Checking access</span>
          <span>Loading data</span>
        </div>
      </header>

      <section className="tex-kpi-grid" aria-label="Loading TEX summary">
        {[0, 1, 2, 3].map((item) => (
          <article className="tex-kpi-card" key={item}>
            <span className="tex-skeleton tex-skeleton-pill" />
            <span className="tex-skeleton tex-skeleton-line" />
            <strong className="tex-skeleton tex-skeleton-metric" />
            <small className="tex-skeleton tex-skeleton-line" />
          </article>
        ))}
      </section>

      <section className="tex-dashboard-grid" aria-label="Loading TEX panels">
        <article className="tex-analytics-panel">
          <span className="tex-skeleton tex-skeleton-title" />
          <span className="tex-skeleton tex-skeleton-block" />
        </article>
        <article className="tex-analytics-panel">
          <span className="tex-skeleton tex-skeleton-title" />
          <span className="tex-skeleton tex-skeleton-block" />
        </article>
      </section>
    </>
  );
}
