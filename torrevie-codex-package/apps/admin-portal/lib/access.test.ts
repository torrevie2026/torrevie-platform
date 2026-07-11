import { strict as assert } from "node:assert";
import { canAccessAdminPortal, canAccessAdminPortalFromClaims } from "./access";
import { roleKeys } from "@torrevie/permissions";

const platformRoles = roleKeys.filter((role) => role.startsWith("torrevie_"));
const customerRoles = roleKeys.filter((role) => !role.startsWith("torrevie_"));

for (const role of platformRoles) {
  assert.equal(canAccessAdminPortal([role]), true, `${role} should access the admin portal`);
}

for (const role of customerRoles) {
  assert.equal(canAccessAdminPortal([role]), false, `${role} should not access the admin portal`);
}

assert.equal(canAccessAdminPortalFromClaims({ role_scope: "platform" }), true);
assert.equal(canAccessAdminPortalFromClaims({ role_scope: "customer" }), false);
assert.equal(canAccessAdminPortalFromClaims({}), false);

console.log("Admin portal authorization tests passed.");
