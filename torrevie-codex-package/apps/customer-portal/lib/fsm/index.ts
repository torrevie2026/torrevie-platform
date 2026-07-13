import type { Locale } from "@torrevie/localization";
import { withTenantContext, type ResolvedTenantContext, type TenantQueryClient } from "@torrevie/tenant-context";
import {
  dashboardWidgets,
  defaultFlowSettings,
  detectBusinessSegment,
  normalizeBusinessSegment,
  normalizePlanTier,
  profileKeyForSegment,
  segmentLabels,
  suggestedPlanForSegment,
  widgetLabels,
  type BusinessSegment,
  type DashboardWidgetKey,
  type FsmPlanTier,
  type SegmentDetectionAnswers
} from "../../config/fsmSegments";
import { navForSegment, type FsmNavItem } from "../../config/navProfiles";
import { getTerminologyPack, type TerminologyPack } from "../../config/terminology";

export type FsmWorkspace = {
  tenantName: string;
  segment: BusinessSegment;
  segmentLabel: string;
  planTier: FsmPlanTier;
  suggestedPlanTier: FsmPlanTier;
  terminologyPack: TerminologyPack;
  navItems: FsmNavItem[];
  widgets: FsmDashboardWidget[];
  flowSteps: string[];
  onboardingComplete: boolean;
  onboardingAnswers: Record<string, unknown>;
  baselineMetrics: Record<string, unknown>;
  enabledFeatures: string[];
};

export type FsmDashboardWidget = {
  key: DashboardWidgetKey;
  label: string;
  value: string;
  detail: string;
};

export type FsmOnboardingInput = SegmentDetectionAnswers & {
  confirmedSegment: BusinessSegment;
  planTier: FsmPlanTier;
  jobsPerMonthToday: number | null;
  averageResponseHoursToday: number | null;
  activatedChannel: "whatsapp" | "portal" | "voice";
  growthTrial: boolean;
};

type TenantFsmRow = {
  tenant_name: string;
  business_segment: string | null;
  plan_tier: string | null;
  flow_settings: Record<string, unknown> | null;
  onboarding_answers: Record<string, unknown> | null;
  baseline_metrics: Record<string, unknown> | null;
};

type EntitlementRow = {
  feature_key: string;
  enabled: boolean;
  limit_value: number | null;
  source: string;
};

export async function resolveFsmWorkspace(
  client: TenantQueryClient,
  context: ResolvedTenantContext,
  locale: Locale
): Promise<FsmWorkspace> {
  return withTenantContext(client, context, async () => {
    const tenant = await client.query<TenantFsmRow>(
      `
        select
          name as tenant_name,
          business_segment::text,
          plan_tier::text,
          flow_settings,
          onboarding_answers,
          baseline_metrics
        from public.tenants
        where id = public.current_tenant_id()
        limit 1
      `
    );
    const entitlements = await client.query<EntitlementRow>(
      `
        select feature_key, enabled, limit_value, source
        from public.get_org_entitlements(public.current_tenant_id())
      `
    );
    const tenantRow = tenant.rows[0];
    const segment = normalizeBusinessSegment(tenantRow?.business_segment);
    const planTier = normalizePlanTier(tenantRow?.plan_tier);
    const enabledFeatureSet = new Set(entitlements.rows.filter((row) => row.enabled).map((row) => row.feature_key));
    const onboardingAnswers = tenantRow?.onboarding_answers ?? {};
    const baselineMetrics = tenantRow?.baseline_metrics ?? {};
    const flowSettings = tenantRow?.flow_settings && Object.keys(tenantRow.flow_settings).length > 0 ? tenantRow.flow_settings : defaultFlowSettings[segment];

    return {
      tenantName: tenantRow?.tenant_name ?? "Current tenant",
      segment,
      segmentLabel: segmentLabels[segment],
      planTier,
      suggestedPlanTier: suggestedPlanForSegment(segment),
      terminologyPack: getTerminologyPack(segment, locale),
      navItems: navForSegment(segment, enabledFeatureSet),
      widgets: dashboardWidgets[segment].map((key) => widgetForKey(key, baselineMetrics)),
      flowSteps: Array.isArray(flowSettings.steps) ? flowSettings.steps.map(String) : defaultFlowSettings[segment].steps,
      onboardingComplete: Boolean(onboardingAnswers["wp28_completed_at"]),
      onboardingAnswers,
      baselineMetrics,
      enabledFeatures: Array.from(enabledFeatureSet).sort()
    };
  });
}

