import { notFound, redirect } from "next/navigation";
import { AdminSidebar } from "../components/AdminSidebar";
import { getSupabaseAdminClient } from "../../lib/admin-client";
import { getPlatformSession } from "../../lib/session";
import { listTenants, tenantStatuses } from "../../lib/tenant-lifecycle";
import { createTenantAction, hardDeleteTenantAction, setTenantStatusAction, updateTenantAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function TenantsPage({
  searchParams
}: {
  searchParams: Promise<{ deleted?: string }>;
}) {
  const session = await getPlatformSession();
  const params = await searchParams;

  if (!session) {
    redirect("/login");
  }

  const tenants = await listTenants(getSupabaseAdminClient()).catch(() => {
    notFound();
  });

  return (
    <main className="admin-shell">
      <AdminSidebar activeHref="/tenants" session={session} />
      <section className="admin-main">
        <header className="topbar">
          <div>
            <p className="eyebrow">Control Plane</p>
            <h1>Tenants</h1>
          </div>
          <span className="status">Lifecycle controls</span>
        </header>

        <section className="panel" aria-label="Create tenant">
          <h2>Create tenant</h2>
          <form action={createTenantAction} className="tenant-form">
            <label>
              Tenant name
              <input name="name" required minLength={2} />
            </label>
            <label>
              Slug
              <input name="slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" />
            </label>
            <label>
              Status
              <select name="status" defaultValue="trial">
                {tenantStatuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Region
              <input name="region" placeholder="UAE" />
            </label>
            <label>
              Legal entity
              <input name="legalEntityName" />
            </label>
            <label>
              Billing email
              <input name="billingEmail" type="email" />
            </label>
            <label>
              Locale
              <select name="defaultLocale" defaultValue="en">
                <option value="en">English</option>
                <option value="ar">Arabic</option>
              </select>
            </label>
            <label>
              Timezone
              <input name="timezone" defaultValue="Asia/Dubai" />
            </label>
            <button type="submit">Create tenant</button>
          </form>
        </section>

        <section className="panel" aria-label="Tenant list">
          <h2>Tenant lifecycle</h2>
          {params.deleted ? <p className="notice">Tenant permanently deleted.</p> : null}
          <div className="tenant-list">
            {tenants.length === 0 ? <p className="empty">No tenants have been created yet.</p> : null}
            {tenants.map((tenant) => (
              <article key={tenant.id} className="tenant-row">
                <form action={updateTenantAction} className="tenant-edit">
                  <input type="hidden" name="tenantId" value={tenant.id} />
                  <label>
                    Name
                    <input name="name" defaultValue={tenant.name} required />
                  </label>
                  <label>
                    Slug
                    <input name="slug" defaultValue={tenant.slug} required />
                  </label>
                  <label>
                    Status
                    <select name="status" defaultValue={tenant.status}>
                      {tenantStatuses.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Region
                    <input name="region" defaultValue={tenant.region ?? ""} />
                  </label>
                  <label>
                    Legal entity
                    <input name="legalEntityName" defaultValue={tenant.legal_entity_name ?? ""} />
                  </label>
                  <label>
                    Billing email
                    <input name="billingEmail" type="email" defaultValue={tenant.billing_email ?? ""} />
                  </label>
                  <button type="submit">Save</button>
                </form>
                <div className="tenant-actions" aria-label={`${tenant.name} status actions`}>
                  <a className="tenant-export-link" href={`/tenants/${tenant.id}/export`}>
                    Export data
                  </a>
                  <StatusAction tenantId={tenant.id} status="suspended" label="Suspend" />
                  <StatusAction tenantId={tenant.id} status="active" label="Reactivate" />
                  <StatusAction tenantId={tenant.id} status="archived" label="Archive" />
                </div>
                <form action={hardDeleteTenantAction} className="tenant-delete-form">
                  <input type="hidden" name="tenantId" value={tenant.id} />
                  <label>
                    Permanent delete
                    <input name="confirmationSlug" placeholder={`Type ${tenant.slug}`} />
                  </label>
                  <button type="submit">Delete customer</button>
                </form>
              </article>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}

function StatusAction({
  tenantId,
  status,
  label
}: {
  tenantId: string;
  status: (typeof tenantStatuses)[number];
  label: string;
}) {
  return (
    <form action={setTenantStatusAction}>
      <input type="hidden" name="tenantId" value={tenantId} />
      <input type="hidden" name="status" value={status} />
      <button type="submit">{label}</button>
    </form>
  );
}
