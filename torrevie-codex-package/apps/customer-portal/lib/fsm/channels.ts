import { withTenantContext, type ResolvedTenantContext, type TenantQueryClient } from "@torrevie/tenant-context";
import { buildVoiceProvisioningPlan, summarizeVoiceUsage, type VoiceSetupInput, type VoiceSetupPath } from "./voice";

export type ChannelType = "whatsapp" | "voice" | "email" | "portal";
export type ChannelStatus = "active" | "pending" | "suspended";
export type IntakeStatus = "new" | "triaged" | "converted" | "spam" | "closed";

export type OrgChannel = {
  id: string;
  channelType: ChannelType;
  provider: string;
  displayName: string;
  config: Record<string, unknown>;
  status: ChannelStatus;
  createdAt: string;
};

export type IntakeRequest = {
  id: string;
  channelType: ChannelType;
  externalRef: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  aiSummary: string | null;
  status: IntakeStatus;
  createdAt: string;
};

export type CallLog = {
  id: string;
  direction: "inbound" | "outbound";
  fromNumber: string | null;
  toNumber: string | null;
  durationSeconds: number;
  outcome: "answered" | "voicemail" | "abandoned" | "converted";
  startedAt: string;
};

export type VoiceUsage = {
  monthlyMinuteCap: number;
  minutesUsed: number;
  warningAtMinutes: number;
  warningReached: boolean;
};

export type ChannelHubSnapshot = {
  channels: OrgChannel[];
  intakeRequests: IntakeRequest[];
  callLogs: CallLog[];
  voiceUsage: VoiceUsage;
};

export type WhatsAppProvider = {
  verifyWebhook(payload: unknown): Promise<boolean>;
  parseInbound(payload: unknown): Promise<Record<string, unknown>>;
  sendText(input: { to: string; text: string }): Promise<void>;
  sendTemplate(input: { to: string; template: string; variables?: Record<string, string> }): Promise<void>;
  sendMedia(input: { to: string; mediaUrl: string; caption?: string }): Promise<void>;
};

export type VoiceProvider = {
  provisionAssistant(orgConfig: Record<string, unknown>): Promise<{ externalAssistantId: string }>;
  handleToolCall(payload: unknown): Promise<Record<string, unknown>>;
  handleEndOfCallReport(payload: unknown): Promise<void>;
};

export type EmailProvider = {
  parseInbound(payload: unknown): Promise<Record<string, unknown>>;
  sendReply(input: { to: string; subject: string; text: string }): Promise<void>;
};

type ChannelRow = {
  id: string;
  channel_type: ChannelType;
  provider: string;
  display_name: string;
  config: Record<string, unknown> | null;
  status: ChannelStatus;
  created_at: string;
};

type IntakeRow = {
  id: string;
  channel_type: ChannelType;
  external_ref: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  ai_summary: string | null;
  status: IntakeStatus;
  created_at: string;
};

type CallLogRow = {
  id: string;
  direction: "inbound" | "outbound";
  from_number: string | null;
  to_number: string | null;
  duration_seconds: number;
  outcome: "answered" | "voicemail" | "abandoned" | "converted";
  started_at: string;
};

type EntitlementRow = {
  feature_key: string;
  enabled: boolean;
};

type VoiceUsageRow = {
  duration_seconds: number | null;
};

export async function listChannelHubSnapshot(
  client: TenantQueryClient,
  context: ResolvedTenantContext
): Promise<ChannelHubSnapshot> {
  return withTenantContext(client, context, async () => {
    const [channels, intakeRequests, callLogs, voiceUsage] = await Promise.all([
      client.query<ChannelRow>(
        `
          select id, channel_type, provider, display_name, config, status, created_at
          from public.org_channels
          where tenant_id = public.current_tenant_id()
          order by created_at desc
          limit 20
        `
      ),
      client.query<IntakeRow>(
        `
          select id, channel_type, external_ref, contact_name, contact_phone, contact_email, ai_summary, status, created_at
          from public.intake_requests
          where tenant_id = public.current_tenant_id()
          order by created_at desc
          limit 30
        `
      ),
      client.query<CallLogRow>(
        `
          select id, direction, from_number, to_number, duration_seconds, outcome, started_at
          from public.call_logs
          where tenant_id = public.current_tenant_id()
          order by started_at desc
          limit 10
        `
      ),
      client.query<VoiceUsageRow>(
        `
          select coalesce(sum(duration_seconds), 0)::int as duration_seconds
          from public.call_logs
          where tenant_id = public.current_tenant_id()
            and started_at >= date_trunc('month', now())
        `
      )
    ]);
    const voiceChannel = channels.rows.find((channel) => channel.channel_type === "voice");
    const monthlyMinuteCap = readNumber(voiceChannel?.config?.["monthlyMinuteCap"], 500);

    return {
      channels: channels.rows.map(mapChannel),
      intakeRequests: intakeRequests.rows.map(mapIntake),
      callLogs: callLogs.rows.map(mapCallLog),
      voiceUsage: summarizeVoiceUsage({
        monthlyMinuteCap,
        durationSeconds: voiceUsage.rows[0]?.duration_seconds ?? 0
      })
    };
  });
}

