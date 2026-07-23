import type { PermissionKey, ProductKey, RoleKey } from "@torrevie/permissions";
import type { EmailDispatchResult, WhatsAppDispatchResult } from "@torrevie/notifications";
import type { ResolvedTenantContext } from "@torrevie/tenant-context";
import type { TexReceiptExtraction } from "../tex-ai";

export type TexActorContext = ResolvedTenantContext & {
  roles: readonly RoleKey[];
  entitledProducts: readonly ProductKey[];
  texPlan: TexPlanContext;
  tenantName?: string;
  tenantLogoUrl?: string | null;
  moduleAdminProducts?: readonly ProductKey[];
  integrationPermissions?: readonly PermissionKey[];
};

export type TexExpenseStatus = "pending" | "approved" | "rejected" | "paid";

export type TexExpenseInput = {
  employeeProfileId?: string | null;
  vendor?: string | null;
  expenseDate: string;
  amount: number;
  currency: string;
  category?: string | null;
  tripId?: string | null;
  tripLegId?: string | null;
  notes?: string | null;
  paymentMethod?: string | null;
  taxIdNumber?: string | null;
  taxAmount?: number | null;
  receiptFileId?: string | null;
  extractionSource?: "manual" | "web_ai" | "whatsapp_ai" | null;
  extractionConfidence?: number | null;
  extractionPayload?: Record<string, unknown> | null;
  source?: string | null;
};

export type TexExpenseListItem = TexExpenseRecord & {
  employeeProfileId: string | null;
  employeeName: string | null;
  vendor: string | null;
  expenseDate: string;
  category: string | null;
  tripId: string | null;
  tripName: string | null;
  notes: string | null;
  paymentMethod: string | null;
  taxIdNumber: string | null;
  taxAmount: number | null;
  receiptFileId: string | null;
  receiptUrl: string | null;
  createdAt: string;
  duplicateStatus: "clear" | "suspected" | "duplicate";
  duplicateReason: string | null;
  managerReviewRequired: boolean;
};

export type TexExpenseRecord = {
  id: string;
  status: TexExpenseStatus;
  amount: number;
  currency: string;
};

export type TexExpenseUpdateInput = Partial<TexExpenseInput>;

export type TexReceiptDownload = {
  buffer: Buffer;
  filename: string;
  contentType: string;
  sizeBytes: number;
};

export type TexReceiptFileRecord = {
  id: string;
  storagePath: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  url: string;
};

export type TexReceiptUploadInput = {
  fileName: string;
  contentType: string;
  dataBase64: string;
};

export type TexBootstrap = {
  categories: TexExpenseCategory[];
  employeeProfiles: TexEmployeeProfile[];
  managerUsers: TexManagerUser[];
  teams: TexTeam[];
  integrationSettings: TexIntegrationSettings | null;
};

export type TexExpenseCategory = {
  id: string;
  name: string;
  isActive: boolean;
  isSystem: boolean;
  sortOrder: number;
};

export type TexExpenseCategoryInput = {
  name: string;
  isActive?: boolean | null;
  sortOrder?: number | null;
};

export type TexEmployeeProfile = {
  id: string;
  userId: string | null;
  name: string;
  phoneNumber: string;
  department: string | null;
  monthlySalary: number;
  managerUserId: string | null;
  managerName: string | null;
  managerEmail: string | null;
  submissionFrequency: "realtime" | "daily" | "weekly" | "monthly";
  isActive: boolean;
};

export type TexEmployeeProfileInput = {
  name: string;
  phoneNumber: string;
  department?: string | null;
  monthlySalary?: number | null;
  managerUserId?: string | null;
  submissionFrequency?: "realtime" | "daily" | "weekly" | "monthly" | null;
  isActive: boolean;
};

export type TexIntegrationSettings = {
  whatsappProvider: "ultramsg" | "wappfly" | "meta";
  whatsappInstanceId: string | null;
  wappflySessionId: string | null;
  metaPhoneNumberId: string | null;
  metaWhatsappBusinessAccountId: string | null;
  aiReceiptExtractionEnabled: boolean;
  duplicateDetectionEnabled: boolean;
  duplicateAutoRejectEnabled: boolean;
  duplicateSimilarityThreshold: number;
};

export type TexIntegrationWorkspace = {
  settings: TexIntegrationSettings | null;
  providerProfiles: TexProviderProfileSummary[];
  defaultProviderProfile: TexProviderProfileSummary | null;
  quickConnect: {
    available: boolean;
    connectorActive: boolean;
    session: TexQuickConnectSession | null;
    events: TexQuickConnectEvent[];
  };
  receiptStorage: {
    bucket: string;
    pathPrefix: string;
    convention: string;
  };
};

export type TexManagerUser = {
  id: string;
  email: string;
  displayName: string | null;
  roles: RoleKey[];
};

