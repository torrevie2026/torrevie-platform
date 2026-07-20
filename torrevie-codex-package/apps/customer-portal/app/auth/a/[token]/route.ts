import { createClient } from "@supabase/supabase-js";
import { redeemAuthActionLink } from "@torrevie/auth/server";
import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;

  try {
    const actionLink = await redeemAuthActionLink(getSupabaseAdminClient(), token);
    const actionUrl = new URL(actionLink);
    actionUrl.searchParams.set("redirect_to", customerPasswordSetupCallbackUrl(request));

    return NextResponse.redirect(actionUrl);
  } catch {
    return NextResponse.redirect(new URL("/login?error=invalid_invite", request.url));
  }
}

function getSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Supabase admin environment variables are not configured.");
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

function customerPasswordSetupCallbackUrl(request: NextRequest) {
  const origin = customerPortalOrigin(request);
  return `${origin}/auth/callback?next=${encodeURIComponent("/en/account?setup=password")}`;
}

function customerPortalOrigin(request: NextRequest) {
  const requestOrigin = request.nextUrl.origin.replace(/\/+$/, "");
  if (isCustomerPortalUrl(requestOrigin)) {
    return requestOrigin;
  }

  return (
    normalizeCustomerPortalUrl(process.env.CUSTOMER_PORTAL_URL) ||
    normalizeCustomerPortalUrl(process.env.NEXT_PUBLIC_CUSTOMER_PORTAL_URL) ||
    "https://app.torrevie.com"
  );
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
