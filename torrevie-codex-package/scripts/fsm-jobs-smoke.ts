import { strict as assert } from "node:assert";
import type { QueryResult, QueryValue, TenantQueryClient } from "@torrevie/tenant-context";
import {
  buildFsmJobInput,
  buildFsmJobStatusInput,
  createFsmJob,
  updateFsmJobStatus
} from "../apps/customer-portal/lib/fsm/jobs";

const tenantId = "30000000-0000-4000-8000-00000001f001";
const userId = "30000000-0000-4000-8000-00000000f001";
const jobId = "30000000-0000-4000-8000-00000002f001";

class RecordingClient implements TenantQueryClient {
  readonly statements: string[] = [];

  async query<Row>(sql: string, _values: readonly QueryValue[] = []): Promise<QueryResult<Row>> {
    this.statements.push(sql);

    if (sql.includes("from public.get_org_entitlements")) {
      return { rows: [{ feature_key: "fsm.core.jobs.enabled", enabled: true }] as Row[] };
    }

    if (sql.includes("insert into public.fsm_jobs") && sql.includes("returning id")) {
      return { rows: [{ id: jobId }] as Row[] };
    }

    if (sql.includes("select status") && sql.includes("from public.fsm_jobs")) {
      return { rows: [{ status: "assigned" }] as Row[] };
    }

    return { rows: [] };
  }

  hasSql(fragment: string) {
    return this.statements.some((statement) => statement.includes(fragment));
  }
}

const input = buildFsmJobInput({
  title: "AC unit fault",
  description: "Client reports warm air from lobby unit.",
  urgency: "high",
  accountId: "",
  siteText: "Main lobby",
  assignedUserId: userId,
  scheduledFor: ""
});

assert.equal(input.title, "AC unit fault");
assert.equal(input.urgency, "high");
assert.equal(input.accountId, null);
assert.equal(input.assignedUserId, userId);

assert.throws(
  () =>
    buildFsmJobInput({
      title: "",
      description: "",
      urgency: "medium",
      accountId: "",
      siteText: "",
      assignedUserId: "",
      scheduledFor: ""
    }),
  /Job title is required/
);

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const createClient = new RecordingClient();
  await createFsmJob(createClient, { tenantId, userId, roleScope: "customer" }, input);
  assert.equal(createClient.hasSql("from public.get_org_entitlements"), true);
  assert.equal(createClient.hasSql("insert into public.fsm_jobs"), true);
  assert.equal(createClient.hasSql("insert into public.fsm_job_state_history"), true);
  assert.equal(createClient.hasSql("insert into public.audit_events"), true);

  const statusInput = buildFsmJobStatusInput({
    jobId,
    status: "in_progress",
    note: "Technician started work."
  });
  assert.equal(statusInput.status, "in_progress");

  const updateClient = new RecordingClient();
  await updateFsmJobStatus(updateClient, { tenantId, userId, roleScope: "customer" }, statusInput);
  assert.equal(updateClient.hasSql("update public.fsm_jobs"), true);
  assert.equal(updateClient.hasSql("insert into public.fsm_job_state_history"), true);
  assert.equal(updateClient.hasSql("insert into public.audit_events"), true);

  console.log("FSM jobs smoke test passed.");
}
