import { strict as assert } from "node:assert";
import { InMemoryRateLimiter, fsmRateLimitPolicies, rateLimitHeaders } from "../apps/customer-portal/lib/fsm/rate-limit";

const limiter = new InMemoryRateLimiter();
const portalPolicy = fsmRateLimitPolicies["fsm.portal.intake"];
const voicePolicy = fsmRateLimitPolicies["fsm.voice.webhook"];
const now = Date.parse("2026-07-13T08:00:00.000Z");

for (let index = 0; index < portalPolicy.maxRequests; index += 1) {
  const result = limiter.check(portalPolicy, "198.51.100.10", now);
  assert.equal(result.allowed, true);
}

const blockedPortal = limiter.check(portalPolicy, "198.51.100.10", now);
assert.equal(blockedPortal.allowed, false);
assert.equal(blockedPortal.remaining, 0);
assert.equal(rateLimitHeaders(blockedPortal)["x-ratelimit-reset"], "2026-07-13T08:01:00.000Z");

const nextWindow = limiter.check(portalPolicy, "198.51.100.10", now + portalPolicy.windowMs + 1);
assert.equal(nextWindow.allowed, true);
assert.equal(nextWindow.remaining, portalPolicy.maxRequests - 1);

const otherIdentity = limiter.check(portalPolicy, "198.51.100.11", now);
assert.equal(otherIdentity.allowed, true);
assert.equal(otherIdentity.remaining, portalPolicy.maxRequests - 1);

for (let index = 0; index < voicePolicy.maxRequests; index += 1) {
  const result = limiter.check(voicePolicy, "voice-channel-a", now);
  assert.equal(result.allowed, true);
}

const blockedVoice = limiter.check(voicePolicy, "voice-channel-a", now);
assert.equal(blockedVoice.allowed, false);

limiter.reset();
assert.equal(limiter.check(voicePolicy, "voice-channel-a", now).allowed, true);

console.log("FSM hardening smoke test passed.");
