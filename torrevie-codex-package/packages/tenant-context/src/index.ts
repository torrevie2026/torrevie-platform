export type RoleScope = "platform" | "customer";

export type QueryValue = string | number | boolean | null | Date;

export type QueryResult<Row> = {
  rows: Row[];
};

export type TenantQueryClient = {
  query<Row>(sql: string, values?: readonly QueryValue[]): Promise<QueryResult<Row>>;
};

export type TenantMembershipRow = {
  tenant_id: string;
  user_id: string;
  membership_status: "active" | "invited" | "disabled";
  user_status: "active" | "deactivated";
  role_scope: RoleScope | null;
  joined_at: string | null;
  created_at: string;
};

export type ResolvedTenantContext = {
  tenantId: string;
  userId: string;
  roleScope: RoleScope;
};

export class TenantContextError extends Error {
  constructor(
    message: string,
    readonly code: "missing_user" | "membership_not_found" | "inactive_user"
  ) {
    super(message);
    this.name = "TenantContextError";
  }
}

export function chooseActiveMembership(
  userId: string,
  rows: readonly TenantMembershipRow[]
): ResolvedTenantContext {
  if (!userId) {
    throw new TenantContextError("A user id is required to resolve tenant context.", "missing_user");
  }

  const activeRows = rows.filter(
    (row) =>
      row.user_id === userId &&
      row.membership_status === "active" &&
      row.user_status === "active"
  );

  if (activeRows.length === 0) {
    const hasDeactivatedUser = rows.some(
      (row) => row.user_id === userId && row.user_status === "deactivated"
    );

    if (hasDeactivatedUser) {
      throw new TenantContextError("The user is deactivated.", "inactive_user");
    }

    throw new TenantContextError("No active tenant membership was found.", "membership_not_found");
  }

  const [chosen] = [...activeRows].sort(compareMembershipRows);

  if (!chosen) {
    throw new TenantContextError("No active tenant membership was found.", "membership_not_found");
  }

  return {
    tenantId: chosen.tenant_id,
    userId: chosen.user_id,
    roleScope: chosen.role_scope ?? "customer"
  };
}

export async function resolveTenantContext(
  client: TenantQueryClient,
  userId: string
): Promise<ResolvedTenantContext> {
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
    `,
    [userId]
  );

  return chooseActiveMembership(userId, result.rows);
}

export async function setTenantContext(
  client: TenantQueryClient,
  tenantId: string
): Promise<void> {
  await client.query("select set_config('app.current_tenant_id', $1, true)", [tenantId]);
}

export async function withTenantContext<Result>(
  client: TenantQueryClient,
  context: ResolvedTenantContext,
  work: () => Promise<Result>
): Promise<Result> {
  await client.query("begin");

  try {
    await setTenantContext(client, context.tenantId);
    const result = await work();
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

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
