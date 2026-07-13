import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type JsonRecord = Record<string, unknown>;

type VoiceEvent =
  | {
      kind: "tool_call";
      callId: string | null;
      toolName: string;
      arguments: JsonRecord;
    }
  | {
      kind: "end_of_call_report";
      callId: string | null;
      fromNumber: string | null;
      toNumber: string | null;
      startedAt: string | null;
      durationSeconds: number;
      transcript: string | null;
      recordingUrl: string | null;
      summary: string | null;
    }
  | {
      kind: "ignored";
      eventType: string;
    };

const corsHeaders = {
  "content-type": "application/json"
};

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  const channelId = request.headers.get("x-torrevie-channel-id");
  const webhookSecret = readBearerToken(request.headers.get("authorization")) ?? request.headers.get("x-torrevie-channel-secret");

  if (!channelId || !webhookSecret) {
    return jsonResponse({ error: "missing_channel_auth" }, 401);
  }

  const supabase = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false }
  });
  const channel = await verifyVoiceChannel(supabase, channelId, webhookSecret);

  if (!channel) {
    return jsonResponse({ error: "invalid_channel_auth" }, 401);
  }

  const payload = await request.json();
  const event = normalizeVapiWebhookPayload(payload);

  if (event.kind === "tool_call") {
    return jsonResponse(await handleToolCall(supabase, channel, event, payload));
  }

  if (event.kind === "end_of_call_report") {
    const intakeId = await createCallIntake(supabase, channel, event, payload);
    await createCallLog(supabase, channel, event, intakeId);
    return jsonResponse({ received: true, intake_request_id: intakeId });
  }

  return jsonResponse({ received: true, ignored: event.eventType });
});

async function verifyVoiceChannel(
  supabase: ReturnType<typeof createClient>,
  channelId: string,
  webhookSecret: string
): Promise<{ id: string; tenant_id: string; provider: string; config: JsonRecord } | null> {
  const { data, error } = await supabase
    .from("org_channels")
    .select("id, tenant_id, provider, config, org_channel_credentials!inner(secret_value)")
    .eq("id", channelId)
    .eq("channel_type", "voice")
    .eq("org_channel_credentials.secret_name", "voice_webhook_secret")
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const credentials = Array.isArray(data.org_channel_credentials) ? data.org_channel_credentials : [data.org_channel_credentials];
  const matchingSecret = credentials.some((credential) => readString(readRecord(credential)["secret_value"]) === webhookSecret);

  if (!matchingSecret) {
    return null;
  }

  return {
    id: readString(data.id),
    tenant_id: readString(data.tenant_id),
    provider: readString(data.provider),
    config: readRecord(data.config)
  };
}

async function handleToolCall(
  supabase: ReturnType<typeof createClient>,
  channel: { id: string; tenant_id: string },
  event: Extract<VoiceEvent, { kind: "tool_call" }>,
  payload: unknown
) {
  if (event.toolName === "identify_caller") {
    return identifyCaller(supabase, channel.tenant_id, readString(event.arguments["phone"] ?? event.arguments["phone_number"]));
  }

  if (event.toolName === "create_service_request") {
    const intakeId = await createToolCallIntake(supabase, channel, event, payload);
    return { intake_request_id: intakeId, status: "created" };
  }

  if (event.toolName === "check_job_status") {
    return { status: "not_available", message: "FSM job tracking is not active in this workspace yet." };
  }

  if (event.toolName === "escalate_to_human") {
    const intakeId = await createToolCallIntake(supabase, channel, event, payload, true);
    return { intake_request_id: intakeId, status: "escalated" };
  }

  return { status: "ignored", tool: event.toolName };
}

async function identifyCaller(supabase: ReturnType<typeof createClient>, tenantId: string, phone: string) {
  if (!phone) {
    return { matched: false };
  }

  const { data } = await supabase
    .from("contacts")
    .select("id, first_name, last_name, phone, email, account_id")
    .eq("tenant_id", tenantId)
    .eq("phone", phone)
    .limit(1)
    .maybeSingle();

  if (!data) {
    return { matched: false };
  }

  return {
    matched: true,
    contact: {
      id: data.id,
      name: [data.first_name, data.last_name].filter(Boolean).join(" "),
      phone: data.phone,
      email: data.email,
      account_id: data.account_id
    }
  };
}

