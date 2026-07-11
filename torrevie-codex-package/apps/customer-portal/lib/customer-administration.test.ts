import { strict as assert } from "node:assert";
import type { QueryResult, QueryValue, TenantQueryClient } from "@torrevie/tenant-context";
import {
  assignCustomerUserRole,
  assignableCustomerRoles,
  inviteCustomerUser,
  listCustomerMembers,
  setCustomerMembershipStatus,
  type CustomerAdminContext
} from "./customer-administration";

const adminContext: CustomerAdminContext = {
  tenantId: "00000000-0000-4000-8000-000000000101",
  userId: "00000000-0000-4000-8000-000000000201",
  roleScope: "customer",
  roles: ["customer_admin"]
};

const standardContext: CustomerAdminContext = {
  ...adminContext,
  userId: "00000000-0000-4000-8000-000000000202",
  roles: ["customer_standard_user"]
};

class RecordingTenantClient implements TenantQueryClient {
  readonly calls: Array<{ sql: string; values: readonly QueryValue[] }> = [];

  constructor(private readonly memberRows: unknown[] = []) {}

  async query<Row>(sql: string, values: readonly QueryValue[] = []): Promise<QueryResult<Row>> {
    this.calls.push({ sql, values });

    if (sql.includes("from public.roles")) {
      return { rows: [{ id: "00000000-0000-4000-8000-000000000901" }] as Row[] };
    }

    if (sql.includes("from public.tenant_memberships") && sql.includes("join public.users")) {
      return { rows: this.memberRows as Row[] };
    }

    if (sql.includes("from public.tenant_memberships") || sql.includes("update public.tenant_memberships")) {
      return { rows: [{ id: "00000000-0000-4000-8000-000000000801" }] as Row[] };
    }

    if (sql.includes("insert into public.users")) {
      return { rows: [{ id: "00000000-0000-4000-8000-000000000301" }] as Row[] };
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
  assert.deepEqual(assignableCustomerRoles.includes("customer_admin"), true);
  assert.deepEqual(assignableCustomerRoles.includes("integration_service"), false);
  assert.deepEqual(assignableCustomerRoles.includes("torrevie_platform_admin"), false);

  {
    const client = new RecordingTenantClient();
    const invited = await inviteCustomerUser(client, adminContext, {
      email: " New.User@Example.TEST ",
      displayName: "New User",
      role: "customer_manager"
    });

    assert.equal(invited.email, "new.user@example.test");
    assert.equal(invited.status, "invited");
    assert.deepEqual(invited.roles, ["customer_manager"]);
    assert.equal(client.hasSql("app.current_tenant_id"), true);
    assert.equal(client.hasSql("app.platform_service_role', 'true"), true);
    assert.equal(client.hasSql("public.tenant_memberships"), true);
    assert.equal(client.hasSql("public.user_role_assignments"), true);
    assert.equal(client.hasSql("public.audit_events"), true);
    assert.equal(client.valuesContain(adminContext.tenantId), true);
  }

  {
    const client = new RecordingTenantClient();
    await assert.rejects(
      () =>
        inviteCustomerUser(client, standardContext, {
          email: "blocked@example.test",
          role: "customer_readonly"
        }),
      /Permission denied for tenant.user.invite/
    );
    assert.equal(client.calls.length, 0);
  }

  {
    const client = new RecordingTenantClient();
    await assert.rejects(
      () =>
        inviteCustomerUser(client, adminContext, {
          email: "platform-role@example.test",
          role: "torrevie_platform_admin"
        }),
      /Role cannot be assigned/
    );
    assert.equal(client.calls.length, 0);
  }

  {
    const client = new RecordingTenantClient();
    await assignCustomerUserRole(
      client,
      adminContext,
      "00000000-0000-4000-8000-000000000301",
      "customer_readonly"
    );
    assert.equal(client.hasSql("delete from public.user_role_assignments"), true);
    assert.equal(client.valuesContain("tenant.role.assigned"), true);
  }

  {
    const client = new RecordingTenantClient();
    await setCustomerMembershipStatus(
      client,
      adminContext,
      "00000000-0000-4000-8000-000000000301",
      "disabled"
    );
    assert.equal(client.hasSql("update public.tenant_memberships"), true);
    assert.equal(client.valuesContain("tenant.user.disabled"), true);
  }

  {
    const client = new RecordingTenantClient();
    await assert.rejects(
      () => setCustomerMembershipStatus(client, adminContext, adminContext.userId, "disabled"),
      /cannot disable their own/
    );
    assert.equal(client.calls.length, 0);
  }

  {
    const client = new RecordingTenantClient([
      {
        user_id: "00000000-0000-4000-8000-000000000401",
        email: "member@example.test",
        display_name: "Member",
        status: "active",
        role_key: "customer_admin"
      },
      {
        user_id: "00000000-0000-4000-8000-000000000401",
        email: "member@example.test",
        display_name: "Member",
        status: "active",
        role_key: "customer_manager"
      }
    ]);
    const members = await listCustomerMembers(client, adminContext);
    assert.deepEqual(members, [
      {
        userId: "00000000-0000-4000-8000-000000000401",
        email: "member@example.test",
        displayName: "Member",
        status: "active",
        roles: ["customer_admin", "customer_manager"]
      }
    ]);
  }

  console.log("Customer administration tests passed.");
}

void main();
