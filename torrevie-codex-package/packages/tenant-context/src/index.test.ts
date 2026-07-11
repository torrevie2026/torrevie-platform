import assert from "node:assert/strict";
import {
  TenantContextError,
  chooseActiveMembership,
  resolveTenantContext,
  setTenantContext,
  withTenantContext,
  type QueryResult,
  type QueryValue,
  type TenantMembershipRow,
  type TenantQueryClient
} from "./index.js";

const rows: TenantMembershipRow[] = [
  {
    tenant_id: "tenant-older",
    user_id: "user-1",
    membership_status: "active",
    user_status: "active",
    role_scope: "customer",
    joined_at: "2026-01-01T00:00:00.000Z",
    created_at: "2026-01-01T00:00:00.000Z"
  },
  {
    tenant_id: "tenant-newer",
    user_id: "user-1",
    membership_status: "active",
    user_status: "active",
    role_scope: "customer",
    joined_at: "2026-02-01T00:00:00.000Z",
    created_at: "2026-02-01T00:00:00.000Z"
  }
];

assert.equal(chooseActiveMembership("user-1", rows).tenantId, "tenant-newer");

assert.equal(
  chooseActiveMembership("user-1", [
    ...rows,
    {
      tenant_id: "tenant-platform",
      user_id: "user-1",
      membership_status: "active",
      user_status: "active",
      role_scope: "platform",
      joined_at: "2026-01-15T00:00:00.000Z",
      created_at: "2026-01-15T00:00:00.000Z"
    }
  ]).tenantId,
  "tenant-platform"
);

assert.throws(
  () =>
    chooseActiveMembership("user-2", [
      {
        tenant_id: "tenant-disabled",
        user_id: "user-2",
        membership_status: "disabled",
        user_status: "active",
        role_scope: "customer",
        joined_at: null,
        created_at: "2026-01-01T00:00:00.000Z"
      }
    ]),
  (error) => error instanceof TenantContextError && error.code === "membership_not_found"
);

class FakeClient implements TenantQueryClient {
  readonly queries: Array<{ sql: string; values?: readonly QueryValue[] }> = [];

  constructor(private readonly rowsToReturn: TenantMembershipRow[] = rows) {}

  async query<Row>(sql: string, values?: readonly QueryValue[]): Promise<QueryResult<Row>> {
    this.queries.push({ sql, values });
    return { rows: this.rowsToReturn as Row[] };
  }
}

const resolvingClient = new FakeClient();
assert.deepEqual(await resolveTenantContext(resolvingClient, "user-1"), {
  tenantId: "tenant-newer",
  userId: "user-1",
  roleScope: "customer"
});
assert.deepEqual(resolvingClient.queries[0]?.values, ["user-1"]);

const settingClient = new FakeClient();
await setTenantContext(settingClient, "tenant-newer");
assert.match(settingClient.queries[0]?.sql ?? "", /set_config\('app\.current_tenant_id'/);
assert.deepEqual(settingClient.queries[0]?.values, ["tenant-newer"]);

const transactionClient = new FakeClient();
const transactionResult = await withTenantContext(
  transactionClient,
  { tenantId: "tenant-newer", userId: "user-1", roleScope: "customer" },
  async () => "ok"
);
assert.equal(transactionResult, "ok");
assert.deepEqual(
  transactionClient.queries.map((query) => query.sql.trim().split(/\s+/).slice(0, 2).join(" ")),
  ["begin", "select set_config('app.current_tenant_id',", "commit"]
);

const rollbackClient = new FakeClient();
await assert.rejects(
  withTenantContext(
    rollbackClient,
    { tenantId: "tenant-newer", userId: "user-1", roleScope: "customer" },
    async () => {
      throw new Error("fail");
    }
  )
);
assert.equal(rollbackClient.queries.at(-1)?.sql, "rollback");

console.log("Tenant-context unit tests passed.");
