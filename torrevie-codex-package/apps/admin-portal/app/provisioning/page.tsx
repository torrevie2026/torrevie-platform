import { SupabaseProvisioningStore, type ProvisioningJobWithSteps } from "@torrevie/provisioning";
import { notFound, redirect } from "next/navigation";
import { getSupabaseAdminClient } from "../../lib/admin-client";
import { getPlatformSession } from "../../lib/session";
import { listTenants, type TenantRecord } from "../../lib/tenant-lifecycle";
import { retryProvisioningStepAction, startProvisioningJobAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function ProvisioningPage() {
  const session = await getPlatformSession();

  if (!session) {
    redirect("/login");
  }

  const client = getSupabaseAdminClient();
  const store = new SupabaseProvisioningStore(client);
  const [tenants, jobs] = await Promise.all([listTenants(client), store.listJobs()]).catch(() => {
    notFound();
  });
  const tenantNames = new Map(tenants.map((tenant) => [tenant.id, tenant.name]));

  return (
    <main className="admin-shell">
      <aside className="admin-sidebar" aria-label="Control Plane sections">
        <p className="brand">Torrevie</p>
        <nav>
          <a href="/">Overview</a>
          <a href="/tenants">Tenants</a>
          <a href="/provisioning">Provisioning</a>
          <a href="/">Subscriptions</a>
          <a href="/">Audit</a>
        </nav>
      </aside>
      <section className="admin-main">
        <header className="topbar">
          <div>
            <p className="eyebrow">Control Plane</p>
            <h1>Provisioning</h1>
          </div>
          <span className="status">Retryable steps</span>
        </header>

        <section className="panel" aria-label="Start provisioning job">
          <h2>Start provisioning</h2>
          <form action={startProvisioningJobAction} className="provisioning-form">
            <label>
              Tenant
              <select name="tenantId" required>
                {tenants.map((tenant) => (
                  <option key={tenant.id} value={tenant.id}>
                    {tenant.name}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" disabled={tenants.length === 0}>
              Start job
            </button>
          </form>
          {tenants.length === 0 ? <p className="empty">Create a tenant before starting provisioning.</p> : null}
        </section>

        <section className="panel" aria-label="Provisioning jobs">
          <h2>Job status</h2>
          <div className="provisioning-list">
            {jobs.length === 0 ? <p className="empty">No provisioning jobs have been started yet.</p> : null}
            {jobs.map((job) => (
              <ProvisioningJobCard key={job.id} job={job} tenantName={tenantNames.get(job.tenantId)} />
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}

function ProvisioningJobCard({
  job,
  tenantName
}: {
  job: ProvisioningJobWithSteps;
  tenantName: TenantRecord["name"] | undefined;
}) {
  return (
    <article className="provisioning-job">
      <header>
        <div>
          <strong>{tenantName ?? job.tenantId}</strong>
          <span>{job.id}</span>
        </div>
        <StatusBadge status={job.status} />
      </header>
      <ol className="provisioning-steps">
        {job.steps.map((step) => (
          <li key={step.id}>
            <div>
              <strong>{step.stepKey.replaceAll("_", " ")}</strong>
              <span>
                Attempts {step.attemptCount}
                {step.error ? ` · ${step.error}` : ""}
              </span>
            </div>
            <div className="step-actions">
              <StatusBadge status={step.status} />
              {step.status === "failed" ? (
                <form action={retryProvisioningStepAction}>
                  <input type="hidden" name="stepId" value={step.id} />
                  <button type="submit">Retry</button>
                </form>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </article>
  );
}

function StatusBadge({ status }: { status: ProvisioningJobWithSteps["status"] }) {
  return <span className={`status-badge status-badge-${status}`}>{status}</span>;
}
