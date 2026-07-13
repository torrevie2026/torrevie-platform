import { strict as assert } from "node:assert";
import {
  buildTwilioDeflectionTwiML,
  buildVoiceAssistantScript,
  buildVoiceProvisioningPlan,
  normalizeVapiWebhookPayload,
  normalizeVoiceSetupInput,
  summarizeVoiceUsage
} from "../apps/customer-portal/lib/fsm/voice";

assert.match(buildVoiceAssistantScript("COMMUNITY", "Palm Tower"), /building, unit/);
assert.match(buildVoiceAssistantScript("FM", "Alpha FM"), /site, location, asset/);
assert.match(buildVoiceAssistantScript("OEM", "Torrevie Test"), /product serial number/);

const vapiToolEvent = normalizeVapiWebhookPayload({
  message: {
    type: "tool-calls",
    call: { id: "call-123" },
    toolCalls: [
      {
        function: {
          name: "create_service_request",
          arguments: JSON.stringify({ phone: "+971500000001", summary: "AC fault" })
        }
      }
    ]
  }
});

assert.equal(vapiToolEvent.kind, "tool_call");
assert.equal(vapiToolEvent.toolName, "create_service_request");
assert.equal(vapiToolEvent.arguments["summary"], "AC fault");

const vapiEndEvent = normalizeVapiWebhookPayload({
  message: {
    type: "end-of-call-report",
    call: { id: "call-124", from: "+971500000002", to: "+441234567890", durationSeconds: 121 },
    artifact: { transcript: "Caller reported a leak.", recordingUrl: "https://example.test/recording.mp3" },
    summary: "Leak reported"
  }
});

assert.equal(vapiEndEvent.kind, "end_of_call_report");
assert.equal(vapiEndEvent.durationSeconds, 121);
assert.equal(vapiEndEvent.summary, "Leak reported");

const plan = buildVoiceProvisioningPlan({
  segment: "FM",
  tenantName: "Alpha FM",
  setupPath: "forward_existing_number",
  monthlyMinuteCap: 1000
});

assert.equal(plan.provider, "vapi");
assert.equal(plan.assistant.tools.includes("identify_caller"), true);
assert.equal(plan.monthlyMinuteCap, 1000);

const deflectionPlan = buildVoiceProvisioningPlan({
  segment: "SOLO",
  tenantName: "Solo Works",
  setupPath: "missed_call_deflection",
  monthlyMinuteCap: 10
});

assert.equal(deflectionPlan.provider, "twilio");
assert.equal(deflectionPlan.monthlyMinuteCap, 50);

const twiml = buildTwilioDeflectionTwiML({ whatsappNumber: "+971500000000" });
assert.match(twiml, /<Response>/);
assert.match(twiml, /WhatsApp/);

assert.deepEqual(normalizeVoiceSetupInput({ path: "licensed_sip", monthlyMinuteCap: "800" }), {
  path: "licensed_sip",
  monthlyMinuteCap: 800
});

assert.deepEqual(summarizeVoiceUsage({ monthlyMinuteCap: 100, durationSeconds: 4860 }), {
  monthlyMinuteCap: 100,
  minutesUsed: 81,
  warningAtMinutes: 80,
  warningReached: true
});

console.log("FSM voice core smoke test passed.");
