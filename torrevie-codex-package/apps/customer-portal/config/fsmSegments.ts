import type { Locale } from "@torrevie/localization";

export const businessSegments = ["SOLO", "TRADE", "FM", "COMMUNITY", "OEM"] as const;
export const fsmPlanTiers = ["entry", "growth", "enterprise"] as const;

export type BusinessSegment = (typeof businessSegments)[number];
export type FsmPlanTier = (typeof fsmPlanTiers)[number];

export type SegmentDetectionAnswers = {
  serve: "homeowners" | "contracts" | "buildings" | "products";
  intake: "owner_whatsapp" | "shared_inbox" | "hotline" | "email_dealer";
  fieldSize: "up_to_5" | "six_to_50" | "more_than_50";
};

export type FsmFlowSettings = {
  segment: BusinessSegment;
  autoConvertIntake: boolean;
  triageVisible: boolean;
  slaStartsAt: "intake" | "job";
  defaultSourceChannel: "whatsapp" | "voice" | "email" | "portal";
  approvalRequired: boolean;
  warrantyCheckRequired: boolean;
  steps: string[];
};

export type DashboardWidgetKey =
  | "todayJobs"
  | "unansweredWhatsApp"
  | "unpaidInvoices"
  | "cashCollected"
  | "jobsByStatus"
  | "pmDue"
  | "contractRenewals"
  | "quoteWinRate"
  | "slaBoard"
  | "jobsBySite"
  | "technicianUtilization"
  | "penaltyExposure"
  | "residentRequests"
  | "ppmCompliance"
  | "agingRequests"
  | "satisfactionScore"
  | "productLineRequests"
  | "warrantySplit"
  | "partsPending"
  | "firstTimeFix";

export const segmentLabels: Record<BusinessSegment, string> = {
  SOLO: "Independent Operator",
  TRADE: "Specialist Trade Contractor",
  FM: "Facility Management Company",
  COMMUNITY: "Building and Community Management",
  OEM: "Manufacturer After-Sales and Service"
};

export const dashboardWidgets: Record<BusinessSegment, DashboardWidgetKey[]> = {
  SOLO: ["todayJobs", "unansweredWhatsApp", "unpaidInvoices", "cashCollected"],
  TRADE: ["jobsByStatus", "pmDue", "contractRenewals", "quoteWinRate"],
  FM: ["slaBoard", "jobsBySite", "technicianUtilization", "penaltyExposure"],
  COMMUNITY: ["residentRequests", "ppmCompliance", "agingRequests", "satisfactionScore"],
  OEM: ["productLineRequests", "warrantySplit", "partsPending", "firstTimeFix"]
};

export const widgetLabels: Record<DashboardWidgetKey, string> = {
  todayJobs: "Jobs today",
  unansweredWhatsApp: "Unanswered WhatsApp",
  unpaidInvoices: "Unpaid invoices",
  cashCollected: "Cash collected this week",
  jobsByStatus: "Jobs by status",
  pmDue: "PM due in 14 days",
  contractRenewals: "Contract renewals in 60 days",
  quoteWinRate: "Quote win rate",
  slaBoard: "SLA board",
  jobsBySite: "Open jobs by site",
  technicianUtilization: "Technician utilization",
  penaltyExposure: "Penalty exposure estimate",
  residentRequests: "Open resident requests",
  ppmCompliance: "PPM compliance",
  agingRequests: "Aging requests",
  satisfactionScore: "Satisfaction score",
  productLineRequests: "Requests by product line",
  warrantySplit: "Warranty versus billable",
  partsPending: "Parts pending",
  firstTimeFix: "First-time-fix rate"
};

export const defaultFlowSettings: Record<BusinessSegment, FsmFlowSettings> = {
  SOLO: {
    segment: "SOLO",
    autoConvertIntake: true,
    triageVisible: false,
    slaStartsAt: "job",
    defaultSourceChannel: "whatsapp",
    approvalRequired: false,
    warrantyCheckRequired: false,
    steps: ["WhatsApp message", "Job created", "Quote sent", "Assigned to owner", "Complete with photos", "Invoice sent"]
  },
  TRADE: {
    segment: "TRADE",
    autoConvertIntake: false,
    triageVisible: true,
    slaStartsAt: "job",
    defaultSourceChannel: "whatsapp",
    approvalRequired: false,
    warrantyCheckRequired: false,
    steps: ["Intake", "Triage", "Quote or contract dispatch", "Schedule", "Execute", "Service report", "Invoice"]
  },
  FM: {
    segment: "FM",
    autoConvertIntake: false,
    triageVisible: true,
    slaStartsAt: "intake",
    defaultSourceChannel: "voice",
    approvalRequired: false,
    warrantyCheckRequired: false,
    steps: ["Hotline intake", "SLA classification", "Dispatch by skill and zone", "Checklist execution", "Client confirmation", "Monthly report"]
  },
  COMMUNITY: {
    segment: "COMMUNITY",
    autoConvertIntake: false,
    triageVisible: true,
    slaStartsAt: "intake",
    defaultSourceChannel: "portal",
    approvalRequired: true,
    warrantyCheckRequired: false,
    steps: ["Resident request", "Triage", "Approval if chargeable", "Dispatch", "Resident confirmation", "Board pack rollup"]
  },
  OEM: {
    segment: "OEM",
    autoConvertIntake: false,
    triageVisible: true,
    slaStartsAt: "intake",
    defaultSourceChannel: "email",
    approvalRequired: false,
    warrantyCheckRequired: true,
    steps: ["Request with serial", "Warranty check", "Quote or warranty job", "Parts reservation", "Engineer or dealer dispatch", "RMA if needed"]
  }
};

export function detectBusinessSegment(answers: SegmentDetectionAnswers): BusinessSegment {
  if (answers.serve === "products" || answers.intake === "email_dealer") {
    return "OEM";
  }

  if (answers.serve === "buildings") {
    return "COMMUNITY";
  }

  if (answers.intake === "hotline" || answers.fieldSize === "more_than_50") {
    return "FM";
  }

  if (answers.serve === "contracts" || answers.fieldSize === "six_to_50" || answers.intake === "shared_inbox") {
    return "TRADE";
  }

  return "SOLO";
}

export function suggestedPlanForSegment(segment: BusinessSegment): FsmPlanTier {
  if (segment === "SOLO") {
    return "entry";
  }

  if (segment === "FM" || segment === "OEM") {
    return "enterprise";
  }

  return "growth";
}

export function normalizeBusinessSegment(value: string | null | undefined): BusinessSegment {
  return businessSegments.includes(value as BusinessSegment) ? (value as BusinessSegment) : "TRADE";
}

export function normalizePlanTier(value: string | null | undefined): FsmPlanTier {
  return fsmPlanTiers.includes(value as FsmPlanTier) ? (value as FsmPlanTier) : "entry";
}

export function profileKeyForSegment(segment: BusinessSegment) {
  return segment.toLowerCase();
}

export function localeFallback(locale: Locale) {
  return locale === "ar" ? "en" : locale;
}
