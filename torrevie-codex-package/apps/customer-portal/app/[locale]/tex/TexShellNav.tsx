"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type TexShellNavProps = {
  email: string | null;
  locale: string;
  roles: readonly string[];
  tenantId: string;
};

const texNavItems = [
  { href: "", icon: "D", label: "Dashboard" },
  { href: "/expenses", icon: "E", label: "Expenses" },
  { href: "/trips", icon: "T", label: "Trips" },
  { href: "/finance-review", icon: "F", label: "Finance review" },
  { href: "/people", icon: "P", label: "People" },
  { href: "/reports", icon: "R", label: "Reports" },
  { href: "/whatsapp-review", icon: "W", label: "WhatsApp review" },
  { href: "/integrations", icon: "I", label: "Integrations" },
  { href: "/settings", icon: "S", label: "Settings" }
] as const;

export function TexShellNav({ email, locale, roles, tenantId }: TexShellNavProps) {
  const pathname = usePathname();
  const basePath = `/${locale}/tex`;

  return (
    <aside className="customer-sidebar tex-sidebar" aria-label="TEX sections">
      <div className="tex-sidebar-header">
        <Link className="customer-brand tex-brand" href={`/${locale}`} aria-label="Torrevie">
          <img src="/logo/torrevie_logo_color.png" alt="" width="36" height="36" />
          <span>
            <strong>Torrevie TEX</strong>
            <small>Travel and Expense</small>
          </span>
        </Link>
        <div className="tex-company-chip">{tenantId}</div>
      </div>

      <nav className="tex-nav">
        {texNavItems.map((item) => {
          const href = `${basePath}${item.href}`;
          const isDashboard = item.href === "";
          const active = isDashboard ? pathname === basePath : pathname.startsWith(href);

          return (
            <Link
              aria-current={active ? "page" : undefined}
              className={isDashboard ? "tex-nav-primary" : undefined}
              href={href}
              key={item.href || "dashboard"}
            >
              <span className="tex-nav-icon" aria-hidden="true">
                {item.icon}
              </span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="tex-sidebar-user">
        <span className="tex-avatar">{email?.slice(0, 1).toUpperCase() ?? "T"}</span>
        <span>
          <strong>{email ?? "Customer user"}</strong>
          <small>{roles.join(", ") || "TEX user"}</small>
        </span>
      </div>
    </aside>
  );
}
