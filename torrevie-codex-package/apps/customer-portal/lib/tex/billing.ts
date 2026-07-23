import { createHmac, timingSafeEqual } from "node:crypto";
import { assertTexPermission } from "./access";
import { assertUuid } from "./shared";
import type { TexActorContext, TexPlanKey, TexPlanStatus } from "./types";
import { queryServerDatabase } from "../server/tenant-query-client";

export type TexBillingCurrency = "aed" | "usd";
export type TexPaidPlanKey = Extract<TexPlanKey, "lite" | "growth">;

export type TexCheckoutInput = {
  planKey: string;
  currency?: string | null;
};

export type TexBillingSyncInput = {
  sessionId?: string | null;
};

export type TexStripeEvent = {
  id: string;
  type: string;
  data?: {
    object?: Record<string, unknown>;
  };
};

type TexBillingTenantRow = {
  tenant_id: string;
  tenant_name: string;
  billing_email: string | null;
  user_email: string;
  region: string | null;
  stripe_customer_id: string | null;
};

type StripeCustomer = {
  id: string;
};

type StripeCheckoutSession = {
  id?: string;
  customer?: string | null;
  metadata?: Record<string, string>;
  subscription?: string | null;
  url: string | null;
};

type StripeSubscriptionList = {
  data?: StripeSubscriptionObject[];
};

type StripePortalSession = {
  url: string | null;
};

type StripeSubscriptionObject = {
  id: string;
  customer: string;
  status: string;
  items?: {
    data?: Array<{
      current_period_start?: number;
      current_period_end?: number;
      price?: {
        id?: string;
        currency?: string;
      };
    }>;
  };
  metadata?: Record<string, string>;
  current_period_start?: number;
  current_period_end?: number;
  cancel_at_period_end?: boolean;
  latest_invoice?: string | { id?: string } | null;
};

const paidPlanKeys = ["lite", "growth"] as const;
const supportedCurrencies = ["aed", "usd"] as const;

export async function createTexBillingCheckoutSession(
  actor: TexActorContext,
  input: TexCheckoutInput
) {
  assertTexPermission(actor, "tenant.settings.manage");
  const planKey = sanitizePaidPlanKey(input.planKey);
  const tenant = await getBillingTenant(actor);
  const currency = sanitizeCurrency(input.currency) ?? defaultBillingCurrency(tenant);
  const priceId = requireStripePriceId(planKey, currency);
  const customerId = await ensureStripeCustomer(actor, tenant, currency);
  const baseUrl = customerPortalBaseUrl();

  const session = await stripeRequest<StripeCheckoutSession>("/v1/checkout/sessions", {
    method: "POST",
    form: {
      mode: "subscription",
      customer: customerId,
      "line_items[0][price]": priceId,
      "line_items[0][quantity]": "1",
      success_url: `${baseUrl}/en/tex/settings?billing=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/en/tex/settings?billing=cancelled`,
      "metadata[tenant_id]": actor.tenantId,
      "metadata[product_key]": "tex",
      "metadata[plan_key]": planKey,
      "subscription_data[metadata][tenant_id]": actor.tenantId,
      "subscription_data[metadata][product_key]": "tex",
      "subscription_data[metadata][plan_key]": planKey
    }
  });

  if (!session.url) {
    throw new Error("Stripe did not return a checkout URL.");
  }

  await auditBillingEvent(actor.tenantId, actor.userId, "tex.billing.checkout_started", {
    plan_key: planKey,
    currency
  });

  return {
    url: session.url
  };
}

export async function createTexBillingPortalSession(actor: TexActorContext) {
  assertTexPermission(actor, "tenant.settings.manage");
  const tenant = await getBillingTenant(actor);

  if (!tenant.stripe_customer_id) {
    throw new Error("No Stripe billing customer is configured for this TEX tenant.");
  }

  const session = await stripeRequest<StripePortalSession>("/v1/billing_portal/sessions", {
    method: "POST",
    form: {
      customer: tenant.stripe_customer_id,
      return_url: `${customerPortalBaseUrl()}/en/tex/settings?billing=portal_return`
    }
  });

  if (!session.url) {
    throw new Error("Stripe did not return a billing portal URL.");
  }

  return {
    url: session.url
  };
}