export type TexOnboardingStatus = {
  companyProfileCompletedAt: string | null;
  whatsappConnectedAt: string | null;
  firstEmployeeInvitedAt: string | null;
  firstReceiptReceivedAt: string | null;
  firstExpenseApprovedAt: string | null;
  dashboardFirstViewedAt: string | null;
  lastActivityAt: string | null;
  ocrPendingCount: number;
  manualReviewCount: number;
  progress: number;
};

export type TexTeam = {
  id: string;
  name: string;
  description: string | null;
  managerEmployeeProfileId: string | null;
  managerName: string | null;
  memberEmployeeProfileIds: string[];
  memberNames: string[];
  memberCount: number;
};

export type TexTeamInput = {
  name: string;
  description?: string | null;
  managerEmployeeProfileId?: string | null;
  memberEmployeeProfileIds?: string[] | null;
};

export type TexTripInput = {
  name: string;
  description?: string | null;
  tripType?: "general" | "logistics" | null;
  origin?: string | null;
  destination?: string | null;
  budgetAmount?: number | null;
  advanceDepositFileId?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  enforceCurrency?: boolean | null;
  enforcedCurrency?: string | null;
  teamId?: string | null;
  containerNumber?: string | null;
  driverEmployeeProfileId?: string | null;
  driverTripAmount?: number | null;
  subcontractorDriverName?: string | null;
  subcontractorAmount?: number | null;
  subcontractorNotes?: string | null;
};

export type TexTripLeg = {
  id: string;
  sequence: number;
  origin: string;
  originPlaceId: string | null;
  originLat: number | null;
  originLng: number | null;
  originCountry: string | null;
  destination: string;
  destinationPlaceId: string | null;
  destinationLat: number | null;
  destinationLng: number | null;
  destinationCountry: string | null;
  mode: TexTripLegMode | null;
  status: TexTripLegStatus;
  plannedStart: string | null;
  plannedEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  distanceKm: number | null;
  isReturnTrip: boolean;
  returnDistanceKm: number | null;
  returnDurationSeconds: number | null;
  totalDistanceKm: number | null;
  durationSeconds: number | null;
  distanceSource: string | null;
  routePolyline: string | null;
  budgetAmount: number | null;
  containerRef: string | null;
  notes: string | null;
};

export type TexTripLegInput = {
  id?: string | null;
  sequence?: number | null;
  origin: string;
  originPlaceId?: string | null;
  originLat?: number | null;
  originLng?: number | null;
  originCountry?: string | null;
  destination: string;
  destinationPlaceId?: string | null;
  destinationLat?: number | null;
  destinationLng?: number | null;
  destinationCountry?: string | null;
  mode?: TexTripLegMode | null;
  status?: TexTripLegStatus | null;
  plannedStart?: string | null;
  plannedEnd?: string | null;
  actualStart?: string | null;
  actualEnd?: string | null;
  distanceKm?: number | null;
  isReturnTrip?: boolean | null;
  returnDistanceKm?: number | null;
  returnDurationSeconds?: number | null;
  totalDistanceKm?: number | null;
  durationSeconds?: number | null;
  distanceSource?: string | null;
  routePolyline?: string | null;
  budgetAmount?: number | null;
  containerRef?: string | null;
  notes?: string | null;
};

export type TexTripLegMode = "road" | "sea" | "air" | "rail";
export type TexTripLegStatus = "planned" | "in_transit" | "completed" | "cancelled";

export type TexTripListItem = {
  id: string;
  name: string;
  description: string | null;
  tripType: "general" | "logistics";
  origin: string | null;
  destination: string | null;
  status: string;
  startDate: string | null;
  endDate: string | null;
  budgetAmount: number | null;
  enforceCurrency: boolean;
  enforcedCurrency: string | null;
  teamId: string | null;
  teamName: string | null;
  containerNumber: string | null;
  driverEmployeeProfileId: string | null;
  driverName: string | null;
  driverTripAmount: number;
  subcontractorDriverName: string | null;
  subcontractorAmount: number;
  driverPayoutStatus: string;
  legCount: number;
  totalDistanceKm: number;
  expenseCount: number;
  spendAmount: number;
};

export type TexFinanceReview = {
  month: number;
  year: number;
  currency: string;
  approvedExpenses: TexFinanceExpense[];
  tripPayouts: TexFinanceTripPayout[];
  totals: {
    approvedExpenseAmount: number;
    tripPayoutAmount: number;
    netPayable: number;
  };
};

export type TexFinanceExpense = {
  id: string;
  employeeProfileId: string | null;
  employeeName: string | null;
  vendor: string | null;
  expenseDate: string;
  amount: number;
  currency: string;
  baseAmount: number;
  category: string | null;
  tripName: string | null;
  notes: string | null;
  receiptFileId: string | null;
  receiptUrl: string | null;
  approvedAt: string | null;
};

