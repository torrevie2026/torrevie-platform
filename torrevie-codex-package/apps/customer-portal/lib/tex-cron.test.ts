import assert from "node:assert/strict";
import type { QueryResult, QueryValue, TenantQueryClient } from "@torrevie/tenant-context";
import { runTexFxRefreshCron } from "./tex-cron";

class RecordingTexCronClient implements TenantQueryClient {
  readonly calls: Array<{ sql: string; values: readonly QueryValue[] }> = [];

  async query<RowType>(
    sql: string,
    values: readonly QueryValue[] = []
  ): Promise<QueryResult<RowType>> {
    this.calls.push({ sql, values });

    if (sql.includes("from public.subscriptions")) {
      return {
        rows: [
          { tenant_id: "00000000-0000-4000-8000-000000001001" },
          { tenant_id: "00000000-0000-4000-8000-000000001002" }
        ] as RowType[]
      };
    }

    if (sql.trim().toLowerCase() === "begin" || sql.trim().toLowerCase() === "commit") {
      return { rows: [] };
    }

    if (sql.includes("set_config('app.current_tenant_id'")) {
      return { rows: [] };
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
        ] as RowType[]
      };
    }

    if (sql.includes("set_config('app.platform_service_role'")) {
      return { rows: [] };
    }

    if (sql.includes("insert into public.tex_fx_rates")) {
      return {
        rows: [{ id: "00000000-0000-4000-8000-000000017001" }] as RowType[]
      };
    }

    if (sql.includes("insert into public.audit_events")) {
      return { rows: [] };
    }

    return { rows: [] };
  }

  hasSql(pattern: string) {
    return this.calls.some((call) => call.sql.includes(pattern));
  }

  tenantContextValues() {
    return this.calls
      .filter((call) => call.sql.includes("set_config('app.current_tenant_id'"))
      .map((call) => call.values[0]);
  }
}

async function main() {
  const client = new RecordingTexCronClient();
  const previousKey = process.env.FX_API_KEY;

  try {
    process.env.FX_API_KEY = "fx-test";
    const result = await runTexFxRefreshCron(client, async () =>
      Response.json({ result: "success", conversion_rates: { EUR: 0.91, GBP: 0.78 } })
    );

    assert.equal(result.tenantCount, 2);
    assert.equal(result.refreshed, 2);
    assert.equal(result.failed, 0);
    assert.deepEqual(client.tenantContextValues(), [
      "00000000-0000-4000-8000-000000001001",
      "00000000-0000-4000-8000-000000001002"
    ]);
    assert.equal(client.hasSql("from public.subscriptions"), true);
    assert.equal(client.hasSql("insert into public.tex_fx_rates"), true);
  } finally {
    if (previousKey === undefined) {
      delete process.env.FX_API_KEY;
    } else {
      process.env.FX_API_KEY = previousKey;
    }
  }
}

void main().then(() => {
  console.log("TEX cron tests passed.");
});
