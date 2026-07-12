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