export type TexFinanceTripPayout = {
  id: string;
  name: string;
  driverEmployeeProfileId: string | null;
  driverName: string | null;
  origin: string | null;
  destination: string | null;
  startDate: string | null;
  driverTripAmount: number;
  subcontractorDriverName: string | null;
  subcontractorAmount: number;
  totalAmount: number;
};

export type TexFinancePaymentInput = {
  expenseIds?: string[];
  tripIds?: string[];
};

export type TexEmailReportInput = {
  dateFrom?: string | null;
  dateTo?: string | null;
  recipients?: string[];
};

export type TexEmailReportResult = {
  status: EmailDispatchResult["status"];
  provider: EmailDispatchResult["provider"];
  recipients: string[];
  messageId: string | null;
  error: string | null;
};

export type TexFxRate = {
  id: string;
  rateDate: string;
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  source: string | null;
  isManualOverride: boolean;
};

export type TexCurrencyPeg = {
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  effectiveFrom: string;
  notes: string | null;
};

export type TexFxWorkspace = {
  rateDate: string;
  baseCurrency: string;
  rates: TexFxRate[];
  pegs: TexCurrencyPeg[];
};

export type TexFxRefreshResult = {
  success: boolean;
  source: "live" | "fallback" | "none";
  updated: number;
  skipped: number;
  pegged: number;
  errors: string[];
  rateDate: string;
};

export type TexReportInput = {
  dateFrom?: string | null;
  dateTo?: string | null;
};

export type TexReportExpense = {
  id: string;
  employeeProfileId: string | null;
  employeeName: string | null;
  vendor: string | null;
  expenseDate: string;
  amount: number;
  currency: string;
  baseAmount: number;
  category: string | null;
  tripId: string | null;
  tripName: string | null;
  paymentMethod: string | null;
  source: string | null;
  status: TexExpenseStatus;
  policyFlag: boolean;
  taxAmount: number | null;
  taxIdNumber: string | null;
  approvedAt: string | null;
  paidAt: string | null;
  createdAt: string;
};

export type TexReportWorkspace = {
  dateFrom: string;
  dateTo: string;
  previousDateFrom: string;
  previousDateTo: string;
  currency: string;
  expenses: TexReportExpense[];
  previousExpenses: TexReportExpense[];
};

export type TexDriverAdvanceInput = {
  employeeProfileId?: string | null;
  amount: number;
  currency?: string | null;
  baseAmount?: number | null;
  advanceDate?: string | null;
  month?: number | null;
  year?: number | null;
  notes?: string | null;
};

export type TexDriverAdvance = {
  id: string;
  employeeProfileId: string;
  amount: number;
  currency: string;
  baseAmount: number;
  advanceDate: string;
  month: number;
  year: number;
  notes: string | null;
};

export type TexNotificationInput = {
  userId?: string | null;
  title: string;
  body?: string | null;
  type?: string | null;
  relatedExpenseId?: string | null;
  relatedTripId?: string | null;
};

export type TexNotification = {
  id: string;
  userId: string | null;
  title: string;
  body: string | null;
  type: string | null;
  relatedExpenseId: string | null;
  relatedTripId: string | null;
  isRead: boolean;
  createdAt: string;
};

export type TexSpendPolicy = {
  id: string | null;
  category: string;
  dailyLimit: number | null;
  monthlyLimit: number | null;
  requiresNotesAbove: number | null;
  isBlocked: boolean;
};

export type TexSpendPolicyInput = {
  category: string;
  dailyLimit?: number | null;
  monthlyLimit?: number | null;
  requiresNotesAbove?: number | null;
  isBlocked?: boolean | null;
};

export type TexBudget = {
  id: string;
  department: string;
  month: number;
  year: number;
  budgetAmount: number;
  spentAmount: number;
  remainingAmount: number;
};

export type TexBudgetInput = {
  department: string;
  month: number;
  year: number;
  budgetAmount: number;
};

export type TexDuplicateHandlingMode = "manager_review" | "auto_reject";

export type TexProcessingSettings = {
  duplicateDetectionEnabled: boolean;
  duplicateAutoRejectEnabled: boolean;
  duplicateHandlingMode: TexDuplicateHandlingMode;
};

export type TexProcessingSettingsInput = {
  duplicateHandlingMode: TexDuplicateHandlingMode;
};

export type TexSettingsWorkspace = {
  branding: TexTenantBranding;
  categories: TexExpenseCategory[];
  policies: TexSpendPolicy[];
  budgets: TexBudget[];
  departments: string[];
  processingSettings: TexProcessingSettings;
  month: number;
  year: number;
};

