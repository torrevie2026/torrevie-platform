export type TenantClaims = {
  tenant_id?: string;
  role_scope?: "platform" | "customer";
};

export function requireSupabaseBrowserEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Supabase browser environment variables are not configured.");
  }

  return { url, anonKey };
}

export function getTenantClaimsFromJwt(accessToken: string): TenantClaims {
  const [, payload] = accessToken.split(".");

  if (!payload) {
    return {};
  }

  const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as TenantClaims;
  return {
    tenant_id: decoded.tenant_id,
    role_scope: decoded.role_scope
  };
}
