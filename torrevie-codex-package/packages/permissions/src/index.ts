export const roleKeys = [
  "torrevie_platform_admin",
  "torrevie_operations_admin",
  "torrevie_support_agent",
  "torrevie_billing_admin",
  "torrevie_security_admin",
  "customer_admin",
  "customer_module_admin",
  "customer_manager",
  "customer_standard_user",
  "customer_readonly",
  "integration_service"
] as const;

export type RoleKey = (typeof roleKeys)[number];

export const permissionKeys = [
  "platform.provision",
  "platform.subscription.manage",
  "platform.support_access.grant",
  "platform.audit.read_all",
  "tenant.settings.manage",
  "tenant.user.invite",
  "tenant.user.manage",
  "tenant.role.assign",
  "crm.account.read",
  "crm.account.write",
  "crm.opportunity.read",
  "crm.opportunity.write",
  "crm.pipeline.manage",
  "fsm.work_order.read",
  "fsm.work_order.update_assigned",
  "fsm.work_order.manage",
  "tex.expense.submit",
  "tex.expense.approve",
  "tex.policy.manage",
  "cme.content.draft",
  "cme.content.publish",
  "lqs.lead.read",
  "lqs.lead.qualify",
  "lqs.scoring.manage"
] as const;

export type PermissionKey = (typeof permissionKeys)[number];
export type ProductKey = "crm" | "fsm" | "tex" | "cme" | "lqs";

export type PermissionDecision = {
  allowed: boolean;
  reason:
    | "allowed"
    | "missing_permission"
    | "missing_entitlement"
    | "requires_support_session"
    | "requires_ownership"
    | "integration_scope_required";
};

export type PermissionContext = {
  roles: readonly RoleKey[];
  permission: PermissionKey;
  entitledProducts?: readonly ProductKey[];
  moduleAdminProducts?: readonly ProductKey[];
  supportSessionActive?: boolean;
  integrationPermissions?: readonly PermissionKey[];
  ownership?: {
    actorUserId: string;
    ownerUserId?: string;
    assignedUserIds?: readonly string[];
    designatedApproverUserId?: string;
  };
};

const customerAdminEquivalentPermissions = permissionKeys.filter(
  (permission) => !permission.startsWith("platform.")
);

const baseRolePermissions = {
  torrevie_platform_admin: [
    "platform.provision",
    "platform.subscription.manage",
    "platform.support_access.grant",
    "platform.audit.read_all",
    ...customerAdminEquivalentPermissions
  ],
  torrevie_operations_admin: ["platform.provision", "platform.support_access.grant"],
  torrevie_support_agent: ["platform.support_access.grant", "platform.audit.read_all"],
  torrevie_billing_admin: ["platform.subscription.manage", "platform.audit.read_all"],
  torrevie_security_admin: ["platform.audit.read_all", "tenant.role.assign"],
  customer_admin: customerAdminEquivalentPermissions,
  customer_module_admin: [
    "crm.account.read",
    "crm.account.write",
    "crm.opportunity.read",
    "crm.opportunity.write",
    "crm.pipeline.manage",
    "fsm.work_order.read",
    "fsm.work_order.update_assigned",
    "fsm.work_order.manage",
    "tex.expense.submit",
    "tex.expense.approve",
    "tex.policy.manage",
    "cme.content.draft",
    "cme.content.publish",
    "lqs.lead.read",
    "lqs.lead.qualify",
    "lqs.scoring.manage"
  ],
  customer_manager: [
    "crm.account.read",
    "crm.opportunity.read",
    "crm.opportunity.write",
    "tex.expense.approve",
    "fsm.work_order.manage"
  ],
  customer_standard_user: [
    "crm.account.read",
    "crm.opportunity.read",
    "crm.opportunity.write",
    "fsm.work_order.update_assigned",
    "tex.expense.submit",
    "cme.content.draft",
    "lqs.lead.qualify"
  ],
  customer_readonly: permissionKeys.filter((permission) => permission.endsWith(".read")),
  integration_service: []
} satisfies Record<RoleKey, readonly PermissionKey[]>;

export function hasPermission(context: PermissionContext): PermissionDecision {
  const product = productForPermission(context.permission);

  if (context.roles.includes("integration_service")) {
    return decideIntegrationPermission(context, product);
  }

  if (!hasBasePermission(context.roles, context.permission)) {
    return { allowed: false, reason: "missing_permission" };
  }

  if (requiresSupportSession(context.roles, context.permission) && !context.supportSessionActive) {
    return { allowed: false, reason: "requires_support_session" };
  }

  if (product && !context.entitledProducts?.includes(product)) {
    return { allowed: false, reason: "missing_entitlement" };
  }

  if (
    context.roles.includes("customer_module_admin") &&
    product &&
    !context.moduleAdminProducts?.includes(product) &&
    !context.roles.some((role) => role !== "customer_module_admin")
  ) {
    return { allowed: false, reason: "missing_entitlement" };
  }

  if (!passesOwnershipNarrowing(context)) {
    return { allowed: false, reason: "requires_ownership" };
  }

  return { allowed: true, reason: "allowed" };
}

export function assertPermission(context: PermissionContext): void {
  const decision = hasPermission(context);

  if (!decision.allowed) {
    throw new PermissionDeniedError(context.permission, decision.reason);
  }
}

export class PermissionDeniedError extends Error {
  constructor(
    readonly permission: PermissionKey,
    readonly reason: PermissionDecision["reason"]
  ) {
    super(`Permission denied for ${permission}: ${reason}`);
    this.name = "PermissionDeniedError";
  }
}

export function permissionsForRoles(roles: readonly RoleKey[]): PermissionKey[] {
  return [...new Set(roles.flatMap((role) => baseRolePermissions[role]))];
}

function hasBasePermission(roles: readonly RoleKey[], permission: PermissionKey) {
  return permissionsForRoles(roles).includes(permission);
}

function requiresSupportSession(roles: readonly RoleKey[], permission: PermissionKey) {
  return roles.some((role) => role.startsWith("torrevie_")) && !permission.startsWith("platform.");
}

function productForPermission(permission: PermissionKey): ProductKey | null {
  const [prefix] = permission.split(".");

  if (prefix === "crm" || prefix === "fsm" || prefix === "tex" || prefix === "cme" || prefix === "lqs") {
    return prefix;
  }

  return null;
}

function passesOwnershipNarrowing(context: PermissionContext) {
  if (context.roles.some((role) => role !== "customer_standard_user")) {
    return true;
  }

  if (context.permission === "crm.opportunity.write") {
    return Boolean(
      context.ownership?.actorUserId &&
        context.ownership.ownerUserId &&
        context.ownership.actorUserId === context.ownership.ownerUserId
    );
  }

  if (context.permission === "fsm.work_order.update_assigned") {
    return Boolean(
      context.ownership?.actorUserId &&
        context.ownership.assignedUserIds?.includes(context.ownership.actorUserId)
    );
  }

  if (context.permission === "tex.expense.approve") {
    return Boolean(
      context.ownership?.actorUserId &&
        context.ownership.designatedApproverUserId === context.ownership.actorUserId
    );
  }

  return true;
}

function decideIntegrationPermission(
  context: PermissionContext,
  product: ProductKey | null
): PermissionDecision {
  if (!context.integrationPermissions?.includes(context.permission)) {
    return { allowed: false, reason: "integration_scope_required" };
  }

  if (product && !context.entitledProducts?.includes(product)) {
    return { allowed: false, reason: "missing_entitlement" };
  }

  return { allowed: true, reason: "allowed" };
}
