import { dirForLocale, isLocale, type Locale } from "@torrevie/localization";
import { notFound, redirect } from "next/navigation";
import {
  getCustomerAccessRequirements,
  getCustomerMfaAssurance,
  requireVerifiedCustomerSession,
  resolveCustomerAccountTenantContext
} from "../../../lib/server/customer-session";
import { PostgresTenantQueryClient } from "../../../lib/server/tenant-query-client";
import { CustomerSessionActions } from "../CustomerSessionActions";
import { changeCustomerPasswordAction, updateCustomerProfileAction } from "./actions";
import { CustomerMfaSettings } from "./CustomerMfaSettings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const profileMessages: Record<string, string> = {
  missing: "Complete every required profile field.",
  invalid_recovery_email: "Enter a valid recovery email.",
  invalid_mobile: "Enter a valid mobile number.",
  updated: "Profile saved."
};

const passwordMessages: Record<string, string> = {
  required: "Set your password before continuing.",
  too_short: "Use at least 8 characters.",
  mismatch: "The new passwords do not match.",
  failed: "Password update failed.",
  updated: "Password updated."
};

const mfaMessages: Record<string, string> = {
  required: "Set up authenticator MFA before continuing."
};

export default async function CustomerAccountPage({
  params,
  searchParams
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ mfa?: string; profile?: string; password?: string; setup?: string }>;
}) {
  const { locale: rawLocale } = await params;

  if (!isLocale(rawLocale)) {
    notFound();
  }

  const locale = rawLocale as Locale;
  const session = await requireVerifiedCustomerSession().catch(() => null);

  if (!session) {
    redirect("/login");
  }

  const client = new PostgresTenantQueryClient(session.userId);
  const tenantContext = await resolveCustomerAccountTenantContext(client, session);
  const requirements = await getCustomerAccessRequirements(client, tenantContext);
  const messages = await searchParams;
  const isPasswordSetup = messages.setup === "password";
  const isMfaSetup = messages.mfa === "required";

  if (!isPasswordSetup && !isMfaSetup && requirements.requireMfa && requirements.mfaEnrolled) {
    const mfaAssurance = await getCustomerMfaAssurance();

    if (mfaAssurance.requiresChallenge) {
      redirect(`/${locale}/mfa?next=${encodeURIComponent(`/${locale}/account`)}`);
    }
  }

  const showPasswordSetupFirst =
    isPasswordSetup || requirements.requirePasswordChange || messages.password === "required";
  const passwordPanel = (
    <section className="tex-form-panel" aria-label="Password">
      <h2>{showPasswordSetupFirst ? "Set your password" : "Password"}</h2>
      {messages.password ? <p className="tex-notice">{passwordMessages[messages.password] ?? "Password update failed."}</p> : null}
      <form action={changeCustomerPasswordAction} className="customer-account-form">
        <input type="hidden" name="locale" value={locale} />
        <label>
          New password
          <input name="newPassword" type="password" minLength={8} autoComplete="new-password" required />
        </label>
        <label>
          Confirm new password
          <input name="confirmPassword" type="password" minLength={8} autoComplete="new-password" required />
        </label>
        <button type="submit" className="tex-primary-button">
          {showPasswordSetupFirst ? "Set password" : "Update password"}
        </button>
      </form>
    </section>
  );
  const profilePanel = (
    <section className="tex-form-panel" aria-label="Profile">
      <h2>Profile</h2>
      {messages.profile ? <p className="tex-notice">{profileMessages[messages.profile] ?? "Profile update failed."}</p> : null}
      <form action={updateCustomerProfileAction} className="customer-account-form">
        <input type="hidden" name="locale" value={locale} />
        <label>
          First name
          <input name="firstName" defaultValue={requirements.firstName} required />
        </label>
        <label>
          Last name
          <input name="lastName" defaultValue={requirements.lastName} required />
        </label>
        <label>
          Display name
          <input name="displayName" defaultValue={requirements.displayName} required />
        </label>
        <label>
          Mobile number
          <input name="mobileNumber" defaultValue={requirements.mobileNumber} required />
        </label>
        <label>
          Recovery email
          <input name="recoveryEmail" type="email" defaultValue={requirements.recoveryEmail} required />
        </label>
        <button type="submit" className="tex-primary-button">
          Save profile
        </button>
      </form>
    </section>
  );

  return (
    <main className="customer-shell" lang={locale} dir={dirForLocale(locale)}>
      <aside className="customer-sidebar" aria-label="Customer Portal sections">
        <a className="customer-brand" href={`/${locale}`} aria-label="Torrevie">
          <img src="/logo/torrevie_logo_color.png" alt="" width="36" height="36" />
          <span>Torrevie</span>
        </a>
        <nav>
          <a href={`/${locale}/tex`}>TEX</a>
          <a href={`/${locale}/account`} aria-current="page">
            Account
          </a>
        </nav>
        <CustomerSessionActions locale={locale} />
      </aside>
      <section className="customer-main">
        <header className="customer-topbar">
          <div>
            <p className="eyebrow">Customer Portal</p>
            <h1>Account setup</h1>
            <p>Complete required account information, password updates, and optional authenticator MFA.</p>
          </div>
          <div className="customer-context" aria-label="Account requirements">
            <span>{requirements.requireProfileCompletion && !requirements.profileComplete ? "Profile required" : "Profile ok"}</span>
            <span>{requirements.requirePasswordChange ? "Password change required" : "Password ok"}</span>
            <span>{requirements.requireMfa ? "MFA required" : "MFA optional"}</span>
          </div>
        </header>

        <section className="customer-account-grid">
          {showPasswordSetupFirst ? passwordPanel : profilePanel}
          {showPasswordSetupFirst ? profilePanel : passwordPanel}

          <section className="tex-form-panel" aria-label="MFA">
            <h2>Authenticator MFA</h2>
            {messages.mfa ? <p className="tex-notice">{mfaMessages[messages.mfa] ?? "Authenticator MFA is required."}</p> : null}
            <p>Optional unless your tenant admin requires it.</p>
            <CustomerMfaSettings />
          </section>
        </section>
      </section>
    </main>
  );
}
