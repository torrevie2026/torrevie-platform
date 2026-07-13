import type { BusinessSegment } from "./fsmSegments";
import type { TermKey } from "./terminology";

export type FsmNavItem = {
  key: string;
  label: string;
  href: string;
  termKey?: TermKey;
  featureKey?: string;
  featureKeys?: string[];
};

export const fsmNavProfiles: Record<BusinessSegment, FsmNavItem[]> = {
  SOLO: [
    { key: "today", label: "Today", href: "/fsm" },
    { key: "jobs", label: "Jobs", href: "/fsm?section=jobs", termKey: "jobs" },
    { key: "whatsapp", label: "WhatsApp Inbox", href: "/fsm?section=whatsapp", featureKey: "fsm.channel.whatsapp.enabled" },
    { key: "customers", label: "Customers", href: "/fsm?section=customers", termKey: "customers" },
    { key: "commercial", label: "Quotes and Invoices", href: "/fsm?section=commercial" },
    { key: "reports", label: "ROI", href: "/fsm?section=reports", featureKeys: ["fsm.roi.basic.enabled", "fsm.roi.full.enabled"] },
    { key: "settings", label: "Settings", href: "/fsm?section=settings" }
  ],
  TRADE: [
    { key: "dashboard", label: "Dashboard", href: "/fsm" },
    { key: "jobs", label: "Jobs", href: "/fsm?section=jobs", termKey: "jobs" },
    { key: "scheduling", label: "Scheduling", href: "/fsm?section=scheduling" },
    { key: "pm", label: "PM Calendar", href: "/fsm?section=pm", featureKey: "fsm.module.pm" },
    { key: "contracts", label: "Contracts", href: "/fsm?section=contracts", featureKey: "fsm.module.contracts" },
    { key: "customers", label: "Customers", href: "/fsm?section=customers", termKey: "customers" },
    { key: "assets", label: "Assets", href: "/fsm?section=assets", termKey: "assets" },
    { key: "commercial", label: "Quotes and Invoices", href: "/fsm?section=commercial" },
    { key: "whatsapp", label: "WhatsApp Inbox", href: "/fsm?section=whatsapp", featureKey: "fsm.channel.whatsapp.enabled" },
    { key: "reports", label: "Reports", href: "/fsm?section=reports", featureKeys: ["fsm.roi.basic.enabled", "fsm.roi.full.enabled"] },
    { key: "settings", label: "Settings", href: "/fsm?section=settings" }
  ],
  FM: [
    { key: "command", label: "Command Center", href: "/fsm" },
    { key: "triage", label: "Triage", href: "/fsm?section=triage" },
    { key: "jobs", label: "Jobs", href: "/fsm?section=jobs", termKey: "jobs" },
    { key: "dispatch", label: "Scheduling and Dispatch", href: "/fsm?section=dispatch" },
    { key: "ppm", label: "PPM Planner", href: "/fsm?section=pm", featureKey: "fsm.module.pm" },
    { key: "sla", label: "SLA Board", href: "/fsm?section=sla", featureKey: "fsm.module.sla" },
    { key: "assets", label: "Sites and Assets", href: "/fsm?section=assets", termKey: "assets" },
    { key: "contracts", label: "Contracts", href: "/fsm?section=contracts", featureKey: "fsm.module.contracts" },
    { key: "technicians", label: "Subcontractors", href: "/fsm?section=technicians", termKey: "technicians" },
    { key: "channels", label: "Channel Hub", href: "/fsm?section=channels", featureKey: "fsm.channel.email.enabled" },
    { key: "reports", label: "Reports", href: "/fsm?section=reports", featureKeys: ["fsm.roi.basic.enabled", "fsm.roi.full.enabled"] },
    { key: "settings", label: "Settings", href: "/fsm?section=settings" }
  ],
  COMMUNITY: [
    { key: "command", label: "Command Center", href: "/fsm" },
    { key: "requests", label: "Requests", href: "/fsm?section=triage", termKey: "requests" },
    { key: "jobs", label: "Jobs", href: "/fsm?section=jobs", termKey: "jobs" },
    { key: "ppm", label: "PPM Planner", href: "/fsm?section=pm", featureKey: "fsm.module.pm" },
    { key: "residents", label: "Units and Residents", href: "/fsm?section=customers", termKey: "customers" },
    { key: "assets", label: "Common Areas", href: "/fsm?section=assets", termKey: "assets" },
    { key: "approvals", label: "Approvals", href: "/fsm?section=approvals" },
    { key: "channels", label: "Channel Hub", href: "/fsm?section=channels", featureKey: "fsm.channel.portal.basic.enabled" },
    { key: "reports", label: "Board Reports", href: "/fsm?section=reports", featureKeys: ["fsm.roi.basic.enabled", "fsm.roi.full.enabled", "fsm.client_report_packs.enabled"] },
    { key: "settings", label: "Settings", href: "/fsm?section=settings" }
  ],
  OEM: [
    { key: "dashboard", label: "Dashboard", href: "/fsm" },
    { key: "requests", label: "Service Requests", href: "/fsm?section=triage", termKey: "requests" },
    { key: "jobs", label: "Work Orders", href: "/fsm?section=jobs", termKey: "jobs" },
    { key: "install-base", label: "Install Base", href: "/fsm?section=assets", termKey: "assets" },
    { key: "warranty", label: "Warranty and Contracts", href: "/fsm?section=contracts", featureKey: "fsm.assets.warranty_serial.enabled" },
    { key: "parts", label: "Spare Parts", href: "/fsm?section=catalog" },
    { key: "dealers", label: "Dealers and Technicians", href: "/fsm?section=technicians", termKey: "technicians" },
    { key: "channels", label: "Channel Hub", href: "/fsm?section=channels", featureKey: "fsm.channel.email.enabled" },
    { key: "reports", label: "Reports", href: "/fsm?section=reports", featureKeys: ["fsm.roi.basic.enabled", "fsm.roi.full.enabled"] },
    { key: "settings", label: "Settings", href: "/fsm?section=settings" }
  ]
};

export function navForSegment(segment: BusinessSegment, enabledFeatures: ReadonlySet<string>) {
  return fsmNavProfiles[segment].filter((item) => {
    if (item.featureKeys) {
      return item.featureKeys.some((featureKey) => enabledFeatures.has(featureKey));
    }

    return !item.featureKey || enabledFeatures.has(item.featureKey);
  });
}
