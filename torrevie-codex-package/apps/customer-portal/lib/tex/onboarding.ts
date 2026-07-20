import type { TexOnboardingStatusRow } from "./db-types";
import type { TexOnboardingStatus } from "./types";

export function mapOnboardingStatus(row: TexOnboardingStatusRow): TexOnboardingStatus {
  const completedSteps = [
    row.company_profile_completed_at,
    row.whatsapp_connected_at,
    row.first_employee_invited_at,
    row.first_receipt_received_at,
    row.first_expense_approved_at,
    row.dashboard_first_viewed_at
  ].filter(Boolean).length;

  return {
    companyProfileCompletedAt: row.company_profile_completed_at,
    whatsappConnectedAt: row.whatsapp_connected_at,
    firstEmployeeInvitedAt: row.first_employee_invited_at,
    firstReceiptReceivedAt: row.first_receipt_received_at,
    firstExpenseApprovedAt: row.first_expense_approved_at,
    dashboardFirstViewedAt: row.dashboard_first_viewed_at,
    lastActivityAt: row.last_activity_at,
    ocrPendingCount: Number(row.ocr_pending_count ?? 0),
    manualReviewCount: Number(row.manual_review_count ?? 0),
    progress: Math.round((completedSteps / 6) * 100)
  };
}
