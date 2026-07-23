export default function TexLoading() {
  return (
    <>
      <header className="customer-topbar tex-topbar">
        <div>
          <p className="eyebrow">TEX workspace</p>
          <h1>Loading TEX</h1>
          <p>Preparing tenant data and workspace controls.</p>
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
          <span className="tex-skeleton-chart" aria-hidden="true">
            {[58, 22, 34, 48, 74, 36, 42, 64, 30, 52].map((height, index) => (
              <i key={index} style={{ blockSize: `${height}%` }} />
            ))}
          </span>
        </article>
        <article className="tex-analytics-panel">
          <span className="tex-skeleton tex-skeleton-title" />
          <span className="tex-loading-donut" aria-hidden="true" />
          <span className="tex-skeleton tex-skeleton-line" />
          <span className="tex-skeleton tex-skeleton-line" />
        </article>
      </section>

      <section
        className="tex-dashboard-grid tex-dashboard-grid-balanced"
        aria-label="Loading TEX operational panels"
      >
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
