"use server";

import { createServerClient } from "@supabase/ssr";
import { getTenantClaimsFromJwt, requireSupabaseBrowserEnv } from "@torrevie/auth";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { canAccessAdminPortalFromClaims } from "../../lib/access";
import { getSupabaseAdminClient } from "../../lib/admin-client";

export async function signOutAction() {
  const supabase = await createWritableSupabaseServerClient();

  await supabase.auth.signOut({ scope: "local" });
  redirect("/login");
}

export async function changePasswordAction(formData: FormData) {
  const supabase = await createWritableSupabaseServerClient();
  const session = await requireAuthorizedSession(supabase);
  const currentPassword = stringValue(formData, "currentPassword");
  const newPassword = stringValue(formData, "newPassword");
  const confirmPassword = stringValue(formData, "confirmPassword");

  if (newPassword.length < 8) {
    redirect("/account?password=too_short");
  }

  if (newPassword !== confirmPassword) {
    redirect("/account?password=mismatch");
  }

  if (!session.user.email) {
    redirect("/account?password=missing_email");
  }

  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: session.user.email,
    password: currentPassword
  });

  if (verifyError) {
    redirect("/account?password=invalid_current");
  }

  const { error } = await supabase.auth.updateUser({ password: newPassword });

  if (error) {
    redirect("/account?password=failed");
  }

  redirect("/account?password=updated");
}

export async function setInitialPasswordAction(formData: FormData) {
  const cookieStore = await cookies();

  if (cookieStore.get("torrevie_admin_password_setup")?.value !== "1") {
    redirect("/account?password=setup_expired");
  }

  const supabase = await createWritableSupabaseServerClient();
  await requireAuthorizedSession(supabase);
  const newPassword = stringValue(formData, "newPassword");
  const confirmPassword = stringValue(formData, "confirmPassword");

  if (newPassword.length < 8) {
    redirect("/account?setup=password&password=too_short");
  }

  if (newPassword !== confirmPassword) {
    redirect("/account?setup=password&password=mismatch");
  }

  const { error } = await supabase.auth.updateUser({ password: newPassword });

  if (error) {
    redirect("/account?setup=password&password=failed");
  }

  cookieStore.delete("torrevie_admin_password_setup");
  redirect("/account?password=setup_updated");
}

export async function updateTimezoneAction(formData: FormData) {
  const supabase = await createWritableSupabaseServerClient();
  await requireAuthorizedSession(supabase);
  const timezone = sanitizeTimezone(stringValue(formData, "timezone"));
  const { error } = await supabase.auth.updateUser({
    data: {
      timezone
    }
  });

  if (error) {
    redirect("/account?timezone=failed");
  }

  redirect("/account?timezone=updated");
}

export async function updateProfileAction(formData: FormData) {
  const supabase = await createWritableSupabaseServerClient();
  const session = await requireAuthorizedSession(supabase);
  const profile = sanitizeProfile({
    firstName: stringValue(formData, "firstName"),
    lastName: stringValue(formData, "lastName"),
    position: stringValue(formData, "position"),
    mobileNumber: stringValue(formData, "mobileNumber"),
    recoveryEmail: stringValue(formData, "recoveryEmail")
  });
  const { error } = await getSupabaseAdminClient()
    .from("users")
    .update({
      first_name: profile.firstName,
      last_name: profile.lastName,
      position: profile.position,
      mobile_number: profile.mobileNumber,
      recovery_email: profile.recoveryEmail,
      profile_completed_at: new Date().toISOString(),
      updated_by: session.user.id
    })
    .eq("id", session.user.id);

  if (error) {
    redirect("/account?profile=failed");
  }

  redirect("/account?profile=updated");
}

export async function updateMfaEnrollmentAction(enabled: boolean) {
  const supabase = await createWritableSupabaseServerClient();
  const session = await requireAuthorizedSession(supabase);
  const { error } = await getSupabaseAdminClient()
    .from("users")
    .update({
      mfa_enrolled: enabled,
      updated_by: session.user.id
    })
    .eq("id", session.user.id);

  if (error) {
    throw new Error(`Unable to update MFA enrollment state: ${error.message}`);
  }
}

async function createWritableSupabaseServerClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = requireSupabaseBrowserEnv();

  return createServerClient(url, anonKey, {
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
}

async function requireAuthorizedSession(supabase: Awaited<ReturnType<typeof createWritableSupabaseServerClient>>) {
  const { data } = await supabase.auth.getSession();
  const session = data.session;

  if (!session) {
    redirect("/login");
  }

  if (!canAccessAdminPortalFromClaims(getTenantClaimsFromJwt(session.access_token))) {
    notFound();
  }

  return session;
}

function stringValue(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function sanitizeTimezone(value: string) {
  if (!value || value.length > 64) {
    redirect("/account?timezone=invalid");
  }

  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format(new Date());
  } catch {
    redirect("/account?timezone=invalid");
  }

  return value;
}

function sanitizeProfile(input: {
  firstName: string;
  lastName: string;
  position: string;
  mobileNumber: string;
  recoveryEmail: string;
}) {
  if (!input.firstName || !input.lastName || !input.position || !input.mobileNumber || !input.recoveryEmail) {
    redirect("/account?profile=missing");
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.recoveryEmail)) {
    redirect("/account?profile=invalid_recovery_email");
  }

  if (input.mobileNumber.length < 7 || input.mobileNumber.length > 32) {
    redirect("/account?profile=invalid_mobile");
  }

  return input;
}
