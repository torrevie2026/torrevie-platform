"use server";

import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { requireSupabaseBrowserEnv } from "@torrevie/auth";
import { createAuthActionShortLink } from "@torrevie/auth/server";
import { dispatchEmailNotification } from "@torrevie/notifications";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  assertTexStagingDemoAccessAllowed,
  ensureTexStagingDemoAccess,
  isTexStagingDemoCredential
} from "../../lib/server/tex-staging-demo-access";

export async function signIn(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const cookieStore = await cookies();
  const { url, anonKey } = requireSupabaseBrowserEnv();
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        for (const cookieToSet of cookiesToSet) {
          cookieStore.set(cookieToSet.name, cookieToSet.value, cookieToSet.options);
        }
      }
    }
  });

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error && isTexStagingDemoCredential(email, password)) {
    try {
      const headerStore = await headers();
      assertTexStagingDemoAccessAllowed(headerStore.get("host"));
      await ensureTexStagingDemoAccess();
      const retry = await supabase.auth.signInWithPassword({ email, password });

      if (!retry.error) {
        redirect("/en/tex");
      }
    } catch (caught) {
      console.error("TEX staging demo login setup failed.", {
        message: caught instanceof Error ? caught.message : "Unknown setup error"
      });
    }
  }

  if (error) {
    redirect("/login?error=invalid_credentials");
  }

  redirect("/en");
}

export async function requestPasswordReset(formData: FormData) {
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const emailQuery = email ? `&email=${encodeURIComponent(email)}` : "";
  let resetStatus: "failed" | "sent" = "sent";

  if (!isValidEmail(email)) {
    redirect(`/login?reset=invalid${emailQuery}`);
  }

  try {
    const client = getSupabaseAdminClient();
    const { data, error } = await client.auth.admin.generateLink({
      type: "recovery",
      email,
      options: {
        redirectTo: customerPasswordSetupCallbackUrl()
      }
    });

    if (error || !data.properties?.action_link) {
      console.warn("Customer self-service password reset link was not created.", {
        email,
        message: error?.message ?? "Missing action link"
      });
    } else {
      const actionLink = await createAuthActionShortLink(client, {
        actionLink: enforceCustomerPasswordSetupRedirect(data.properties.action_link),
        actionType: "recovery",
        baseUrl: customerPortalUrl()
      });

      const result = await dispatchEmailNotification({
        to: email,
        from: "Torrevie <noreply@torrevie.com>",
        subject: "Reset your Torrevie password",
        html: `
          <div style="font-family: Inter, Arial, sans-serif; color: #162449; line-height: 1.5;">
            <h1 style="font-size: 22px;">Reset your Torrevie password</h1>
            <p>We received a request to reset the password for your Torrevie account.</p>
            <p><a href="${escapeHtml(actionLink)}" style="background:#0D9488;color:#fff;padding:12px 18px;text-decoration:none;border-radius:6px;display:inline-block;">Set a new password</a></p>
            <p>If the button does not work, open this link:</p>
            <p><a href="${escapeHtml(actionLink)}">${escapeHtml(actionLink)}</a></p>
            <p>If you did not request this reset, you can ignore this email.</p>
          </div>
        `,
        text: `We received a request to reset the password for your Torrevie account.\n\nSet a new password: ${actionLink}\n\nIf you did not request this reset, you can ignore this email.`
      });

      if (!result.ok) {
        console.error("Customer self-service password reset email failed.", {
          email,
          error: result.error,
          status: result.status
        });
        resetStatus = "failed";
      }
    }
  } catch (caught) {
    console.error("Customer self-service password reset failed.", {
      email,
      message: caught instanceof Error ? caught.message : "Unknown reset error"
    });
    resetStatus = "failed";
  }

  redirect(`/login?reset=${resetStatus}${emailQuery}`);
}

function getSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Supabase admin environment variables are not configured.");
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

function customerPortalUrl() {
  return (
    normalizeCustomerPortalUrl(process.env.CUSTOMER_PORTAL_URL) ||
    normalizeCustomerPortalUrl(process.env.NEXT_PUBLIC_CUSTOMER_PORTAL_URL) ||
    normalizeCustomerPortalUrl(process.env.NEXT_PUBLIC_APP_URL) ||
    normalizeCustomerPortalUrl(process.env.VERCEL_PROJECT_PRODUCTION_URL) ||
    "https://app.torrevie.com"
  );
}

function normalizeCustomerPortalUrl(value: string | undefined) {
  const clean = value?.trim().replace(/^['"]|['"]$/g, "").replace(/\/$/, "");
  if (!clean) {
    return null;
  }

  const url = /^https?:\/\//i.test(clean) ? clean : `https://${clean}`;

  return isCustomerPortalUrl(url) ? url : null;
}

function customerPasswordSetupCallbackUrl() {
  return `${customerPortalUrl()}/auth/callback?next=${encodeURIComponent("/en/account?setup=password")}`;
}

function enforceCustomerPasswordSetupRedirect(actionLink: string) {
  try {
    const url = new URL(actionLink);
    url.searchParams.set("redirect_to", customerPasswordSetupCallbackUrl());
    return url.toString();
  } catch {
    return actionLink;
  }
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

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
