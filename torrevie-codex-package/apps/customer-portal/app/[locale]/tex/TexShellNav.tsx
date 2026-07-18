"use client";

import {
  BarChart3,
  ClipboardCheck,
  LayoutGrid,
  MapPin,
  MessageCircle,
  Plug,
  Receipt,
  Settings,
  Users
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { TexInstallPrompt } from "./TexInstallPrompt";

type TexShellNavProps = {
  email: string | null;
  locale: string;
  planKey: "trial" | "lite" | "growth" | "enterprise";
  roles: readonly string[];
  tenantName: string;
};

const texNavItems = [
  { href: "", icon: LayoutGrid, label: "Dashboard", minimumPlan: "trial" },
  { href: "/expenses", icon: Receipt, label: "Expenses", minimumPlan: "trial" },
  { href: "/trips", icon: MapPin, label: "Trips", minimumPlan: "growth" },
  { href: "/finance-review", icon: ClipboardCheck, label: "Finance review", minimumPlan: "growth" },
  { href: "/people", icon: Users, label: "People", minimumPlan: "trial" },
  { href: "/reports", icon: BarChart3, label: "Reports", minimumPlan: "trial" },
  { href: "/whatsapp-review", icon: MessageCircle, label: "WhatsApp receipts", minimumPlan: "trial" },
  { href: "/integrations", icon: Plug, label: "WhatsApp setup", minimumPlan: "trial" },
  { href: "/settings", icon: Settings, label: "Settings", minimumPlan: "trial" }
] as const;

const planRank = {
  trial: 0,
  lite: 1,
  growth: 2,
  enterprise: 3
} as const;

export function TexShellNav({ email, locale, planKey, roles, tenantName }: TexShellNavProps) {
  const pathname = usePathname();
  const basePath = `/${locale}/tex`;
  const visibleNavItems = texNavItems.filter(
    (item) => planRank[planKey] >= planRank[item.minimumPlan]
  );

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
        <div className="tex-company-chip" title={tenantName}>{tenantName}</div>
      </div>

      <nav className="tex-nav">
        {visibleNavItems.map((item) => {
          const href = `${basePath}${item.href}`;
          const isDashboard = item.href === "";
          const active = isDashboard ? pathname === basePath : pathname.startsWith(href);
          const Icon = item.icon;

          return (
            <Link
              aria-current={active ? "page" : undefined}
              className={isDashboard ? "tex-nav-primary" : undefined}
              href={href}
              key={item.href || "dashboard"}
            >
              <span className="tex-nav-icon" aria-hidden="true">
                <Icon />
              </span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="tex-sidebar-user">
        <TexInstallPrompt />
        <span className="tex-avatar">{email?.slice(0, 1).toUpperCase() ?? "T"}</span>
        <span>
          <strong>{email ?? "Customer user"}</strong>
          <small>{roles.join(", ") || "TEX user"}</small>
        </span>
      </div>
    </aside>
  );
}
