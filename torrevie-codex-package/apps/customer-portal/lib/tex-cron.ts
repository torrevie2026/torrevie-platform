import type { TenantQueryClient } from "@torrevie/tenant-context";
import {
  defaultTexPlanContext,
  refreshTexFxRates,
  type TexActorContext,
  type TexFxRefreshResult
} from "./tex";

export type TexFxCronTenantResult = {
  tenantId: string;
  result: TexFxRefreshResult | null;
  error: string | null;
};

export type TexFxCronResult = {
  tenantCount: number;
  refreshed: number;
  failed: number;
  tenants: TexFxCronTenantResult[];
};

const TEX_CRON_ACTOR_USER_ID = "00000000-0000-4000-8000-000000000000";

export async function runTexFxRefreshCron(
  client: TenantQueryClient,
  fetcher: typeof fetch = globalThis.fetch.bind(globalThis)
): Promise<TexFxCronResult> {
  const tenants = await listTexFxRefreshTenantIds(client);
  const results: TexFxCronTenantResult[] = [];

  for (const tenantId of tenants) {
    try {
      const result = await refreshTexFxRates(client, texCronActor(tenantId), fetcher);
      results.push({ tenantId, result, error: null });
    } catch (error) {
      results.push({ tenantId, result: null, error: errorMessage(error) });
    }
  }

  return {
    tenantCount: tenants.length,
    refreshed: results.filter((entry) => entry.result?.source !== "none").length,
    failed: results.filter((entry) => entry.error || entry.result?.source === "none").length,
    tenants: results
  };
}

async function listTexFxRefreshTenantIds(client: TenantQueryClient) {
  const result = await client.query<{ tenant_id: string }>(
    `
      select distinct s.tenant_id
      from public.subscriptions s
      join public.products p on p.id = s.product_id
      join public.tenants t on t.id = s.tenant_id
      where p.key = 'tex'
        and t.status in ('active', 'trial')
        and s.status in ('trial', 'active')
        and s.starts_at <= now()
        and (s.expires_at is null or s.expires_at > now())
      order by s.tenant_id
    `
  );

  return result.rows.map((row) => row.tenant_id);
}

function texCronActor(tenantId: string): TexActorContext {
  return {
    tenantId,
    userId: TEX_CRON_ACTOR_USER_ID,
    roleScope: "customer",
    roles: ["integration_service"],
    entitledProducts: ["tex"],
    texPlan: defaultTexPlanContext(),
    integrationPermissions: ["tex.integration.manage"]
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
