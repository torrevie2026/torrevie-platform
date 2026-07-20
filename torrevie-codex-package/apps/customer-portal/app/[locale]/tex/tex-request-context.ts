import {
  getCustomerAccessRequirements,
  getCustomerMfaAssurance,
  isCustomerSessionError,
  requireVerifiedCustomerSession,
  resolveCustomerTenantContext
} from "../../../lib/server/customer-session";
import { PostgresTenantQueryClient } from "../../../lib/server/tenant-query-client";
import { resolveTexActorContext } from "../../../lib/tex";
import { redirect } from "next/navigation";

export async function requireTexRequestContext(locale?: "en" | "ar", nextPath = "/tex") {
  const session = await requireVerifiedCustomerSession();
  const client = new PostgresTenantQueryClient(session.userId);
  const tenantContext = await resolveCustomerTenantContext(client, session);
  const requirements = await getCustomerAccessRequirements(client, tenantContext);

  if (locale && requirements.requireProfileCompletion && !requirements.profileComplete) {
    redirect(`/${locale}/account?profile=required`);
  }

  if (locale && requirements.requirePasswordChange) {
    redirect(`/${locale}/account?password=required`);
  }

  if (locale && requirements.requireMfa && !requirements.mfaEnrolled) {
    redirect(`/${locale}/account?mfa=required`);
  }

  if (locale && requirements.requireMfa) {
    const mfaAssurance = await getCustomerMfaAssurance();

    if (mfaAssurance.requiresChallenge) {
      redirect(`/${locale}/mfa?next=${encodeURIComponent(`/${locale}${nextPath}`)}`);
    }
  }

  const actor = await resolveTexActorContext(client, tenantContext);

  return { actor, client, session };
}

export function isTexSessionError(error: unknown) {
  return isCustomerSessionError(error);
}