export async function syncTexBillingFromStripe(
  actor: TexActorContext,
  input: TexBillingSyncInput = {}
) {
  assertTexPermission(actor, "tenant.settings.manage");
  const tenant = await getBillingTenant(actor);

  if (input.sessionId) {
    const session = await stripeRequest<StripeCheckoutSession>(
      `/v1/checkout/sessions/${encodeURIComponent(input.sessionId)}`,
      { method: "GET" }
    );
    const tenantId = session.metadata?.tenant_id;
    if (tenantId && tenantId !== actor.tenantId) {
      throw new Error("Stripe checkout session belongs to another TEX tenant.");
    }
    if (
      session.customer &&
      tenant.stripe_customer_id &&
      session.customer !== tenant.stripe_customer_id
    ) {
      throw new Error("Stripe checkout session customer does not match this TEX tenant.");
    }
    if (session.subscription) {
      const subscription = await stripeRequest<StripeSubscriptionObject>(
        `/v1/subscriptions/${encodeURIComponent(session.subscription)}`,
        { method: "GET" }
      );
      await syncStripeSubscription(subscription);
      return {
        synced: true,
        source: "checkout_session",
        stripeSubscriptionId: subscription.id
      };
    }
  }

  if (!tenant.stripe_customer_id) {
    return { synced: false, source: "stripe_customer", reason: "missing_customer" };
  }

  const subscriptions = await stripeRequest<StripeSubscriptionList>(
    `/v1/subscriptions?customer=${encodeURIComponent(tenant.stripe_customer_id)}&status=all&limit=10`,
    { method: "GET" }
  );
  const subscription = pickMostRelevantSubscription(subscriptions.data ?? []);
  if (!subscription) {
    return { synced: false, source: "stripe_customer", reason: "missing_subscription" };
  }

  await syncStripeSubscription(subscription);
  return {
    synced: true,
    source: "stripe_customer",
    stripeSubscriptionId: subscription.id
  };
}

export function verifyStripeWebhookPayload(payload: string, signatureHeader: string | null) {
  const webhookSecret = requireEnv("STRIPE_WEBHOOK_SECRET");
  if (!signatureHeader) {
    throw new Error("Missing Stripe signature.");
  }

  const values = Object.fromEntries(
    signatureHeader.split(",").map((part) => {
      const [key, value] = part.split("=");
      return [key, value];
    })
  );
  const timestamp = values.t;
  const signature = values.v1;

  if (!timestamp || !signature) {
    throw new Error("Invalid Stripe signature header.");
  }

  const expected = createHmac("sha256", webhookSecret)
    .update(`${timestamp}.${payload}`)
    .digest("hex");

  const expectedBuffer = Buffer.from(expected, "hex");
  const actualBuffer = Buffer.from(signature, "hex");

  if (
    expectedBuffer.length !== actualBuffer.length ||
    !timingSafeEqual(expectedBuffer, actualBuffer)
  ) {
    throw new Error("Invalid Stripe webhook signature.");
  }

  return JSON.parse(payload) as TexStripeEvent;
}

export async function processTexStripeWebhookEvent(event: TexStripeEvent) {
  const object = event.data?.object ?? {};
  const tenantId =
    readString(object.metadata, "tenant_id") ?? (await findTenantIdForStripeObject(object));

  if (await hasStripeEvent(event.id)) {
    return { status: "duplicate" };
  }

  if (event.type === "checkout.session.completed") {
    await handleCheckoutCompleted(object);
    await recordStripeEvent(event, tenantId, "processed", null);
    return { status: "processed" };
  }

  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    await syncStripeSubscription(object as StripeSubscriptionObject);
    await recordStripeEvent(event, tenantId, "processed", null);
    return { status: "processed" };
  }

  await recordStripeEvent(event, tenantId, "ignored", null);
  return { status: "ignored" };
}

async function handleCheckoutCompleted(object: Record<string, unknown>) {
  const subscriptionId = readString(object, "subscription");
  if (!subscriptionId) {
    return;
  }

  const subscription = await stripeRequest<StripeSubscriptionObject>(
    `/v1/subscriptions/${encodeURIComponent(subscriptionId)}`,
    { method: "GET" }
  );
  await syncStripeSubscription(subscription);
}

