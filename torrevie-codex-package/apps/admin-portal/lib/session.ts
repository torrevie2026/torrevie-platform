import { createServerClient } from "@supabase/ssr";
import { getTenantClaimsFromJwt, requireSupabaseBrowserEnv } from "@torrevie/auth";
import { cookies } from "next/headers";
import { canAccessAdminPortalFromClaims } from "./access";

export type PlatformSession = {
  accessToken: string;
  userId: string;
};

export async function getPlatformSession(): Promise<PlatformSession | null> {
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
  const session = data.session;

  if (!session || !canAccessAdminPortalFromClaims(getTenantClaimsFromJwt(session.access_token))) {
    return null;
  }

  return {
    accessToken: session.access_token,
    userId: session.user.id
  };
}
