import { strict as assert } from "node:assert";
import { defaultFlowSettings, detectBusinessSegment, suggestedPlanForSegment } from "../apps/customer-portal/config/fsmSegments";
import { navForSegment } from "../apps/customer-portal/config/navProfiles";
import { term } from "../apps/customer-portal/config/terminology";

assert.equal(
  detectBusinessSegment({
    serve: "homeowners",
    intake: "owner_whatsapp",
    fieldSize: "up_to_5"
  }),
  "SOLO"
);

assert.equal(
  detectBusinessSegment({
    serve: "products",
    intake: "email_dealer",
    fieldSize: "six_to_50"
  }),
  "OEM"
);

assert.equal(suggestedPlanForSegment("SOLO"), "entry");
assert.equal(suggestedPlanForSegment("TRADE"), "growth");
assert.equal(suggestedPlanForSegment("FM"), "enterprise");

const entryTradeNav = navForSegment("TRADE", new Set(["fsm.channel.whatsapp.enabled"]));
assert.equal(entryTradeNav.some((item) => item.key === "pm"), false);
assert.equal(entryTradeNav.some((item) => item.key === "whatsapp"), true);

const growthTradeNav = navForSegment("TRADE", new Set(["fsm.module.pm", "fsm.module.contracts", "fsm.channel.whatsapp.enabled"]));
assert.equal(growthTradeNav.some((item) => item.key === "pm"), true);
assert.equal(growthTradeNav.some((item) => item.key === "contracts"), true);

assert.equal(term("COMMUNITY", "en", "customer"), "Resident");
assert.equal(term("OEM", "en", "asset"), "Installed Product");
assert.equal(defaultFlowSettings.FM.slaStartsAt, "intake");
assert.equal(defaultFlowSettings.SOLO.autoConvertIntake, true);

console.log("FSM adaptive UX smoke test passed.");