async function syncStripeSubscription(subscription: StripeSubscriptionObject) {
  const tenantId =
    subscription.metadata?.tenant_id ?? (await tenantIdForStripeCustomer(subscription.customer));
  const planKey = sanitizePaidPlanKey(
    subscription.metadata?.plan_key ?? planKeyFromPrice(subscription)
  );
  const currency = sanitizeCurrency(subscription.items?.data?.[0]?.price?.currency) ?? "aed";
  const platformStatus = platformSubscriptionStatus(subscription.status);
  const texPlanStatus = texPlanStatusForStripeStatus(subscription.status);
  const billingStatus = billingStatusForStripeStatus(subscription.status);
  const priceId = subscription.items?.data?.[0]?.price?.id ?? "";

  if (!tenantId) {
    throw new Error("Unable to resolve tenant for Stripe subscription.");
  }
  assertUuid(tenantId, "tenant id");

  const productPlan = await queryServerDatabase<{ product_id: string; plan_id: string }>(
    `
      select products.id as product_id, plans.id as plan_id
      from public.products
      join public.plans on plans.product_id = products.id
      where products.key = 'tex'
        and plans.key = $1
      limit 1
    `,
    [planKey]
  );
  const row = productPlan.rows[0];
  if (!row) {
    throw new Error(`Unable to find TEX ${planKey} plan.`);
  }

  const platformSubscription = await queryServerDatabase<{ id: string }>(
    `
      insert into public.subscriptions (
        tenant_id,
        product_id,
        plan_id,
        status,
        starts_at,
        expires_at
      ) values (
        $1,
        $2,
        $3,
        $4,
        coalesce($5::timestamptz, now()),
        $6::timestamptz
      )
      on conflict (tenant_id, product_id) do update set
        plan_id = excluded.plan_id,
        status = excluded.status,
        expires_at = excluded.expires_at,
        updated_at = now()
      returning id
    `,
    [
      tenantId,
      row.product_id,
      row.plan_id,
      platformStatus,
      fromUnixTimestamp(subscriptionPeriodStart(subscription)),
      entitlementExpiryForStripeStatus(subscription.status, subscriptionPeriodEnd(subscription))
    ]
  );
  const subscriptionId = platformSubscription.rows[0]?.id;
  if (!subscriptionId) {
    throw new Error("Unable to upsert TEX subscription from Stripe.");
  }

  await replaceEntitlements(subscriptionId, tenantId, row.plan_id);
  await upsertTexBillingSubscription(subscription, {
    tenantId,
    platformSubscriptionId: subscriptionId,
    planKey,
    currency,
    priceId,
    billingStatus,
    texPlanStatus
  });
}

