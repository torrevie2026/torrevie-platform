import { createServerClient } from "@supabase/ssr";
import { getTenantClaimsFromJwt, requireSupabaseBrowserEnv } from "@torrevie/auth";
import { cookies, headers } from "next/headers";
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
  if (await isLocalReviewBypassEnabled()) {
    return localReviewSession();
  }

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

export async function isLocalReviewBypassEnabled() {
  if (process.env.ADMIN_LOCAL_REVIEW_BYPASS !== "true") {
    return false;
  }

  const headerStore = await headers();
  const host = headerStore.get("host") ?? "";
  return host.startsWith("localhost:") || host.startsWith("127.0.0.1:");
}

function localReviewSession(): PlatformSession {
  const userId = "00000000-0000-4000-8000-000000000001";
  const email = "local-review@torrevie.test";

  return {
    accessToken: "local-review-bypass",
    userId,
    email,
    timezone: "Asia/Dubai",
    profile: {
      firstName: "Local",
      lastName: "Reviewer",
      position: "Review mode",
      mobileNumber: "+971000000000",
      recoveryEmail: email,
      completedAt: new Date(0).toISOString()
    },
    profileComplete: true,
    mfaRequired: false
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
    profile.firstName &&
      profile.lastName &&
      profile.position &&
      profile.mobileNumber &&
      profile.recoveryEmail
  );
}

function readString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function readTimezone(metadata: unknown) {
  const timezone = (metadata as { timezone?: unknown } | null)?.timezone;

  return typeof timezone === "string" && timezone.trim() ? timezone : "Asia/Dubai";
}
