import { redirect } from "next/navigation";
import { AdminSidebar } from "../components/AdminSidebar";
import { getSupabaseAdminClient } from "../../lib/admin-client";
import { getPlatformSession } from "../../lib/session";
import { listTenants } from "../../lib/tenant-lifecycle";
import { customerRoleKeys, listTenantUsers, tenantMembershipStatuses, type TenantUserRecord } from "../../lib/tenant-users";
import {
  inviteTenantUserAction,
  removeTenantUserAction,
  sendTenantPasswordResetAction,
  updateTenantUserAccessAction
} from "./actions";

export const dynamic = "force-dynamic";

const roleLabels: Record<(typeof customerRoleKeys)[number], string> = {
  customer_admin: "Customer Admin",
  customer_module_admin: "Module Admin",
  customer_manager: "Customer Manager",
  customer_standard_user: "Web User",
  customer_readonly: "Readonly"
};

export default async function TenantUsersPage({
  searchParams
}: {
  searchParams: Promise<{ tenantId?: string; invited?: string; updated?: string; removed?: string; password?: string }>;
}) {
  const session = await getPlatformSession();

  if (!session) {
    redirect("/login");
  }

  const params = await searchParams;
  const client = getSupabaseAdminClient();
  const tenants = await listTenants(client);
  const selectedTenantId = params.tenantId ?? tenants[0]?.id ?? "";
  const selectedTenant = tenants.find((tenant) => tenant.id === selectedTenantId) ?? tenants[0] ?? null;
  const users = selectedTenant ? await listTenantUsers(client, selectedTenant.id) : [];

  return (
    <main className="admin-shell">
      <AdminSidebar activeHref="/tenant-users" session={session} />
      <section className="admin-main">
        <header className="topbar">
          <div>
            <p className="eyebrow">Control Plane</p>
            <h1>Tenant users</h1>
          </div>
          <span className="status">Customer access</span>
        </header>

        {params.invited === "1" ? <p className="notice">Invitation sent.</p> : null}
        {params.updated === "1" ? <p className="notice">User access updated.</p> : null}
        {params.removed === "1" ? <p className="notice">User removed from tenant.</p> : null}
        {params.password === "sent" ? <p className="notice">Password reset email sent.</p> : null}

        <section className="panel" aria-label="Select tenant">
          <h2>Select customer</h2>
          <form className="tenant-user-selector">
            <label>
              Customer
              <select name="tenantId" defaultValue={selectedTenant?.id ?? ""}>
                {tenants.map((tenant) => (
                  <option key={tenant.id} value={tenant.id}>
                    {tenant.name}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit">Load users</button>
          </form>
        </section>

        {selectedTenant ? (
          <>
            <section className="panel" aria-label="Invite customer user">
              <h2>Invite user</h2>
              <form action={inviteTenantUserAction} className="tenant-user-form">
                <input type="hidden" name="tenantId" value={selectedTenant.id} />
                <label>
                  Email
                  <input name="email" type="email" required dir="ltr" />
                </label>
                <label>
                  Display name
                  <input name="displayName" />
                </label>
                <label>
                  Role
                  <select name="role" defaultValue="customer_standard_user">
                    {customerRoleKeys.map((role) => (
                      <option key={role} value={role}>
                        {roleLabels[role]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  WhatsApp phone
                  <input name="whatsappPhoneNumber" placeholder="+971501234567" dir="ltr" />
                </label>
                <Toggle name="webAccessEnabled" label="Web user" defaultChecked />
                <Toggle name="whatsappAccessEnabled" label="WhatsApp user" />
                <Toggle name="requireProfileCompletion" label="Require profile on first login" defaultChecked />
                <Toggle name="requirePasswordChange" label="Force password change" />
                <Toggle name="requireMfa" label="Require MFA" />
                <button type="submit">Send invitation</button>
              </form>
            </section>

            <section className="panel" aria-label={`${selectedTenant.name} users`}>
              <h2>{selectedTenant.name} users</h2>
              <div className="tenant-user-list">
                {users.length === 0 ? <p className="empty">No users are enrolled for this customer.</p> : null}
                {users.map((user) => (
                  <TenantUserRow key={user.userId} tenantId={selectedTenant.id} user={user} />
                ))}
              </div>
            </section>
          </>
        ) : (
          <section className="panel">
            <p className="empty">Create a tenant before enrolling users.</p>
          </section>
        )}
      </section>
    </main>
  );
}

function TenantUserRow({ tenantId, user }: { tenantId: string; user: TenantUserRecord }) {
  return (
    <article className="tenant-user-row">
      <form action={updateTenantUserAccessAction} className="tenant-user-edit">
        <input type="hidden" name="tenantId" value={tenantId} />
        <input type="hidden" name="userId" value={user.userId} />
        <div>
          <strong>{user.displayName || "Name not set"}</strong>
          <span>{user.email}</span>
          <span>{user.profileCompletedAt ? "profile complete" : "profile incomplete"}</span>
        </div>
        <label>
          Status
          <select name="status" defaultValue={user.status}>
            {tenantMembershipStatuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
        <label>
          Role
          <select name="role" defaultValue={user.role ?? "customer_standard_user"}>
            {customerRoleKeys.map((role) => (
              <option key={role} value={role}>
                {roleLabels[role]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Display name
          <input name="displayName" defaultValue={user.displayName} />
        </label>
        <label>
          WhatsApp phone
          <input name="whatsappPhoneNumber" defaultValue={user.whatsappPhoneNumber} placeholder="+971501234567" dir="ltr" />
        </label>
        <Toggle name="webAccessEnabled" label="Web" defaultChecked={user.webAccessEnabled} />
        <Toggle name="whatsappAccessEnabled" label="WhatsApp" defaultChecked={user.whatsappAccessEnabled} />
        <Toggle name="requireProfileCompletion" label="Profile required" defaultChecked={user.requireProfileCompletion} />
        <Toggle name="requirePasswordChange" label="Password change" defaultChecked={user.requirePasswordChange} />
        <Toggle name="requireMfa" label={user.mfaEnrolled ? "MFA required/enrolled" : "MFA required"} defaultChecked={user.requireMfa} />
        <button type="submit">Save access</button>
      </form>
      <div className="tenant-user-actions">
        <form action={sendTenantPasswordResetAction}>
          <input type="hidden" name="tenantId" value={tenantId} />
          <input type="hidden" name="userId" value={user.userId} />
          <button type="submit">Send password reset</button>
        </form>
        <form action={removeTenantUserAction}>
          <input type="hidden" name="tenantId" value={tenantId} />
          <input type="hidden" name="userId" value={user.userId} />
          <button type="submit">Delete from customer</button>
        </form>
      </div>
    </article>
  );
}

function Toggle({
  name,
  label,
  defaultChecked = false
}: {
  name: string;
  label: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="checkbox-label">
      <input name={name} type="checkbox" defaultChecked={defaultChecked} />
      {label}
    </label>
  );
}
