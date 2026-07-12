import { notFound, redirect } from "next/navigation";
import { AdminSidebar } from "../components/AdminSidebar";
import { getSupabaseAdminClient } from "../../lib/admin-client";
import { getPlatformSession } from "../../lib/session";
import { listPlatformUsers, platformRoleKeys, type PlatformUserRecord } from "../../lib/platform-users";
import { invitePlatformUserAction } from "./actions";

export const dynamic = "force-dynamic";

const platformRoleLabels: Record<(typeof platformRoleKeys)[number], string> = {
  torrevie_platform_admin: "Platform Admin",
  torrevie_operations_admin: "Operations Admin",
  torrevie_support_agent: "Support Agent",
  torrevie_billing_admin: "Billing Admin",
  torrevie_security_admin: "Security Admin"
};

export default async function UsersPage({
  searchParams
}: {
  searchParams: Promise<{ invited?: string }>;
}) {
  const session = await getPlatformSession();

  if (!session) {
    redirect("/login");
  }

  const users = await listPlatformUsers(getSupabaseAdminClient()).catch(() => {
    notFound();
  });
  const { invited } = await searchParams;

  return (
    <main className="admin-shell">
      <AdminSidebar activeHref="/users" />
      <section className="admin-main">
        <header className="topbar">
          <div>
            <p className="eyebrow">Control Plane</p>
            <h1>Users</h1>
          </div>
          <span className="status">Torrevie staff</span>
        </header>

        {invited === "1" ? <p className="notice">Invitation sent.</p> : null}

        <section className="panel" aria-label="Invite platform user">
          <h2>Invite admin user</h2>
          <form action={invitePlatformUserAction} className="user-form">
            <label>
              Email
              <input name="email" type="email" required placeholder="name@torrevie.com" dir="ltr" />
            </label>
            <label>
              Role
              <select name="role" defaultValue="torrevie_platform_admin">
                {platformRoleKeys.map((role) => (
                  <option key={role} value={role}>
                    {platformRoleLabels[role]}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit">Send invitation</button>
          </form>
        </section>

        <section className="panel" aria-label="Platform users">
          <h2>Admin users</h2>
          <div className="user-list">
            {users.length === 0 ? <p className="empty">No admin users found.</p> : null}
            {users.map((user) => (
              <PlatformUserRow key={`${user.userId}-${user.role}`} user={user} />
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}

function PlatformUserRow({ user }: { user: PlatformUserRecord }) {
  return (
    <article className="user-row">
      <div>
        <strong>{user.email}</strong>
        <span>{platformRoleLabels[user.role]}</span>
      </div>
      <div>
        <mark>{user.membershipStatus}</mark>
        <span>{user.status}</span>
      </div>
    </article>
  );
}
