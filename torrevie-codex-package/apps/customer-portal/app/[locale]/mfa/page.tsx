import { isLocale, type Locale } from "@torrevie/localization";
import { notFound, redirect } from "next/navigation";
import {
  getCustomerAccessRequirements,
  getCustomerMfaAssurance,
  isCustomerSessionError,
  requireVerifiedCustomerSession,
  resolveCustomerTenantContext
} from "../../../lib/server/customer-session";
import { PostgresTenantQueryClient } from "../../../lib/server/tenant-query-client";
import { CustomerMfaChallenge } from "./CustomerMfaChallenge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function CustomerMfaPage({
  params,
  searchParams
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string }>;
}) {
  const { locale: rawLocale } = await params;

  if (!isLocale(rawLocale)) {
    notFound();
  }

  const locale = rawLocale as Locale;
  const nextPath = sanitizeNextPath((await searchParams).next, locale);

  try {
    const session = await requireVerifiedCustomerSession();
    const client = new PostgresTenantQueryClient(session.userId);
    const tenantContext = await resolveCustomerTenantContext(client, session);
    const requirements = await getCustomerAccessRequirements(client, tenantContext);

    if (requirements.requireProfileCompletion && !requirements.profileComplete) {
      redirect(`/${locale}/account?profile=required`);
    }

    if (requirements.requirePasswordChange) {
      redirect(`/${locale}/account?password=required`);
    }

    if (requirements.requireMfa && !requirements.mfaEnrolled) {
      redirect(`/${locale}/account?mfa=required`);
    }

    if (!requirements.requireMfa) {
      redirect(nextPath);
    }

    const mfaAssurance = await getCustomerMfaAssurance();

    if (!mfaAssurance.requiresChallenge) {
      redirect(nextPath);
    }

    return (
      <main className="login-shell" lang={locale}>
        <CustomerMfaChallenge locale={locale} nextPath={nextPath} />
      </main>
    );
  } catch (error) {
    if (isCustomerSessionError(error)) {
      redirect("/login");
    }

    throw error;
  }
}

function sanitizeNextPath(value: string | undefined, locale: Locale) {
  if (!value || !value.startsWith(`/${locale}`) || value.startsWith("//")) {
    return `/${locale}`;
  }

  return value;
}
