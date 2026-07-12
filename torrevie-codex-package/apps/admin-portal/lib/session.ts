import { createServerClient } from "@supabase/ssr";
import { getTenantClaimsFromJwt, requireSupabaseBrowserEnv } from "@torrevie/auth";
import { cookies } from "next/headers";
import { canAccessAdminPortalFromClaims } from "./access";

export type PlatformSession = {
  accessToken: string;
  userId: string;
  email: string;
  timezone: string;
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

  return {
    accessToken: session.access_token,
    userId: session.user.id,
    email: session.user.email ?? "",
    timezone: readTimezone(session.user.user_metadata)
  };
}

function readTimezone(metadata: unknown) {
  const timezone = (metadata as { timezone?: unknown } | null)?.timezone;

  return typeof timezone === "string" && timezone.trim() ? timezone : "Asia/Dubai";
}
