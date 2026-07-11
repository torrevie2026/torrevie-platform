import { createServerClient } from "@supabase/ssr";
import { getTenantClaimsFromJwt, requireSupabaseBrowserEnv } from "@torrevie/auth";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default async function SessionPage() {
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
  const {
    data: { session }
  } = await supabase.auth.getSession();

  if (!session) {
    redirect("/login");
  }

  const claims = getTenantClaimsFromJwt(session.access_token);

  return (
    <main>
      <h1>Session</h1>
      <dl>
        <dt>Tenant</dt>
        <dd>{claims.tenant_id ?? "Not set"}</dd>
        <dt>Role scope</dt>
        <dd>{claims.role_scope ?? "Not set"}</dd>
      </dl>
    </main>
  );
}
