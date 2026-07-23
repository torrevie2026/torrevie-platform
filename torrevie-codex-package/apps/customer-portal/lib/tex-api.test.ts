import { strict as assert } from "node:assert";
import type { QueryResult, QueryValue, TenantQueryClient } from "@torrevie/tenant-context";
import { handleTexApiRequest } from "./tex-api";
import {
  defaultTexPlanContext,
  setTexEmailNotificationDispatcherForTest,
  setTexWhatsappNotificationDispatcherForTest,
  type TexActorContext
} from "./tex";

setTexWhatsappNotificationDispatcherForTest(async (input) => ({
  ok: true,
  provider: input.provider,
  status: "sent",
  messageId: "test-whatsapp-message",
  error: null,
  httpStatus: 200
}));

setTexEmailNotificationDispatcherForTest(async () => ({
  ok: false,
  provider: "postmark",
  status: "skipped",
  messageId: null,
  error: "Postmark server token is not configured.",
  httpStatus: null
}));

const actor: TexActorContext = {
  tenantId: "00000000-0000-4000-8000-000000001001",
  userId: "00000000-0000-4000-8000-000000002001",
  roleScope: "customer",
  roles: ["customer_admin"],
  entitledProducts: ["tex"],
  texPlan: defaultTexPlanContext()
};

const integrationActor: TexActorContext = {
  ...actor,
  roles: ["integration_service"],
  integrationPermissions: ["tex.integration.manage"]
};

class RecordingTexApiClient implements TenantQueryClient {
  readonly calls: Array<{ sql: string; values: readonly QueryValue[] }> = [];

