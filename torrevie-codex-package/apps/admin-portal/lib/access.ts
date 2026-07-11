import type { RoleKey } from "@torrevie/permissions";
import type { TenantClaims } from "@torrevie/auth";

export function isTorrevieStaffRole(role: RoleKey): boolean {
  return role.startsWith("torrevie_");
}

export function canAccessAdminPortal(roles: readonly RoleKey[]): boolean {
  return roles.some(isTorrevieStaffRole);
}

export function canAccessAdminPortalFromClaims(claims: TenantClaims): boolean {
  return claims.role_scope === "platform";
}
