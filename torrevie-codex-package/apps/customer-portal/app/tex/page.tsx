import { startTexTrial } from "./actions";

export const runtime = "nodejs";

export default async function TexTrialPage({
  searchParams
}: {
  searchParams: Promise<{
    adminName?: string;
    companyName?: string;
    country?: string;
    email?: string;
    error?: string;
    phone?: string;
  }>;
}) {
  const params = await searchParams;

  return (
    <main className="tex-trial-shell">
      <section className="tex-trial-hero" aria-labelledby="tex-trial-title">
        <a className="tex-trial-brand" href="/login" aria-label="Torrevie">
          <img src="/logo/torrevie_logo_color.png" alt="" width="46" height="46" />
          <span>
            <strong>Torrevie TEX</strong>
            <small>Travel and expense operations</small>
          </span>
        </a>
        <div className="tex-trial-copy">
          <p className="eyebrow">15-day Starter trial</p>
          <h1 id="tex-trial-title">TEX Starter Trial</h1>
          <p>
            Run transport expenses, trips, receipts, finance review, and WhatsApp receipt intake from
            a dedicated tenant workspace on the Torrevie SaaS platform.
          </p>
        </div>
        <div className="tex-trial-points" aria-label="Trial includes">
          <span>Starter package</span>
          <span>Quick Connect ready</span>
          <span>Tenant-isolated data</span>
          <span>No tex1 dependency</span>
        </div>
      </section>

      <section className="tex-trial-panel" aria-labelledby="tex-trial-form-title">
        <div>
          <p className="eyebrow">Start now</p>
          <h2 id="tex-trial-form-title">Create your TEX trial</h2>
          <p>Your admin account and company workspace will be created immediately.</p>
        </div>
        {params.error ? <p className="error">{trialErrorMessage(params.error)}</p> : null}
        <form action={startTexTrial} className="tex-trial-form">
          <label>
            Company name
            <input
              name="companyName"
              type="text"
              autoComplete="organization"
              defaultValue={params.companyName ?? ""}
              minLength={2}
              maxLength={120}
              required
            />
          </label>
          <label>
            Admin full name
            <input
              name="adminName"
              type="text"
              autoComplete="name"
              defaultValue={params.adminName ?? ""}
              minLength={2}
              maxLength={120}
              required
            />
          </label>
          <label>
            Work email
            <input name="email" type="email" autoComplete="email" defaultValue={params.email ?? ""} required />
          </label>
          <label>
            WhatsApp / mobile number
            <input
              name="phone"
              type="tel"
              autoComplete="tel"
              defaultValue={params.phone ?? ""}
              placeholder="+971..."
              minLength={7}
              maxLength={32}
              required
            />
          </label>
          <label>
            Country
            <select name="country" defaultValue={params.country ?? "AE"} required>
              <option value="AE">United Arab Emirates</option>
              <option value="SA">Saudi Arabia</option>
              <option value="QA">Qatar</option>
              <option value="BH">Bahrain</option>
              <option value="KW">Kuwait</option>
              <option value="OM">Oman</option>
            </select>
          </label>
          <label>
            Password
            <input name="password" type="password" autoComplete="new-password" minLength={8} required />
          </label>
          <label className="tex-trial-checkbox">
            <input name="terms" type="checkbox" value="accepted" required />
            <span>I confirm I am authorized to create this company trial.</span>
          </label>
          <button type="submit">Start 15-day trial</button>
        </form>
        <p className="tex-trial-login-link">
          Already have access? <a href="/login">Sign in</a>
        </p>
      </section>
    </main>
  );
}

function trialErrorMessage(error: string) {
  if (error === "existing_email") {
    return "This email is already registered. Please sign in or use another work email.";
  }

  if (error === "trial_terms_required") {
    return "Please confirm you are authorized to create this company trial.";
  }

  if (error === "trial_company_invalid") {
    return "Please enter a company name between 2 and 120 characters.";
  }

  if (error === "trial_admin_invalid") {
    return "Please enter the admin full name between 2 and 120 characters.";
  }

  if (error === "trial_email_invalid") {
    return "Please enter a valid work email address.";
  }

  if (error === "trial_phone_invalid") {
    return "Please enter a valid WhatsApp or mobile number between 7 and 32 characters.";
  }

  if (error === "trial_country_invalid") {
    return "Please select one of the supported GCC countries.";
  }

  if (error === "trial_password_invalid") {
    return "Please use a password with at least 8 characters.";
  }

  if (error === "trial_auth_failed") {
    return "We could not create the login account. Please try again or use another email.";
  }

  if (error === "trial_seed_failed") {
    return "The login account could not be connected to a TEX tenant. Please try again.";
  }

  return "We could not create the trial right now. Please try again.";
}
