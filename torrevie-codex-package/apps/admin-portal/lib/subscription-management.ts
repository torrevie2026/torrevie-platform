import type { ProductKey } from "@torrevie/permissions";
import type { SupabaseClient } from "@supabase/supabase-js";

export const subscriptionStatuses = ["trial", "active", "expired", "cancelled"] as const;
export type SubscriptionStatus = (typeof subscriptionStatuses)[number];

export type ProductRecord = {
  id: string;
  key: ProductKey;
  label: string;
};

export type PlanRecord = {
  id: string;
  product_id: string;
  key: string;
  label: string;
  product_key: ProductKey;
  product_label: string;
};

export type SubscriptionRecord = {
  id: string;
  tenant_id: string;
  product_id: string;
  plan_id: string;
  status: SubscriptionStatus;
  starts_at: string;
  expires_at: string | null;
  product_key: ProductKey;
  product_label: string;
  plan_key: string;
  plan_label: string;
  entitlement_count: number;
};

export type SubscriptionAssignmentInput = {
  tenantId: string;
  planId: string;
  status: SubscriptionStatus;
  startsAt: string;
  expiresAt?: string | null;
};

type PlanFeatureRow = {
  feature_key: string;
  limit_value: number | null;
};

type SubscriptionRow = {
  id: string;
  tenant_id: string;
  product_id: string;
  plan_id: string;
  status: SubscriptionStatus;
  starts_at: string;
  expires_at: string | null;
};

type ProductRow = {
  id: string;
  key: ProductKey;
  label: string;
};

type PlanWithProductRow = {
  id: string;
  product_id: string;
  key: string;
  label: string;
  products: ProductRow | ProductRow[] | null;
};

type SubscriptionWithRelationsRow = SubscriptionRow & {
  products: ProductRow | ProductRow[] | null;
  plans:
    | {
        key: string;
        label: string;
      }
    | Array<{
        key: string;
        label: string;
      }>
    | null;
};

export async function listSubscriptionCatalog(client: SupabaseClient): Promise<PlanRecord[]> {
  const { data, error } = await client
    .from("plans")
    .select("id,product_id,key,label,products(id,key,label)")
    .order("label", { ascending: true });

  if (error) {
    throw new Error(`Unable to list plans: ${error.message}`);
  }

  return ((data ?? []) as PlanWithProductRow[]).map(mapPlan);
}

