import { withTenantContext, type ResolvedTenantContext, type TenantQueryClient } from "@torrevie/tenant-context";

export type FsmRoiDashboard = {
  periodLabel: string;
  completedRequestsThisWeek: number;
  capturedRequestsThisMonth: number;
  averageResponseMinutes: number | null;
  responseBaselineHours: number | null;
  responseDeltaMinutes: number | null;
  firstTimeFixRate: number | null;
  slaComplianceRate: number | null;
  revenueInvoiced: number;
  afterHoursCaptured: number;
  adminMinutesSavedPerRequest: number;
  adminHoursSaved: number;
  channelBreakdown: Array<{ channelType: string; count: number }>;
  monthlyValueEmail: MonthlyValueEmail;
  clientReportPack: ClientReportPackSummary;
};

export type MonthlyValueEmail = {
  subject: string;
  previewText: string;
  bodyText: string;
};

export type ClientReportPackSummary = {
  title: string;
  available: boolean;
  footer: string;
  sections: string[];
};

type IntakeAggregateRow = {
  captured_requests: number;
  completed_requests_this_week: number;
  after_hours_captured: number;
  average_response_minutes: number | null;
};

type ChannelBreakdownRow = {
  channel_type: string;
  count: number;
};

export async function listFsmRoiDashboard(
  client: TenantQueryClient,
  context: ResolvedTenantContext,
  input: {
    tenantName: string;
    baselineMetrics: Record<string, unknown>;
    enabledFeatures: string[];
  }
): Promise<FsmRoiDashboard> {
  return withTenantContext(client, context, async () => {
    const [aggregates, channelBreakdown] = await Promise.all([
      client.query<IntakeAggregateRow>(
        `
          select
            count(*)::int as captured_requests,
            count(*) filter (
              where status in ('converted', 'closed')
                and created_at >= date_trunc('week', now())
            )::int as completed_requests_this_week,
            count(*) filter (
              where channel_type in ('whatsapp', 'voice')
                and (
                  extract(isodow from created_at) in (6, 7)
                  or extract(hour from created_at) < 8
                  or extract(hour from created_at) >= 18
                )
            )::int as after_hours_captured,
            avg(extract(epoch from (updated_at - created_at)) / 60)
              filter (where status in ('triaged', 'converted', 'closed'))::float as average_response_minutes
          from public.intake_requests
          where tenant_id = public.current_tenant_id()
            and created_at >= date_trunc('month', now())
        `
      ),
      client.query<ChannelBreakdownRow>(
        `
          select channel_type::text, count(*)::int as count
          from public.intake_requests
          where tenant_id = public.current_tenant_id()
            and created_at >= date_trunc('month', now())
          group by channel_type
          order by channel_type
        `
      )
    ]);
    const row = aggregates.rows[0];
    const capturedRequestsThisMonth = row?.captured_requests ?? 0;
    const adminMinutesSavedPerRequest = readPositiveNumber(input.baselineMetrics["adminMinutesSavedPerRequest"], 20);
    const averageResponseMinutes = row?.average_response_minutes !== null && row?.average_response_minutes !== undefined
      ? Math.round(row.average_response_minutes)
      : null;
    const responseBaselineHours = readOptionalNumber(input.baselineMetrics["averageResponseHoursToday"]);
    const responseDeltaMinutes = responseBaselineHours !== null && averageResponseMinutes !== null
      ? Math.round(responseBaselineHours * 60 - averageResponseMinutes)
      : null;
    const dashboard: FsmRoiDashboard = {
      periodLabel: "This month",
      completedRequestsThisWeek: row?.completed_requests_this_week ?? 0,
      capturedRequestsThisMonth,
      averageResponseMinutes,
      responseBaselineHours,
      responseDeltaMinutes,
      firstTimeFixRate: null,
      slaComplianceRate: null,
      revenueInvoiced: 0,
      afterHoursCaptured: row?.after_hours_captured ?? 0,
      adminMinutesSavedPerRequest,
      adminHoursSaved: roundOne((capturedRequestsThisMonth * adminMinutesSavedPerRequest) / 60),
      channelBreakdown: channelBreakdown.rows.map((item) => ({ channelType: item.channel_type, count: item.count })),
      monthlyValueEmail: buildMonthlyValueEmail({
        tenantName: input.tenantName,
        capturedRequestsThisMonth,
        adminHoursSaved: roundOne((capturedRequestsThisMonth * adminMinutesSavedPerRequest) / 60),
        afterHoursCaptured: row?.after_hours_captured ?? 0,
        averageResponseMinutes
      }),
      clientReportPack: buildClientReportPackSummary({
        tenantName: input.tenantName,
        enabledFeatures: input.enabledFeatures
      })
    };

    return dashboard;
  });
}

