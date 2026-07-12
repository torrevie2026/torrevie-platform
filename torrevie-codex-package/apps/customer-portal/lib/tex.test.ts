import { strict as assert } from "node:assert";
import type { QueryResult, QueryValue, TenantQueryClient } from "@torrevie/tenant-context";
import {
  createTexExpense,
  listTexExpenses,
  listTexTrips,
  listTexBootstrap,
  recordTexWebhookSubmission,
  resolveTexActorContext,
  updateTexExpenseStatus,
  type TexActorContext
} from "./tex";

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
            is_system: true
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
            is_active: true
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

    if (sql.includes("from public.tex_integration_settings")) {
      return {
        rows: [
          {
            whatsapp_provider: "wappfly",
            whatsapp_instance_id: null,
            wappfly_session_id: "session-a",
            meta_phone_number_id: null,
            meta_whatsapp_business_account_id: null
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
            created_at: "2026-07-12T10:00:00.000Z"
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
            origin: "Dubai",
            destination: "Abu Dhabi",
            status: "open",
            start_date: "2026-07-12",
            end_date: null,
            budget_amount: 1500
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
    const expenses = await listTexExpenses(client, actor);
    assert.equal(expenses[0]?.employeeName, "Maya Haddad");
    assert.equal(expenses[0]?.tripName, "Dubai run");
    assert.equal(expenses[0]?.status, "pending");
    assert.equal(client.hasSql("from public.tex_expenses e"), true);
  }

  {
    const client = new RecordingTexClient();
    const trips = await listTexTrips(client, actor);
    assert.equal(trips[0]?.name, "Dubai run");
    assert.equal(trips[0]?.budgetAmount, 1500);
    assert.equal(client.hasSql("from public.tex_trips"), true);
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
