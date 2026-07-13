import { redirect } from "next/navigation";
import { AdminSidebar } from "../components/AdminSidebar";
import { getSupabaseAdminClient } from "../../lib/admin-client";
import { getPlatformSession } from "../../lib/session";
import {
  listPlatformUsers,
  platformMembershipStatuses,
  platformRoleKeys,
  type PlatformUserRecord
} from "../../lib/platform-users";
import { invitePlatformUserAction, removePlatformUserAction, updatePlatformUserAccessAction } from "./actions";

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
  searchParams: Promise<{ invited?: string; updated?: string; removed?: string }>;
}) {
  const session = await getPlatformSession();

  if (!session) {
    redirect("/login");
  }

  const users = await listPlatformUsers(getSupabaseAdminClient());
  const params = await searchParams;

  return (
    <main className="admin-shell">
      <AdminSidebar activeHref="/users" session={session} />
      <section className="admin-main">
        <header className="topbar">
          <div>
            <p className="eyebrow">Control Plane</p>
            <h1>Users</h1>
          </div>
          <span className="status">Torrevie staff</span>
        </header>

        {params.invited === "1" ? <p className="notice">Invitation sent.</p> : null}
        {params.updated === "1" ? <p className="notice">Admin user access updated.</p> : null}
        {params.removed === "1" ? <p className="notice">Admin user removed.</p> : null}

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
              <PlatformUserRow key={user.userId} actorUserId={session.userId} user={user} />
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}

function PlatformUserRow({ actorUserId, user }: { actorUserId: string; user: PlatformUserRecord }) {
  const isCurrentUser = user.userId === actorUserId;

  return (
    <article className="user-row">
      <form action={updatePlatformUserAccessAction} className="tenant-user-edit">
        <input type="hidden" name="userId" value={user.userId} />
        <div>
          <strong>{displayName(user)}</strong>
          <span>{user.email}</span>
          <span>{user.position || "Position not set"}</span>
        </div>
        <label>
          Access level
          <select name="role" defaultValue={user.role}>
            {platformRoleKeys.map((role) => (
              <option key={role} value={role}>
                {platformRoleLabels[role]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select name="status" defaultValue={user.membershipStatus} disabled={isCurrentUser}>
            {platformMembershipStatuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
        {isCurrentUser ? <input type="hidden" name="status" value={user.membershipStatus} /> : null}
        <div>
          <strong>{user.mobileNumber || "Mobile not set"}</strong>
          <span>{user.recoveryEmail || "Recovery email not set"}</span>
          <span>{user.status}</span>
        </div>
        <div className="user-badges">
          <mark>{user.profileCompletedAt ? "profile complete" : "profile required"}</mark>
          <mark>{user.mfaEnrolled ? "mfa enabled" : "mfa optional"}</mark>
        </div>
        <button type="submit">Save access</button>
      </form>
      <div className="tenant-user-actions">
        <form action={removePlatformUserAction}>
          <input type="hidden" name="userId" value={user.userId} />
          <button type="submit" disabled={isCurrentUser}>
            Delete user
          </button>
        </form>
      </div>
    </article>
  );
}

function displayName(user: PlatformUserRecord) {
  const name = `${user.firstName} ${user.lastName}`.trim();

  return name || "Name not set";
}
