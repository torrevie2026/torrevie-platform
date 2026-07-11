import { createServerClient } from "@supabase/ssr";
import { getTenantClaimsFromJwt, requireSupabaseBrowserEnv } from "@torrevie/auth";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { canAccessAdminPortalFromClaims } from "../lib/access";

export const dynamic = "force-dynamic";

export default async function AdminHomePage() {
  const accessToken = await getAccessToken();

  if (!accessToken) {
    redirect("/login");
  }

  if (!canAccessAdminPortalFromClaims(getTenantClaimsFromJwt(accessToken))) {
    notFound();
  }

  return (
    <main className="admin-shell">
      <aside className="admin-sidebar" aria-label="Control Plane sections">
        <p className="brand">Torrevie</p>
        <nav>
          <a href="/">Overview</a>
          <a href="/tenants">Tenants</a>
          <a href="/">Provisioning</a>
          <a href="/">Subscriptions</a>
          <a href="/">Audit</a>
        </nav>
      </aside>
      <section className="admin-main">
        <header className="topbar">
          <div>
            <p className="eyebrow">Control Plane</p>
            <h1>Admin Portal</h1>
          </div>
          <span className="status">Platform access</span>
        </header>
        <section className="summary-grid" aria-label="Foundation status">
          <article>
            <span>WP-10 Gate</span>
            <strong>Active</strong>
            <p>Tenant isolation is required before platform changes can merge.</p>
          </article>
          <article>
            <span>Scope</span>
            <strong>Staff only</strong>
            <p>Customer roles are blocked before the shell renders.</p>
          </article>
          <article>
            <span>Next Slice</span>
            <strong>Tenant lifecycle</strong>
            <p>Feature routes will land after the shell authorization boundary.</p>
          </article>
        </section>
      </section>
    </main>
  );
}

async function getAccessToken() {
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

  return data.session?.access_token ?? null;
}
