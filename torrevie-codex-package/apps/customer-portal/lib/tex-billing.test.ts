import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  billingStatusForStripeStatus,
  defaultBillingCurrency,
  platformSubscriptionStatus,
  requireStripePriceId,
  sanitizeCurrency,
  sanitizePaidPlanKey,
  texPlanStatusForStripeStatus,
  verifyStripeWebhookPayload
} from "./tex/billing";

const previousEnv = { ...process.env };

try {
  assert.equal(sanitizePaidPlanKey("lite"), "lite");
  assert.equal(sanitizePaidPlanKey("growth"), "growth");
  assert.throws(() => sanitizePaidPlanKey("trial"), /Lite and Growth/);
  assert.throws(() => sanitizePaidPlanKey("enterprise"), /Lite and Growth/);

  assert.equal(sanitizeCurrency("AED"), "aed");
  assert.equal(sanitizeCurrency("usd"), "usd");
  assert.equal(sanitizeCurrency("eur"), null);
  assert.equal(defaultBillingCurrency({ region: "AE" }), "aed");
  assert.equal(defaultBillingCurrency({ region: "UAE" }), "aed");
  assert.equal(defaultBillingCurrency({ region: "United Arab Emirates" }), "aed");
  assert.equal(defaultBillingCurrency({ region: "Saudi Arabia" }), "usd");

  process.env.TEX_STRIPE_LITE_AED_PRICE_ID = "price_lite_aed";
  assert.equal(requireStripePriceId("lite", "aed"), "price_lite_aed");
  assert.throws(() => requireStripePriceId("growth", "usd"), /TEX_STRIPE_GROWTH_USD_PRICE_ID/);

  assert.equal(platformSubscriptionStatus("active"), "active");
  assert.equal(platformSubscriptionStatus("trialing"), "active");
  assert.equal(platformSubscriptionStatus("canceled"), "cancelled");
  assert.equal(platformSubscriptionStatus("past_due"), "expired");
  assert.equal(texPlanStatusForStripeStatus("past_due"), "suspended");
  assert.equal(billingStatusForStripeStatus("past_due"), "overdue");
  assert.equal(billingStatusForStripeStatus("active"), "paid");

  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  const payload = JSON.stringify({
    id: "evt_test",
    type: "checkout.session.completed",
    data: { object: { metadata: { tenant_id: "tenant-a" } } }
  });
  const timestamp = "1784793600";
  const signature = createHmac("sha256", process.env.STRIPE_WEBHOOK_SECRET)
    .update(`${timestamp}.${payload}`)
    .digest("hex");

  assert.equal(
    verifyStripeWebhookPayload(payload, `t=${timestamp},v1=${signature}`).id,
    "evt_test"
  );
  assert.throws(
    () => verifyStripeWebhookPayload(payload, `t=${timestamp},v1=${"0".repeat(64)}`),
    /Invalid Stripe webhook signature/
  );
} finally {
  process.env = previousEnv;
}

console.log("TEX billing tests passed.");
