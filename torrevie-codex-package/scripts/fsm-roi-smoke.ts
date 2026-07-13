import { strict as assert } from "node:assert";
import type { QueryResult, QueryValue, TenantQueryClient } from "@torrevie/tenant-context";
import {
  buildClientReportPackSummary,
  buildFsmRoiSettingsInput,
  buildMonthlyValueEmail,
  fsmDocumentFooter,
  listFsmRoiDashboard,
  saveFsmRoiSettings
} from "../apps/customer-portal/lib/fsm/roi";

class RecordingClient implements TenantQueryClient {
  readonly calls: Array<{ sql: string; values: readonly QueryValue[] }> = [];

  async query<Row>(sql: string, values: readonly QueryValue[] = []): Promise<QueryResult<Row>> {
    this.calls.push({ sql, values });

    if (sql.includes("count(*)::int as captured_requests")) {
      return {
        rows: [
          {
            captured_requests: 9,
            completed_requests_this_week: 3,
            after_hours_captured: 2,
            average_response_minutes: 45
          }
        ] as Row[]
      };
    }

    if (sql.includes("group by channel_type")) {
      return {
        rows: [
          { channel_type: "whatsapp", count: 5 },
          { channel_type: "voice", count: 4 }
        ] as Row[]
      };
    }

    return { rows: [] };
  }

  hasSql(fragment: string) {
    return this.calls.some((call) => call.sql.includes(fragment));
  }

  valuesContain(value: QueryValue) {
    return this.calls.some((call) => call.values.includes(value));
  }
}

const context = {
  tenantId: "00000000-0000-4000-8000-000000031001",
  userId: "00000000-0000-4000-8000-000000031002",
  roleScope: "customer" as const
};

async function main() {
  const dashboard = await listFsmRoiDashboard(new RecordingClient(), context, {
    tenantName: "Alpha FM",
    baselineMetrics: {
      averageResponseHoursToday: 2,
      adminMinutesSavedPerRequest: 20
    },
    enabledFeatures: ["fsm.client_report_packs.enabled"]
  });

  assert.equal(dashboard.capturedRequestsThisMonth, 9);
  assert.equal(dashboard.completedRequestsThisWeek, 3);
  assert.equal(dashboard.afterHoursCaptured, 2);
  assert.equal(dashboard.adminHoursSaved, 3);
  assert.equal(dashboard.responseDeltaMinutes, 75);
  assert.equal(dashboard.channelBreakdown[0]?.channelType, "whatsapp");
  assert.equal(dashboard.clientReportPack.available, true);
  assert.match(dashboard.monthlyValueEmail.bodyText, /Powered by Torrevie FSM/);

  assert.deepEqual(
    buildFsmRoiSettingsInput({
      jobsPerMonthToday: "100",
      averageResponseHoursToday: "3.5",
      adminMinutesSavedPerRequest: "25"
    }),
    {
      jobsPerMonthToday: 100,
      averageResponseHoursToday: 3.5,
      adminMinutesSavedPerRequest: 25
    }
  );

  assert.equal(fsmDocumentFooter(false), "Powered by Torrevie FSM | Torrevie FZE | torrevie.com | hello@torrevie.com | Dubai, UAE");
  assert.equal(fsmDocumentFooter(true), "");

  const email = buildMonthlyValueEmail({
    tenantName: "Alpha FM",
    capturedRequestsThisMonth: 10,
    adminHoursSaved: 4,
    afterHoursCaptured: 2,
    averageResponseMinutes: null
  });
  assert.equal(email.subject, "Torrevie FSM monthly value summary for Alpha FM");
  assert.match(email.bodyText, /Response time will appear/);

  const reportPack = buildClientReportPackSummary({
    tenantName: "Alpha FM",
    enabledFeatures: ["fsm.white_label.portal.enabled", "fsm.client_report_packs.enabled"]
  });
  assert.equal(reportPack.footer, "");

  const writeClient = new RecordingClient();
  await saveFsmRoiSettings(writeClient, context, {
    jobsPerMonthToday: 100,
    averageResponseHoursToday: 2,
    adminMinutesSavedPerRequest: 20
  });
  assert.equal(writeClient.hasSql("update public.tenants"), true);
  assert.equal(writeClient.hasSql("fsm.roi_settings.updated"), true);

  console.log("FSM ROI smoke test passed.");
}

void main();
