import { createServerClient } from "@supabase/ssr";
import { getTenantClaimsFromJwt, requireSupabaseBrowserEnv } from "@torrevie/auth";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { canAccessAdminPortalFromClaims } from "../../../lib/access";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const nextPath = sanitizeNextPath(requestUrl.searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=missing_code", requestUrl.origin));
  }

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

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(new URL("/login?error=invalid_invite", requestUrl.origin));
  }

  const { data } = await supabase.auth.getSession();
  const session = data.session;

  if (!session || !canAccessAdminPortalFromClaims(getTenantClaimsFromJwt(session.access_token))) {
    await supabase.auth.signOut({ scope: "local" });

    return NextResponse.redirect(new URL("/login?error=unauthorized", requestUrl.origin));
  }

  if (nextPath === "/account?setup=password") {
    cookieStore.set("torrevie_admin_password_setup", "1", {
      httpOnly: true,
      maxAge: 60 * 60,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production"
    });
  }

  return NextResponse.redirect(new URL(nextPath, requestUrl.origin));
}

function sanitizeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/account";
  }

  return value;
}