export async function createManualIntakeRequest(
  client: TenantQueryClient,
  context: ResolvedTenantContext,
  input: {
    channelType: ChannelType;
    contactName: string;
    contactPhone: string;
    contactEmail: string;
    summary: string;
  }
) {
  return withTenantContext(client, context, async () => {
    await client.query(
      `
        insert into public.intake_requests (
          tenant_id,
          channel_type,
          external_ref,
          contact_name,
          contact_phone,
          contact_email,
          raw_payload,
          ai_summary,
          status,
          created_by,
          updated_by
        )
        values (
          public.current_tenant_id(),
          $1,
          $2,
          $3,
          $4,
          $5,
          $6::jsonb,
          $7,
          'new',
          $8,
          $8
        )
      `,
      [
        input.channelType,
        `manual-${Date.now()}`,
        input.contactName,
        input.contactPhone,
        input.contactEmail,
        JSON.stringify({ source: "manual_channel_hub_form" }),
        input.summary,
        context.userId
      ]
    );
  });
}

export async function requestVoiceChannelSetup(
  client: TenantQueryClient,
  context: ResolvedTenantContext,
  input: VoiceSetupInput & { tenantName: string; segment: "SOLO" | "TRADE" | "FM" | "COMMUNITY" | "OEM" }
) {
  return withTenantContext(client, context, async () => {
    await assertVoiceEntitled(client);

    const provisioningPlan = buildVoiceProvisioningPlan({
      segment: input.segment,
      tenantName: input.tenantName,
      setupPath: input.path,
      monthlyMinuteCap: input.monthlyMinuteCap
    });

    await client.query(
      `
        insert into public.org_channels (
          tenant_id,
          channel_type,
          provider,
          display_name,
          config,
          status,
          created_by,
          updated_by
        )
        values (
          public.current_tenant_id(),
          'voice',
          $1,
          'Voice Hotline',
          $2::jsonb,
          'pending',
          $3,
          $3
        )
        on conflict (tenant_id, channel_type, display_name)
        do update set
          provider = excluded.provider,
          config = excluded.config,
          status = 'pending',
          updated_by = excluded.updated_by
      `,
      [provisioningPlan.provider, JSON.stringify(provisioningPlan), context.userId]
    );

    await client.query(
      `
        insert into public.audit_events (tenant_id, actor_user_id, action, target_type, target_id, metadata)
        values (
          public.current_tenant_id(),
          $1,
          'fsm.voice.setup_requested',
          'org_channel',
          public.current_tenant_id(),
          $2::jsonb
        )
      `,
      [
        context.userId,
        JSON.stringify({
          provider: provisioningPlan.provider,
          setup_path: provisioningPlan.setupPath,
          monthly_minute_cap: provisioningPlan.monthlyMinuteCap
        })
      ]
    );
  });
}

function mapChannel(row: ChannelRow): OrgChannel {
  return {
    id: row.id,
    channelType: row.channel_type,
    provider: row.provider,
    displayName: row.display_name,
    config: row.config ?? {},
    status: row.status,
    createdAt: row.created_at
  };
}

function mapIntake(row: IntakeRow): IntakeRequest {
  return {
    id: row.id,
    channelType: row.channel_type,
    externalRef: row.external_ref,
    contactName: row.contact_name,
    contactPhone: row.contact_phone,
    contactEmail: row.contact_email,
    aiSummary: row.ai_summary,
    status: row.status,
    createdAt: row.created_at
  };
}

function mapCallLog(row: CallLogRow): CallLog {
  return {
    id: row.id,
    direction: row.direction,
    fromNumber: row.from_number,
    toNumber: row.to_number,
    durationSeconds: row.duration_seconds,
    outcome: row.outcome,
    startedAt: row.started_at
  };
}

async function assertVoiceEntitled(client: TenantQueryClient) {
  const entitlements = await client.query<EntitlementRow>(
    `
      select feature_key, enabled
      from public.get_org_entitlements(public.current_tenant_id())
      where feature_key in ('fsm.channel.voice.enabled', 'fsm.voice.addon.available')
    `
  );
  const allowed = entitlements.rows.some((row) => row.enabled);

  if (!allowed) {
    throw new Error("Voice setup requires Enterprise voice or the Growth voice add-on.");
  }
}

function readNumber(value: unknown, fallback: number) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export type { VoiceSetupPath };
