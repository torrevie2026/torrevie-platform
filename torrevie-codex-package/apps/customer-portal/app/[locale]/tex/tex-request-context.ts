import {
  isCustomerSessionError,
  requireVerifiedCustomerSession,
  resolveCustomerTenantContext
} from "../../../lib/server/customer-session";
import { PostgresTenantQueryClient } from "../../../lib/server/tenant-query-client";
import { resolveTexActorContext } from "../../../lib/tex";

export async function requireTexRequestContext() {
  const session = await requireVerifiedCustomerSession();
  const client = new PostgresTenantQueryClient(session.userId);
  const tenantContext = await resolveCustomerTenantContext(client, session);
  const actor = await resolveTexActorContext(client, tenantContext);

  return { actor, client, session };
}

export function isTexSessionError(error: unknown) {
  return isCustomerSessionError(error);
}