  async query<Row>(sql: string, values: readonly QueryValue[] = []): Promise<QueryResult<Row>> {
    this.calls.push({ sql, values });

    if (sql.includes("as employee_profiles") && sql.includes("as integration_settings")) {
      return {
        rows: [
          {
            categories: [
              {
                id: "00000000-0000-4000-8000-000000003001",
                name: "Meals",
                is_active: true,
                is_system: true,
                sort_order: 10
              }
            ],
            employee_profiles: [
              {
                id: "00000000-0000-4000-8000-000000004001",
                user_id: null,
                name: "Maya Haddad",
                phone_number: "+971500000001",
                department: "Operations",
                monthly_salary: 12000,
                manager_user_id: "00000000-0000-4000-8000-000000002002",
                manager_name: "Omar Faris",
                manager_email: "omar@example.test",
                submission_frequency: "weekly",
                is_active: true
              }
            ],
            manager_users: [
              {
                id: "00000000-0000-4000-8000-000000002002",
                email: "omar@example.test",
                display_name: "Omar Faris",
                roles: ["customer_manager"]
              }
            ],
            teams: [
              {
                id: "00000000-0000-4000-8000-000000005001",
                name: "Ops",
                description: "Operations",
                manager_employee_profile_id: "00000000-0000-4000-8000-000000004001",
                manager_name: "Maya Haddad",
                member_employee_profile_ids: "00000000-0000-4000-8000-000000004001",
                member_names: "Maya Haddad",
                member_count: 1
              }
            ],
            integration_settings: {
              whatsapp_provider: "wappfly",
              whatsapp_instance_id: null,
              wappfly_session_id: "session-a",
              meta_phone_number_id: null,
              meta_whatsapp_business_account_id: null,
              ai_receipt_extraction_enabled: true,
              duplicate_detection_enabled: true,
              duplicate_auto_reject_enabled: false,
              duplicate_similarity_threshold: 0.92
            }
          }
        ] as Row[]
      };
    }

    if (sql.includes("insert into public.tex_expense_categories")) {
      return {
        rows: [
          {
            id: "00000000-0000-4000-8000-000000003002",
            name: values[0],
            is_active: values[1],
            is_system: false,
            sort_order: values[2]
          }
        ] as Row[]
      };
    }

    if (sql.includes("update public.tex_expense_categories")) {
      return {
        rows: [
          {
            id: values[4],
            name: values[0],
            is_active: values[1],
            is_system: false,
            sort_order: values[2]
          }
        ] as Row[]
      };
    }

    if (sql.includes("delete from public.tex_expense_categories")) {
      return {
        rows: [
          {
            id: values[0],
            name: "Meals"
          }
        ] as Row[]
      };
    }

    if (sql.includes("from public.tex_expense_categories")) {
      return {
        rows: [
          {
            id: "00000000-0000-4000-8000-000000003001",
            name: "Meals",
            is_active: true,
            is_system: true,
            sort_order: 10
          }
        ] as Row[]
      };
    }

    if (sql.includes("from public.tex_spend_policies")) {
      return {
        rows: [
          {
            id: "00000000-0000-4000-8000-000000013001",
            category: "Meals",
            daily_limit: 100,
            monthly_limit: 1000,
            requires_notes_above: 75,
            is_blocked: false
          }
        ] as Row[]
      };
    }

    if (sql.includes("insert into public.tex_spend_policies")) {
      return {
        rows: [
          {
            id: "00000000-0000-4000-8000-000000013001",
            category: values[0],
            daily_limit: values[1],
            monthly_limit: values[2],
            requires_notes_above: values[3],
            is_blocked: values[4]
          }
        ] as Row[]
      };
    }

    if (sql.includes("from public.tex_budgets b")) {
      return {
        rows: [
          {
            id: "00000000-0000-4000-8000-000000014001",
            department: "Logistics",
            month: values[0],
            year: values[1],
            budget_amount: 5000,
            spent_amount: 1200
          }
        ] as Row[]
      };
    }

    if (sql.includes("insert into public.tex_budgets")) {
      return {
        rows: [
          {
            id: "00000000-0000-4000-8000-000000014001",
            department: values[0],
            month: values[1],
            year: values[2],
            budget_amount: values[3],
            spent_amount: 0
          }
        ] as Row[]
      };
    }

    if (sql.includes("delete from public.tex_budgets")) {
      return {
        rows: [
          {
            id: values[0],
            department: "Logistics"
          }
        ] as Row[]
      };
    }

    if (sql.includes("select distinct department")) {
      return {
        rows: [{ department: "Logistics" }] as Row[]
      };
    }

    if (sql.includes("with report_periods as") && sql.includes("from report_periods rp")) {
      return {
        rows: [
          {
            report_period: "current",
            id: "00000000-0000-4000-8000-000000006001",
            employee_profile_id: "00000000-0000-4000-8000-000000004001",
            employee_name: "Maya Haddad",
            vendor: "Airport Cafe",
            expense_date: values[0],
            amount: 120,
            currency: "AED",
            base_amount: 120,
            category: "Meals",
            trip_id: null,
            trip_name: null,
            payment_method: "personal",
            source: "web",
            status: "approved",
            policy_flag: false,
            tax_amount: null,
            tax_id_number: null,
            approved_at: "2026-07-12T10:00:00.000Z",
            paid_at: null,
            created_at: "2026-07-12T09:00:00.000Z"
          },
          {
            report_period: "previous",
            id: "00000000-0000-4000-8000-000000006002",
            employee_profile_id: "00000000-0000-4000-8000-000000004001",
            employee_name: "Maya Haddad",
            vendor: "Airport Cafe",
            expense_date: values[2],
            amount: 80,
            currency: "AED",
            base_amount: 80,
            category: "Meals",
            trip_id: null,
            trip_name: null,
            payment_method: "personal",
            source: "web",
            status: "approved",
            policy_flag: false,
            tax_amount: null,
            tax_id_number: null,
            approved_at: "2026-06-12T10:00:00.000Z",
            paid_at: null,
            created_at: "2026-06-12T09:00:00.000Z"
          }
        ] as Row[]
      };
    }

    if (sql.includes("from public.tex_employee_profiles") && sql.includes("order by ep.name asc")) {
      return {
        rows: [
          {
            id: "00000000-0000-4000-8000-000000004001",
            user_id: null,
            name: "Maya Haddad",
            phone_number: "+971500000001",
            department: "Operations",
            monthly_salary: 12000,
            manager_user_id: "00000000-0000-4000-8000-000000002002",
            manager_name: "Omar Faris",
            manager_email: "omar@example.test",
            submission_frequency: "weekly",
            is_active: true,
            phone_digits: "971500000001"
          }
        ] as Row[]
      };
    }

    if (
      sql.includes("from public.tex_employee_profiles ep") &&
      sql.includes("ep.is_active = true") &&
      sql.includes("regexp_replace(ep.phone_number")
    ) {
      return {
        rows: [
          {
            id: "00000000-0000-4000-8000-000000004001",
            user_id: null,
            name: "Maya Haddad",
            phone_number: "+971500000001",
            department: "Operations",
            monthly_salary: 12000,
            manager_user_id: "00000000-0000-4000-8000-000000002002",
            manager_name: null,
            manager_email: null,
            submission_frequency: "weekly",
            is_active: true,
            phone_digits: "971500000001"
          }
        ] as Row[]
      };
    }

    if (
      sql.includes("from public.tex_employee_profiles") &&
      sql.includes("and id = $1") &&
      sql.includes("limit 1")
    ) {
      return {
        rows: [{ id: values[0] }] as Row[]
      };
    }

    if (sql.includes("from public.tex_teams")) {
      return {
        rows: [
          {
            id: "00000000-0000-4000-8000-000000005001",
            name: "Ops",
            description: "Operations",
            manager_employee_profile_id: "00000000-0000-4000-8000-000000004001",
            manager_name: "Maya Haddad",
            member_employee_profile_ids: "00000000-0000-4000-8000-000000004001",
            member_names: "Maya Haddad",
            member_count: 1
          }
        ] as Row[]
      };
    }

    if (sql.includes("from public.tex_fx_rates")) {
      return {
        rows: [
          {
            id: "00000000-0000-4000-8000-000000017001",
            rate_date: "2026-07-14",
            from_currency: "EUR",
            to_currency: "USD",
            rate: 0.91,
            source: "live",
            is_manual_override: false
          }
        ] as Row[]
      };
    }

    if (sql.includes("from public.tex_currency_pegs")) {
      return {
        rows: [
          {
            from_currency: "AED",
            to_currency: "USD",
            rate: 0.272294,
            effective_from: "1997-11-01",
            notes: "UAE dirham fixed peg"
          }
        ] as Row[]
      };
    }

    if (
      sql.includes("from public.tenants") &&
      sql.includes("logo_storage_path") &&
      sql.includes("logo_updated_at") &&
      !sql.includes("update public.tenants")
    ) {
      return {
        rows: [
          {
            name: "SEK Demo",
            logo_storage_path:
              "tenant/00000000-0000-4000-8000-000000001001/tex/logos/company-logo.png",
            logo_updated_at: "2026-07-23T09:00:00.000Z"
          }
        ] as Row[]
      };
    }

    if (sql.includes("insert into public.tex_fx_rates")) {
      return {
        rows: [{ id: "00000000-0000-4000-8000-000000017002" }] as Row[]
      };
    }

    if (sql.includes("api_secret.secret_value as api_key")) {
      return {
        rows: [
          {
            whatsapp_provider: "wappfly",
            whatsapp_instance_id: null,
            wappfly_session_id: "session-a",
            meta_phone_number_id: null,
            api_key: "test-api-key"
          }
        ] as Row[]
      };
    }

    if (sql.includes("email_notifications_enabled") && sql.includes("email_report_recipients")) {
      return {
        rows: [
          {
            email_notifications_enabled: true,
            email_report_frequency: "weekly",
            email_report_recipients: ["finance@example.test"]
          }
        ] as Row[]
      };
    }

    if (sql.includes("from public.tex_integration_settings")) {
      return {
        rows: [
          {
            whatsapp_provider: "wappfly",
            whatsapp_instance_id: null,
            wappfly_session_id: "session-a",
            meta_phone_number_id: null,
            ai_receipt_extraction_enabled: true,
            duplicate_detection_enabled: true,
            duplicate_auto_reject_enabled: false,
            duplicate_similarity_threshold: 0.92
          }
        ] as Row[]
      };
    }

    if (sql.includes("from public.tenant_whatsapp_provider_profiles")) {
      return {
        rows: [
          {
            id: "00000000-0000-4000-8000-000000015001",
            label: "Primary Wappfly",
            provider: "wappfly",
            status: "active",
            is_default: true,
            webhook_url: "https://app.torrevie.com/api/tex/webhooks/wappfly",
            api_key_last4: "1234",
            keys_configured: true
          }
        ] as Row[]
      };
    }

    if (
      sql.includes("from public.tenant_memberships tm") &&
      sql.includes("join public.users u") &&
      sql.includes("array_agg")
    ) {
      return {
        rows: [
          {
            id: "00000000-0000-4000-8000-000000002002",
            email: "omar@example.test",
            display_name: "Omar Faris",
            roles: ["customer_manager"]
          }
        ] as Row[]
      };
    }

    if (
      sql.includes("from public.tenant_memberships tm") &&
      sql.includes("join public.users u") &&
      sql.includes("select u.id") &&
      sql.includes("tm.user_id = $1")
    ) {
      return {
        rows: [{ id: values[0] }] as Row[]
      };
    }

    if (sql.includes("from public.tex_notifications")) {
      return {
        rows: [
          {
            id: "00000000-0000-4000-8000-000000010001",
            user_id: actor.userId,
            title: "Expense approved",
            body: "Airport Cafe was approved.",
            type: "expense",
            related_expense_id: "00000000-0000-4000-8000-000000006001",
            related_trip_id: null,
            is_read: false,
            created_at: "2026-07-12T10:00:00.000Z"
          }
        ] as Row[]
      };
    }

    if (
      sql.includes("from public.tex_unregistered_whatsapp_submissions") &&
      sql.includes("order by created_at desc")
    ) {
      return {
        rows: [
          {
            id: "00000000-0000-4000-8000-000000012001",
            sender_raw: "971500000001@s.whatsapp.net",
            sender_phone: "+971500000001",
            whatsapp_chat_jid: "971500000001@s.whatsapp.net",
            message_id: "wamid.review",
            session_id: "session-a",
            message_text: "Receipt",
            receipt_file_id: null,
            media_url: null,
            media_mime_type: null,
            message_type: "receipt",
            ocr_status: "manual_review",
            ocr_result: {},
            ocr_error: null,
            whatsapp_reply_text: "Receipt received.",
            status: "open",
            resolved_expense_id: null,
            resolved_employee_profile_id: null,
            resolved_at: null,
            created_at: "2026-07-12T10:00:00.000Z"
          }
        ] as Row[]
      };
    }

    if (
      sql.includes("from public.tex_unregistered_whatsapp_submissions") &&
      sql.includes("limit 1")
    ) {
      return {
        rows: [
          {
            id: values[0],
            sender_raw: "971500000001@s.whatsapp.net",
            sender_phone: "+971500000001",
            whatsapp_chat_jid: "971500000001@s.whatsapp.net",
            message_id: "wamid.review",
            session_id: "session-a",
            message_text: "Receipt",
            receipt_file_id: null,
            media_url: null,
            media_mime_type: null,
            message_type: "receipt",
            ocr_status: "extracted",
            ocr_result: {
              vendor: "Airport Cafe",
              expenseDate: "2026-07-12",
              amount: 120,
              currency: "AED",
              category: "Meals",
              taxAmount: null,
              taxIdNumber: null,
              confidence: 0.9,
              notes: null
            },
            ocr_error: null,
            whatsapp_reply_text: "Receipt received.",
            status: "open",
            resolved_expense_id: null,
            resolved_employee_profile_id: null,
            resolved_at: null,
            created_at: "2026-07-12T10:00:00.000Z"
          }
        ] as Row[]
      };
    }

    if (sql.includes("insert into public.tex_employee_profiles")) {
      return {
        rows: [
          {
            id: "00000000-0000-4000-8000-000000004002",
            user_id: null,
            name: values[0],
            phone_number: values[1],
            department: values[2],
            monthly_salary: values[3],
            manager_user_id: values[4],
            manager_name: null,
            manager_email: null,
            submission_frequency: values[5],
            is_active: values[6]
          }
        ] as Row[]
      };
    }

    if (sql.includes("update public.tex_employee_profiles")) {
      return {
        rows: [
          {
            id: values[0],
            user_id: null,
            name: values[1],
            phone_number: values[2],
            department: values[3],
            monthly_salary: values[4],
            manager_user_id: values[5],
            manager_name: null,
            manager_email: null,
            submission_frequency: values[6],
            is_active: values[7]
          }
        ] as Row[]
      };
    }

    if (sql.includes("insert into public.tex_teams")) {
      return {
        rows: [
          {
            id: "00000000-0000-4000-8000-000000005002",
            name: values[0],
            description: values[1],
            manager_employee_profile_id: values[2],
            manager_name: null,
            member_employee_profile_ids: "",
            member_names: "",
            member_count: 0
          }
        ] as Row[]
      };
    }

    if (sql.includes("update public.tex_teams")) {
      return {
        rows: [
          {
            id: values[0],
            name: values[1]
          }
        ] as Row[]
      };
    }

    if (sql.includes("delete from public.tex_teams")) {
      return {
        rows: [
          {
            id: values[0],
            name: "Ops"
          }
        ] as Row[]
      };
    }

    if (sql.includes("insert into public.tex_team_members")) {
      return { rows: [] };
    }

    if (sql.includes("delete from public.tex_employee_profiles")) {
      return {
        rows: [
          {
            id: values[0],
            name: "New Driver"
          }
        ] as Row[]
      };
    }

    if (sql.includes("insert into public.tex_notifications")) {
      return {
        rows: [
          {
            id: "00000000-0000-4000-8000-000000010002",
            user_id: values[0],
            title: values[1],
            body: values[2],
            type: values[3],
            related_expense_id: values[4],
            related_trip_id: values[5],
            is_read: false,
            created_at: "2026-07-12T10:00:00.000Z"
          }
        ] as Row[]
      };
    }

    if (sql.includes("update public.tex_notifications")) {
      return {
        rows: [
          {
            id: sql.includes("and id = $2") ? values[1] : "00000000-0000-4000-8000-000000010001",
            user_id: actor.userId,
            title: "Expense approved",
            body: "Airport Cafe was approved.",
            type: "expense",
            related_expense_id: "00000000-0000-4000-8000-000000006001",
            related_trip_id: null,
            is_read: true,
            created_at: "2026-07-12T10:00:00.000Z"
          }
        ] as Row[]
      };
    }

    if (sql.includes("insert into public.tex_expenses") && sql.includes("'whatsapp'")) {
      return {
        rows: [
          {
            id: "00000000-0000-4000-8000-000000006002",
            status: "pending",
            amount: values[7],
            currency: values[8]
          }
        ] as Row[]
      };
    }

    if (sql.includes("insert into public.tex_expenses")) {
      return {
        rows: [
          {
            id: "00000000-0000-4000-8000-000000006001",
            status: "pending",
            amount: values[4],
            currency: values[5]
          }
        ] as Row[]
      };
    }

    if (sql.includes("update public.tex_unregistered_whatsapp_submissions")) {
      return {
        rows: [
          {
            id: values.includes("00000000-0000-4000-8000-000000012001")
              ? "00000000-0000-4000-8000-000000012001"
              : values[1],
            status: sql.includes("status = 'ignored'") ? "ignored" : "resolved"
          }
        ] as Row[]
      };
    }

    if (sql.includes("from public.tex_expenses e") && sql.includes("order by e.created_at desc")) {
      return {
        rows: [
          {
            id: "00000000-0000-4000-8000-000000006001",
            employee_name: "Maya Haddad",
            vendor: "Airport Cafe",
            expense_date: "2026-07-12",
            amount: 120,
            currency: "AED",
            category: "Meals",
            trip_name: "Dubai run",
            notes: "Lunch",
            status: "pending",
            created_at: "2026-07-12T10:00:00.000Z",
            duplicate_status: "clear",
            duplicate_reason: null,
            manager_review_required: false
          }
        ] as Row[]
      };
    }

    if (sql.includes("from public.tex_expenses e") && sql.includes("e.status = 'approved'")) {
      return {
        rows: [
          {
            id: "00000000-0000-4000-8000-000000006001",
            employee_profile_id: "00000000-0000-4000-8000-000000004001",
            employee_name: "Maya Haddad",
            vendor: "Airport Cafe",
            expense_date: "2026-07-12",
            amount: 120,
            currency: "AED",
            base_amount: 120,
            category: "Meals",
            trip_name: "Dubai run",
            notes: "Lunch",
            approved_at: "2026-07-12T10:00:00.000Z"
          }
        ] as Row[]
      };
    }

    if (
      sql.includes("from public.tex_trips t") &&
      sql.includes("driver_payout_status = 'unpaid'")
    ) {
      return {
        rows: [
          {
            id: "00000000-0000-4000-8000-000000008001",
            name: "Dubai run",
            driver_employee_profile_id: "00000000-0000-4000-8000-000000004001",
            driver_name: "Maya Haddad",
            origin: "Dubai",
            destination: "Abu Dhabi",
            start_date: "2026-07-12",
            driver_trip_amount: 250,
            subcontractor_driver_name: null,
            subcontractor_amount: 0,
            total_amount: 250
          }
        ] as Row[]
      };
    }

    if (sql.includes("from public.tex_trips") && sql.includes("budget_amount::float")) {
      return {
        rows: [
          {
            id: "00000000-0000-4000-8000-000000008001",
            name: "Dubai run",
            description: "Port delivery",
            trip_type: "logistics",
            origin: "Dubai",
            destination: "Abu Dhabi",
            status: "open",
            start_date: "2026-07-12",
            end_date: null,
            budget_amount: 1500,
            enforce_currency: true,
            enforced_currency: "AED",
            team_id: null,
            team_name: null,
            container_number: "MSKU123",
            driver_employee_profile_id: null,
            driver_name: null,
            driver_trip_amount: 250,
            subcontractor_driver_name: null,
            subcontractor_amount: 0,
            driver_payout_status: "unpaid",
            leg_count: 1,
            total_distance_km: 210,
            expense_count: 2,
            spend_amount: 300
          }
        ] as Row[]
      };
    }

    if (sql.includes("update public.tex_trips") && sql.includes("status = 'closed'")) {
      return {
        rows: [
          {
            id: values[1],
            name: "Dubai run",
            description: "Port delivery",
            trip_type: "logistics",
            origin: "Dubai",
            destination: "Abu Dhabi",
            status: "closed",
            start_date: "2026-07-12",
            end_date: null,
            budget_amount: 1500,
            enforce_currency: true,
            enforced_currency: "AED",
            team_id: null,
            team_name: null,
            container_number: "MSKU123",
            driver_employee_profile_id: null,
            driver_name: null,
            driver_trip_amount: 250,
            subcontractor_driver_name: null,
            subcontractor_amount: 0,
            driver_payout_status: "unpaid",
            leg_count: 1,
            total_distance_km: 210,
            expense_count: 0,
            spend_amount: 0
          }
        ] as Row[]
      };
    }

    if (sql.includes("insert into public.tex_trips") || sql.includes("update public.tex_trips")) {
      return {
        rows: [
          {
            id: sql.includes("insert into public.tex_trips")
              ? "00000000-0000-4000-8000-000000008001"
              : values[18],
            name: values[0] ?? "Dubai run",
            description: values[1] ?? null,
            trip_type: values[2] ?? "general",
            origin: values[3] ?? null,
            destination: values[4] ?? null,
            status: "open",
            start_date: values[6] ?? null,
            end_date: values[7] ?? null,
            budget_amount: values[5] ?? null,
            enforce_currency: values[8] ?? false,
            enforced_currency: values[9] ?? null,
            team_id: values[10] ?? null,
            team_name: null,
            container_number: values[11] ?? null,
            driver_employee_profile_id: values[12] ?? null,
            driver_name: null,
            driver_trip_amount: values[13] ?? 0,
            subcontractor_driver_name: values[14] ?? null,
            subcontractor_amount: values[15] ?? 0,
            driver_payout_status: "unpaid",
            leg_count: 0,
            total_distance_km: 0,
            expense_count: 0,
            spend_amount: 0
          }
        ] as Row[]
      };
    }

    if (sql.includes("insert into public.tex_driver_advances")) {
      return {
        rows: [
          {
            id: "00000000-0000-4000-8000-000000011001",
            employee_profile_id: values[0],
            amount: values[1],
            currency: values[2],
            base_amount: values[3],
            advance_date: values[4],
            month: values[5],
            year: values[6],
            notes: values[7]
          }
        ] as Row[]
      };
    }

    if (sql.includes("delete from public.tex_driver_advances")) {
      return {
        rows: [
          {
            id: values[0],
            employee_profile_id: "00000000-0000-4000-8000-000000004001"
          }
        ] as Row[]
      };
    }

    if (sql.includes("update public.tex_expenses") && sql.includes("status = 'paid'")) {
      return {
        rows: [
          {
            id: "00000000-0000-4000-8000-000000006001"
          }
        ] as Row[]
      };
    }

    if (sql.includes("update public.tex_trips") && sql.includes("driver_payout_status = 'paid'")) {
      return {
        rows: [
          {
            id: "00000000-0000-4000-8000-000000008001"
          }
        ] as Row[]
      };
    }

    if (sql.includes("update public.tex_expenses") && sql.includes("employee_profile_id = $1")) {
      return {
        rows: [
          {
            id: values[16],
            status: "pending",
            amount: values[3],
            currency: values[4]
          }
        ] as Row[]
      };
    }

    if (sql.includes("update public.tex_expenses")) {
      return {
        rows: [
          {
            id: values[3],
            status: values[0],
            amount: 120,
            currency: "AED"
          }
        ] as Row[]
      };
    }

    if (sql.includes("insert into public.tex_unregistered_whatsapp_submissions")) {
      return {
        rows: [
          {
            id: "00000000-0000-4000-8000-000000007001",
            status: "open"
          }
        ] as Row[]
      };
    }

    if (sql.includes("from public.tex_trips") && sql.includes("limit 1")) {
      return { rows: [{ id: "00000000-0000-4000-8000-000000008001" }] as Row[] };
    }

    if (sql.includes("from public.tex_trip_legs") && sql.includes("order by sequence")) {
      return {
        rows: [
          {
            id: "00000000-0000-4000-8000-000000009001",
            sequence: 1,
            origin: "Jebel Ali",
            origin_place_id: null,
            origin_lat: null,
            origin_lng: null,
            origin_country: "AE",
            destination: "Riyadh",
            destination_place_id: null,
            destination_lat: null,
            destination_lng: null,
            destination_country: "SA",
            mode: "road",
            status: "planned",
            planned_start: "2026-07-12",
            planned_end: null,
            actual_start: null,
            actual_end: null,
            distance_km: 105,
            is_return_trip: true,
            return_distance_km: 105,
            return_duration_seconds: null,
            total_distance_km: 210,
            duration_seconds: null,
            distance_source: "manual",
            route_polyline: null,
            budget_amount: 700,
            container_ref: "MSKU123",
            notes: null
          }
        ] as Row[]
      };
    }

    if (
      sql.includes("insert into public.tex_trip_legs") ||
      sql.includes("update public.tex_trip_legs")
    ) {
      return {
        rows: [
          {
            id: "00000000-0000-4000-8000-000000009001"
          }
        ] as Row[]
      };
    }

    if (sql.includes("update public.tenants") && sql.includes("logo_storage_path")) {
      return {
        rows: [
          {
            name: "SEK Demo",
            logo_storage_path: values[0] ?? null,
            logo_content_type: values[1] ?? null,
            logo_updated_at: "2026-07-23T09:00:00.000Z"
          }
        ] as Row[]
      };
    }

    if (
      sql.includes("update public.user_profiles") &&
      sql.includes("tex_first_run_tutorial_dismissed_at")
    ) {
      return {
        rows: [
          {
            tex_first_run_tutorial_dismissed_at: "2026-07-23T15:30:00.000Z"
          }
        ] as Row[]
      };
    }

    return { rows: [] };
  }

