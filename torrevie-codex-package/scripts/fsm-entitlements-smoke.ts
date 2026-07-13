import { execFileSync, execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { createTenant } from "../apps/admin-portal/lib/tenant-lifecycle";
import { assignSubscription } from "../apps/admin-portal/lib/subscription-management";

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

execFileSync(
  "docker",
  ["exec", "-i", containerName, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-f", "-"],
  {
    input: `insert into public.users (id, email) values ('${actorUserId}', 'fsm-entitlements-${now}@example.test');`,
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
      name: "FSM Entitlements Smoke",
      slug: `fsm-entitlements-${now}`,
      status: "active",
      region: "UAE",
      legalEntityName: "FSM Entitlements Smoke LLC",
      billingEmail: "fsm-entitlements@example.test"
    },
    {
      defaultLocale: "en",
      timezone: "Asia/Dubai"
    },
    actorUserId
  );

  const { error: tenantUpdateError } = await client
    .from("tenants")
    .update({
      business_segment: "SOLO",
      plan_tier: "entry",
      terminology_pack: "solo",
      nav_profile: "solo"
    })
    .eq("id", tenant.id);

  if (tenantUpdateError) {
    throw new Error(`Unable to set FSM tenant controls: ${tenantUpdateError.message}`);
  }

  const { data: entryPlan, error: planError } = await client
    .from("plans")
    .select("id,products!inner(key)")
    .eq("key", "entry")
    .eq("products.key", "fsm")
    .single();

  if (planError || !entryPlan) {
    throw new Error(`Unable to find FSM Entry plan: ${planError?.message ?? "missing plan"}`);
  }

  await assignSubscription(
    client,
    {
      tenantId: tenant.id,
      planId: String(entryPlan.id),
      status: "active",
      startsAt: new Date().toISOString()
    },
    actorUserId
  );

  const entryEntitlements = await getEntitlements(tenant.id);
  if (!entryEntitlements.some((entitlement) => entitlement.feature_key === "fsm.core.jobs.enabled")) {
    throw new Error("Expected FSM Entry to include core jobs.");
  }

  if (entryEntitlements.some((entitlement) => entitlement.feature_key === "fsm.module.pm")) {
    throw new Error("FSM Entry must not include PM before an override.");
  }

  const { error: overrideError } = await client.from("org_feature_overrides").insert({
    tenant_id: tenant.id,
    feature_key: "fsm.module.pm",
    enabled: true,
    reason: "WP-27 smoke trial override",
    created_by: actorUserId,
    updated_by: actorUserId
  });

  if (overrideError) {
    throw new Error(`Unable to create PM override: ${overrideError.message}`);
  }

  const overriddenEntitlements = await getEntitlements(tenant.id);
  const pm = overriddenEntitlements.find((entitlement) => entitlement.feature_key === "fsm.module.pm");

  if (!pm || pm.source !== "override") {
    throw new Error("Expected PM entitlement to be granted by override.");
  }

  console.log("FSM entitlements smoke test passed.");
}

async function getEntitlements(tenantId: string) {
  const { data, error } = await client.rpc("get_org_entitlements", { org_id: tenantId });

  if (error) {
    throw new Error(`Unable to resolve FSM entitlements: ${error.message}`);
  }

  return (data ?? []) as Array<{
    feature_key: string;
    enabled: boolean;
    limit_value: number | null;
    source: string;
  }>;
}

void main();
