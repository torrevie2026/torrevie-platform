import { createServerClient } from "@supabase/ssr";
import { getTenantClaimsFromJwt, requireSupabaseBrowserEnv } from "@torrevie/auth";
import { resolveTenantContext, type ResolvedTenantContext, type TenantQueryClient } from "@torrevie/tenant-context";
import { cookies } from "next/headers";

export type VerifiedCustomerSession = {
  accessToken: string;
  userId: string;
  email: string | null;
};

export async function requireVerifiedCustomerSession(): Promise<VerifiedCustomerSession> {
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
    throw new CustomerSessionError("Authentication is required for customer portal access.", "unauthorized");
  }

  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error || !user || user.id !== session.user.id) {
    throw new CustomerSessionError("Unable to verify the customer portal session.", "unauthorized");
  }

  return {
    accessToken: session.access_token,
    userId: user.id,
    email: user.email ?? null
  };
}

export async function resolveCustomerTenantContext(
  client: TenantQueryClient,
  session: VerifiedCustomerSession
): Promise<ResolvedTenantContext> {
  const claims = getTenantClaimsFromJwt(session.accessToken);

  if (claims.tenant_id) {
    return {
      tenantId: claims.tenant_id,
      userId: session.userId,
      roleScope: claims.role_scope ?? "customer"
    };
  }

  return resolveTenantContext(client, session.userId);
}

export function isCustomerSessionError(error: unknown): error is CustomerSessionError {
  return error instanceof CustomerSessionError;
}

export class CustomerSessionError extends Error {
  constructor(
    message: string,
    readonly code: "unauthorized"
  ) {
    super(message);
    this.name = "CustomerSessionError";
  }
}
