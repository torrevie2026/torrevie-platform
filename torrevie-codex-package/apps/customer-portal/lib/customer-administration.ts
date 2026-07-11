import { assertPermission, roleKeys, type RoleKey } from "@torrevie/permissions";
import { withTenantContext, type ResolvedTenantContext, type TenantQueryClient } from "@torrevie/tenant-context";

export const assignableCustomerRoles = roleKeys.filter(
  (role) => role.startsWith("customer_") && role !== "integration_service"
) as RoleKey[];

export const membershipStatuses = ["active", "invited", "disabled"] as const;
export type MembershipStatus = (typeof membershipStatuses)[number];

export type CustomerAdminContext = ResolvedTenantContext & {
  roles: readonly RoleKey[];
};

export type CustomerMemberRecord = {
  userId: string;
  email: string;
  displayName: string | null;
  status: MembershipStatus;
  roles: RoleKey[];
};

export type CustomerInviteInput = {
  email: string;
  displayName?: string | null;
  role: RoleKey;
};

export async function listCustomerMembers(
  client: TenantQueryClient,
  actor: CustomerAdminContext
): Promise<CustomerMemberRecord[]> {
  assertCustomerPermission(actor, "tenant.user.manage");

  return withTenantContext(client, actor, async () => {
    const result = await client.query<MemberRow>(
      `
        select
          u.id as user_id,
          u.email,
          tm.status,
          up.display_name,
          r.key as role_key
        from public.tenant_memberships tm
        join public.users u on u.id = tm.user_id
        left join public.user_profiles up
          on up.tenant_id = tm.tenant_id
         and up.user_id = tm.user_id
        left join public.user_role_assignments ura
          on ura.tenant_id = tm.tenant_id
         and ura.user_id = tm.user_id
        left join public.roles r on r.id = ura.role_id
        where tm.tenant_id = public.current_tenant_id()
        order by u.email asc, r.key asc
      `
    );

    return groupMemberRows(result.rows);
  });
}

export async function inviteCustomerUser(
  client: TenantQueryClient,
  actor: CustomerAdminContext,
  input: CustomerInviteInput
): Promise<CustomerMemberRecord> {
  assertCustomerPermission(actor, "tenant.user.invite");
  assertCustomerPermission(actor, "tenant.role.assign");

  const email = sanitizeEmail(input.email);
  const displayName = cleanOptional(input.displayName);
  const role = sanitizeAssignableRole(input.role);

  return withTenantContext(client, actor, async () => {
    const userId = await upsertUserIdentity(client, email, actor.userId);

    await client.query(
      `
        insert into public.tenant_memberships (tenant_id, user_id, status, invited_by, created_by, updated_by)
        values (public.current_tenant_id(), $1, 'invited', $2, $2, $2)
        on conflict (tenant_id, user_id)
        do update set status = 'invited', invited_by = $2, updated_by = $2
      `,
      [userId, actor.userId]
    );

    if (displayName) {
      await client.query(
        `
          insert into public.user_profiles (tenant_id, user_id, display_name, created_by, updated_by)
          select public.current_tenant_id(), $1, $2, $3, $3
          where not exists (
            select 1
            from public.user_profiles
            where tenant_id = public.current_tenant_id()
              and user_id = $1
          )
        `,
        [userId, displayName, actor.userId]
      );
    }

    await replaceCustomerRole(client, userId, role, actor.userId);
    await writeCustomerAdminAuditEvent(client, actor, "tenant.user.invited", "user", userId, {
      email,
      role
    });

    return {
      userId,
      email,
      displayName,
      status: "invited",
      roles: [role]
    };
  });
}

export async function assignCustomerUserRole(
  client: TenantQueryClient,
  actor: CustomerAdminContext,
  targetUserId: string,
  role: RoleKey
): Promise<void> {
  assertCustomerPermission(actor, "tenant.role.assign");
  assertUuid(targetUserId, "target user id");
  const sanitizedRole = sanitizeAssignableRole(role);

  await withTenantContext(client, actor, async () => {
    await assertTenantMemberExists(client, targetUserId);
    await replaceCustomerRole(client, targetUserId, sanitizedRole, actor.userId);
    await writeCustomerAdminAuditEvent(client, actor, "tenant.role.assigned", "user", targetUserId, {
      role: sanitizedRole
    });
  });
}

