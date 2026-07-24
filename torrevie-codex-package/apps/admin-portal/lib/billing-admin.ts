import type { SupabaseClient } from "@supabase/supabase-js";
import type { TexPlanKey } from "./tex-admin";

export type BillingProvider = "stripe";
export type BillingProductKey = "tex";

export type BillingOverviewRecord = {
  tenant_id: string;
  tenant_name: string;
  product_key: BillingProductKey;
  provider: BillingProvider;
  billing_email: string;
  customer_currency: string;
  provider_customer_id: string;
  provider_subscription_id: string;
  provider_price_id: string;
  plan_key: TexPlanKey | null;
  subscription_currency: string;
  provider_status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  latest_invoice_id: string | null;
  subscription_updated_at: string | null;
  latest_event_type: string | null;
  latest_event_status: string | null;
  latest_event_processed_at: string | null;
  latest_event_error: string | null;
  processed_event_count: number;
  failed_event_count: number;
  ignored_event_count: number;
};

type TenantRelation = { id: string; name: string; created_at: string };

type TexBillingCustomerRow = {
  tenant_id: string;
  stripe_customer_id: string;
  billing_email: string;
  currency: string;
  tenants: TenantRelation | TenantRelation[] | null;
};

type TexBillingSubscriptionRow = {
  tenant_id: string;
  stripe_customer_id: string;
  stripe_subscription_id: string;
  stripe_price_id: string;
  plan_key: TexPlanKey;
  currency: string;
  stripe_status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
  latest_invoice_id: string | null;
  updated_at: string;
  tenants: TenantRelation | TenantRelation[] | null;
};

type TexBillingEventRow = {
  tenant_id: string | null;
  event_type: string;
  status: "processed" | "ignored" | "failed";
  error: string | null;
  processed_at: string;
};

export async function listBillingOverview(
  client: SupabaseClient
): Promise<BillingOverviewRecord[]> {
  const [customers, subscriptions, events] = await Promise.all([
    client
      .from("tex_billing_customers")
      .select("tenant_id,stripe_customer_id,billing_email,currency,tenants(id,name,created_at)")
      .order("updated_at", { ascending: false }),
    client
      .from("tex_billing_subscriptions")
      .select(
        "tenant_id,stripe_customer_id,stripe_subscription_id,stripe_price_id,plan_key,currency,stripe_status,current_period_start,current_period_end,cancel_at_period_end,latest_invoice_id,updated_at,tenants(id,name,created_at)"
      )
      .order("updated_at", { ascending: false }),
    client
      .from("tex_billing_events")
      .select("tenant_id,event_type,status,error,processed_at")
      .order("processed_at", { ascending: false })
      .limit(100)
  ]);

  if (customers.error) {
    throw new Error(`Unable to list TEX Stripe billing customers: ${customers.error.message}`);
  }

  if (subscriptions.error) {
    throw new Error(
      `Unable to list TEX Stripe billing subscriptions: ${subscriptions.error.message}`
    );
  }

  if (events.error) {
    throw new Error(`Unable to list TEX Stripe billing events: ${events.error.message}`);
  }

  const customerRows = (customers.data ?? []) as TexBillingCustomerRow[];
  const subscriptionRows = (subscriptions.data ?? []) as TexBillingSubscriptionRow[];
  const eventRows = (events.data ?? []) as TexBillingEventRow[];
  const customersByTenant = new Map(customerRows.map((row) => [row.tenant_id, row]));
  const subscriptionsByTenant = new Map(subscriptionRows.map((row) => [row.tenant_id, row]));
  const eventStats = summarizeBillingEvents(eventRows);
  const tenantIds = new Set([
    ...customersByTenant.keys(),
    ...subscriptionsByTenant.keys(),
    ...eventStats.keys()
  ]);

  return [...tenantIds]
    .map((tenantId) => {
      const customer = customersByTenant.get(tenantId);
      const subscription = subscriptionsByTenant.get(tenantId);
      const tenant = firstRelation(subscription?.tenants ?? customer?.tenants ?? null);
      const stats = eventStats.get(tenantId);

      return {
        tenant_id: tenantId,
        tenant_name: tenant?.name ?? tenantId,
        product_key: "tex" as const,
        provider: "stripe" as const,
        billing_email: customer?.billing_email ?? "",
        customer_currency: customer?.currency ?? "",
        provider_customer_id: customer?.stripe_customer_id ?? subscription?.stripe_customer_id ?? "",
        provider_subscription_id: subscription?.stripe_subscription_id ?? "",
        provider_price_id: subscription?.stripe_price_id ?? "",
        plan_key: subscription?.plan_key ?? null,
        subscription_currency: subscription?.currency ?? "",
        provider_status: subscription?.stripe_status ?? "not_connected",
        current_period_start: subscription?.current_period_start ?? null,
        current_period_end: subscription?.current_period_end ?? null,
        cancel_at_period_end: Boolean(subscription?.cancel_at_period_end),
        latest_invoice_id: subscription?.latest_invoice_id ?? null,
        subscription_updated_at: subscription?.updated_at ?? null,
        latest_event_type: stats?.latest?.event_type ?? null,
        latest_event_status: stats?.latest?.status ?? null,
        latest_event_processed_at: stats?.latest?.processed_at ?? null,
        latest_event_error: stats?.latest?.error ?? null,
        processed_event_count: stats?.processed ?? 0,
        failed_event_count: stats?.failed ?? 0,
        ignored_event_count: stats?.ignored ?? 0
      };
    })
    .sort((first, second) => {
      const firstDate = first.subscription_updated_at ?? first.latest_event_processed_at ?? "";
      const secondDate = second.subscription_updated_at ?? second.latest_event_processed_at ?? "";
      return secondDate.localeCompare(firstDate);
    });
}

function summarizeBillingEvents(rows: TexBillingEventRow[]) {
  const stats = new Map<
    string,
    {
      latest: TexBillingEventRow | null;
      processed: number;
      failed: number;
      ignored: number;
    }
  >();

  for (const row of rows) {
    if (!row.tenant_id) {
      continue;
    }

    const tenantStats =
      stats.get(row.tenant_id) ??
      {
        latest: null,
        processed: 0,
        failed: 0,
        ignored: 0
      };

    if (!tenantStats.latest || row.processed_at > tenantStats.latest.processed_at) {
      tenantStats.latest = row;
    }

    if (row.status === "processed") tenantStats.processed += 1;
    if (row.status === "failed") tenantStats.failed += 1;
    if (row.status === "ignored") tenantStats.ignored += 1;

    stats.set(row.tenant_id, tenantStats);
  }

  return stats;
}

function firstRelation<T>(relation: T | T[] | null): T | null {
  return Array.isArray(relation) ? (relation[0] ?? null) : relation;
}
