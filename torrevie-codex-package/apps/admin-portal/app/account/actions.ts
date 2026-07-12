"use server";

import { createServerClient } from "@supabase/ssr";
import { getTenantClaimsFromJwt, requireSupabaseBrowserEnv } from "@torrevie/auth";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { canAccessAdminPortalFromClaims } from "../../lib/access";

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
