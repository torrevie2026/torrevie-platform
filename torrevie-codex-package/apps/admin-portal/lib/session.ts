import { createServerClient } from "@supabase/ssr";
import { getTenantClaimsFromJwt, requireSupabaseBrowserEnv } from "@torrevie/auth";
import { cookies } from "next/headers";
import { canAccessAdminPortalFromClaims } from "./access";
import { getSupabaseAdminClient } from "./admin-client";

export type PlatformUserProfile = {
  firstName: string;
  lastName: string;
  position: string;
  mobileNumber: string;
  recoveryEmail: string;
  completedAt: string | null;
};

export type PlatformSession = {
  accessToken: string;
  userId: string;
  email: string;
  timezone: string;
  profile: PlatformUserProfile;
  profileComplete: boolean;
  mfaRequired: boolean;
};

export async function getPlatformSession(): Promise<PlatformSession | null> {
  const cookieStore = await cookies();
  const { url, anonKey } = requireSupabaseBrowserEnv();
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll() {
        return;
      }
    }
  });
  const { data } = await supabase.auth.getSession();
  const session = data.session;

  if (!session || !canAccessAdminPortalFromClaims(getTenantClaimsFromJwt(session.access_token))) {
    return null;
  }

  const [profile, assurance] = await Promise.all([
    getPlatformUserProfile(session.user.id),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  ]);

  return {
    accessToken: session.access_token,
    userId: session.user.id,
    email: session.user.email ?? "",
    timezone: readTimezone(session.user.user_metadata),
    profile,
    profileComplete: isProfileComplete(profile),
    mfaRequired: assurance.data?.nextLevel === "aal2" && assurance.data.currentLevel !== "aal2"
  };
}

async function getPlatformUserProfile(userId: string): Promise<PlatformUserProfile> {
  const { data, error } = await getSupabaseAdminClient()
    .from("users")
    .select("first_name,last_name,position,mobile_number,recovery_email,profile_completed_at")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to load platform user profile: ${error.message}`);
  }

  return {
    firstName: readString(data?.first_name),
    lastName: readString(data?.last_name),
    position: readString(data?.position),
    mobileNumber: readString(data?.mobile_number),
    recoveryEmail: readString(data?.recovery_email),
    completedAt: readString(data?.profile_completed_at) || null
  };
}

function isProfileComplete(profile: PlatformUserProfile) {
  return Boolean(
    profile.firstName && profile.lastName && profile.position && profile.mobileNumber && profile.recoveryEmail
  );
}

function readString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function readTimezone(metadata: unknown) {
  const timezone = (metadata as { timezone?: unknown } | null)?.timezone;

  return typeof timezone === "string" && timezone.trim() ? timezone : "Asia/Dubai";
}
