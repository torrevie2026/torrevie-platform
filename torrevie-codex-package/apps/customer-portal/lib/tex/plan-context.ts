import type { TexPlanContextRow } from "./db-types";
import type { TexPlanContext, TexPlanKey, TexPlanStatus, TexWhatsappProviderScope } from "./types";

export function defaultTexPlanContext(): TexPlanContext {
  return {
    planKey: "trial",
    planStatus: "trialing",
    trialStartDate: null,
    trialEndDate: null,
    billingStatus: "not_configured",
    renewalDate: null,
    billingCurrency: "usd",
    billingCancelAtPeriodEnd: false,
    employeeLimit: 5,
    seatCount: 0,
    whatsappProviderScope: "not_configured",
    growthFeaturesEnabled: false,
    enterpriseFeaturesEnabled: false
  };
}

export function mapTexPlanContext(row: TexPlanContextRow | undefined): TexPlanContext {
  const fallback = defaultTexPlanContext();
  const planKey = isTexPlanKey(row?.plan_key) ? row.plan_key : fallback.planKey;
  const planStatus = isTexPlanStatus(row?.plan_status) ? row.plan_status : fallback.planStatus;
  const employeeLimit = positiveInteger(row?.employee_limit, fallback.employeeLimit);
  const seatCount = positiveInteger(row?.seat_count, fallback.seatCount);
  const whatsappProviderScope = isTexWhatsappProviderScope(row?.whatsapp_provider_scope)
    ? row.whatsapp_provider_scope
    : fallback.whatsappProviderScope;
  const billingCurrency = row?.billing_currency === "aed" ? "aed" : "usd";

  return {
    planKey,
    planStatus,
    trialStartDate: row?.trial_start_date ?? null,
    trialEndDate: row?.trial_end_date ?? null,
    billingStatus: row?.billing_status ?? fallback.billingStatus,
    renewalDate: row?.renewal_date ?? null,
    billingCurrency,
    billingCancelAtPeriodEnd: row?.billing_cancel_at_period_end === true,
    employeeLimit,
    seatCount,
    whatsappProviderScope,
    growthFeaturesEnabled: planKey === "growth" || planKey === "enterprise",
    enterpriseFeaturesEnabled: planKey === "enterprise"
  };
}

function positiveInteger(value: number | string | null | undefined, fallback: number) {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function isTexPlanKey(value: string | undefined): value is TexPlanKey {
  return value === "trial" || value === "lite" || value === "growth" || value === "enterprise";
}

function isTexPlanStatus(value: string | undefined): value is TexPlanStatus {
  return (
    value === "trialing" ||
    value === "active" ||
    value === "expired" ||
    value === "suspended" ||
    value === "cancelled"
  );
}

function isTexWhatsappProviderScope(
  value: string | null | undefined
): value is TexWhatsappProviderScope {
  return value === "not_configured" || value === "torrevie_managed" || value === "customer_owned";
}
