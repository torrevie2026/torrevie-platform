import { createServerClient } from "@supabase/ssr";
import { getTenantClaimsFromJwt, requireSupabaseBrowserEnv } from "@torrevie/auth";
import { resolveTenantContext, type ResolvedTenantContext, type TenantQueryClient } from "@torrevie/tenant-context";
import { cookies } from "next/headers";

export type VerifiedCustomerSession = {
  accessToken: string;
  userId: string;
  email: string | null;
};

export type CustomerAccessRequirements = {
  displayName: string;
  firstName: string;
  lastName: string;
  mobileNumber: string;
  recoveryEmail: string;
  profileComplete: boolean;
  requireProfileCompletion: boolean;
  requirePasswordChange: boolean;
  requireMfa: boolean;
  mfaEnrolled: boolean;
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

export async function getCustomerAccessRequirements(
  client: TenantQueryClient,
  context: ResolvedTenantContext
): Promise<CustomerAccessRequirements> {
  const userResult = await client.query<UserRequirementRow>(
    `
      select first_name, last_name, mobile_number, recovery_email, profile_completed_at, mfa_enrolled
      from public.users
      where id = $1
    `,
    [context.userId]
  );
  const profileResult = await client.query<ProfileRequirementRow>(
    `
      select
        display_name,
        require_profile_completion,
        require_password_change,
        require_mfa
      from public.user_profiles
      where tenant_id = $1
        and user_id = $2
    `,
    [context.tenantId, context.userId]
  );
  const user = userResult.rows[0];
  const profile = profileResult.rows[0];

  return {
    displayName: profile?.display_name ?? "",
    firstName: user?.first_name ?? "",
    lastName: user?.last_name ?? "",
    mobileNumber: user?.mobile_number ?? "",
    recoveryEmail: user?.recovery_email ?? "",
    profileComplete: Boolean(user?.profile_completed_at),
    requireProfileCompletion: profile?.require_profile_completion ?? true,
    requirePasswordChange: profile?.require_password_change ?? false,
    requireMfa: profile?.require_mfa ?? false,
    mfaEnrolled: user?.mfa_enrolled ?? false
  };
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

type UserRequirementRow = {
  first_name: string | null;
  last_name: string | null;
  mobile_number: string | null;
  recovery_email: string | null;
  profile_completed_at: string | null;
  mfa_enrolled: boolean;
};

type ProfileRequirementRow = {
  display_name: string | null;
  require_profile_completion: boolean | null;
  require_password_change: boolean | null;
  require_mfa: boolean | null;
};
