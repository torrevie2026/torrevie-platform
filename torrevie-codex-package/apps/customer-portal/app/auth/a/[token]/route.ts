import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { getTenantClaimsFromJwt, requireSupabaseBrowserEnv } from "@torrevie/auth";
import { redeemAuthActionLink } from "@torrevie/auth/server";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token: shortLinkToken } = await context.params;
  const requestUrl = new URL(request.url);

  try {
    const actionLink = await redeemAuthActionLink(getSupabaseAdminClient(), shortLinkToken);
    const authAction = parseSupabaseActionLink(actionLink);
    const supabase = await getSupabaseServerClient();
    const { error } = await supabase.auth.verifyOtp({
      token_hash: authAction.tokenHash,
      type: authAction.type
    });

    if (error) {
      return NextResponse.redirect(new URL("/login?error=invalid_invite", requestUrl.origin));
    }

    const { data } = await supabase.auth.getSession();
    const session = data.session;
    const claims = session ? getTenantClaimsFromJwt(session.access_token) : {};

    if (!session || claims.role_scope === "platform") {
      await supabase.auth.signOut({ scope: "local" });

      return NextResponse.redirect(new URL("/login?error=unauthorized", requestUrl.origin));
    }

    return NextResponse.redirect(new URL("/en/account?setup=password", requestUrl.origin));
  } catch {
    return NextResponse.redirect(new URL("/login?error=invalid_invite", requestUrl.origin));
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

async function getSupabaseServerClient() {
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

function parseSupabaseActionLink(actionLink: string) {
  const actionUrl = new URL(actionLink);
  const tokenHash = actionUrl.searchParams.get("token");
  const type = actionUrl.searchParams.get("type");

  if (!tokenHash || (type !== "invite" && type !== "recovery")) {
    throw new Error("Invalid Torrevie auth action link.");
  }

  return { tokenHash, type };
}