  hasSql(fragment: string) {
    return this.calls.some((call) => call.sql.includes(fragment));
  }

  valuesContain(value: QueryValue) {
    return this.calls.some((call) => call.values.includes(value));
  }
}

async function main() {
  {
    const client = new RecordingTexApiClient();
    const response = await handleTexApiRequest(client, actor, {
      method: "GET",
      path: "/bootstrap"
    });
    assert.equal(response.status, 200);
    assert.equal(client.hasSql("from public.tex_expense_categories"), true);
  }

  {
    const client = new RecordingTexApiClient();
    const response = await handleTexApiRequest(client, actor, {
      method: "POST",
      path: "/tutorial/dismiss"
    });
    assert.equal(response.status, 200);
    assert.equal(client.hasSql("update public.user_profiles"), true);
    assert.equal(client.valuesContain("tex.tutorial.dismissed"), true);
  }

  {
    const client = new RecordingTexApiClient();
    const response = await handleTexApiRequest(client, actor, {
      method: "GET",
      path: "/expenses"
    });
    assert.equal(response.status, 200);
    assert.match(JSON.stringify(response.body), /Airport Cafe/);
    assert.equal(client.hasSql("from public.tex_expenses e"), true);
  }

  {
    const client = new RecordingTexApiClient();
    const response = await handleTexApiRequest(client, actor, {
      method: "POST",
      path: "/expenses",
      body: {
        expenseDate: "2026-07-12",
        amount: 120,
        currency: "AED"
      }
    });
    assert.equal(response.status, 201);
    assert.equal(client.hasSql("insert into public.tex_expenses"), true);
    assert.equal(client.valuesContain("tex.expense.created"), true);
  }

  {
    const client = new RecordingTexApiClient();
    const response = await handleTexApiRequest(client, actor, {
      method: "PATCH",
      path: "/expenses/00000000-0000-4000-8000-000000006001",
      body: {
        employeeProfileId: "00000000-0000-4000-8000-000000004001",
        vendor: "Fuel Station",
        expenseDate: "2026-07-13",
        amount: 155.5,
        currency: "AED",
        category: "Fuel",
        notes: "Corrected from receipt review"
      }
    });
    assert.equal(response.status, 200);
    assert.equal(client.hasSql("employee_profile_id = $1"), true);
    assert.equal(client.valuesContain("tex.expense.updated"), true);
  }

  {
    const client = new RecordingTexApiClient();
    const response = await handleTexApiRequest(client, actor, {
      method: "PATCH",
      path: "/expenses/00000000-0000-4000-8000-000000006001/status",
      body: {
        status: "approved"
      }
    });
    assert.equal(response.status, 200);
    assert.equal(client.hasSql("update public.tex_expenses"), true);
    assert.equal(client.valuesContain("tex.expense.approved"), true);
  }

  {
    const client = new RecordingTexApiClient();
    const response = await handleTexApiRequest(client, actor, {
      method: "GET",
      path: "/trips"
    });
    assert.equal(response.status, 200);
    assert.match(JSON.stringify(response.body), /Dubai run/);
    assert.match(JSON.stringify(response.body), /legCount/);
    assert.equal(client.hasSql("from public.tex_trips"), true);
  }

  {
    const client = new RecordingTexApiClient();
    const response = await handleTexApiRequest(client, actor, {
      method: "GET",
      path: "/trips/00000000-0000-4000-8000-000000008001/legs"
    });
    assert.equal(response.status, 200);
    assert.match(JSON.stringify(response.body), /Jebel Ali/);
  }

  {
    const client = new RecordingTexApiClient();
    const previousKey = process.env.GOOGLE_MAPS_API_KEY;
    const previousFetch = globalThis.fetch;
    process.env.GOOGLE_MAPS_API_KEY = "test-google-key";
    let callCount = 0;
    globalThis.fetch = async () => {
      callCount += 1;
      return new Response(
        JSON.stringify({
          routes: [
            {
              distanceMeters: callCount === 1 ? 105000 : 106000,
              duration: callCount === 1 ? "7200s" : "7500s",
              polyline: { encodedPolyline: "encoded" }
            }
          ]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    };
    const response = await handleTexApiRequest(client, actor, {
      method: "POST",
      path: "/trips/00000000-0000-4000-8000-000000008001/legs/estimate",
      body: {
        origin: "Jebel Ali",
        destination: "Riyadh",
        returnToOrigin: true
      }
    });
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) {
      delete process.env.GOOGLE_MAPS_API_KEY;
    } else {
      process.env.GOOGLE_MAPS_API_KEY = previousKey;
    }
    assert.equal(response.status, 200);
    assert.match(JSON.stringify(response.body), /211/);
    assert.equal(callCount, 2);
  }

  {
    const client = new RecordingTexApiClient();
    const previousKey = process.env.GOOGLE_MAPS_API_KEY;
    const previousFetch = globalThis.fetch;
    process.env.GOOGLE_MAPS_API_KEY = "test-google-key";
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          suggestions: [
            {
              placePrediction: {
                placeId: "places/hamriya",
                text: { text: "Hamriya Port, Sharjah, United Arab Emirates" }
              }
            }
          ]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    const response = await handleTexApiRequest(client, actor, {
      method: "GET",
      path: "/places",
      query: { input: "Hamriya" }
    });
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) {
      delete process.env.GOOGLE_MAPS_API_KEY;
    } else {
      process.env.GOOGLE_MAPS_API_KEY = previousKey;
    }
    assert.equal(response.status, 200);
    assert.match(JSON.stringify(response.body), /configured/);
    assert.match(JSON.stringify(response.body), /Hamriya Port/);
  }

  {
    const client = new RecordingTexApiClient();
    const previousKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    const previousFetch = globalThis.fetch;
    delete process.env.GOOGLE_MAPS_API_KEY;
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = "test-public-google-key";
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          suggestions: [
            {
              placePrediction: {
                placeId: "places/gpi",
                text: { text: "GPI DIP, Dubai, United Arab Emirates" }
              }
            }
          ]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    const response = await handleTexApiRequest(client, actor, {
      method: "GET",
      path: "/places",
      query: { input: "GPI DIP" }
    });
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) {
      delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    } else {
      process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = previousKey;
    }
    assert.equal(response.status, 200);
    assert.match(JSON.stringify(response.body), /GPI DIP/);
  }

  {
    const client = new RecordingTexApiClient();
    const previousKey = process.env.GOOGLE_MAPS_API_KEY;
    const previousFetch = globalThis.fetch;
    process.env.GOOGLE_MAPS_API_KEY = "test-google-key";
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          suggestions: [
            {
              placePrediction: {
                placeId: "places/airport",
                text: { text: "Dubai International Airport" }
              }
            }
          ]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    const response = await handleTexApiRequest(client, actor, {
      method: "POST",
      path: "/maps/places/autocomplete",
      body: { input: "Dubai airport" }
    });
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) {
      delete process.env.GOOGLE_MAPS_API_KEY;
    } else {
      process.env.GOOGLE_MAPS_API_KEY = previousKey;
    }
    assert.equal(response.status, 200);
    assert.match(JSON.stringify(response.body), /Dubai International Airport/);
    assert.match(JSON.stringify(response.body), /place_id/);
  }

  {
    const client = new RecordingTexApiClient();
    const previousKeys = {
      GOOGLE_MAPS_API_KEY: process.env.GOOGLE_MAPS_API_KEY,
      GOOGLE_MAPS_PLATFORM_KEY: process.env.GOOGLE_MAPS_PLATFORM_KEY,
      NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY,
      NEXT_PUBLIC_GOOGLE_MAPS_PLATFORM_KEY: process.env.NEXT_PUBLIC_GOOGLE_MAPS_PLATFORM_KEY,
      VITE_GOOGLE_MAPS_API_KEY: process.env.VITE_GOOGLE_MAPS_API_KEY,
      VITE_GOOGLE_MAPS_PLATFORM_KEY: process.env.VITE_GOOGLE_MAPS_PLATFORM_KEY,
      GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
      GOOGLE_AI_KEY: process.env.GOOGLE_AI_KEY
    };
    delete process.env.GOOGLE_MAPS_API_KEY;
    delete process.env.GOOGLE_MAPS_PLATFORM_KEY;
    delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_PLATFORM_KEY;
    delete process.env.VITE_GOOGLE_MAPS_API_KEY;
    delete process.env.VITE_GOOGLE_MAPS_PLATFORM_KEY;
    delete process.env.GOOGLE_API_KEY;
    delete process.env.GOOGLE_AI_KEY;
    const response = await handleTexApiRequest(client, actor, {
      method: "GET",
      path: "/places",
      query: { input: "Hamriya" }
    });
    for (const [key, value] of Object.entries(previousKeys)) {
      if (value !== undefined) {
        process.env[key] = value;
      }
    }
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { configured: false, places: [] });
  }

  {
    const client = new RecordingTexApiClient();
    const response = await handleTexApiRequest(client, actor, {
      method: "PUT",
      path: "/trips/00000000-0000-4000-8000-000000008001/legs",
      body: {
        legs: [
          {
            origin: "Jebel Ali",
            destination: "Riyadh",
            mode: "road",
            distanceKm: 105,
            isReturnTrip: true
          }
        ]
      }
    });
    assert.equal(response.status, 200);
    assert.equal(client.valuesContain("tex.trip.legs_updated"), true);
  }

  {
    const client = new RecordingTexApiClient();
    const response = await handleTexApiRequest(client, actor, {
      method: "DELETE",
      path: "/trips/00000000-0000-4000-8000-000000008001/legs/00000000-0000-4000-8000-000000009001"
    });
    assert.equal(response.status, 200);
    assert.equal(client.valuesContain("tex.trip.leg_deleted"), true);
  }

  {
    const client = new RecordingTexApiClient();
    const response = await handleTexApiRequest(client, actor, {
      method: "POST",
      path: "/trips",
      body: {
        name: "Dubai run",
        origin: "Dubai",
        destination: "Abu Dhabi"
      }
    });
    assert.equal(response.status, 201);
    assert.equal(client.hasSql("insert into public.tex_trips"), true);
    assert.equal(client.valuesContain("tex.trip.created"), true);
  }

  {
    const client = new RecordingTexApiClient();
    const response = await handleTexApiRequest(client, actor, {
      method: "PATCH",
      path: "/trips/00000000-0000-4000-8000-000000008001",
      body: {
        name: "Dubai run updated",
        origin: "Dubai",
        destination: "Sharjah"
      }
    });
    assert.equal(response.status, 200);
    assert.equal(client.hasSql("update public.tex_trips"), true);
    assert.equal(client.valuesContain("tex.trip.updated"), true);
  }

  {
    const client = new RecordingTexApiClient();
    const response = await handleTexApiRequest(client, actor, {
      method: "PATCH",
      path: "/trips/00000000-0000-4000-8000-000000008001/close"
    });
    assert.equal(response.status, 200);
    assert.equal(client.hasSql("status = 'closed'"), true);
    assert.equal(client.valuesContain("tex.trip.closed"), true);
  }

  {
    const client = new RecordingTexApiClient();
    const response = await handleTexApiRequest(client, actor, {
      method: "GET",
      path: "/finance-review",
      query: {
        month: "7",
        year: "2026"
      }
    });
    assert.equal(response.status, 200);
    assert.match(JSON.stringify(response.body), /Airport Cafe/);
    assert.equal(client.hasSql("e.status = 'approved'"), true);
  }

  {
    const client = new RecordingTexApiClient();
    const response = await handleTexApiRequest(client, actor, {
      method: "POST",
      path: "/finance-review/pay",
      body: {
        expenseIds: ["00000000-0000-4000-8000-000000006001"],
        tripIds: ["00000000-0000-4000-8000-000000008001"]
      }
    });
    assert.equal(response.status, 200);
    assert.equal(client.valuesContain("tex.finance.expense_paid"), true);
    assert.equal(client.valuesContain("tex.finance.trip_payout_paid"), true);
  }

  {
    const client = new RecordingTexApiClient();
    const response = await handleTexApiRequest(client, actor, {
      method: "POST",
      path: "/driver-advances",
      body: {
        employee_id: "00000000-0000-4000-8000-000000004001",
        amount: 100,
        currency: "AED",
        advance_date: "2026-07-12"
      }
    });
    assert.equal(response.status, 201);
    assert.equal(client.hasSql("insert into public.tex_driver_advances"), true);
    assert.equal(client.valuesContain("tex.finance.driver_advance_created"), true);
  }

  {
    const client = new RecordingTexApiClient();
    const response = await handleTexApiRequest(client, actor, {
      method: "DELETE",
      path: "/driver-advances/00000000-0000-4000-8000-000000011001"
    });
    assert.equal(response.status, 200);
    assert.equal(client.hasSql("delete from public.tex_driver_advances"), true);
    assert.equal(client.valuesContain("tex.finance.driver_advance_deleted"), true);
  }

  {
    const client = new RecordingTexApiClient();
    const response = await handleTexApiRequest(client, actor, {
      method: "GET",
      path: "/notifications"
    });
    assert.equal(response.status, 200);
    assert.match(JSON.stringify(response.body), /Expense approved/);
    assert.equal(client.hasSql("from public.tex_notifications"), true);
  }

  {
    const client = new RecordingTexApiClient();
    const response = await handleTexApiRequest(client, actor, {
      method: "POST",
      path: "/notifications",
      body: {
        user_id: actor.userId,
        title: "Expense approved",
        body: "Airport Cafe was approved.",
        related_expense_id: "00000000-0000-4000-8000-000000006001"
      }
    });
    assert.equal(response.status, 201);
    assert.equal(client.hasSql("insert into public.tex_notifications"), true);
    assert.equal(client.valuesContain("tex.notification.created"), true);
  }

  {
    const client = new RecordingTexApiClient();
    const response = await handleTexApiRequest(client, actor, {
      method: "PATCH",
      path: "/notifications/00000000-0000-4000-8000-000000010001/read"
    });
    assert.equal(response.status, 200);
    assert.equal(client.hasSql("update public.tex_notifications"), true);
    assert.equal(client.valuesContain("tex.notification.read"), true);
  }

  {
    const client = new RecordingTexApiClient();
    const response = await handleTexApiRequest(client, actor, {
      method: "PATCH",
      path: "/notifications/read-all"
    });
    assert.equal(response.status, 200);
    assert.match(JSON.stringify(response.body), /updated/);
    assert.equal(client.valuesContain("tex.notification.read_all"), true);
  }

  {
    const client = new RecordingTexApiClient();
    const response = await handleTexApiRequest(client, actor, {
      method: "GET",
      path: "/settings",
      query: { month: "7", year: "2026" }
    });
    assert.equal(response.status, 200);
    assert.match(JSON.stringify(response.body), /Logistics/);
    assert.match(JSON.stringify(response.body), /SEK Demo/);
    assert.match(JSON.stringify(response.body), /\/api\/tex\/branding\/logo/);
    assert.equal(client.hasSql("from public.tex_spend_policies"), true);
    assert.equal(client.hasSql("from public.tex_budgets b"), true);
  }

  {
    const client = new RecordingTexApiClient();
    const response = await handleTexApiRequest(client, actor, {
      method: "POST",
      path: "/settings/categories",
      body: { name: "Parking", sortOrder: 30 }
    });
    assert.equal(response.status, 201);
    assert.equal(client.hasSql("insert into public.tex_expense_categories"), true);
    assert.equal(client.valuesContain("tex.category.created"), true);
  }

  {
    const client = new RecordingTexApiClient();
    const response = await handleTexApiRequest(client, actor, {
      method: "PATCH",
      path: "/settings/categories/00000000-0000-4000-8000-000000003002",
      body: { name: "Parking", isActive: false, sortOrder: 30 }
    });
    assert.equal(response.status, 200);
    assert.equal(client.hasSql("update public.tex_expense_categories"), true);
    assert.equal(client.valuesContain("tex.category.updated"), true);
  }

  {
    const client = new RecordingTexApiClient();
    const response = await handleTexApiRequest(client, actor, {
      method: "PUT",
      path: "/settings/policies",
      body: {
        category: "Meals",
        dailyLimit: 120,
        monthlyLimit: 1000,
        requiresNotesAbove: 80,
        isBlocked: false
      }
    });
    assert.equal(response.status, 200);
    assert.equal(client.hasSql("insert into public.tex_spend_policies"), true);
    assert.equal(client.valuesContain("tex.policy.updated"), true);
  }

  {
    const client = new RecordingTexApiClient();
    const response = await handleTexApiRequest(client, actor, {
      method: "PUT",
      path: "/settings/budgets",
      body: {
        department: "Logistics",
        month: 7,
        year: 2026,
        budgetAmount: 5000
      }
    });
    assert.equal(response.status, 200);
    assert.equal(client.hasSql("insert into public.tex_budgets"), true);
    assert.equal(client.valuesContain("tex.budget.updated"), true);
  }

  {
    const client = new RecordingTexApiClient();
    const response = await handleTexApiRequest(client, actor, {
      method: "GET",
      path: "/people"
    });
    assert.equal(response.status, 200);
    assert.match(JSON.stringify(response.body), /omar@example\.test/);
    assert.equal(client.hasSql("from public.tex_employee_profiles"), true);
    assert.equal(client.hasSql("array_agg"), true);
  }

  {
    const client = new RecordingTexApiClient();
    const response = await handleTexApiRequest(client, actor, {
      method: "POST",
      path: "/people/employees",
      body: {
        name: "New Driver",
        phone_number: "+971500000001",
        department: "Logistics",
        manager_profile_id: "00000000-0000-4000-8000-000000002002",
        is_active: true
      }
    });
    assert.equal(response.status, 201);
    assert.match(JSON.stringify(response.body), /00000000-0000-4000-8000-000000002002/);
    assert.equal(client.hasSql("tm.user_id = $1"), true);
    assert.equal(client.hasSql("insert into public.tex_employee_profiles"), true);
    assert.equal(client.valuesContain("tex.employee.created"), true);
  }

  {
    const client = new RecordingTexApiClient();
    const response = await handleTexApiRequest(client, actor, {
      method: "PATCH",
      path: "/people/employees/00000000-0000-4000-8000-000000004002",
      body: {
        name: "New Driver Updated",
        phoneNumber: "+971 50 000 0001",
        department: "Ops",
        managerUserId: "00000000-0000-4000-8000-000000002002",
        isActive: false
      }
    });
    assert.equal(response.status, 200);
    assert.equal(client.hasSql("update public.tex_employee_profiles"), true);
    assert.equal(client.valuesContain("tex.employee.updated"), true);
  }

  {
    const client = new RecordingTexApiClient();
    const response = await handleTexApiRequest(client, actor, {
      method: "DELETE",
      path: "/people/employees/00000000-0000-4000-8000-000000004002"
    });
    assert.equal(response.status, 200);
    assert.equal(client.hasSql("delete from public.tex_employee_profiles"), true);
    assert.equal(client.valuesContain("tex.employee.deleted"), true);
  }

  {
    const client = new RecordingTexApiClient();
    const response = await handleTexApiRequest(client, actor, {
      method: "POST",
      path: "/people/teams",
      body: {
        name: "Field Ops",
        description: "Field operations",
        manager_id: "00000000-0000-4000-8000-000000004001",
        member_ids: ["00000000-0000-4000-8000-000000004001"]
      }
    });
    assert.equal(response.status, 201);
    assert.equal(client.hasSql("insert into public.tex_teams"), true);
    assert.equal(client.hasSql("insert into public.tex_team_members"), true);
    assert.equal(client.valuesContain("tex.team.created"), true);
  }

  {
    const client = new RecordingTexApiClient();
    const response = await handleTexApiRequest(client, actor, {
      method: "PATCH",
      path: "/people/teams/00000000-0000-4000-8000-000000005001",
      body: {
        name: "Ops Updated",
        memberEmployeeProfileIds: ["00000000-0000-4000-8000-000000004001"]
      }
    });
    assert.equal(response.status, 200);
    assert.equal(client.hasSql("update public.tex_teams"), true);
    assert.equal(client.valuesContain("tex.team.updated"), true);
  }

  {
    const client = new RecordingTexApiClient();
    const response = await handleTexApiRequest(client, actor, {
      method: "DELETE",
      path: "/people/teams/00000000-0000-4000-8000-000000005001"
    });
    assert.equal(response.status, 200);
    assert.equal(client.hasSql("delete from public.tex_teams"), true);
    assert.equal(client.valuesContain("tex.team.deleted"), true);
  }

  {
    const client = new RecordingTexApiClient();
    const response = await handleTexApiRequest(client, actor, {
      method: "GET",
      path: "/reports",
      query: { date_from: "2026-07-01", date_to: "2026-07-31" }
    });
    assert.equal(response.status, 200);
    assert.match(JSON.stringify(response.body), /Maya Haddad/);
    assert.match(JSON.stringify(response.body), /previousExpenses/);
    assert.equal(client.hasSql("with report_periods as"), true);
  }

  {
    const client = new RecordingTexApiClient();
    const response = await handleTexApiRequest(client, actor, {
      method: "POST",
      path: "/reports/email",
      body: { date_from: "2026-07-01", date_to: "2026-07-31" }
    });
    assert.equal(response.status, 200);
    assert.match(JSON.stringify(response.body), /finance@example\.test/);
    assert.equal(client.hasSql("email_report_recipients"), true);
    assert.equal(client.valuesContain("tex.email_report.skipped"), true);
  }

  {
    const client = new RecordingTexApiClient();
    const response = await handleTexApiRequest(client, actor, {
      method: "GET",
      path: "/fx-rates"
    });
    assert.equal(response.status, 200);
    assert.match(JSON.stringify(response.body), /EUR/);
    assert.equal(client.hasSql("from public.tex_fx_rates"), true);
  }

  {
    const client = new RecordingTexApiClient();
    const previousKey = process.env.FX_API_KEY;
    const previousFetch = globalThis.fetch;
    try {
      process.env.FX_API_KEY = "fx-test";
      globalThis.fetch = async () =>
        Response.json({ result: "success", conversion_rates: { EUR: 0.91, GBP: 0.78 } });
      const response = await handleTexApiRequest(client, actor, {
        method: "POST",
        path: "/fx-rates/refresh"
      });

      assert.equal(response.status, 200);
      assert.match(JSON.stringify(response.body), /live/);
      assert.equal(client.hasSql("app.platform_service_role"), true);
      assert.equal(client.valuesContain("tex.fx_rates.refreshed"), true);
    } finally {
      globalThis.fetch = previousFetch;
      if (previousKey === undefined) {
        delete process.env.FX_API_KEY;
      } else {
        process.env.FX_API_KEY = previousKey;
      }
    }
  }

  {
    const client = new RecordingTexApiClient();
    const previousFetch = globalThis.fetch;
    const previousUrl = process.env.SUPABASE_URL;
    const previousServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    try {
      process.env.SUPABASE_URL = "https://supabase.example.test";
      process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test";
      globalThis.fetch = async () => new Response(null, { status: 200 });

      const response = await handleTexApiRequest(client, actor, {
        method: "PUT",
        path: "/settings/branding",
        body: {
          contentType: "image/png",
          dataBase64: Buffer.from("logo").toString("base64")
        }
      });

      assert.equal(response.status, 200);
      assert.match(JSON.stringify(response.body), /SEK Demo/);
      assert.match(JSON.stringify(response.body), /\/api\/tex\/branding\/logo/);
      assert.equal(client.hasSql("update public.tenants"), true);
      assert.equal(client.hasSql("app.platform_service_role', 'true"), true);
      assert.equal(client.hasSql("app.platform_service_role', 'false"), true);
      assert.equal(client.valuesContain("tex.tenant_logo.updated"), true);
    } finally {
      globalThis.fetch = previousFetch;
      if (previousUrl === undefined) {
        delete process.env.SUPABASE_URL;
      } else {
        process.env.SUPABASE_URL = previousUrl;
      }

      if (previousServiceKey === undefined) {
        delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      } else {
        process.env.SUPABASE_SERVICE_ROLE_KEY = previousServiceKey;
      }
    }
  }

  {
    const client = new RecordingTexApiClient();
    const response = await handleTexApiRequest(client, actor, {
      method: "GET",
      path: "/integrations"
    });
    assert.equal(response.status, 200);
    assert.match(JSON.stringify(response.body), /Primary Wappfly/);
    assert.equal(
      JSON.stringify(response.body).includes(
        "tenant/00000000-0000-4000-8000-000000001001/tex/receipts/"
      ),
      true
    );
    assert.equal(client.hasSql("from public.tenant_whatsapp_provider_profiles"), true);
  }

  {
    const client = new RecordingTexApiClient();
    const response = await handleTexApiRequest(client, actor, {
      method: "GET",
      path: "/unregistered-whatsapp",
      query: { status: "open" }
    });
    assert.equal(response.status, 200);
    assert.match(JSON.stringify(response.body), /wamid\.review/);
    assert.equal(client.hasSql("from public.tex_unregistered_whatsapp_submissions"), true);
  }

  {
    const client = new RecordingTexApiClient();
    const response = await handleTexApiRequest(client, actor, {
      method: "PATCH",
      path: "/unregistered-whatsapp/00000000-0000-4000-8000-000000012001/ignore",
      body: { reason: "Not a receipt" }
    });
    assert.equal(response.status, 200);
    assert.equal(client.valuesContain("tex.whatsapp_submission.ignored"), true);
  }

  {
    const client = new RecordingTexApiClient();
    const response = await handleTexApiRequest(client, actor, {
      method: "PATCH",
      path: "/unregistered-whatsapp/00000000-0000-4000-8000-000000012001/resolve",
      body: {
        mode: "new_employee",
        employee_name: "New Driver",
        phone_number: "+971500000001",
        department: "Logistics"
      }
    });
    assert.equal(response.status, 200);
    assert.equal(client.hasSql("insert into public.tex_employee_profiles"), true);
    assert.equal(client.hasSql("insert into public.tex_expenses"), true);
    assert.equal(client.valuesContain("tex.whatsapp_submission.resolved"), true);
  }

  {
    const client = new RecordingTexApiClient();
    const response = await handleTexApiRequest(client, integrationActor, {
      method: "POST",
      path: "/webhook-submissions",
      body: {
        messageId: "wamid.api",
        payload: { provider: "meta" }
      }
    });
    assert.equal(response.status, 201);
    assert.equal(client.hasSql("on conflict (tenant_id, message_id)"), true);
  }

  {
    const client = new RecordingTexApiClient();
    const response = await handleTexApiRequest(client, integrationActor, {
      method: "POST",
      path: "/webhook-submissions/process",
      body: {
        messageId: "wamid.status",
        messageText: "STATUS",
        senderPhone: "+971599999999",
        payload: { provider: "meta" }
      }
    });
    assert.equal(response.status, 201);
    assert.match(JSON.stringify(response.body), /TEX profile not found/);
    assert.equal(client.hasSql("ocr_status"), true);
  }

  {
    const client = new RecordingTexApiClient();
    const response = await handleTexApiRequest(client, actor, {
      method: "GET",
      path: "/admin"
    });
    assert.equal(response.status, 410);
    assert.match(JSON.stringify(response.body), /admin\.torrevie\.com/);
    assert.equal(client.calls.length, 0);
  }

  {
    const client = new RecordingTexApiClient();
    const response = await handleTexApiRequest(client, actor, {
      method: "GET",
      path: "/missing"
    });
    assert.equal(response.status, 404);
  }

  console.log("TEX API boundary tests passed.");
}

void main();
