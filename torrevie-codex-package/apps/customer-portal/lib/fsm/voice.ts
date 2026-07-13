import type { BusinessSegment } from "../../config/fsmSegments";

export type VoiceSetupPath = "forward_existing_number" | "licensed_sip" | "missed_call_deflection";

export type VoiceSetupInput = {
  path: VoiceSetupPath;
  monthlyMinuteCap: number;
};

export type VoiceProvisioningPlan = {
  provider: "vapi" | "twilio";
  setupPath: VoiceSetupPath;
  status: "pending_manual_setup";
  monthlyMinuteCap: number;
  assistant: {
    script: string;
    tools: string[];
  };
  complianceNote: string;
};

export type VoiceUsageSummary = {
  monthlyMinuteCap: number;
  minutesUsed: number;
  warningAtMinutes: number;
  warningReached: boolean;
};

export type NormalizedVoiceEvent =
  | {
      kind: "tool_call";
      callId: string | null;
      toolName: string;
      arguments: Record<string, unknown>;
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
      outcome: "answered" | "voicemail" | "abandoned" | "converted";
      summary: string | null;
    }
  | {
      kind: "ignored";
      eventType: string;
    };

const voiceTools = ["identify_caller", "create_service_request", "check_job_status", "escalate_to_human"];

export function buildVoiceProvisioningPlan(input: {
  segment: BusinessSegment;
  tenantName: string;
  setupPath: VoiceSetupPath;
  monthlyMinuteCap: number;
}): VoiceProvisioningPlan {
  const provider = input.setupPath === "missed_call_deflection" ? "twilio" : "vapi";

  return {
    provider,
    setupPath: input.setupPath,
    status: "pending_manual_setup",
    monthlyMinuteCap: clampMinuteCap(input.monthlyMinuteCap),
    assistant: {
      script: buildVoiceAssistantScript(input.segment, input.tenantName),
      tools: provider === "vapi" ? voiceTools : ["create_service_request"]
    },
    complianceNote:
      "UAE telecom regulation restricts unlicensed VoIP origination. Use customer-side call forwarding or a licensed local telephony partner."
  };
}

export function buildVoiceAssistantScript(segment: BusinessSegment, tenantName: string) {
  const name = tenantName.trim() || "the service team";
  const commonClose = "Create a service request before the call ends. Escalate urgent safety issues to a human.";

  if (segment === "COMMUNITY") {
    return `Greet the caller as ${name} community hotline. Ask for building, unit, contact number, and request details. ${commonClose}`;
  }

  if (segment === "FM") {
    return `Greet the caller as ${name} service desk. Ask for site, location, asset, urgency, and access details. ${commonClose}`;
  }

  if (segment === "OEM") {
    return `Greet the caller as ${name} service hotline. Ask for product serial number, warranty context, symptom, and location. ${commonClose}`;
  }

  if (segment === "SOLO") {
    return `Greet the caller as ${name}. Capture the customer name, phone, location, and job details. ${commonClose}`;
  }

  return `Greet the caller as ${name} service hotline. Ask for client, site, equipment, urgency, and preferred visit time. ${commonClose}`;
}

export function normalizeVoiceSetupInput(raw: { path: string; monthlyMinuteCap: string }): VoiceSetupInput {
  return {
    path: readSetupPath(raw.path),
    monthlyMinuteCap: clampMinuteCap(Number(raw.monthlyMinuteCap))
  };
}

export function summarizeVoiceUsage(input: { monthlyMinuteCap: number; durationSeconds: number }): VoiceUsageSummary {
  const monthlyMinuteCap = clampMinuteCap(input.monthlyMinuteCap);
  const minutesUsed = Math.ceil(Math.max(0, input.durationSeconds) / 60);
  const warningAtMinutes = Math.ceil(monthlyMinuteCap * 0.8);

  return {
    monthlyMinuteCap,
    minutesUsed,
    warningAtMinutes,
    warningReached: minutesUsed >= warningAtMinutes
  };
}

export function normalizeVapiWebhookPayload(payload: unknown): NormalizedVoiceEvent {
  const message = readRecord(readRecord(payload)["message"]);
  const type = readString(message["type"]);

  if (type === "tool-calls" || type === "function-call") {
    const firstToolCall = Array.isArray(message["toolCalls"]) ? readRecord(message["toolCalls"][0]) : message;
    const functionPayload = readRecord(firstToolCall["function"]);
    const toolName = readString(functionPayload["name"] ?? message["functionCall"] ?? message["name"]) || "unknown";

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
      fromNumber: readString(call["customer"] ?? call["from"] ?? message["from"]),
      toNumber: readString(call["phoneNumber"] ?? call["to"] ?? message["to"]),
      startedAt: readString(call["startedAt"] ?? message["startedAt"]) || null,
      durationSeconds: readDurationSeconds(message["durationSeconds"] ?? call["durationSeconds"]),
      transcript: readString(artifact["transcript"] ?? message["transcript"]) || null,
      recordingUrl: readString(artifact["recordingUrl"] ?? message["recordingUrl"]) || null,
      outcome: "answered",
      summary: readString(message["summary"] ?? artifact["summary"]) || null
    };
  }

  return {
    kind: "ignored",
    eventType: type || "unknown"
  };
}

export function buildTwilioDeflectionTwiML(input: { whatsappNumber?: string; callbackMessage?: string }) {
  const message =
    input.callbackMessage?.trim() ||
    `Thank you for calling. Please send your service request by WhatsApp to ${input.whatsappNumber || "the service number"}. The team will call you back.`;

  return `<?xml version="1.0" encoding="UTF-8"?><Response><Say>${escapeXml(message)}</Say><Hangup /></Response>`;
}

function readSetupPath(value: string): VoiceSetupPath {
  if (value === "forward_existing_number" || value === "licensed_sip" || value === "missed_call_deflection") {
    return value;
  }

  return "forward_existing_number";
}

function clampMinuteCap(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return 500;
  }

  return Math.min(Math.max(Math.round(value), 50), 100000);
}

function readCallId(message: Record<string, unknown>) {
  const call = readRecord(message["call"]);
  return readString(call["id"] ?? message["callId"]) || null;
}

function readArguments(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try {
      return readRecord(JSON.parse(value));
    } catch {
      return {};
    }
  }

  return readRecord(value);
}

function readDurationSeconds(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : 0;
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function readString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&apos;");
}