export type TexTenantBranding = {
  tenantName: string;
  logoUrl: string | null;
  logoUpdatedAt: string | null;
};

export type TexFirstRunTutorialState = {
  dismissedAt: string | null;
  shouldShow: boolean;
};

export type TexTenantLogoUploadInput = {
  fileName?: string | null;
  contentType: string;
  dataBase64: string;
};

export type TexTenantLogoDownload = {
  buffer: Buffer;
  contentType: string;
};

export type TexWebhookSubmissionInput = {
  senderRaw?: string | null;
  senderPhone?: string | null;
  whatsappChatJid?: string | null;
  messageId?: string | null;
  sessionId?: string | null;
  messageText?: string | null;
  receiptFileId?: string | null;
  mediaUrl?: string | null;
  mediaMimeType?: string | null;
  extractedReceipt?: TexReceiptExtraction | null;
  payload: Record<string, unknown>;
};

export type TexWebhookSubmissionRecord = {
  id: string;
  status: "open" | "resolved" | "ignored";
};

export type TexUnregisteredWhatsappSubmission = TexWebhookSubmissionRecord & {
  senderRaw: string | null;
  senderPhone: string | null;
  whatsappChatJid: string | null;
  messageId: string | null;
  sessionId: string | null;
  messageText: string | null;
  receiptFileId: string | null;
  mediaUrl: string | null;
  mediaMimeType: string | null;
  mediaStatus: string | null;
  mediaError: string | null;
  messageType: "receipt" | "status" | "text";
  ocrStatus: TexWhatsappReceiptResult["ocrStatus"];
  ocrResult: TexReceiptExtraction | TexReceiptBatchResult | null;
  ocrError: string | null;
  whatsappReplyText: string | null;
  intakeStatus: string;
  duplicateHint: string | null;
  payload: Record<string, unknown>;
  resolvedExpenseId: string | null;
  resolvedEmployeeProfileId: string | null;
  resolvedAt: string | null;
  createdAt: string;
};

export type TexUnregisteredWhatsappResolveInput = {
  mode: "existing_employee" | "new_employee";
  employeeProfileId?: string | null;
  employeeName?: string | null;
  phoneNumber?: string | null;
  department?: string | null;
};

export type TexUnregisteredWhatsappResolveResult = {
  submission: TexWebhookSubmissionRecord;
  employee: TexEmployeeProfile;
  expense: TexExpenseRecord;
  expenses: TexExpenseRecord[];
  delivery: WhatsAppDispatchResult | null;
};

export type TexWhatsappReceiptResult = {
  submission: TexWebhookSubmissionRecord;
  replyText: string;
  expense: TexExpenseRecord | null;
  expenses?: TexExpenseRecord[];
  ocrStatus: "pending" | "processing" | "extracted" | "failed" | "manual_review" | "not_applicable";
  delivery: WhatsAppDispatchResult | null;
};

export type TexReceiptBatchResult = {
  multipleReceipts: true;
  receipts: TexReceiptExtraction[];
};

export type TexProviderProfileSummary = {
  id: string;
  label: string;
  provider: "ultramsg" | "wappfly" | "meta";
  status: "active" | "inactive";
  isDefault: boolean;
  webhookUrl: string | null;
  apiKeyConfigured: boolean;
  apiKeyLast4: string;
};

export type TexQuickConnectEvent = {
  id: string;
  eventType: string;
  direction: "inbound" | "outbound" | "system";
  status: string | null;
  message: string | null;
  occurredAt: string;
};

export type TexQuickConnectSession = {
  id: string;
  status: TexQuickConnectStatus;
  pairingCode: string | null;
  qrCodeData: string | null;
  qrExpiresAt: string | null;
  connectedPhone: string | null;
  connectedAt: string | null;
  lastSeenAt: string | null;
  error: string | null;
  updatedAt: string;
};

export type TexQuickConnectStatus = "idle" | "qr_pending" | "connected" | "disconnected" | "failed";

export type TexPlanContext = {
  planKey: TexPlanKey;
  planStatus: TexPlanStatus;
  trialStartDate: string | null;
  trialEndDate: string | null;
  billingStatus: string | null;
  renewalDate: string | null;
  billingCurrency: "aed" | "usd";
  billingCancelAtPeriodEnd: boolean;
  employeeLimit: number;
  seatCount: number;
  whatsappProviderScope: TexWhatsappProviderScope;
  growthFeaturesEnabled: boolean;
  enterpriseFeaturesEnabled: boolean;
};

export type TexPlanKey = "trial" | "lite" | "growth" | "enterprise";
export type TexPlanStatus = "trialing" | "active" | "expired" | "suspended" | "cancelled";
export type TexWhatsappProviderScope = "not_configured" | "torrevie_managed" | "customer_owned";
