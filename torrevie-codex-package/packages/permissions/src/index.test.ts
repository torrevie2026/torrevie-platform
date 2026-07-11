import assert from "node:assert/strict";
import {
  PermissionDeniedError,
  assertPermission,
  hasPermission,
  permissionsForRoles,
  type PermissionKey,
  type ProductKey,
  type RoleKey
} from "./index.js";

function decision(
  roles: RoleKey[],
  permission: PermissionKey,
  entitledProducts: ProductKey[] = ["crm", "fsm", "tex", "cme", "lqs"]
) {
  return hasPermission({ roles, permission, entitledProducts });
}

assert.equal(decision(["torrevie_platform_admin"], "platform.provision").allowed, true);
assert.equal(
  decision(["torrevie_platform_admin"], "crm.opportunity.write").reason,
  "requires_support_session"
);
assert.equal(
  hasPermission({
    roles: ["torrevie_platform_admin"],
    permission: "crm.opportunity.write",
    entitledProducts: ["crm"],
    supportSessionActive: true
  }).allowed,
  true
);

assert.equal(decision(["torrevie_operations_admin"], "platform.provision").allowed, true);
assert.equal(decision(["torrevie_operations_admin"], "platform.subscription.manage").allowed, false);

assert.equal(decision(["torrevie_support_agent"], "platform.audit.read_all").allowed, true);
assert.equal(decision(["torrevie_support_agent"], "tenant.user.manage").allowed, false);

assert.equal(decision(["torrevie_billing_admin"], "platform.subscription.manage").allowed, true);
assert.equal(decision(["torrevie_billing_admin"], "platform.provision").allowed, false);

assert.equal(decision(["torrevie_security_admin"], "tenant.role.assign").reason, "requires_support_session");
assert.equal(
  hasPermission({
    roles: ["torrevie_security_admin"],
    permission: "tenant.role.assign",
    supportSessionActive: true
  }).allowed,
  true
);
assert.equal(decision(["torrevie_security_admin"], "tenant.user.manage").allowed, false);

assert.equal(decision(["customer_admin"], "tenant.user.invite").allowed, true);
assert.equal(decision(["customer_admin"], "platform.provision").allowed, false);
assert.equal(decision(["customer_admin"], "crm.pipeline.manage", []).reason, "missing_entitlement");

assert.equal(
  hasPermission({
    roles: ["customer_module_admin"],
    permission: "crm.pipeline.manage",
    entitledProducts: ["crm"],
    moduleAdminProducts: ["crm"]
  }).allowed,
  true
);
assert.equal(
  hasPermission({
    roles: ["customer_module_admin"],
    permission: "fsm.work_order.manage",
    entitledProducts: ["fsm"],
    moduleAdminProducts: ["crm"]
  }).reason,
  "missing_entitlement"
);

assert.equal(decision(["customer_manager"], "crm.opportunity.write", ["crm"]).allowed, true);
assert.equal(decision(["customer_manager"], "tenant.user.manage").allowed, false);

assert.equal(
  hasPermission({
    roles: ["customer_standard_user"],
    permission: "crm.opportunity.write",
    entitledProducts: ["crm"],
    ownership: { actorUserId: "user-a", ownerUserId: "user-a" }
  }).allowed,
  true
);
assert.equal(
  hasPermission({
    roles: ["customer_standard_user"],
    permission: "crm.opportunity.write",
    entitledProducts: ["crm"],
    ownership: { actorUserId: "user-a", ownerUserId: "user-b" }
  }).reason,
  "requires_ownership"
);
assert.equal(
  hasPermission({
    roles: ["customer_standard_user"],
    permission: "fsm.work_order.update_assigned",
    entitledProducts: ["fsm"],
    ownership: { actorUserId: "tech-a", assignedUserIds: ["tech-a"] }
  }).allowed,
  true
);

assert.equal(decision(["customer_readonly"], "crm.account.read", ["crm"]).allowed, true);
assert.equal(decision(["customer_readonly"], "crm.account.write", ["crm"]).allowed, false);

assert.equal(
  hasPermission({
    roles: ["integration_service"],
    permission: "crm.account.read",
    entitledProducts: ["crm"],
    integrationPermissions: ["crm.account.read"]
  }).allowed,
  true
);
assert.equal(
  hasPermission({
    roles: ["integration_service"],
    permission: "crm.account.write",
    entitledProducts: ["crm"],
    integrationPermissions: ["crm.account.read"]
  }).reason,
  "integration_scope_required"
);

assert.deepEqual(
  permissionsForRoles(["customer_readonly"]).filter((permission) => !permission.endsWith(".read")),
  []
);

assert.throws(
  () => assertPermission({ roles: ["customer_readonly"], permission: "crm.account.write", entitledProducts: ["crm"] }),
  PermissionDeniedError
);

console.log("Permissions unit tests passed.");