async function upsertTexBillingSubscription(
  subscription: StripeSubscriptionObject,
  input: {
    tenantId: string;
    platformSubscriptionId: string;
    planKey: TexPaidPlanKey;
    currency: TexBillingCurrency;
    priceId: string;
    billingStatus: string;
    texPlanStatus: TexPlanStatus;
  }
) {
  await queryServerDatabase(
    `
      insert into public.tex_billing_subscriptions (
        tenant_id,
        platform_subscription_id,
        stripe_customer_id,
        stripe_subscription_id,
        stripe_price_id,
        plan_key,
        currency,
        stripe_status,
        current_period_start,
        current_period_end,
        cancel_at_period_end,
        latest_invoice_id
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9::timestamptz, $10::timestamptz, $11, $12)
      on conflict (tenant_id) do update set
        platform_subscription_id = excluded.platform_subscription_id,
        stripe_customer_id = excluded.stripe_customer_id,
        stripe_subscription_id = excluded.stripe_subscription_id,
        stripe_price_id = excluded.stripe_price_id,
        plan_key = excluded.plan_key,
        currency = excluded.currency,
        stripe_status = excluded.stripe_status,
        current_period_start = excluded.current_period_start,
        current_period_end = excluded.current_period_end,
        cancel_at_period_end = excluded.cancel_at_period_end,
        latest_invoice_id = excluded.latest_invoice_id,
        updated_at = now()
    `,
    [
      input.tenantId,
      input.platformSubscriptionId,
      subscription.customer,
      subscription.id,
      input.priceId,
      input.planKey,
      input.currency,
      subscription.status,
      fromUnixTimestamp(subscriptionPeriodStart(subscription)),
      fromUnixTimestamp(subscriptionPeriodEnd(subscription)),
      Boolean(subscription.cancel_at_period_end),
      latestInvoiceId(subscription.latest_invoice)
    ]
  );

  await queryServerDatabase(
    `
      update public.tenants
      set
        status = case
          when $2::public.tex_plan_status = 'active' then 'active'
          when $2::public.tex_plan_status in ('expired', 'suspended') then 'suspended'
          when $2::public.tex_plan_status = 'cancelled' then 'archived'
          else status
        end,
        updated_at = now()
      where id = $1
    `,
    [input.tenantId, input.texPlanStatus]
  );

  await queryServerDatabase(
    `
      insert into public.tex_plan_controls (
        tenant_id,
        subscription_id,
        plan_key,
        plan_status,
        employee_limit,
        billing_status,
        renewal_date
      )
      select
        $1,
        $2,
        $3::public.tex_plan_key,
        $4::public.tex_plan_status,
        coalesce(pf.limit_value, 0),
        $5::public.tex_billing_status,
        $6::date
      from public.plans p
      left join public.plan_features pf
        on pf.plan_id = p.id
       and pf.feature_key = 'tex.employee_limit'
      where p.id = (
        select plan_id from public.subscriptions where id = $2
      )
      on conflict (tenant_id) do update set
        subscription_id = excluded.subscription_id,
        plan_key = excluded.plan_key,
        plan_status = excluded.plan_status,
        trial_start_date = null,
        trial_end_date = null,
        employee_limit = excluded.employee_limit,
        billing_status = excluded.billing_status,
        renewal_date = excluded.renewal_date,
        updated_at = now()
    `,
    [
      input.tenantId,
      input.platformSubscriptionId,
      input.planKey,
      input.texPlanStatus,
      input.billingStatus,
      fromUnixDate(subscriptionPeriodEnd(subscription))
    ]
  );
}

async function replaceEntitlements(subscriptionId: string, tenantId: string, planId: string) {
  await queryServerDatabase(
    "delete from public.subscription_entitlements where subscription_id = $1",
    [subscriptionId]
  );

  await queryServerDatabase(
    `
      insert into public.subscription_entitlements (
        tenant_id,
        subscription_id,
        feature_key,
        limit_value
      )
      select $1, $2, feature_key, limit_value
      from public.plan_features
      where plan_id = $3
    `,
    [tenantId, subscriptionId, planId]
  );
}

async function ensureStripeCustomer(
  actor: TexActorContext,
  tenant: TexBillingTenantRow,
  currency: TexBillingCurrency
) {
  if (tenant.stripe_customer_id) {
    return tenant.stripe_customer_id;
  }

  const customer = await stripeRequest<StripeCustomer>("/v1/customers", {
    method: "POST",
    form: {
      name: tenant.tenant_name,
      email: tenant.billing_email || tenant.user_email,
      "metadata[tenant_id]": actor.tenantId,
      "metadata[product_key]": "tex"
    }
  });

  await queryServerDatabase(
    `
      insert into public.tex_billing_customers (
        tenant_id,
        stripe_customer_id,
        billing_email,
        currency,
        created_by,
        updated_by
      ) values ($1, $2, $3, $4, $5, $5)
      on conflict (tenant_id) do update set
        stripe_customer_id = excluded.stripe_customer_id,
        billing_email = excluded.billing_email,
        currency = excluded.currency,
        updated_by = excluded.updated_by,
        updated_at = now()
    `,
    [actor.tenantId, customer.id, tenant.billing_email || tenant.user_email, currency, actor.userId]
  );

  return customer.id;
}

