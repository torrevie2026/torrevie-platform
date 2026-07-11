import { strict as assert } from "node:assert";
import type { QueryResult, QueryValue, TenantQueryClient } from "@torrevie/tenant-context";
import {
  createCrmVerticalSlice,
  ensureDefaultCrmPipeline,
  listCrmDashboard,
  moveOpportunityToStage,
  type CrmActorContext
} from "./crm";

const actor: CrmActorContext = {
  tenantId: "00000000-0000-4000-8000-000000001001",
  userId: "00000000-0000-4000-8000-000000002001",
  roleScope: "customer",
  roles: ["customer_admin"],
  entitledProducts: ["crm"]
};

const readonlyActor: CrmActorContext = {
  ...actor,
  roles: ["customer_readonly"]
};

class RecordingCrmClient implements TenantQueryClient {
  readonly calls: Array<{ sql: string; values: readonly QueryValue[] }> = [];

  async query<Row>(sql: string, values: readonly QueryValue[] = []): Promise<QueryResult<Row>> {
    this.calls.push({ sql, values });

    if (sql.includes("returning id, pipeline_stage_id, version")) {
      return {
        rows: [
          {
            id: "00000000-0000-4000-8000-000000006001",
            pipeline_stage_id: values[0],
            version: 2
          }
        ] as Row[]
      };
    }

    if (sql.includes("select owner_user_id, version")) {
      return { rows: [{ owner_user_id: actor.userId, version: 1 }] as Row[] };
    }

    if (sql.includes("from public.pipeline_stages") && sql.includes("order by sort_order asc") && sql.includes("limit 1")) {
      return { rows: [{ id: "00000000-0000-4000-8000-000000005001" }] as Row[] };
    }

    if (sql.includes("from public.pipeline_stages") && sql.includes("order by sort_order asc, label asc")) {
      return {
        rows: [
          {
            id: "00000000-0000-4000-8000-000000005001",
            key: "qualified",
            label: "Qualified",
            sort_order: 10
          },
          {
            id: "00000000-0000-4000-8000-000000005002",
            key: "proposal",
            label: "Proposal",
            sort_order: 20
          }
        ] as Row[]
      };
    }

    if (sql.includes("from public.pipeline_stages") && sql.includes("and id = $1")) {
      return { rows: [{ id: values[0] }] as Row[] };
    }

    if (sql.includes("select") && sql.includes("account_count")) {
      return { rows: [{ account_count: 1, contact_count: 1, opportunity_count: 1 }] as Row[] };
    }

    if (sql.includes("from public.opportunities o")) {
      return {
        rows: [
          {
            id: "00000000-0000-4000-8000-000000006001",
            name: "Warehouse rollout",
            amount: 12000,
            currency: "AED",
            version: 1,
            owner_user_id: actor.userId,
            pipeline_stage_id: "00000000-0000-4000-8000-000000005001",
            account_name: "Gulf Logistics",
            contact_name: "Maya Haddad"
          }
        ] as Row[]
      };
    }

    if (sql.includes("insert into public.accounts") && sql.includes("returning id")) {
      return { rows: [{ id: "00000000-0000-4000-8000-000000003001" }] as Row[] };
    }

    if (sql.includes("insert into public.contacts") && sql.includes("returning id")) {
      return { rows: [{ id: "00000000-0000-4000-8000-000000004001" }] as Row[] };
    }

    if (sql.includes("insert into public.opportunities") && sql.includes("returning id")) {
      return { rows: [{ id: "00000000-0000-4000-8000-000000006001" }] as Row[] };
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
    const client = new RecordingCrmClient();
    const stages = await ensureDefaultCrmPipeline(client, actor);
    assert.equal(stages.length, 2);
    assert.equal(client.hasSql("insert into public.pipeline_stages"), true);
    assert.equal(client.valuesContain(actor.tenantId), true);
  }

  {
    const client = new RecordingCrmClient();
    const result = await createCrmVerticalSlice(client, actor, {
      account: { name: " Gulf Logistics ", industry: "Logistics" },
      contact: { firstName: "Maya", lastName: "Haddad", email: "MAYA@example.TEST" },
      opportunity: { name: "Warehouse rollout", amount: 12000 }
    });

    assert.equal(result.accountId, "00000000-0000-4000-8000-000000003001");
    assert.equal(result.contactId, "00000000-0000-4000-8000-000000004001");
    assert.equal(result.opportunityId, "00000000-0000-4000-8000-000000006001");
    assert.equal(client.hasSql("insert into public.accounts"), true);
    assert.equal(client.hasSql("insert into public.contacts"), true);
    assert.equal(client.hasSql("insert into public.opportunities"), true);
    assert.equal(client.valuesContain("maya@example.test"), true);
  }

  {
    const client = new RecordingCrmClient();
    const moved = await moveOpportunityToStage(
      client,
      actor,
      "00000000-0000-4000-8000-000000006001",
      "00000000-0000-4000-8000-000000005002"
    );
    assert.equal(moved.pipelineStageId, "00000000-0000-4000-8000-000000005002");
    assert.equal(moved.version, 2);
    assert.equal(client.hasSql("version = version + 1"), true);
  }

  {
    const client = new RecordingCrmClient();
    const dashboard = await listCrmDashboard(client, actor);
    assert.equal(dashboard.accountCount, 1);
    assert.equal(dashboard.pipeline[0]?.opportunities[0]?.name, "Warehouse rollout");
  }

  {
    const client = new RecordingCrmClient();
    await assert.rejects(
      () =>
        createCrmVerticalSlice(client, readonlyActor, {
          account: { name: "Blocked" },
          contact: { firstName: "Blocked" },
          opportunity: { name: "Blocked" }
        }),
      /Permission denied for crm.account.write/
    );
    assert.equal(client.calls.length, 0);
  }

  console.log("CRM vertical slice tests passed.");
}

void main();