export async function saveFsmOnboarding(
  client: TenantQueryClient,
  context: ResolvedTenantContext,
  input: FsmOnboardingInput
) {
  return withTenantContext(client, context, async () => {
    const suggestedSegment = detectBusinessSegment(input);
    const profile = profileKeyForSegment(input.confirmedSegment);
    const flowSettings = defaultFlowSettings[input.confirmedSegment];
    const onboardingAnswers = {
      serve: input.serve,
      intake: input.intake,
      fieldSize: input.fieldSize,
      suggestedSegment,
      confirmedSegment: input.confirmedSegment,
      selectedPlanTier: input.planTier,
      growthTrial: input.growthTrial,
      activatedChannel: input.activatedChannel,
      wp28_completed_at: new Date().toISOString()
    };
    const baselineMetrics = {
      jobsPerMonthToday: input.jobsPerMonthToday,
      averageResponseHoursToday: input.averageResponseHoursToday
    };

    await client.query(
      `
        update public.tenants
        set
          business_segment = $1::public.business_segment,
          plan_tier = $2::public.plan_tier,
          terminology_pack = $3,
          nav_profile = $3,
          flow_settings = $4::jsonb,
          onboarding_answers = coalesce(onboarding_answers, '{}'::jsonb) || $5::jsonb,
          baseline_metrics = $6::jsonb,
          updated_by = $7
        where id = public.current_tenant_id()
      `,
      [
        input.confirmedSegment,
        input.planTier,
        profile,
        JSON.stringify(flowSettings),
        JSON.stringify(onboardingAnswers),
        JSON.stringify(baselineMetrics),
        context.userId
      ]
    );

    await client.query(
      `
        insert into public.audit_events (tenant_id, actor_user_id, action, target_type, target_id, metadata)
        values (
          public.current_tenant_id(),
          $1,
          'fsm.onboarding.completed',
          'tenant',
          public.current_tenant_id(),
          $2::jsonb
        )
      `,
      [
        context.userId,
        JSON.stringify({
          segment: input.confirmedSegment,
          plan_tier: input.planTier,
          activated_channel: input.activatedChannel
        })
      ]
    );
  });
}

export function buildOnboardingInput(raw: {
  serve: string;
  intake: string;
  fieldSize: string;
  confirmedSegment: string;
  planTier: string;
  jobsPerMonthToday: string;
  averageResponseHoursToday: string;
  activatedChannel: string;
  growthTrial: boolean;
}): FsmOnboardingInput {
  const answers: SegmentDetectionAnswers = {
    serve: readServe(raw.serve),
    intake: readIntake(raw.intake),
    fieldSize: readFieldSize(raw.fieldSize)
  };
  const suggestedSegment = detectBusinessSegment(answers);
  const confirmedSegment = normalizeBusinessSegment(raw.confirmedSegment || suggestedSegment);

  return {
    ...answers,
    confirmedSegment,
    planTier: normalizePlanTier(raw.planTier || suggestedPlanForSegment(confirmedSegment)),
    jobsPerMonthToday: optionalNumber(raw.jobsPerMonthToday),
    averageResponseHoursToday: optionalNumber(raw.averageResponseHoursToday),
    activatedChannel: readActivatedChannel(raw.activatedChannel),
    growthTrial: raw.growthTrial
  };
}

function widgetForKey(key: DashboardWidgetKey, baselineMetrics: Record<string, unknown>): FsmDashboardWidget {
  const baseline = typeof baselineMetrics["jobsPerMonthToday"] === "number" ? `${baselineMetrics["jobsPerMonthToday"]} monthly baseline` : "Baseline pending";

  return {
    key,
    label: widgetLabels[key],
    value: placeholderValue(key),
    detail: key.includes("time") || key.includes("response") ? "Measured after first jobs" : baseline
  };
}

function placeholderValue(key: DashboardWidgetKey) {
  if (key.includes("Rate") || key.includes("Compliance") || key.includes("Fix") || key === "satisfactionScore") {
    return "0%";
  }

  if (key === "penaltyExposure" || key === "cashCollected") {
    return "AED 0";
  }

  return "0";
}

function readServe(value: string): SegmentDetectionAnswers["serve"] {
  if (value === "homeowners" || value === "contracts" || value === "buildings" || value === "products") {
    return value;
  }

  return "contracts";
}

function readIntake(value: string): SegmentDetectionAnswers["intake"] {
  if (value === "owner_whatsapp" || value === "shared_inbox" || value === "hotline" || value === "email_dealer") {
    return value;
  }

  return "shared_inbox";
}

function readFieldSize(value: string): SegmentDetectionAnswers["fieldSize"] {
  if (value === "up_to_5" || value === "six_to_50" || value === "more_than_50") {
    return value;
  }

  return "six_to_50";
}

function readActivatedChannel(value: string): FsmOnboardingInput["activatedChannel"] {
  if (value === "whatsapp" || value === "portal" || value === "voice") {
    return value;
  }

  return "portal";
}

function optionalNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const number = Number(trimmed);
  if (!Number.isFinite(number) || number < 0) {
    throw new Error("Baseline values must be zero or higher.");
  }

  return number;
}