async function getBillingTenant(actor: TexActorContext) {
  assertUuid(actor.tenantId, "tenant id");
  assertUuid(actor.userId, "user id");
  const result = await queryServerDatabase<TexBillingTenantRow>(
    `
      select
        t.id as tenant_id,
        t.name as tenant_name,
        t.billing_email,
        u.email as user_email,
        t.region,
        tbc.stripe_customer_id
      from public.tenants t
      join public.users u on u.id = $2
      left join public.tex_billing_customers tbc on tbc.tenant_id = t.id
      where t.id = $1
      limit 1
    `,
    [actor.tenantId, actor.userId]
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error("Unable to resolve TEX billing tenant.");
  }
  return row;
}

async function findTenantIdForStripeObject(object: Record<string, unknown>) {
  const customerId = readString(object, "customer");
  if (!customerId) {
    return null;
  }
  return tenantIdForStripeCustomer(customerId);
}

async function tenantIdForStripeCustomer(customerId: string) {
  const result = await queryServerDatabase<{ tenant_id: string }>(
    `
      select tenant_id
      from public.tex_billing_customers
      where stripe_customer_id = $1
      limit 1
    `,
    [customerId]
  );
  return result.rows[0]?.tenant_id ?? null;
}

async function recordStripeEvent(
  event: TexStripeEvent,
  tenantId: string | null,
  status: "processed" | "ignored" | "failed",
  error: string | null
) {
  await queryServerDatabase(
    `
      insert into public.tex_billing_events (
        tenant_id,
        stripe_event_id,
        event_type,
        status,
        error
      ) values ($1, $2, $3, $4, $5)
      on conflict (stripe_event_id) do nothing
    `,
    [tenantId, event.id, event.type, status, error]
  );
}

async function hasStripeEvent(eventId: string) {
  const result = await queryServerDatabase<{ id: string }>(
    `
      select id
      from public.tex_billing_events
      where stripe_event_id = $1
      limit 1
    `,
    [eventId]
  );
  return Boolean(result.rows[0]);
}

async function auditBillingEvent(
  tenantId: string,
  actorUserId: string,
  action: string,
  metadata: Record<string, string>
) {
  await queryServerDatabase(
    `
      insert into public.audit_events (
        tenant_id,
        actor_user_id,
        action,
        target_type,
        target_id,
        metadata
      ) values ($1, $2, $3, 'tenant', $1, $4::jsonb)
    `,
    [tenantId, actorUserId, action, JSON.stringify(metadata)]
  );
}

export function sanitizePaidPlanKey(value: string | null | undefined): TexPaidPlanKey {
  if (paidPlanKeys.includes(value as TexPaidPlanKey)) {
    return value as TexPaidPlanKey;
  }
  throw new Error("TEX checkout supports Lite and Growth plans only.");
}

export function sanitizeCurrency(value: string | null | undefined): TexBillingCurrency | null {
  const normalized = value?.trim().toLowerCase();
  return supportedCurrencies.includes(normalized as TexBillingCurrency)
    ? (normalized as TexBillingCurrency)
    : null;
}

export function defaultBillingCurrency(tenant: Pick<TexBillingTenantRow, "region">) {
  const region = `${tenant.region ?? ""}`.toLowerCase();
  return region.includes("uae") || region.includes("united arab emirates") ? "aed" : "usd";
}

export function requireStripePriceId(planKey: TexPaidPlanKey, currency: TexBillingCurrency) {
  const envKey = `TEX_STRIPE_${planKey.toUpperCase()}_${currency.toUpperCase()}_PRICE_ID`;
  return requireEnv(envKey);
}

function planKeyFromPrice(subscription: StripeSubscriptionObject) {
  const priceId = subscription.items?.data?.[0]?.price?.id ?? "";
  const matches = [
    ["lite", "aed"],
    ["lite", "usd"],
    ["growth", "aed"],
    ["growth", "usd"]
  ] as const;

  for (const [planKey, currency] of matches) {
    const configured =
      process.env[`TEX_STRIPE_${planKey.toUpperCase()}_${currency.toUpperCase()}_PRICE_ID`];
    if (configured && configured === priceId) {
      return planKey;
    }
  }

  throw new Error("Unable to map Stripe price to a TEX plan.");
}

