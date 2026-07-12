import { strict as assert } from "node:assert";
import type { QueryResult, QueryValue, TenantQueryClient } from "@torrevie/tenant-context";
import { handleTexApiRequest } from "./tex-api";
import type { TexActorContext } from "./tex";

const actor: TexActorContext = {
  tenantId: "00000000-0000-4000-8000-000000001001",
  userId: "00000000-0000-4000-8000-000000002001",
  roleScope: "customer",
  roles: ["customer_admin"],
  entitledProducts: ["tex"]
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

    if (sql.includes("from public.tex_expense_categories")) {
      return { rows: [] };
    }

    if (sql.includes("from public.tex_employee_profiles")) {
      return { rows: [] };
    }

    if (sql.includes("from public.tex_teams")) {
      return { rows: [] };
    }

    if (sql.includes("from public.tex_integration_settings")) {
      return { rows: [] };
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
            id: sql.includes("insert into public.tex_trips") ? "00000000-0000-4000-8000-000000008001" : values[18],
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
            expense_count: 0,
            spend_amount: 0
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
    assert.equal(client.hasSql("from public.tex_trips"), true);
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
