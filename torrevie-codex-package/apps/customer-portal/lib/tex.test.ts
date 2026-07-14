import { strict as assert } from "node:assert";
import type { QueryResult, QueryValue, TenantQueryClient } from "@torrevie/tenant-context";
import {
  createTexExpense,
  createTexEmployeeProfile,
  closeTexTrip,
  createTexTrip,
  deleteTexEmployeeProfile,
  deleteTexTripLeg,
  listTexTripLegs,
  listTexExpenses,
  listTexFinanceReview,
  listTexIntegrationWorkspace,
  listTexReportWorkspace,
  listTexTrips,
  listTexBootstrap,
  payTexFinanceItems,
  processTexWhatsappSubmission,
  recordTexWebhookSubmission,
  replaceTexTripLegs,
  resolveTexActorContext,
  sendTexEmailReport,
  setTexEmailNotificationDispatcherForTest,
  setTexWhatsappNotificationDispatcherForTest,
  updateTexTrip,
  updateTexEmployeeProfile,
  updateTexExpenseStatus,
  uploadTexReceiptFile,
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
  entitledProducts: ["tex"]
};

const standardActor: TexActorContext = {
  ...actor,
  roles: ["customer_standard_user"]
};

const integrationActor: TexActorContext = {
  ...actor,
  roles: ["integration_service"],
  integrationPermissions: ["tex.integration.manage"]
};

const unentitledActor: TexActorContext = {
  ...actor,
  entitledProducts: []
};

class RecordingTexClient implements TenantQueryClient {
  readonly calls: Array<{ sql: string; values: readonly QueryValue[] }> = [];

