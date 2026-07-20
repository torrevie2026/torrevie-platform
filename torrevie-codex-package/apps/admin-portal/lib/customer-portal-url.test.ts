import { strict as assert } from "node:assert";
import { customerPasswordSetupCallbackUrl, customerPortalUrl } from "./customer-portal-url";

const originalEnv = {
  CUSTOMER_PORTAL_URL: process.env.CUSTOMER_PORTAL_URL,
  NEXT_PUBLIC_CUSTOMER_PORTAL_URL: process.env.NEXT_PUBLIC_CUSTOMER_PORTAL_URL,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL
};

function resetEnv() {
  for (const key of Object.keys(originalEnv) as Array<keyof typeof originalEnv>) {
    const value = originalEnv[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

try {
  process.env.CUSTOMER_PORTAL_URL = "";
  process.env.NEXT_PUBLIC_CUSTOMER_PORTAL_URL = "";
  process.env.NEXT_PUBLIC_APP_URL = "https://admin.torrevie.com";
  process.env.VERCEL_PROJECT_PRODUCTION_URL = "torrevie-admin-portal-production.vercel.app";

  assert.equal(customerPortalUrl(), "https://app.torrevie.com");
  assert.equal(
    customerPasswordSetupCallbackUrl(),
    "https://app.torrevie.com/auth/callback?next=%2Fen%2Faccount%3Fsetup%3Dpassword"
  );

  process.env.CUSTOMER_PORTAL_URL = '"https://app.torrevie.com/"';
  assert.equal(customerPortalUrl(), "https://app.torrevie.com");

  console.log("Admin customer portal URL tests passed.");
} finally {
  resetEnv();
}
