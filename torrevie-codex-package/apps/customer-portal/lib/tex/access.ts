import {
  assertPermission,
  hasPermission,
  roleKeys,
  type PermissionKey,
  type ProductKey,
  type RoleKey
} from "@torrevie/permissions";
import type { TenantQueryClient } from "@torrevie/tenant-context";
import type { TexActorContext } from "./types";

export function assertTexPermission(actor: TexActorContext, permission: PermissionKey) {
  if (actor.roleScope !== "customer" && actor.roleScope !== "platform") {
    throw new Error("TEX access requires a customer or support tenant context.");
  }

  assertPermission({
    roles: actor.roles,
    permission,
    entitledProducts: actor.entitledProducts,
    moduleAdminProducts: actor.moduleAdminProducts,
    integrationPermissions: actor.integrationPermissions,
    supportSessionActive: actor.roleScope === "platform"
  });
}

export function assertTexAnyPermission(
  actor: TexActorContext,
  permissions: readonly PermissionKey[]
) {
  if (actor.roleScope !== "customer" && actor.roleScope !== "platform") {
    throw new Error("TEX access requires a customer or support tenant context.");
  }

  const allowed = permissions.some(
    (permission) =>
      hasPermission({
        roles: actor.roles,
        permission,
        entitledProducts: actor.entitledProducts,
        moduleAdminProducts: actor.moduleAdminProducts,
        integrationPermissions: actor.integrationPermissions,
        supportSessionActive: actor.roleScope === "platform"
      }).allowed
  );

  if (!allowed) {
    assertTexPermission(actor, permissions[0] ?? "tex.expense.read");
  }
}

export function isRoleKey(value: string): value is RoleKey {
  return (roleKeys as readonly string[]).includes(value);
}

export function isProductKey(value: string): value is ProductKey {
  return (
    value === "crm" || value === "fsm" || value === "tex" || value === "cme" || value === "lqs"
  );
}

export function canReadBroadcastTexNotifications(actor: TexActorContext) {
  return actor.roles.some((role) =>
    [
      "customer_admin",
      "customer_module_admin",
      "customer_manager",
      "torrevie_platform_admin"
    ].includes(role)
  );
}

export function isTexStandardUserOnly(actor: TexActorContext) {
  return (
    actor.roles.includes("customer_standard_user") &&
    actor.roles.every((role) => role === "customer_standard_user")
  );
}

export async function assertStandardUserExpenseProfileScope(
  client: TenantQueryClient,
  actor: TexActorContext,
  employeeProfileId: string | null
) {
  if (!isTexStandardUserOnly(actor) || !employeeProfileId) {
    return;
  }

  const result = await client.query<{ id: string }>(
    `
      select id
      from public.tex_employee_profiles
      where tenant_id = public.current_tenant_id()
        and id = $1
        and user_id = $2
      limit 1
    `,
    [employeeProfileId, actor.userId]
  );

  if (!result.rows[0]) {
    throw new Error("Standard users can submit expenses only for their own profile.");
  }
}