async function createToolCallIntake(
  supabase: ReturnType<typeof createClient>,
  channel: { id: string; tenant_id: string },
  event: Extract<VoiceEvent, { kind: "tool_call" }>,
  payload: unknown,
  urgent = false
) {
  const summary = readString(event.arguments["summary"] ?? event.arguments["description"] ?? event.arguments["reason"]);
  const { data, error } = await supabase
    .from("intake_requests")
    .insert({
      tenant_id: channel.tenant_id,
      channel_id: channel.id,
      channel_type: "voice",
      external_ref: event.callId ? `voice-tool-${event.callId}` : crypto.randomUUID(),
      contact_name: readString(event.arguments["contact_name"] ?? event.arguments["name"]) || null,
      contact_phone: readString(event.arguments["phone"] ?? event.arguments["phone_number"]) || null,
      raw_payload: payload,
      ai_summary: summary || "Voice service request",
      ai_classification: {
        urgency: urgent ? "urgent" : readString(event.arguments["urgency"]) || "normal",
        source_tool: event.toolName
      },
      status: "new"
    })
    .select("id")
    .single();

  if (error) {
    throw error;
  }

  return data.id as string;
}

async function createCallIntake(
  supabase: ReturnType<typeof createClient>,
  channel: { id: string; tenant_id: string },
  event: Extract<VoiceEvent, { kind: "end_of_call_report" }>,
  payload: unknown
) {
  const { data, error } = await supabase
    .from("intake_requests")
    .insert({
      tenant_id: channel.tenant_id,
      channel_id: channel.id,
      channel_type: "voice",
      external_ref: event.callId ? `voice-call-${event.callId}` : crypto.randomUUID(),
      contact_phone: event.fromNumber,
      raw_payload: payload,
      transcript: event.transcript,
      ai_summary: event.summary || "Voice call completed.",
      ai_classification: { urgency: "normal", confidence: 0.7 },
      status: "new"
    })
    .select("id")
    .single();

  if (error) {
    throw error;
  }

  return data.id as string;
}

async function createCallLog(
  supabase: ReturnType<typeof createClient>,
  channel: { id: string; tenant_id: string },
  event: Extract<VoiceEvent, { kind: "end_of_call_report" }>,
  intakeId: string
) {
  const { error } = await supabase.from("call_logs").insert({
    tenant_id: channel.tenant_id,
    channel_id: channel.id,
    direction: "inbound",
    from_number: event.fromNumber,
    to_number: event.toNumber,
    started_at: event.startedAt || new Date().toISOString(),
    duration_seconds: event.durationSeconds,
    recording_url: event.recordingUrl,
    transcript: event.transcript,
    outcome: "converted",
    intake_request_id: intakeId,
    cost_estimate: estimateCallCost(event.durationSeconds)
  });

  if (error) {
    throw error;
  }
}

function normalizeVapiWebhookPayload(payload: unknown): VoiceEvent {
  const message = readRecord(readRecord(payload)["message"]);
  const type = readString(message["type"]);

  if (type === "tool-calls" || type === "function-call") {
    const firstToolCall = Array.isArray(message["toolCalls"]) ? readRecord(message["toolCalls"][0]) : message;
    const functionPayload = readRecord(firstToolCall["function"]);
    const toolName = readString(functionPayload["name"] ?? message["name"]) || "unknown";

    return {
      kind: "tool_call",
      callId: readCallId(message),
      toolName,
      arguments: readArguments(functionPayload["arguments"] ?? message["arguments"])
    };
  }

  if (type === "end-of-call-report") {
    const call = readRecord(message["call"]);
    const artifact = readRecord(message["artifact"]);

    return {
      kind: "end_of_call_report",
      callId: readCallId(message),
      fromNumber: readString(call["customer"] ?? call["from"] ?? message["from"]) || null,
      toNumber: readString(call["phoneNumber"] ?? call["to"] ?? message["to"]) || null,
      startedAt: readString(call["startedAt"] ?? message["startedAt"]) || null,
      durationSeconds: readDurationSeconds(message["durationSeconds"] ?? call["durationSeconds"]),
      transcript: readString(artifact["transcript"] ?? message["transcript"]) || null,
      recordingUrl: readString(artifact["recordingUrl"] ?? message["recordingUrl"]) || null,
      summary: readString(message["summary"] ?? artifact["summary"]) || null
    };
  }

  return { kind: "ignored", eventType: type || "unknown" };
}

function estimateCallCost(durationSeconds: number) {
  const minutes = Math.ceil(Math.max(0, durationSeconds) / 60);
  return Number((minutes * 0.12).toFixed(4));
}

function readBearerToken(value: string | null) {
  if (!value?.startsWith("Bearer ")) {
    return null;
  }

  return value.slice("Bearer ".length).trim();
}

function readArguments(value: unknown): JsonRecord {
  if (typeof value === "string") {
    try {
      return readRecord(JSON.parse(value));
    } catch {
      return {};
    }
  }

  return readRecord(value);
}

function readCallId(message: JsonRecord) {
  const call = readRecord(message["call"]);
  return readString(call["id"] ?? message["callId"]) || null;
}

function readDurationSeconds(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : 0;
}

function readRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function readString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function requireEnv(name: string) {
  const value = Deno.env.get(name);

  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}

function jsonResponse(body: JsonRecord, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders
  });
}