export function platformSubscriptionStatus(
  stripeStatus: string
): "active" | "cancelled" | "expired" {
  if (stripeStatus === "active" || stripeStatus === "trialing") {
    return "active";
  }
  if (stripeStatus === "canceled" || stripeStatus === "incomplete_expired") {
    return "cancelled";
  }
  return "expired";
}

export function texPlanStatusForStripeStatus(stripeStatus: string): TexPlanStatus {
  if (stripeStatus === "active" || stripeStatus === "trialing") {
    return "active";
  }
  if (stripeStatus === "canceled" || stripeStatus === "incomplete_expired") {
    return "cancelled";
  }
  if (stripeStatus === "past_due" || stripeStatus === "unpaid") {
    return "suspended";
  }
  return "expired";
}

export function billingStatusForStripeStatus(stripeStatus: string) {
  if (stripeStatus === "active" || stripeStatus === "trialing") {
    return "paid";
  }
  if (stripeStatus === "past_due" || stripeStatus === "unpaid") {
    return "overdue";
  }
  if (stripeStatus === "canceled" || stripeStatus === "incomplete_expired") {
    return "not_configured";
  }
  return "manual_invoice_pending";
}

function entitlementExpiryForStripeStatus(
  stripeStatus: string,
  currentPeriodEnd: number | undefined
) {
  if (stripeStatus === "active" || stripeStatus === "trialing") {
    return null;
  }
  return fromUnixTimestamp(currentPeriodEnd);
}

function subscriptionPeriodStart(subscription: StripeSubscriptionObject) {
  return subscription.current_period_start ?? subscription.items?.data?.[0]?.current_period_start;
}

function subscriptionPeriodEnd(subscription: StripeSubscriptionObject) {
  return subscription.current_period_end ?? subscription.items?.data?.[0]?.current_period_end;
}

function fromUnixTimestamp(value: number | undefined) {
  return value ? new Date(value * 1000).toISOString() : null;
}

function fromUnixDate(value: number | undefined) {
  return value ? new Date(value * 1000).toISOString().slice(0, 10) : null;
}

function latestInvoiceId(value: StripeSubscriptionObject["latest_invoice"]) {
  if (!value) {
    return null;
  }
  return typeof value === "string" ? value : (value.id ?? null);
}

function pickMostRelevantSubscription(subscriptions: StripeSubscriptionObject[]) {
  const statusRank = new Map([
    ["active", 0],
    ["trialing", 1],
    ["past_due", 2],
    ["unpaid", 3],
    ["incomplete", 4]
  ]);

  return [...subscriptions]
    .filter((subscription) => sanitizeCurrency(subscription.items?.data?.[0]?.price?.currency))
    .sort((left, right) => {
      const leftRank = statusRank.get(left.status) ?? 99;
      const rightRank = statusRank.get(right.status) ?? 99;
      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }
      return (right.current_period_start ?? 0) - (left.current_period_start ?? 0);
    })[0];
}

function readString(source: unknown, key: string) {
  if (!source || typeof source !== "object") {
    return null;
  }
  const value = (source as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function stripeRequest<Response>(
  path: string,
  options: {
    method: "GET" | "POST";
    form?: Record<string, string>;
  }
) {
  const secretKey = requireEnv("STRIPE_SECRET_KEY");
  const response = await fetch(`https://api.stripe.com${path}`, {
    method: options.method,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      ...(options.form ? { "Content-Type": "application/x-www-form-urlencoded" } : {})
    },
    body: options.form ? new URLSearchParams(options.form).toString() : undefined
  });

  const body = (await response.json().catch(() => null)) as
    | (Record<string, unknown> & { error?: { message?: string } })
    | null;

  if (!response.ok) {
    throw new Error(
      body?.error?.message ?? `Stripe request failed with status ${response.status}.`
    );
  }

  return body as Response;
}

function customerPortalBaseUrl() {
  const url =
    process.env.CUSTOMER_PORTAL_URL ||
    process.env.NEXT_PUBLIC_CUSTOMER_PORTAL_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://app.torrevie.com";
  return url
    .trim()
    .replace(/^"+|"+$/g, "")
    .replace(/\/+$/, "");
}

function requireEnv(key: string) {
  const value = process.env[key]?.trim();
  if (!value) {
    throw new Error(`${key} is not configured.`);
  }
  return value;
}
