import type { WhatsAppProvider } from "@torrevie/notifications";
import type {
  TexExpenseStatus,
  TexQuickConnectStatus,
  TexTripLegMode,
  TexTripLegStatus,
  TexWhatsappReceiptResult
} from "./types";

export type TexExpenseCategoryRow = {
  id: string;
  name: string;
  is_active: boolean;
  is_system: boolean;
  sort_order: number;
};

export type TexSpendPolicyRow = {
  id: string;
  category: string;
  daily_limit: number | null;
  monthly_limit: number | null;
  requires_notes_above: number | null;
  is_blocked: boolean;
};

export type TexBudgetRow = {
  id: string;
  department: string;
  month: number;
  year: number;
  budget_amount: number;
  spent_amount: number | null;
};

export type TexEmployeeProfileRow = {
  id: string;
  user_id: string | null;
  name: string;
  phone_number: string;
  department: string | null;
  monthly_salary: number;
  manager_user_id: string | null;
  manager_name: string | null;
  manager_email: string | null;
  submission_frequency: "realtime" | "daily" | "weekly" | "monthly";
  is_active: boolean;
};

export type TexManagerUserRow = {
  id: string;
  email: string;
  display_name: string | null;
  roles: string[];
};

export type TexTeamRow = {
  id: string;
  name: string;
  description: string | null;
  manager_employee_profile_id: string | null;
  manager_name: string | null;
  member_employee_profile_ids: string;
  member_names: string;
  member_count: number;
};

export type TexIntegrationSettingsRow = {
  whatsapp_provider: "ultramsg" | "wappfly" | "meta";
  whatsapp_instance_id: string | null;
  wappfly_session_id: string | null;
  meta_phone_number_id: string | null;
  meta_whatsapp_business_account_id: string | null;
  ai_receipt_extraction_enabled: boolean;
  duplicate_detection_enabled: boolean;
  duplicate_auto_reject_enabled: boolean;
  duplicate_similarity_threshold: number;
};

export type TexEmailNotificationSettingsRow = {
  email_notifications_enabled: boolean;
  email_report_frequency: "off" | "daily" | "weekly" | "monthly";
  email_report_recipients: string[] | null;
};

export type TexProviderProfileSummaryRow = {
  id: string;
  label: string;
  provider: "ultramsg" | "wappfly" | "meta";
  status: "active" | "inactive";
  is_default: boolean;
  webhook_url: string | null;
  api_key_last4: string | null;
  keys_configured: boolean;
};

export type TexQuickConnectSessionRow = {
  id: string;
  status: TexQuickConnectStatus;
  pairing_code: string | null;
  qr_code_data: string | null;
  qr_expires_at: string | null;
  connected_phone: string | null;
  connected_at: string | null;
  last_seen_at: string | null;
  error: string | null;
  updated_at: string;
};

export type TexQuickConnectEventRow = {
  id: string;
  event_type: string;
  direction: "inbound" | "outbound" | "system";
  status: string | null;
  message: string | null;
  occurred_at: string;
};

export type TexExpenseRow = {
  id: string;
  status: TexExpenseStatus;
  amount: number;
  currency: string;
};

export type TexExpenseListRow = TexExpenseRow & {
  employee_profile_id: string | null;
  employee_name: string | null;
  vendor: string | null;
  expense_date: string;
  category: string | null;
  trip_id: string | null;
  trip_name: string | null;
  notes: string | null;
  payment_method: string | null;
  tax_id_number: string | null;
  tax_amount: number | null;
  receipt_file_id: string | null;
  created_at: string;
  duplicate_status: "clear" | "suspected" | "duplicate";
  duplicate_reason: string | null;
  manager_review_required: boolean;
};

export type TexTripListRow = {
  id: string;
  name: string;
  description: string | null;
  trip_type: "general" | "logistics";
  origin: string | null;
  destination: string | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
  budget_amount: number | null;
  enforce_currency: boolean;
  enforced_currency: string | null;
  team_id: string | null;
  team_name: string | null;
  container_number: string | null;
  driver_employee_profile_id: string | null;
  driver_name: string | null;
  driver_trip_amount: number;
  subcontractor_driver_name: string | null;
  subcontractor_amount: number;
  driver_payout_status: string;
  leg_count: number;
  total_distance_km: number;
  expense_count: number;
  spend_amount: number;
};

export type TexTripLegRow = {
  id: string;
  sequence: number;
  origin: string;
  origin_place_id: string | null;
  origin_lat: number | null;
  origin_lng: number | null;
  origin_country: string | null;
  destination: string;
  destination_place_id: string | null;
  destination_lat: number | null;
  destination_lng: number | null;
  destination_country: string | null;
  mode: TexTripLegMode | null;
  status: TexTripLegStatus;
  planned_start: string | null;
  planned_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  distance_km: number | null;
  is_return_trip: boolean;
  return_distance_km: number | null;
  return_duration_seconds: number | null;
  total_distance_km: number | null;
  duration_seconds: number | null;
  distance_source: string | null;
  route_polyline: string | null;
  budget_amount: number | null;
  container_ref: string | null;
  notes: string | null;
};

