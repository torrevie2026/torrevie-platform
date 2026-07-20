import { createAuthActionShortLink } from "@torrevie/auth/server";
import type { SupabaseClient } from "@supabase/supabase-js";

export function customerPortalUrl() {
  return (
    normalizeCustomerPortalUrl(process.env.CUSTOMER_PORTAL_URL) ||
    normalizeCustomerPortalUrl(process.env.NEXT_PUBLIC_CUSTOMER_PORTAL_URL) ||
    normalizeCustomerPortalUrl(process.env.NEXT_PUBLIC_APP_URL) ||
    normalizeCustomerPortalUrl(process.env.VERCEL_PROJECT_PRODUCTION_URL) ||
    "https://app.torrevie.com"
  );
}

export function customerPasswordSetupCallbackUrl() {
  return `${customerPortalUrl()}/auth/callback?next=${encodeURIComponent("/en/account?setup=password")}`;
}

export function enforceCustomerPasswordSetupActionLink(actionLink: string) {
  try {
    const url = new URL(actionLink);
    url.searchParams.set("redirect_to", customerPasswordSetupCallbackUrl());
    return url.toString();
  } catch {
    return actionLink;
  }
}

export async function createCustomerAuthActionShortLink(
  client: SupabaseClient,
  actionLink: string,
  actionType: "invite" | "recovery"
) {
  return createAuthActionShortLink(client, {
    actionLink: enforceCustomerPasswordSetupActionLink(actionLink),
    actionType,
    baseUrl: customerPortalUrl()
  });
}

function normalizeCustomerPortalUrl(value: string | undefined) {
  const clean = value?.trim().replace(/^['"]|['"]$/g, "").replace(/\/+$/, "");
  if (!clean) {
    return null;
  }

  const url = /^https?:\/\//i.test(clean) ? clean : `https://${clean}`;

  return isCustomerPortalUrl(url) ? url : null;
}

function isCustomerPortalUrl(value: string) {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return (
      hostname === "app.torrevie.com" ||
      hostname === "torrevie-customer-portal-production.vercel.app" ||
      hostname === "torrevie-customer-portal-staging.vercel.app" ||
      hostname.endsWith("-torrevie-customer-portal-production.vercel.app") ||
      hostname.endsWith("-torrevie-customer-portal-staging.vercel.app")
    );
  } catch {
    return false;
  }
}
