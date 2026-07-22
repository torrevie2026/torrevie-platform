"use client";

import {
  BarChart3,
  ClipboardCheck,
  LayoutGrid,
  Menu,
  MapPin,
  MessageCircle,
  Plug,
  Receipt,
  Settings,
  X,
  Users
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
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
  {
    href: "/whatsapp-review",
    icon: MessageCircle,
    label: "WhatsApp receipts",
    minimumPlan: "trial"
  },
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
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const basePath = `/${locale}/tex`;
  const visibleNavItems = useMemo(
    () => texNavItems.filter((item) => planRank[planKey] >= planRank[item.minimumPlan]),
    [planKey]
  );
  const visibleHrefList = useMemo(
    () => visibleNavItems.map((item) => `${basePath}${item.href}`),
    [basePath, visibleNavItems]
  );
  const primaryMobileNavItems = visibleNavItems.filter((item) =>
    ["", "/expenses", "/whatsapp-review"].includes(item.href)
  );
  const secondaryMobileNavItems = visibleNavItems.filter(
    (item) => !primaryMobileNavItems.includes(item)
  );
  const isActive = (href: string) => {
    const itemHref = `${basePath}${href}`;
    return href === "" ? pathname === basePath : pathname.startsWith(itemHref);
  };
  const isMoreActive = secondaryMobileNavItems.some((item) => isActive(item.href));

  useEffect(() => {
    visibleHrefList.forEach((href) => router.prefetch(href));
  }, [router, visibleHrefList]);

  return (
    <>
      <aside className="customer-sidebar tex-sidebar" aria-label="TEX sections">
        <div className="tex-sidebar-header">
          <Link className="customer-brand tex-brand" href={`/${locale}`} aria-label="Torrevie">
            <img src="/logo/torrevie_logo_color.png" alt="" width="36" height="36" />
            <span>
              <strong>Torrevie TEX</strong>
              <small>Travel and Expense</small>
            </span>
          </Link>
          <div className="tex-company-chip" title={tenantName}>
            {tenantName}
          </div>
        </div>

        <nav className="tex-nav">
          {visibleNavItems.map((item) => {
            const href = `${basePath}${item.href}`;
            const isDashboard = item.href === "";
            const isCurrent = isActive(item.href);
            const Icon = item.icon;

            return (
              <Link
                aria-current={isCurrent ? "page" : undefined}
                className={isDashboard && isCurrent ? "tex-nav-primary" : undefined}
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

      <nav className="tex-mobile-nav" aria-label="TEX mobile sections">
        {primaryMobileNavItems.map((item) => {
          const href = `${basePath}${item.href}`;
          const Icon = item.icon;

          return (
            <Link
              aria-current={isActive(item.href) ? "page" : undefined}
              href={href}
              key={item.href || "dashboard"}
              onClick={() => setIsMoreOpen(false)}
            >
              <span className="tex-nav-icon" aria-hidden="true">
                <Icon />
              </span>
              <span>{item.label === "WhatsApp receipts" ? "WhatsApp" : item.label}</span>
            </Link>
          );
        })}
        <button
          aria-current={isMoreActive ? "page" : undefined}
          aria-expanded={isMoreOpen}
          aria-label="Open more TEX sections"
          type="button"
          onClick={() => setIsMoreOpen((current) => !current)}
        >
          <span className="tex-nav-icon" aria-hidden="true">
            <Menu />
          </span>
          <span>More</span>
        </button>
      </nav>

      {isMoreOpen ? (
        <div
          className="tex-mobile-more-backdrop"
          role="presentation"
          onClick={() => setIsMoreOpen(false)}
        >
          <section
            aria-label="More TEX sections"
            className="tex-mobile-more-panel"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="tex-mobile-more-header">
              <div>
                <strong>{tenantName}</strong>
                <small>{email ?? "TEX workspace"}</small>
              </div>
              <button
                aria-label="Close more TEX sections"
                type="button"
                onClick={() => setIsMoreOpen(false)}
              >
                <X />
              </button>
            </div>
            <div className="tex-mobile-more-links">
              {secondaryMobileNavItems.map((item) => {
                const href = `${basePath}${item.href}`;
                const Icon = item.icon;

                return (
                  <Link
                    aria-current={isActive(item.href) ? "page" : undefined}
                    href={href}
                    key={item.href}
                    onClick={() => setIsMoreOpen(false)}
                  >
                    <span className="tex-nav-icon" aria-hidden="true">
                      <Icon />
                    </span>
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
            <TexInstallPrompt />
          </section>
        </div>
      ) : null}
    </>
  );
}
