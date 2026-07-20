import { isRoleKey } from "./access";
import type {
  TexBudgetRow,
  TexCurrencyPegRow,
  TexDriverAdvanceRow,
  TexEmployeeProfileRow,
  TexExpenseCategoryRow,
  TexExpenseListRow,
  TexExpenseRow,
  TexFinanceExpenseRow,
  TexFinanceTripPayoutRow,
  TexFxRateRow,
  TexIntegrationSettingsRow,
  TexManagerUserRow,
  TexNotificationRow,
  TexProcessingSettingsRow,
  TexProviderProfileSummaryRow,
  TexQuickConnectEventRow,
  TexQuickConnectSessionRow,
  TexReportExpenseRow,
  TexSpendPolicyRow,
  TexTeamRow,
  TexTripLegRow,
  TexTripListRow
} from "./db-types";
import type {
  TexBudget,
  TexCurrencyPeg,
  TexDriverAdvance,
  TexEmployeeProfile,
  TexExpenseCategory,
  TexExpenseListItem,
  TexExpenseRecord,
  TexFinanceExpense,
  TexFinanceTripPayout,
  TexFxRate,
  TexIntegrationSettings,
  TexManagerUser,
  TexNotification,
  TexProcessingSettings,
  TexProviderProfileSummary,
  TexQuickConnectEvent,
  TexQuickConnectSession,
  TexReportExpense,
  TexSpendPolicy,
  TexTeam,
  TexTripLeg,
  TexTripListItem
} from "./types";

export function mapCategory(row: TexExpenseCategoryRow): TexExpenseCategory {
  return {
    id: row.id,
    name: row.name,
    isActive: row.is_active,
    isSystem: row.is_system,
    sortOrder: row.sort_order
  };
}

export function mergePoliciesWithCategories(
  categories: readonly TexExpenseCategoryRow[],
  policies: readonly TexSpendPolicyRow[]
) {
  const policyByCategory = new Map(policies.map((policy) => [policy.category, policy]));
  const merged = categories.map((category) => {
    const policy = policyByCategory.get(category.name);
    return policy
      ? mapSpendPolicy(policy)
      : {
          id: null,
          category: category.name,
          dailyLimit: null,
          monthlyLimit: null,
          requiresNotesAbove: null,
          isBlocked: false
        };
  });
  const categoryNames = new Set(categories.map((category) => category.name));
  const customPolicies = policies
    .filter((policy) => !categoryNames.has(policy.category))
    .map(mapSpendPolicy);

  return [...merged, ...customPolicies];
}

export function mapSpendPolicy(row: TexSpendPolicyRow): TexSpendPolicy {
  return {
    id: row.id,
    category: row.category,
    dailyLimit: row.daily_limit,
    monthlyLimit: row.monthly_limit,
    requiresNotesAbove: row.requires_notes_above,
    isBlocked: row.is_blocked
  };
}

export function mapBudget(row: TexBudgetRow): TexBudget {
  const spentAmount = row.spent_amount ?? 0;
  return {
    id: row.id,
    department: row.department,
    month: row.month,
    year: row.year,
    budgetAmount: row.budget_amount,
    spentAmount,
    remainingAmount: row.budget_amount - spentAmount
  };
}

export function mapEmployeeProfile(row: TexEmployeeProfileRow): TexEmployeeProfile {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    phoneNumber: row.phone_number,
    department: row.department,
    monthlySalary: row.monthly_salary,
    managerUserId: row.manager_user_id,
    managerName: row.manager_name,
    managerEmail: row.manager_email,
    submissionFrequency: row.submission_frequency,
    isActive: row.is_active
  };
}

export function mapManagerUser(row: TexManagerUserRow): TexManagerUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    roles: row.roles.filter(isRoleKey)
  };
}

export function mapTeam(row: TexTeamRow): TexTeam {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    managerEmployeeProfileId: row.manager_employee_profile_id,
    managerName: row.manager_name,
    memberEmployeeProfileIds: splitDelimited(row.member_employee_profile_ids, ","),
    memberNames: splitDelimited(row.member_names, "|"),
    memberCount: row.member_count
  };
}