export async function saveFsmRoiSettings(
  client: TenantQueryClient,
  context: ResolvedTenantContext,
  input: {
    jobsPerMonthToday: number | null;
    averageResponseHoursToday: number | null;
    adminMinutesSavedPerRequest: number;
  }
) {
  return withTenantContext(client, context, async () => {
    await client.query(
      `
        update public.tenants
        set
          baseline_metrics = coalesce(baseline_metrics, '{}'::jsonb) || $1::jsonb,
          updated_by = $2
        where id = public.current_tenant_id()
      `,
      [
        JSON.stringify({
          jobsPerMonthToday: input.jobsPerMonthToday,
          averageResponseHoursToday: input.averageResponseHoursToday,
          adminMinutesSavedPerRequest: input.adminMinutesSavedPerRequest
        }),
        context.userId
      ]
    );

    await client.query(
      `
        insert into public.audit_events (tenant_id, actor_user_id, action, target_type, target_id, metadata)
        values (
          public.current_tenant_id(),
          $1,
          'fsm.roi_settings.updated',
          'tenant',
          public.current_tenant_id(),
          $2::jsonb
        )
      `,
      [
        context.userId,
        JSON.stringify({
          admin_minutes_saved_per_request: input.adminMinutesSavedPerRequest
        })
      ]
    );
  });
}

export function buildMonthlyValueEmail(input: {
  tenantName: string;
  capturedRequestsThisMonth: number;
  adminHoursSaved: number;
  afterHoursCaptured: number;
  averageResponseMinutes: number | null;
}): MonthlyValueEmail {
  const responseText = input.averageResponseMinutes === null ? "Response time will appear after triage activity." : `Average response time is ${input.averageResponseMinutes} minutes.`;

  return {
    subject: `Torrevie FSM monthly value summary for ${input.tenantName}`,
    previewText: `${input.capturedRequestsThisMonth} requests captured. ${input.adminHoursSaved} admin hours saved.`,
    bodyText: [
      `Torrevie FSM monthly value summary for ${input.tenantName}.`,
      `${input.capturedRequestsThisMonth} service requests were captured through the platform.`,
      `${input.afterHoursCaptured} WhatsApp or voice requests were captured after hours.`,
      `${input.adminHoursSaved} estimated admin hours were saved.`,
      responseText,
      "Powered by Torrevie FSM | Torrevie FZE | torrevie.com | hello@torrevie.com | Dubai, UAE"
    ].join("\n")
  };
}

export function buildClientReportPackSummary(input: { tenantName: string; enabledFeatures: string[] }): ClientReportPackSummary {
  const available = input.enabledFeatures.includes("fsm.client_report_packs.enabled");

  return {
    title: `${input.tenantName} monthly client report pack`,
    available,
    footer: fsmDocumentFooter(available && input.enabledFeatures.includes("fsm.white_label.portal.enabled")),
    sections: ["Jobs and requests", "SLA performance", "Inspection activity", "Photo annex"]
  };
}

export function fsmDocumentFooter(whiteLabelEnabled: boolean) {
  if (whiteLabelEnabled) {
    return "";
  }

  return "Powered by Torrevie FSM | Torrevie FZE | torrevie.com | hello@torrevie.com | Dubai, UAE";
}

export function buildFsmRoiSettingsInput(raw: {
  jobsPerMonthToday: string;
  averageResponseHoursToday: string;
  adminMinutesSavedPerRequest: string;
}) {
  return {
    jobsPerMonthToday: optionalNonNegativeNumber(raw.jobsPerMonthToday),
    averageResponseHoursToday: optionalNonNegativeNumber(raw.averageResponseHoursToday),
    adminMinutesSavedPerRequest: readPositiveNumber(raw.adminMinutesSavedPerRequest, 20)
  };
}

function readOptionalNumber(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function readPositiveNumber(value: unknown, fallback: number) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : fallback;
}

function optionalNonNegativeNumber(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const number = Number(trimmed);

  if (!Number.isFinite(number) || number < 0) {
    throw new Error("ROI baseline values must be zero or higher.");
  }

  return number;
}

function roundOne(value: number) {
  return Math.round(value * 10) / 10;
}