export async function listSubscriptions(client: SupabaseClient): Promise<SubscriptionRecord[]> {
  const { data, error } = await client
    .from("subscriptions")
    .select("id,tenant_id,product_id,plan_id,status,starts_at,expires_at,products(id,key,label),plans(key,label)")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Unable to list subscriptions: ${error.message}`);
  }

  const rows = (data ?? []) as SubscriptionWithRelationsRow[];

  if (rows.length === 0) {
    return [];
  }

  const { data: entitlementRows, error: entitlementError } = await client
    .from("subscription_entitlements")
    .select("subscription_id")
    .in(
      "subscription_id",
      rows.map((row) => row.id)
    );

  if (entitlementError) {
    throw new Error(`Unable to list subscription entitlements: ${entitlementError.message}`);
  }

  const entitlementCounts = new Map<string, number>();

  for (const row of (entitlementRows ?? []) as Array<{ subscription_id: string }>) {
    entitlementCounts.set(row.subscription_id, (entitlementCounts.get(row.subscription_id) ?? 0) + 1);
  }

  return rows.map((row) => mapSubscription(row, entitlementCounts.get(row.id) ?? 0));
}

export async function assignSubscription(
  client: SupabaseClient,
  input: SubscriptionAssignmentInput,
  actorUserId: string
): Promise<SubscriptionRecord> {
  const sanitized = sanitizeAssignment(input);
  const plan = await getPlan(client, sanitized.planId);

  const { data, error } = await client
    .from("subscriptions")
    .upsert(
      {
        tenant_id: sanitized.tenantId,
        product_id: plan.product_id,
        plan_id: plan.id,
        status: sanitized.status,
        starts_at: sanitized.startsAt,
        expires_at: sanitized.expiresAt,
        created_by: actorUserId,
        updated_by: actorUserId
      },
      {
        onConflict: "tenant_id,product_id"
      }
    )
    .select("id,tenant_id,product_id,plan_id,status,starts_at,expires_at")
    .single();

  if (error) {
    throw new Error(`Unable to assign subscription: ${error.message}`);
  }

  const subscription = data as SubscriptionRow;
  await replaceEntitlementsFromPlan(client, subscription, sanitized.planId, actorUserId);
  await writeSubscriptionAuditEvent(client, {
    tenantId: sanitized.tenantId,
    actorUserId,
    action: "subscription.assigned",
    subscriptionId: subscription.id,
    metadata: {
      product_key: plan.product_key,
      plan_key: plan.key,
      status: sanitized.status
    }
  });

  return {
    ...subscription,
    product_key: plan.product_key,
    product_label: plan.product_label,
    plan_key: plan.key,
    plan_label: plan.label,
    entitlement_count: await countEntitlements(client, subscription.id)
  };
}

export async function getEntitledProducts(client: SupabaseClient, tenantId: string): Promise<ProductKey[]> {
  assertUuid(tenantId, "tenant id");
  const { data, error } = await client
    .from("subscriptions")
    .select("products(key)")
    .eq("tenant_id", tenantId)
    .in("status", ["trial", "active"]);

  if (error) {
    throw new Error(`Unable to resolve entitled products: ${error.message}`);
  }

  return [
    ...new Set(
      ((data ?? []) as Array<{ products: Pick<ProductRow, "key"> | Array<Pick<ProductRow, "key">> | null }>)
        .map((row) => firstRelation(row.products)?.key)
        .filter((key): key is ProductKey => Boolean(key))
    )
  ];
}

async function getPlan(client: SupabaseClient, planId: string): Promise<PlanRecord> {
  assertUuid(planId, "plan id");
  const { data, error } = await client
    .from("plans")
    .select("id,product_id,key,label,products(id,key,label)")
    .eq("id", planId)
    .single();

  if (error) {
    throw new Error(`Unable to get plan: ${error.message}`);
  }

  return mapPlan(data as PlanWithProductRow);
}

async function replaceEntitlementsFromPlan(
  client: SupabaseClient,
  subscription: SubscriptionRow,
  planId: string,
  actorUserId: string
) {
  const { data: features, error: featuresError } = await client
    .from("plan_features")
    .select("feature_key,limit_value")
    .eq("plan_id", planId)
    .order("feature_key", { ascending: true });

  if (featuresError) {
    throw new Error(`Unable to list plan features: ${featuresError.message}`);
  }

  const { error: deleteError } = await client
    .from("subscription_entitlements")
    .delete()
    .eq("subscription_id", subscription.id);

  if (deleteError) {
    throw new Error(`Unable to replace entitlements: ${deleteError.message}`);
  }

  const entitlements = ((features ?? []) as PlanFeatureRow[]).map((feature) => ({
    tenant_id: subscription.tenant_id,
    subscription_id: subscription.id,
    feature_key: feature.feature_key,
    limit_value: feature.limit_value,
    override_reason: null,
    created_by: actorUserId,
    updated_by: actorUserId
  }));

  if (entitlements.length === 0) {
    return;
  }

  const { error: insertError } = await client.from("subscription_entitlements").insert(entitlements);

  if (insertError) {
    throw new Error(`Unable to insert entitlements: ${insertError.message}`);
  }
}

async function countEntitlements(client: SupabaseClient, subscriptionId: string) {
  const { count, error } = await client
    .from("subscription_entitlements")
    .select("id", { count: "exact", head: true })
    .eq("subscription_id", subscriptionId);

  if (error) {
    throw new Error(`Unable to count entitlements: ${error.message}`);
  }

  return count ?? 0;
}

async function writeSubscriptionAuditEvent(
  client: SupabaseClient,
  event: {
    tenantId: string;
    actorUserId: string;
    action: string;
    subscriptionId: string;
    metadata: Record<string, string>;
  }
) {
  const { error } = await client.from("audit_events").insert({
    tenant_id: event.tenantId,
    actor_user_id: event.actorUserId,
    action: event.action,
    target_type: "subscription",
    target_id: event.subscriptionId,
    metadata: event.metadata
  });

  if (error) {
    throw new Error(`Unable to write subscription audit event: ${error.message}`);
  }
}

function sanitizeAssignment(input: SubscriptionAssignmentInput): Required<SubscriptionAssignmentInput> {
  assertUuid(input.tenantId, "tenant id");
  assertUuid(input.planId, "plan id");
  assertSubscriptionStatus(input.status);

  const startsAt = parseDate(input.startsAt, "start date");
  const expiresAt = input.expiresAt ? parseDate(input.expiresAt, "expiry date") : null;

  if (expiresAt && expiresAt <= startsAt) {
    throw new Error("Expiry date must be after the start date.");
  }

  return {
    tenantId: input.tenantId,
    planId: input.planId,
    status: input.status,
    startsAt: startsAt.toISOString(),
    expiresAt: expiresAt?.toISOString() ?? null
  };
}

function parseDate(value: string, label: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid ${label}.`);
  }

  return date;
}

function assertSubscriptionStatus(status: string): asserts status is SubscriptionStatus {
  if (!subscriptionStatuses.includes(status as SubscriptionStatus)) {
    throw new Error(`Unsupported subscription status: ${status}`);
  }
}

function assertUuid(value: string, label: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(`Invalid ${label}.`);
  }
}

function mapPlan(row: PlanWithProductRow): PlanRecord {
  const product = firstRelation(row.products);

  if (!product) {
    throw new Error("Plan product is missing.");
  }

  return {
    id: row.id,
    product_id: row.product_id,
    key: row.key,
    label: row.label,
    product_key: product.key,
    product_label: product.label
  };
}

function mapSubscription(row: SubscriptionWithRelationsRow, entitlementCount: number): SubscriptionRecord {
  const product = firstRelation(row.products);
  const plan = firstRelation(row.plans);

  if (!product || !plan) {
    throw new Error("Subscription relations are missing.");
  }

  return {
    id: row.id,
    tenant_id: row.tenant_id,
    product_id: row.product_id,
    plan_id: row.plan_id,
    status: row.status,
    starts_at: row.starts_at,
    expires_at: row.expires_at,
    product_key: product.key,
    product_label: product.label,
    plan_key: plan.key,
    plan_label: plan.label,
    entitlement_count: entitlementCount
  };
}

function firstRelation<T>(relation: T | T[] | null): T | null {
  return Array.isArray(relation) ? (relation[0] ?? null) : relation;
}