export function mapIntegrationSettings(row: TexIntegrationSettingsRow): TexIntegrationSettings {
  return {
    whatsappProvider: row.whatsapp_provider,
    whatsappInstanceId: row.whatsapp_instance_id,
    wappflySessionId: row.wappfly_session_id,
    metaPhoneNumberId: row.meta_phone_number_id,
    metaWhatsappBusinessAccountId: row.meta_whatsapp_business_account_id,
    aiReceiptExtractionEnabled: row.ai_receipt_extraction_enabled,
    duplicateDetectionEnabled: row.duplicate_detection_enabled,
    duplicateAutoRejectEnabled: row.duplicate_auto_reject_enabled,
    duplicateSimilarityThreshold: row.duplicate_similarity_threshold
  };
}

export function mapProcessingSettings(
  row: TexProcessingSettingsRow | undefined
): TexProcessingSettings {
  const duplicateDetectionEnabled = row?.duplicate_detection_enabled ?? true;
  const duplicateAutoRejectEnabled = row?.duplicate_auto_reject_enabled ?? false;

  return {
    duplicateDetectionEnabled,
    duplicateAutoRejectEnabled,
    duplicateHandlingMode: duplicateAutoRejectEnabled ? "auto_reject" : "manager_review"
  };
}

export function mapProviderProfileSummary(
  row: TexProviderProfileSummaryRow
): TexProviderProfileSummary {
  return {
    id: row.id,
    label: row.label,
    provider: row.provider,
    status: row.status,
    isDefault: row.is_default,
    webhookUrl: row.webhook_url,
    apiKeyConfigured: row.keys_configured,
    apiKeyLast4: row.api_key_last4 ?? ""
  };
}

export function mapQuickConnectSession(row: TexQuickConnectSessionRow): TexQuickConnectSession {
  return {
    id: row.id,
    status: row.status,
    pairingCode: row.pairing_code,
    qrCodeData: row.qr_code_data,
    qrExpiresAt: row.qr_expires_at,
    connectedPhone: row.connected_phone,
    connectedAt: row.connected_at,
    lastSeenAt: row.last_seen_at,
    error: row.error,
    updatedAt: row.updated_at
  };
}

export function mapQuickConnectEvent(row: TexQuickConnectEventRow): TexQuickConnectEvent {
  return {
    id: row.id,
    eventType: row.event_type,
    direction: row.direction,
    status: row.status,
    message: row.message,
    occurredAt: row.occurred_at
  };
}

export function mapExpense(row: TexExpenseRow): TexExpenseRecord {
  return {
    id: row.id,
    status: row.status,
    amount: row.amount,
    currency: row.currency
  };
}

export function mapExpenseListItem(row: TexExpenseListRow): TexExpenseListItem {
  return {
    id: row.id,
    status: row.status,
    amount: row.amount,
    currency: row.currency,
    employeeProfileId: row.employee_profile_id,
    employeeName: row.employee_name,
    vendor: row.vendor,
    expenseDate: row.expense_date,
    category: row.category,
    tripId: row.trip_id,
    tripName: row.trip_name,
    notes: row.notes,
    paymentMethod: row.payment_method,
    taxIdNumber: row.tax_id_number,
    taxAmount: row.tax_amount,
    receiptFileId: row.receipt_file_id,
    receiptUrl: row.receipt_file_id ? `/api/tex/receipts/${row.receipt_file_id}` : null,
    createdAt: row.created_at,
    duplicateStatus: row.duplicate_status,
    duplicateReason: row.duplicate_reason,
    managerReviewRequired: row.manager_review_required
  };
}

export function mapTripListItem(row: TexTripListRow): TexTripListItem {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    tripType: row.trip_type,
    origin: row.origin,
    destination: row.destination,
    status: row.status,
    startDate: row.start_date,
    endDate: row.end_date,
    budgetAmount: row.budget_amount,
    enforceCurrency: row.enforce_currency,
    enforcedCurrency: row.enforced_currency,
    teamId: row.team_id,
    teamName: row.team_name,
    containerNumber: row.container_number,
    driverEmployeeProfileId: row.driver_employee_profile_id,
    driverName: row.driver_name,
    driverTripAmount: row.driver_trip_amount,
    subcontractorDriverName: row.subcontractor_driver_name,
    subcontractorAmount: row.subcontractor_amount,
    driverPayoutStatus: row.driver_payout_status,
    legCount: row.leg_count,
    totalDistanceKm: row.total_distance_km,
    expenseCount: row.expense_count,
    spendAmount: row.spend_amount
  };
}

