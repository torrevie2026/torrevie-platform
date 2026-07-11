import { execFileSync, execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { hasPermission } from "../packages/permissions/src/index";
import { createTenant } from "../apps/admin-portal/lib/tenant-lifecycle";
import { assignSubscription, getEntitledProducts } from "../apps/admin-portal/lib/subscription-management";

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
const slug = `subscription-smoke-${now}`;

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
    input: `insert into public.users (id, email) values ('${actorUserId}', 'subscription-smoke-${now}@example.test');`,
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
      name: "Subscription Smoke",
      slug,
      status: "active",
      region: "UAE",
      legalEntityName: "Subscription Smoke LLC",
      billingEmail: "billing@example.test"
    },
    {
      defaultLocale: "en",
      timezone: "Asia/Dubai"
    },
    actorUserId
  );

  const { data: plan, error: planError } = await client
    .from("plans")
    .select("id,products!inner(key)")
    .eq("key", "growth")
    .eq("products.key", "crm")
    .single();

  if (planError || !plan) {
    throw new Error(`Unable to find CRM growth plan: ${planError?.message ?? "missing plan"}`);
  }

  const subscription = await assignSubscription(
    client,
    {
      tenantId: tenant.id,
      planId: String(plan.id),
      status: "active",
      startsAt: new Date().toISOString()
    },
    actorUserId
  );

  if (subscription.product_key !== "crm") {
    throw new Error(`Expected CRM subscription, received ${subscription.product_key}.`);
  }

  if (subscription.entitlement_count < 1) {
    throw new Error("Expected plan-derived subscription entitlements.");
  }

  const entitledProducts = await getEntitledProducts(client, tenant.id);
  const decision = hasPermission({
    roles: ["customer_admin"],
    permission: "crm.account.read",
    entitledProducts
  });

  if (!decision.allowed) {
    throw new Error(`Expected CRM entitlement to allow crm.account.read, received ${decision.reason}.`);
  }

  const { count, error: auditError } = await client
    .from("audit_events")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenant.id)
    .eq("action", "subscription.assigned");

  if (auditError) {
    throw new Error(`Unable to verify subscription audit event: ${auditError.message}`);
  }

  if (count !== 1) {
    throw new Error(`Expected 1 subscription audit event, received ${count ?? 0}.`);
  }

  console.log("Subscription management smoke test passed.");
}

void main();