export async function setCustomerMembershipStatus(
  client: TenantQueryClient,
  actor: CustomerAdminContext,
  targetUserId: string,
  status: MembershipStatus
): Promise<void> {
  assertCustomerPermission(actor, "tenant.user.manage");
  assertUuid(targetUserId, "target user id");
  assertMembershipStatus(status);

  if (targetUserId === actor.userId && status === "disabled") {
    throw new Error("Customer administrators cannot disable their own active tenant membership.");
  }

  await withTenantContext(client, actor, async () => {
    const result = await client.query<{ id: string }>(
      `
        update public.tenant_memberships
           set status = $1,
               updated_by = $2
         where tenant_id = public.current_tenant_id()
           and user_id = $3
         returning id
      `,
      [status, actor.userId, targetUserId]
    );

    if (result.rows.length !== 1) {
      throw new Error("Tenant member was not found.");
    }

    await writeCustomerAdminAuditEvent(client, actor, `tenant.user.${status}`, "user", targetUserId, {
      status
    });
  });
}

function assertCustomerPermission(actor: CustomerAdminContext, permission: "tenant.user.invite" | "tenant.user.manage" | "tenant.role.assign") {
  if (actor.roleScope !== "customer") {
    throw new Error("Customer administration requires a customer tenant context.");
  }

  assertPermission({
    roles: actor.roles,
    permission
  });
}

async function upsertUserIdentity(client: TenantQueryClient, email: string, actorUserId: string) {
  await client.query("select set_config('app.platform_service_role', 'true', true)");

  const result = await client.query<{ id: string }>(
    `
      insert into public.users (email, created_by, updated_by)
      values ($1, $2, $2)
      on conflict (email)
      do update set email = excluded.email,
                    updated_by = $2
      returning id
    `,
    [email, actorUserId]
  );

  await client.query("select set_config('app.platform_service_role', 'false', true)");

  const [user] = result.rows;

  if (!user) {
    throw new Error("Unable to create or find invited user.");
  }

  return user.id;
}

async function replaceCustomerRole(
  client: TenantQueryClient,
  userId: string,
  role: RoleKey,
  actorUserId: string
) {
  const roleResult = await client.query<{ id: string }>(
    "select id from public.roles where key = $1 and scope = 'customer'",
    [role]
  );
  const [roleRow] = roleResult.rows;

  if (!roleRow) {
    throw new Error(`Customer role was not found: ${role}`);
  }

  await client.query(
    `
      delete from public.user_role_assignments
       where tenant_id = public.current_tenant_id()
         and user_id = $1
    `,
    [userId]
  );

  await client.query(
    `
      insert into public.user_role_assignments (tenant_id, user_id, role_id, assigned_by, created_by, updated_by)
      values (public.current_tenant_id(), $1, $2, $3, $3, $3)
    `,
    [userId, roleRow.id, actorUserId]
  );
}

async function assertTenantMemberExists(client: TenantQueryClient, userId: string) {
  const result = await client.query<{ id: string }>(
    `
      select id
      from public.tenant_memberships
      where tenant_id = public.current_tenant_id()
        and user_id = $1
    `,
    [userId]
  );

  if (result.rows.length !== 1) {
    throw new Error("Tenant member was not found.");
  }
}

async function writeCustomerAdminAuditEvent(
  client: TenantQueryClient,
  actor: CustomerAdminContext,
  action: string,
  targetType: string,
  targetId: string,
  metadata: Record<string, string>
) {
  await client.query(
    `
      insert into public.audit_events (tenant_id, actor_user_id, action, target_type, target_id, metadata)
      values (public.current_tenant_id(), $1, $2, $3, $4, $5::jsonb)
    `,
    [actor.userId, action, targetType, targetId, JSON.stringify(metadata)]
  );
}

function groupMemberRows(rows: readonly MemberRow[]) {
  const members = new Map<string, CustomerMemberRecord>();

  for (const row of rows) {
    const member = members.get(row.user_id) ?? {
      userId: row.user_id,
      email: row.email,
      displayName: row.display_name,
      status: row.status,
      roles: []
    };

    if (row.role_key && isRoleKey(row.role_key) && !member.roles.includes(row.role_key)) {
      member.roles.push(row.role_key);
    }

    members.set(row.user_id, member);
  }

  return [...members.values()];
}

function sanitizeEmail(value: string) {
  const email = value.trim().toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("A valid email address is required.");
  }

  return email;
}

function cleanOptional(value: string | null | undefined) {
  const clean = value?.trim();
  return clean ? clean : null;
}

function sanitizeAssignableRole(role: RoleKey) {
  if (!assignableCustomerRoles.includes(role)) {
    throw new Error(`Role cannot be assigned by a customer administrator: ${role}`);
  }

  return role;
}

function assertMembershipStatus(status: string): asserts status is MembershipStatus {
  if (!membershipStatuses.includes(status as MembershipStatus)) {
    throw new Error(`Unsupported membership status: ${status}`);
  }
}

function assertUuid(value: string, label: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(`Invalid ${label}.`);
  }
}

function isRoleKey(value: string): value is RoleKey {
  return roleKeys.includes(value as RoleKey);
}

type MemberRow = {
  user_id: string;
  email: string;
  display_name: string | null;
  status: MembershipStatus;
  role_key: string | null;
};