export type TexFinanceExpenseRow = {
  id: string;
  employee_profile_id: string | null;
  employee_name: string | null;
  vendor: string | null;
  expense_date: string;
  amount: number;
  currency: string;
  base_amount: number;
  category: string | null;
  trip_name: string | null;
  notes: string | null;
  receipt_file_id: string | null;
  approved_at: string | null;
};

export type TexFinanceTripPayoutRow = {
  id: string;
  name: string;
  driver_employee_profile_id: string | null;
  driver_name: string | null;
  origin: string | null;
  destination: string | null;
  start_date: string | null;
  driver_trip_amount: number;
  subcontractor_driver_name: string | null;
  subcontractor_amount: number;
  total_amount: number;
};

export type TexReportExpenseRow = {
  id: string;
  employee_profile_id: string | null;
  employee_name: string | null;
  vendor: string | null;
  expense_date: string;
  amount: number;
  currency: string;
  base_amount: number;
  category: string | null;
  trip_id: string | null;
  trip_name: string | null;
  payment_method: string | null;
  source: string | null;
  status: TexExpenseStatus;
  policy_flag: boolean;
  tax_amount: number | null;
  tax_id_number: string | null;
  approved_at: string | null;
  paid_at: string | null;
  created_at: string;
};

export type TexFxRateRow = {
  id: string;
  rate_date: string;
  from_currency: string;
  to_currency: string;
  rate: number;
  source: string | null;
  is_manual_override: boolean;
};

export type TexCurrencyPegRow = {
  from_currency: string;
  to_currency: string;
  rate: number;
  effective_from: string;
  notes: string | null;
};

export type TexDriverAdvanceRow = {
  id: string;
  employee_profile_id: string;
  amount: number;
  currency: string;
  base_amount: number;
  advance_date: string;
  month: number;
  year: number;
  notes: string | null;
};

export type TexNotificationRow = {
  id: string;
  user_id: string | null;
  title: string;
  body: string | null;
  type: string | null;
  related_expense_id: string | null;
  related_trip_id: string | null;
  is_read: boolean;
  created_at: string;
};

export type TexWebhookSubmissionRow = {
  id: string;
  status: "open" | "resolved" | "ignored";
};

export type TexWhatsappNotificationSettingsRow = {
  whatsapp_provider: WhatsAppProvider;
  whatsapp_instance_id: string | null;
  wappfly_session_id: string | null;
  meta_phone_number_id: string | null;
  api_key: string | null;
};

export type TexWhatsappExpenseStatusReplyRow = {
  submission_id: string;
  sender_raw: string | null;
  sender_phone: string | null;
  whatsapp_chat_jid: string | null;
  session_id: string | null;
  payload: unknown;
  vendor: string | null;
  amount: number;
  currency: string;
  expense_date: string;
  rejected_reason: string | null;
};

export type TexUnregisteredWhatsappSubmissionRow = {
  id: string;
  sender_raw: string | null;
  sender_phone: string | null;
  whatsapp_chat_jid: string | null;
  message_id: string | null;
  session_id: string | null;
  message_text: string | null;
  receipt_file_id: string | null;
  media_url: string | null;
  media_mime_type: string | null;
  message_type: "receipt" | "status" | "text";
  ocr_status: TexWhatsappReceiptResult["ocrStatus"];
  ocr_result: unknown;
  ocr_error: string | null;
  payload: unknown;
  whatsapp_reply_text: string | null;
  status: "open" | "resolved" | "ignored";
  resolved_expense_id: string | null;
  resolved_employee_profile_id: string | null;
  resolved_at: string | null;
  created_at: string;
};

export type TexProcessingSettingsRow = {
  ai_receipt_extraction_enabled: boolean;
  duplicate_detection_enabled: boolean;
  duplicate_auto_reject_enabled: boolean;
  duplicate_similarity_threshold: number;
};

export type TexDuplicateCandidateRow = {
  id: string;
  employee_profile_id: string | null;
  employee_name: string | null;
  vendor: string | null;
  amount: number;
  currency: string;
  expense_date: string;
};

export type TexMembershipValidationRow = {
  membership_status: "active" | "invited" | "disabled";
  user_status: "active" | "deactivated";
};

export type TexTenantRow = {
  name: string | null;
};

export type TexRoleRow = {
  key: string;
};

export type TexProductRow = {
  key: string;
};

export type TexOnboardingStatusRow = {
  company_profile_completed_at: string | null;
  whatsapp_connected_at: string | null;
  first_employee_invited_at: string | null;
  first_receipt_received_at: string | null;
  first_expense_approved_at: string | null;
  dashboard_first_viewed_at: string | null;
  last_activity_at: string | null;
  ocr_pending_count: number;
  manual_review_count: number;
};

export type TexEmployeeLimitRow = {
  active_count: number;
  existing_phone: boolean;
};

export type TexPlanContextRow = {
  plan_key: string;
  plan_status: string;
  trial_start_date: string | null;
  trial_end_date: string | null;
  billing_status: string | null;
  renewal_date: string | null;
  billing_currency: string | null;
  billing_cancel_at_period_end: boolean | null;
  employee_limit: number | string | null;
  seat_count: number | string | null;
  whatsapp_provider_scope: string | null;
};