export function mapTripLeg(row: TexTripLegRow): TexTripLeg {
  return {
    id: row.id,
    sequence: row.sequence,
    origin: row.origin,
    originPlaceId: row.origin_place_id,
    originLat: row.origin_lat,
    originLng: row.origin_lng,
    originCountry: row.origin_country,
    destination: row.destination,
    destinationPlaceId: row.destination_place_id,
    destinationLat: row.destination_lat,
    destinationLng: row.destination_lng,
    destinationCountry: row.destination_country,
    mode: row.mode,
    status: row.status,
    plannedStart: row.planned_start,
    plannedEnd: row.planned_end,
    actualStart: row.actual_start,
    actualEnd: row.actual_end,
    distanceKm: row.distance_km,
    isReturnTrip: row.is_return_trip,
    returnDistanceKm: row.return_distance_km,
    returnDurationSeconds: row.return_duration_seconds,
    totalDistanceKm: row.total_distance_km,
    durationSeconds: row.duration_seconds,
    distanceSource: row.distance_source,
    routePolyline: row.route_polyline,
    budgetAmount: row.budget_amount,
    containerRef: row.container_ref,
    notes: row.notes
  };
}

export function mapFinanceExpense(row: TexFinanceExpenseRow): TexFinanceExpense {
  return {
    id: row.id,
    employeeProfileId: row.employee_profile_id,
    employeeName: row.employee_name,
    vendor: row.vendor,
    expenseDate: row.expense_date,
    amount: row.amount,
    currency: row.currency,
    baseAmount: row.base_amount,
    category: row.category,
    tripName: row.trip_name,
    notes: row.notes,
    receiptFileId: row.receipt_file_id,
    receiptUrl: row.receipt_file_id ? `/api/tex/receipts/${row.receipt_file_id}` : null,
    approvedAt: row.approved_at
  };
}

export function mapFinanceTripPayout(row: TexFinanceTripPayoutRow): TexFinanceTripPayout {
  return {
    id: row.id,
    name: row.name,
    driverEmployeeProfileId: row.driver_employee_profile_id,
    driverName: row.driver_name,
    origin: row.origin,
    destination: row.destination,
    startDate: row.start_date,
    driverTripAmount: row.driver_trip_amount,
    subcontractorDriverName: row.subcontractor_driver_name,
    subcontractorAmount: row.subcontractor_amount,
    totalAmount: row.total_amount
  };
}

export function mapReportExpense(row: TexReportExpenseRow): TexReportExpense {
  return {
    id: row.id,
    employeeProfileId: row.employee_profile_id,
    employeeName: row.employee_name,
    vendor: row.vendor,
    expenseDate: row.expense_date,
    amount: row.amount,
    currency: row.currency,
    baseAmount: row.base_amount,
    category: row.category,
    tripId: row.trip_id,
    tripName: row.trip_name,
    paymentMethod: row.payment_method,
    source: row.source,
    status: row.status,
    policyFlag: row.policy_flag,
    taxAmount: row.tax_amount,
    taxIdNumber: row.tax_id_number,
    approvedAt: row.approved_at,
    paidAt: row.paid_at,
    createdAt: row.created_at
  };
}

export function mapDriverAdvance(row: TexDriverAdvanceRow): TexDriverAdvance {
  return {
    id: row.id,
    employeeProfileId: row.employee_profile_id,
    amount: row.amount,
    currency: row.currency,
    baseAmount: row.base_amount,
    advanceDate: row.advance_date,
    month: row.month,
    year: row.year,
    notes: row.notes
  };
}

export function mapFxRate(row: TexFxRateRow): TexFxRate {
  return {
    id: row.id,
    rateDate: row.rate_date,
    fromCurrency: row.from_currency,
    toCurrency: row.to_currency,
    rate: row.rate,
    source: row.source,
    isManualOverride: row.is_manual_override
  };
}

export function mapCurrencyPeg(row: TexCurrencyPegRow): TexCurrencyPeg {
  return {
    fromCurrency: row.from_currency,
    toCurrency: row.to_currency,
    rate: row.rate,
    effectiveFrom: row.effective_from,
    notes: row.notes
  };
}

export function mapNotification(row: TexNotificationRow): TexNotification {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    body: row.body,
    type: row.type,
    relatedExpenseId: row.related_expense_id,
    relatedTripId: row.related_trip_id,
    isRead: row.is_read,
    createdAt: row.created_at
  };
}

function splitDelimited(value: string | null, delimiter: string) {
  return value ? value.split(delimiter).filter(Boolean) : [];
}
