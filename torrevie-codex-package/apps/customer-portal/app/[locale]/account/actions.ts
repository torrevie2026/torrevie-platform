"use server";

import { createServerClient } from "@supabase/ssr";
import { getTenantClaimsFromJwt, requireSupabaseBrowserEnv } from "@torrevie/auth";
import { resolveTenantContext } from "@torrevie/tenant-context";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PostgresTenantQueryClient } from "../../../lib/server/tenant-query-client";

export async function updateCustomerProfileAction(formData: FormData) {
  const locale = localeValue(formData);
  const session = await requireCustomerSession(locale);
  const profile = sanitizeProfile(
    {
      firstName: stringValue(formData, "firstName"),
      lastName: stringValue(formData, "lastName"),
      displayName: stringValue(formData, "displayName"),
      mobileNumber: stringValue(formData, "mobileNumber"),
      recoveryEmail: stringValue(formData, "recoveryEmail")
    },
    locale
  );
  const client = new PostgresTenantQueryClient(session.userId);

  await client.query(
    `
      update public.users
         set first_name = $1,
             last_name = $2,
             mobile_number = $3,
             recovery_email = $4,
             profile_completed_at = now(),
             updated_by = $5
       where id = $5
    `,
    [profile.firstName, profile.lastName, profile.mobileNumber, profile.recoveryEmail, session.userId]
  );
  await client.query(
    `
      update public.user_profiles
         set display_name = $1,
             require_profile_completion = false,
             updated_by = $2
       where tenant_id = $3
         and user_id = $2
    `,
    [profile.displayName, session.userId, session.tenantId]
  );

  redirect(`/${locale}/account?profile=updated`);
}

export async function changeCustomerPasswordAction(formData: FormData) {
  const locale = localeValue(formData);
  const session = await requireCustomerSession(locale);
  const newPassword = stringValue(formData, "newPassword");
  const confirmPassword = stringValue(formData, "confirmPassword");

  if (newPassword.length < 8) {
    redirect(`/${locale}/account?password=too_short`);
  }

  if (newPassword !== confirmPassword) {
    redirect(`/${locale}/account?password=mismatch`);
  }

  const { error } = await session.supabase.auth.updateUser({ password: newPassword });

  if (error) {
    redirect(`/${locale}/account?password=failed`);
  }

  const client = new PostgresTenantQueryClient(session.userId);
  await client.query(
    `
      update public.user_profiles
         set require_password_change = false,
             updated_by = $1
       where tenant_id = $2
         and user_id = $1
    `,
    [session.userId, session.tenantId]
  );

  redirect(`/${locale}/account?password=updated`);
}

export async function updateCustomerMfaEnrollmentAction(enabled: boolean) {
  const session = await requireCustomerSession("en");
  const client = new PostgresTenantQueryClient(session.userId);

  await client.query(
    `
      update public.users
         set mfa_enrolled = $1,
             updated_by = $2
       where id = $2
    `,
    [enabled, session.userId]
  );
}

async function requireCustomerSession(locale: "en" | "ar") {
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
  const { data } = await supabase.auth.getSession();
  const authSession = data.session;

  if (!authSession) {
    redirect("/login");
  }

  const claims = getTenantClaimsFromJwt(authSession.access_token);
  let tenantId = claims.tenant_id;

  if (!tenantId) {
    try {
      tenantId = (await resolveTenantContext(new PostgresTenantQueryClient(authSession.user.id), authSession.user.id)).tenantId;
    } catch {
      redirect("/login");
    }
  }

  return {
    supabase,
    userId: authSession.user.id,
    tenantId,
    locale
  };
}

function stringValue(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function localeValue(formData: FormData): "en" | "ar" {
  return stringValue(formData, "locale") === "ar" ? "ar" : "en";
}

function sanitizeProfile(input: {
  firstName: string;
  lastName: string;
  displayName: string;
  mobileNumber: string;
  recoveryEmail: string;
}, locale: "en" | "ar") {
  if (!input.firstName || !input.lastName || !input.displayName || !input.mobileNumber || !input.recoveryEmail) {
    redirect(`/${locale}/account?profile=missing`);
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.recoveryEmail)) {
    redirect(`/${locale}/account?profile=invalid_recovery_email`);
  }

  if (input.mobileNumber.length < 7 || input.mobileNumber.length > 32) {
    redirect(`/${locale}/account?profile=invalid_mobile`);
  }

  return input;
}
