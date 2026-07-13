import { SupabaseProvisioningStore, type ProvisioningJobWithSteps } from "@torrevie/provisioning";
import { redirect } from "next/navigation";
import { AdminSidebar } from "../components/AdminSidebar";
import { getSupabaseAdminClient } from "../../lib/admin-client";
import { getPlatformSession } from "../../lib/session";
import { listTenants, type TenantRecord } from "../../lib/tenant-lifecycle";
import { retryProvisioningStepAction, startProvisioningJobAction } from "./actions";

export const dynamic = "force-dynamic";

const provisioningPageMessages: Record<string, string> = {
  failed: "Provisioning did not complete. Review the failed step below, correct the tenant setup, then retry.",
  missing_billing_email: "Set a tenant billing email before starting provisioning. That email receives the customer admin invitation."
};

export default async function ProvisioningPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getPlatformSession();

  if (!session) {
    redirect("/login");
  }

  const client = getSupabaseAdminClient();
  const store = new SupabaseProvisioningStore(client);
  const params = await searchParams;
  const [tenants, jobs] = await Promise.all([listTenants(client), store.listJobs()]);
  const tenantNames = new Map(tenants.map((tenant) => [tenant.id, tenant.name]));
  const selectableTenants = tenants.filter((tenant) => tenant.billing_email);

  return (
    <main className="admin-shell">
      <AdminSidebar activeHref="/provisioning" session={session} />
      <section className="admin-main">
        <header className="topbar">
          <div>
            <p className="eyebrow">Control Plane</p>
            <h1>Provisioning</h1>
          </div>
          <span className="status">Retryable steps</span>
        </header>

        {params.error ? (
          <p className="error">{provisioningPageMessages[params.error] ?? provisioningPageMessages.failed}</p>
        ) : null}

        <section className="panel" aria-label="Start provisioning job">
          <h2>Start provisioning</h2>
          <form action={startProvisioningJobAction} className="provisioning-form">
            <label>
              Tenant
              <select name="tenantId" required>
                {tenants.map((tenant) => (
                  <option key={tenant.id} value={tenant.id} disabled={!tenant.billing_email}>
                    {tenant.name}
                    {tenant.billing_email ? "" : " (missing billing email)"}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" disabled={selectableTenants.length === 0}>
              Start job
            </button>
          </form>
          {tenants.length === 0 ? <p className="empty">Create a tenant before starting provisioning.</p> : null}
          {tenants.length > 0 && selectableTenants.length === 0 ? (
            <p className="empty">Add a billing email to a tenant before starting provisioning.</p>
          ) : null}
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
