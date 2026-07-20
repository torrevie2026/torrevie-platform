import { createServerClient } from "@supabase/ssr";
import { getTenantClaimsFromJwt, requireSupabaseBrowserEnv } from "@torrevie/auth";
import {
  resolveTenantContext,
  type ResolvedTenantContext,
  type TenantMembershipRow,
  type TenantQueryClient
} from "@torrevie/tenant-context";
import { cookies } from "next/headers";
import {
  getActiveSupportAccessSession,
  supportAccessTenantContext,
  type SupportAccessSession
} from "./support-access";

export type VerifiedCustomerSession = {
  accessToken: string;
  userId: string;
  email: string | null;
  supportAccess?: SupportAccessSession;
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

export type CustomerMfaAssurance = {
  currentLevel: string | null;
  nextLevel: string | null;
  requiresChallenge: boolean;
};

export async function requireVerifiedCustomerSession(): Promise<VerifiedCustomerSession> {
  const supportAccess = await getActiveSupportAccessSession();

  if (supportAccess) {
    return {
      accessToken: "support-access",
      userId: supportAccess.actorUserId,
      email: supportAccess.actorEmail,
      supportAccess
    };
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
  const {
    data: { session }
  } = await supabase.auth.getSession();

  if (!session) {
    throw new CustomerSessionError(
      "Authentication is required for customer portal access.",
      "unauthorized"
    );
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
  if (session.supportAccess) {
    return supportAccessTenantContext(session.supportAccess);
  }

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

export async function resolveCustomerAccountTenantContext(
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

  const result = await client.query<TenantMembershipRow>(
    `
      select
        tm.tenant_id,
        tm.user_id,
        tm.status as membership_status,
        u.status as user_status,
        r.scope as role_scope,
        tm.joined_at,
        tm.created_at
      from public.tenant_memberships tm
      join public.users u on u.id = tm.user_id
      left join public.user_role_assignments ura
        on ura.tenant_id = tm.tenant_id
       and ura.user_id = tm.user_id
      left join public.roles r on r.id = ura.role_id
      where tm.user_id = $1
        and tm.status in ('active', 'invited')
        and u.status = 'active'
    `,
    [session.userId]
  );

  const invitedRows = result.rows.filter((row) => row.membership_status === "invited");
  const activeRows = result.rows.filter((row) => row.membership_status === "active");
  const chosen = [...(activeRows.length > 0 ? activeRows : invitedRows)].sort(
    compareMembershipRows
  )[0];

  if (!chosen) {
    return resolveTenantContext(client, session.userId);
  }

  return {
    tenantId: chosen.tenant_id,
    userId: chosen.user_id,
    roleScope: chosen.role_scope ?? "customer"
  };
}

export async function getCustomerAccessRequirements(
  client: TenantQueryClient,
  context: ResolvedTenantContext
): Promise<CustomerAccessRequirements> {
  if (context.roleScope === "platform") {
    return {
      displayName: "Torrevie Support",
      firstName: "Torrevie",
      lastName: "Support",
      mobileNumber: "",
      recoveryEmail: "",
      profileComplete: true,
      requireProfileCompletion: false,
      requirePasswordChange: false,
      requireMfa: false,
      mfaEnrolled: true
    };
  }

  const [userResult, profileResult] = await Promise.all([
    client.query<UserRequirementRow>(
      `
        select first_name, last_name, mobile_number, recovery_email, profile_completed_at, mfa_enrolled
        from public.users
        where id = $1
      `,
      [context.userId]
    ),
    client.query<ProfileRequirementRow>(
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
    )
  ]);
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

export async function getCustomerMfaAssurance(): Promise<CustomerMfaAssurance> {
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
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

  if (error) {
    return {
      currentLevel: null,
      nextLevel: null,
      requiresChallenge: true
    };
  }

  return {
    currentLevel: data.currentLevel ?? null,
    nextLevel: data.nextLevel ?? null,
    requiresChallenge: data.nextLevel === "aal2" && data.currentLevel !== "aal2"
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

function compareMembershipRows(left: TenantMembershipRow, right: TenantMembershipRow) {
  const leftPlatformRank = left.role_scope === "platform" ? 0 : 1;
  const rightPlatformRank = right.role_scope === "platform" ? 0 : 1;

  if (leftPlatformRank !== rightPlatformRank) {
    return leftPlatformRank - rightPlatformRank;
  }

  const leftJoinedAt = Date.parse(left.joined_at ?? left.created_at);
  const rightJoinedAt = Date.parse(right.joined_at ?? right.created_at);
  return rightJoinedAt - leftJoinedAt;
}