  async query<Row>(sql: string, values: readonly QueryValue[] = []): Promise<QueryResult<Row>> {
    this.calls.push({ sql, values });

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

    if (sql.includes("from public.tex_employee_profiles")) {
      return {
        rows: [
          {
            id: "00000000-0000-4000-8000-000000004001",
            user_id: actor.userId,
            name: "Maya Haddad",
            phone_number: "+971500000001",
            department: "Operations",
            monthly_salary: 12000,
            submission_frequency: "weekly",
            is_active: true
          }
        ] as Row[]
      };
    }

    if (sql.includes("update public.tex_employee_profiles")) {
      return {
        rows: [
          {
            id: values[0],
            user_id: actor.userId,
            name: values[1],
            phone_number: values[2],
            department: values[3],
            monthly_salary: values[4],
            submission_frequency: values[5],
            is_active: values[6]
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
            submission_frequency: values[4],
            is_active: values[5]
          }
        ] as Row[]
      };
    }

    if (sql.includes("delete from public.tex_employee_profiles")) {
      return {
        rows: [
          {
            id: values[0],
            name: "Maya Haddad"
          }
        ] as Row[]
      };
    }

    if (sql.includes("from public.tex_teams")) {
      return {
        rows: [
          {
            id: "00000000-0000-4000-8000-000000005001",
            name: "Ops",
            description: "Operations"
          }
        ] as Row[]
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
            email_report_recipients: ["finance@example.test", " Ops@Example.test "]
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
            meta_whatsapp_business_account_id: null,
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

    if (sql.includes("from public.tenant_memberships")) {
      return {
        rows: [
          {
            membership_status: "active",
            user_status: "active"
          }
        ] as Row[]
      };
    }

    if (sql.includes("from public.user_role_assignments")) {
      return {
        rows: [
          {
            key: "customer_manager"
          }
        ] as Row[]
      };
    }

    if (sql.includes("from public.subscriptions")) {
      return {
        rows: [
          {
            key: "tex"
          }
        ] as Row[]
      };
    }

    if (sql.includes("select status, count(*)::int as count")) {
      return {
        rows: [
          { status: "pending", count: 2, total: 220 },
          { status: "approved", count: 1, total: 120 },
          { status: "rejected", count: 1, total: 80 }
        ] as Row[]
      };
    }

    if (sql.includes("select id, vendor, amount::float as amount")) {
      return {
        rows: [
          {
            id: "00000000-0000-4000-8000-000000006099",
            vendor: "Airport Cafe",
            expense_date: "2026-07-12",
            amount: 120,
            currency: "AED"
          }
        ] as Row[]
      };
    }

    if (sql.includes("insert into public.tex_expenses") && sql.includes("'whatsapp_ai'")) {
      return {
        rows: [
          {
            id: "00000000-0000-4000-8000-000000006001",
            status: values[20],
            amount: values[7],
            currency: values[8]
          }
        ] as Row[]
      };
    }

    if (sql.includes("insert into public.tex_expenses") && sql.includes("returning id, status")) {
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

    if (sql.includes("from public.tex_expenses e") && sql.includes("e.expense_date >= $1::date")) {
      return {
        rows: [
          {
            id: "00000000-0000-4000-8000-000000006001",
            employee_profile_id: "00000000-0000-4000-8000-000000004001",
            employee_name: "Maya Haddad",
            vendor: "Airport Cafe",
            expense_date: values[0],
            amount: 120,
            currency: "AED",
            base_amount: 120,
            category: "Meals",
            trip_id: "00000000-0000-4000-8000-000000008001",
            trip_name: "Dubai run",
            payment_method: "personal",
            source: "web",
            status: "approved",
            policy_flag: false,
            tax_amount: 5,
            tax_id_number: "TRN123",
            approved_at: "2026-07-12T10:00:00.000Z",
            paid_at: null,
            created_at: "2026-07-12T09:00:00.000Z"
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
            status: sql.includes("status = 'closed'") ? "closed" : "open",
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

    if (sql.includes("update public.tex_expenses") && sql.includes("returning id, status")) {
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

    if (sql.includes("insert into public.files")) {
      return {
        rows: [
          {
            id: values[0],
            storage_path: values[1],
            filename: values[2],
            content_type: values[3],
            size_bytes: values[4]
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
            planned_end: "2026-07-13",
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
            notes: "Border route"
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
    const client = new RecordingTexClient();
    const resolved = await resolveTexActorContext(client, {
      tenantId: actor.tenantId,
      userId: actor.userId,
      roleScope: "customer"
    });
    assert.deepEqual(resolved.roles, ["customer_manager"]);
    assert.deepEqual(resolved.entitledProducts, ["tex"]);
    assert.equal(client.hasSql("from public.tenant_memberships"), true);
    assert.equal(client.hasSql("from public.user_role_assignments"), true);
    assert.equal(client.hasSql("from public.subscriptions"), true);
  }

  {
    const client = new RecordingTexClient();
    const bootstrap = await listTexBootstrap(client, actor);
    assert.equal(bootstrap.categories[0]?.name, "Meals");
    assert.equal(bootstrap.employeeProfiles[0]?.name, "Maya Haddad");
    assert.equal(bootstrap.teams[0]?.name, "Ops");
    assert.equal(bootstrap.integrationSettings?.whatsappProvider, "wappfly");
    assert.equal(client.hasSql("public.tex_expense_categories"), true);
    assert.equal(client.hasSql("app.current_tenant_id"), true);
  }

  {
    const client = new RecordingTexClient();
    const integrations = await listTexIntegrationWorkspace(client, {
      ...actor,
      roles: ["customer_admin"]
    });
    assert.equal(integrations.defaultProviderProfile?.label, "Primary Wappfly");
    assert.equal(integrations.receiptStorage.bucket, "receipts");
    assert.equal(integrations.receiptStorage.pathPrefix, `tenant/${actor.tenantId}/tex/receipts/`);
    assert.equal(client.hasSql("from public.tenant_whatsapp_provider_profiles"), true);
  }

  {
    const client = new RecordingTexClient();
    const employee = await createTexEmployeeProfile(client, actor, {
      name: "Omar Faris",
      phoneNumber: "+971 50 000 0002",
      department: "Logistics",
      isActive: true
    });
    assert.equal(employee.name, "Omar Faris");
    assert.equal(employee.phoneNumber, "971500000002");
    assert.equal(client.hasSql("insert into public.tex_employee_profiles"), true);
    assert.equal(client.valuesContain("tex.employee.created"), true);
  }

  {
    const client = new RecordingTexClient();
    const employee = await updateTexEmployeeProfile(
      client,
      actor,
      "00000000-0000-4000-8000-000000004001",
      {
        name: "Maya Haddad Updated",
        phoneNumber: "+971 50 000 0001",
        department: "Finance",
        isActive: false
      }
    );
    assert.equal(employee.name, "Maya Haddad Updated");
    assert.equal(employee.phoneNumber, "971500000001");
    assert.equal(employee.isActive, false);
    assert.equal(client.hasSql("update public.tex_employee_profiles"), true);
    assert.equal(client.valuesContain("tex.employee.updated"), true);
  }

  {
    const client = new RecordingTexClient();
    await deleteTexEmployeeProfile(client, actor, "00000000-0000-4000-8000-000000004001");
    assert.equal(client.hasSql("delete from public.tex_employee_profiles"), true);
    assert.equal(client.valuesContain("tex.employee.deleted"), true);
  }

  {
    const client = new RecordingTexClient();
    const expenses = await listTexExpenses(client, actor);
    assert.equal(expenses[0]?.employeeName, "Maya Haddad");
    assert.equal(expenses[0]?.tripName, "Dubai run");
    assert.equal(expenses[0]?.status, "pending");
    assert.equal(client.hasSql("from public.tex_expenses e"), true);
  }

  {
    const client = new RecordingTexClient();
    const report = await listTexReportWorkspace(client, actor, {
      dateFrom: "2026-07-01",
      dateTo: "2026-07-31"
    });
    assert.equal(report.dateFrom, "2026-07-01");
    assert.equal(report.previousDateFrom, "2026-05-31");
    assert.equal(report.expenses[0]?.employeeName, "Maya Haddad");
    assert.equal(report.expenses[0]?.baseAmount, 120);
    assert.equal(client.hasSql("e.expense_date >= $1::date"), true);
  }

  {
    const client = new RecordingTexClient();
    const result = await sendTexEmailReport(client, actor, {
      dateFrom: "2026-07-01",
      dateTo: "2026-07-31"
    });
    assert.equal(result.status, "skipped");
    assert.equal(result.provider, "postmark");
    assert.deepEqual(result.recipients, ["finance@example.test", "ops@example.test"]);
    assert.equal(client.hasSql("email_report_recipients"), true);
    assert.equal(client.hasSql("e.expense_date >= $1::date"), true);
    assert.equal(client.valuesContain("tex.email_report.skipped"), true);
  }

  {
    const client = new RecordingTexClient();
    const trips = await listTexTrips(client, actor);
    assert.equal(trips[0]?.name, "Dubai run");
    assert.equal(trips[0]?.budgetAmount, 1500);
    assert.equal(trips[0]?.legCount, 1);
    assert.equal(trips[0]?.totalDistanceKm, 210);
    assert.equal(trips[0]?.expenseCount, 2);
    assert.equal(client.hasSql("from public.tex_trips"), true);
  }

  {
    const client = new RecordingTexClient();
    const financeReview = await listTexFinanceReview(client, actor, 7, 2026);
    assert.equal(financeReview.approvedExpenses[0]?.vendor, "Airport Cafe");
    assert.equal(financeReview.tripPayouts[0]?.name, "Dubai run");
    assert.equal(financeReview.totals.netPayable, 370);
    assert.equal(client.hasSql("e.status = 'approved'"), true);
  }

  {
    const client = new RecordingTexClient();
    const payment = await payTexFinanceItems(client, actor, {
      expenseIds: ["00000000-0000-4000-8000-000000006001"],
      tripIds: ["00000000-0000-4000-8000-000000008001"]
    });
    assert.equal(payment.paidExpenses, 1);
    assert.equal(payment.paidTrips, 1);
    assert.equal(client.valuesContain("tex.finance.expense_paid"), true);
    assert.equal(client.valuesContain("tex.finance.trip_payout_paid"), true);
  }

  {
    const client = new RecordingTexClient();
    const legs = await listTexTripLegs(client, actor, "00000000-0000-4000-8000-000000008001");
    assert.equal(legs[0]?.origin, "Jebel Ali");
    assert.equal(legs[0]?.isReturnTrip, true);
    assert.equal(legs[0]?.totalDistanceKm, 210);
  }

  {
    const client = new RecordingTexClient();
    const legs = await replaceTexTripLegs(client, actor, "00000000-0000-4000-8000-000000008001", {
      legs: [
        {
          origin: "Jebel Ali",
          destination: "Riyadh",
          mode: "road",
          status: "planned",
          distanceKm: 105,
          isReturnTrip: true,
          returnDistanceKm: 105,
          budgetAmount: 700,
          containerRef: "MSKU123"
        }
      ]
    });
    assert.equal(legs[0]?.destination, "Riyadh");
    assert.equal(client.valuesContain("tex.trip.legs_updated"), true);
    assert.equal(client.hasSql("delete from public.tex_trip_legs"), true);
  }

  {
    const client = new RecordingTexClient();
    await deleteTexTripLeg(
      client,
      actor,
      "00000000-0000-4000-8000-000000008001",
      "00000000-0000-4000-8000-000000009001"
    );
    assert.equal(client.valuesContain("tex.trip.leg_deleted"), true);
  }

  {
    const client = new RecordingTexClient();
    const trip = await createTexTrip(client, actor, {
      name: "Dubai run",
      tripType: "logistics",
      origin: "Dubai",
      destination: "Abu Dhabi",
      budgetAmount: 1500,
      enforceCurrency: true,
      enforcedCurrency: "AED"
    });
    assert.equal(trip.name, "Dubai run");
    assert.equal(client.hasSql("insert into public.tex_trips"), true);
    assert.equal(client.valuesContain("tex.trip.created"), true);
  }

  {
    const client = new RecordingTexClient();
    const trip = await updateTexTrip(client, actor, "00000000-0000-4000-8000-000000008001", {
      name: "Dubai run updated",
      origin: "Dubai",
      destination: "Sharjah"
    });
    assert.equal(trip.name, "Dubai run updated");
    assert.equal(client.hasSql("update public.tex_trips"), true);
    assert.equal(client.valuesContain("tex.trip.updated"), true);
  }

  {
    const client = new RecordingTexClient();
    const trip = await closeTexTrip(client, actor, "00000000-0000-4000-8000-000000008001");
    assert.equal(trip.status, "closed");
    assert.equal(client.hasSql("status = 'closed'"), true);
    assert.equal(client.valuesContain("tex.trip.closed"), true);
  }

  {
    const client = new RecordingTexClient();
    const expense = await createTexExpense(client, standardActor, {
      employeeProfileId: "00000000-0000-4000-8000-000000004001",
      vendor: " Airport Cafe ",
      expenseDate: "2026-07-12",
      amount: 120,
      currency: " aed ",
      category: "Meals",
      source: "web"
    });
    assert.equal(expense.status, "pending");
    assert.equal(expense.currency, "AED");
    assert.equal(client.hasSql("insert into public.tex_expenses"), true);
    assert.equal(client.hasSql("insert into public.audit_events"), true);
    assert.equal(client.valuesContain("Airport Cafe"), true);
    assert.equal(client.valuesContain("tex.expense.created"), true);
  }

  {
    const client = new RecordingTexClient();
    const updated = await updateTexExpenseStatus(
      client,
      actor,
      "00000000-0000-4000-8000-000000006001",
      "approved"
    );
    assert.equal(updated.status, "approved");
    assert.equal(client.hasSql("approved_by = case"), true);
    assert.equal(client.valuesContain("tex.expense.approved"), true);
  }

  {
    const client = new RecordingTexClient();
    const updated = await updateTexExpenseStatus(
      client,
      actor,
      "00000000-0000-4000-8000-000000006001",
      "paid"
    );
    assert.equal(updated.status, "paid");
    assert.equal(client.hasSql("paid_by = case"), true);
    assert.equal(client.valuesContain("tex.expense.paid"), true);
  }

  {
    const client = new RecordingTexClient();
    const submission = await recordTexWebhookSubmission(client, integrationActor, {
      senderPhone: "+971500000001",
      messageId: "wamid.abc",
      sessionId: "session-a",
      payload: { provider: "wappfly" }
    });
    assert.equal(submission.status, "open");
    assert.equal(client.hasSql("on conflict (tenant_id, message_id)"), true);
    assert.equal(client.valuesContain("wamid.abc"), true);
    assert.equal(client.valuesContain("tex.webhook.submission_recorded"), true);
  }

  {
    const client = new RecordingTexClient();
    const result = await processTexWhatsappSubmission(client, integrationActor, {
      senderPhone: "+971500000001",
      messageId: "wamid.status",
      messageText: "STATUS",
      payload: { provider: "meta" }
    });
    assert.equal(result.ocrStatus, "not_applicable");
    assert.match(result.replyText, /Pending: 2/);
    assert.equal(result.delivery?.status, "sent");
    assert.equal(client.valuesContain("status"), true);
    assert.equal(client.valuesContain("tex.notification.whatsapp_reply_sent"), true);
  }

  {
    const client = new RecordingTexClient();
    const result = await processTexWhatsappSubmission(client, integrationActor, {
      senderPhone: "+971500000001",
      messageId: "wamid.receipt",
      mediaUrl: "https://example.test/receipt.jpg",
      extractedReceipt: {
        vendor: "Airport Cafe",
        expenseDate: "2026-07-12",
        amount: 120,
        currency: "AED",
        category: "Meals",
        taxAmount: 0,
        taxIdNumber: null,
        confidence: 0.94,
        notes: "Lunch"
      },
      payload: { provider: "meta" }
    });
    assert.equal(result.ocrStatus, "extracted");
    assert.match(result.replyText, /possible duplicate/);
    assert.equal(result.delivery?.messageId, "test-whatsapp-message");
    assert.equal(client.valuesContain("suspected"), true);
    assert.equal(client.valuesContain(true), true);
  }

  {
    const client = new RecordingTexClient();
    const previousEnv = {
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      SUPABASE_URL: process.env.SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY
    };
    const previousFetch = globalThis.fetch;
    let uploadHeaders: HeadersInit | undefined;
    try {
      process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
      delete process.env.SUPABASE_URL;
      process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_test";
      globalThis.fetch = async (_input, init) => {
        uploadHeaders = init?.headers;
        return new Response("", { status: 200 });
      };

      const receipt = await uploadTexReceiptFile(client, actor, {
        fileName: "receipt.png",
        contentType: "image/png",
        dataBase64: "iVBORw0KGgo="
      });
      const headers = uploadHeaders as Record<string, string>;
      assert.equal(headers.apikey, "sb_secret_test");
      assert.equal("Authorization" in headers, false);
      assert.equal(receipt.filename, "receipt.png");
      assert.match(
        receipt.storagePath,
        new RegExp(`^tenant/${actor.tenantId}/tex/receipts/[0-9a-f-]+\\.png$`)
      );
      assert.equal(client.valuesContain("tex.receipt.uploaded"), true);
    } finally {
      globalThis.fetch = previousFetch;
      for (const [key, value] of Object.entries(previousEnv)) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    }
  }

  {
    const client = new RecordingTexClient();
    await assert.rejects(
      () =>
        createTexExpense(client, unentitledActor, {
          expenseDate: "2026-07-12",
          amount: 10,
          currency: "AED"
        }),
      /missing_entitlement/
    );
    assert.equal(client.calls.length, 0);
  }

  {
    const client = new RecordingTexClient();
    await assert.rejects(
      () =>
        recordTexWebhookSubmission(client, standardActor, {
          messageId: "blocked",
          payload: {}
        }),
      /Permission denied for tex.integration.manage/
    );
    assert.equal(client.calls.length, 0);
  }

  console.log("TEX domain tests passed.");
}

void main();
