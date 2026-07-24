import { redirect } from "next/navigation";
import type { PlatformSession } from "../../lib/session";
import { signOutAction } from "../account/actions";

const navItems = [
  { href: "/", label: "Overview" },
  { href: "/tenants", label: "Tenants" },
  { href: "/tenant-users", label: "Tenant users" },
  { href: "/users", label: "Users" },
  { href: "/provisioning", label: "Provisioning" },
  { href: "/subscriptions", label: "Subscriptions" },
  { href: "/billing", label: "Billing" },
  { href: "/account", label: "Account" },
  { href: "/", label: "Audit" }
];

export function AdminSidebar({
  activeHref = "/",
  session
}: {
  activeHref?: string;
  session?: PlatformSession;
}) {
  if (session?.mfaRequired && activeHref !== "/mfa") {
    redirect("/mfa");
  }

  if (session && !session.profileComplete && activeHref !== "/account" && activeHref !== "/mfa") {
    redirect("/account?profile=required");
  }

  return (
    <aside className="admin-sidebar" aria-label="Control Plane sections">
      <a className="brand" href="/" aria-label="Torrevie Admin overview">
        <img src="/brand/torrevie_logo_color.png" alt="Torrevie" />
      </a>
      <nav>
        {navItems.map((item) => (
          <a
            key={`${item.href}-${item.label}`}
            href={item.href}
            aria-current={item.href === activeHref ? "page" : undefined}
          >
            {item.label}
          </a>
        ))}
      </nav>
      {session ? (
        <section className="account-card" aria-label="Signed in user">
          <div>
            <span>Signed in</span>
            <strong>{session.email}</strong>
            <small>{session.timezone}</small>
          </div>
          <div className="account-actions">
            <a href="/account" aria-current={activeHref === "/account" ? "page" : undefined}>
              Manage account
            </a>
            <form action={signOutAction}>
              <button type="submit">Sign out</button>
            </form>
          </div>
        </section>
      ) : null}
    </aside>
  );
}
