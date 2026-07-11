import { execFileSync, execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { createTenant, setTenantStatus } from "../apps/admin-portal/lib/tenant-lifecycle";

const statusOutput = execSync("pnpm exec supabase status --output json", {
  encoding: "utf8"
});
const statusJson = statusOutput.slice(statusOutput.indexOf("{"), statusOutput.lastIndexOf("}") + 1);
const status = JSON.parse(statusJson) as {
  API_URL: string;
  SERVICE_ROLE_KEY: string;
};

const projectId = "torrevie-codex-package";
const containerName = `supabase_db_${projectId}`;
const actorUserId = randomUUID();
const now = Date.now();
const slug = `tenant-lifecycle-${now}`;

execFileSync(
  "docker",
  [
    "exec",
    "-i",
    containerName,
    "psql",
    "-U",
    "postgres",
    "-d",
    "postgres",
    "-v",
    "ON_ERROR_STOP=1",
    "-f",
    "-"
  ],
  {
    input: `insert into public.users (id, email) values ('${actorUserId}', 'tenant-lifecycle-${now}@example.test');`,
    stdio: ["pipe", "ignore", "inherit"]
  }
);

const client = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

async function main() {
  const tenant = await createTenant(
    client,
    {
      name: "Tenant Lifecycle Smoke",
      slug,
      status: "trial",
      region: "UAE",
      legalEntityName: "Tenant Lifecycle Smoke LLC",
      billingEmail: "billing@example.test"
    },
    {
      defaultLocale: "en",
      timezone: "Asia/Dubai"
    },
    actorUserId
  );

  if (tenant.status !== "trial") {
    throw new Error(`Expected created tenant to be trial, received ${tenant.status}.`);
  }

  const suspended = await setTenantStatus(client, tenant.id, "suspended", actorUserId);

  if (suspended.status !== "suspended") {
    throw new Error(`Expected suspended tenant status, received ${suspended.status}.`);
  }

  const { count, error } = await client
    .from("audit_events")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenant.id)
    .in("action", ["tenant.created", "tenant.suspended"]);

  if (error) {
    throw new Error(`Unable to verify audit events: ${error.message}`);
  }

  if (count !== 2) {
    throw new Error(`Expected 2 tenant lifecycle audit events, received ${count ?? 0}.`);
  }

  console.log("Tenant lifecycle smoke test passed.");
}

void main();
