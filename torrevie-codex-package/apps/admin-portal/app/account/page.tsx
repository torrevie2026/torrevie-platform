import { redirect } from "next/navigation";
import { AdminSidebar } from "../components/AdminSidebar";
import { getPlatformSession } from "../../lib/session";
import {
  changePasswordAction,
  setInitialPasswordAction,
  signOutAction,
  updateProfileAction,
  updateTimezoneAction
} from "./actions";
import { MfaSettings } from "./MfaSettings";

export const dynamic = "force-dynamic";

const timezones = [
  "Asia/Dubai",
  "Asia/Riyadh",
  "Asia/Qatar",
  "Asia/Kuwait",
  "Asia/Bahrain",
  "Europe/London",
  "Europe/Madrid",
  "UTC"
];

const passwordMessages: Record<string, string> = {
  updated: "Password updated.",
  too_short: "Use at least 8 characters.",
  mismatch: "The new passwords do not match.",
  invalid_current: "Current password is incorrect.",
  missing_email: "The signed-in account is missing an email address.",
  setup_expired: "Open the latest invitation email to set your first password.",
  setup_updated: "Password set. Use it for your next sign-in.",
  failed: "Password update failed. Try again."
};

const timezoneMessages: Record<string, string> = {
  updated: "Timezone saved.",
  invalid: "Choose a valid timezone.",
  failed: "Timezone update failed. Try again."
};

const profileMessages: Record<string, string> = {
  required: "Complete your profile before continuing.",
  updated: "Profile saved.",
  missing: "Complete every profile field.",
  invalid_recovery_email: "Enter a valid recovery email.",
  invalid_mobile: "Enter a valid mobile number.",
  failed: "Profile update failed. Try again."
};

export default async function AccountPage({
  searchParams
}: {
  searchParams: Promise<{ password?: string; profile?: string; setup?: string; timezone?: string }>;
}) {
  const session = await getPlatformSession();

  if (!session) {
    redirect("/login");
  }

  const params = await searchParams;
  const timezoneOptions = timezones.includes(session.timezone) ? timezones : [session.timezone, ...timezones];
  const showPasswordSetup = params.setup === "password";

  return (
    <main className="admin-shell">
      <AdminSidebar activeHref="/account" session={session} />
      <section className="admin-main">
        <header className="topbar">
          <div>
            <p className="eyebrow">Control Plane</p>
            <h1>Account</h1>
          </div>
          <span className="status">User settings</span>
        </header>

        <section className="panel account-summary" aria-label="Signed in account">
          <div>
            <span>Email</span>
            <strong>{session.email}</strong>
          </div>
          <div>
            <span>Name</span>
            <strong>{profileName(session.profile.firstName, session.profile.lastName)}</strong>
          </div>
          <div>
            <span>User ID</span>
            <strong>{session.userId}</strong>
          </div>
          <div>
            <span>Timezone</span>
            <strong>{session.timezone}</strong>
          </div>
        </section>

        {showPasswordSetup ? (
          <section className="panel" aria-label="First login password setup">
            <h2>Set your password</h2>
            <p className="empty">Create the password you will use for future Admin Portal sign-ins.</p>
            {params.password ? (
              <p className="notice">{passwordMessages[params.password] ?? passwordMessages.failed}</p>
            ) : null}
            <form action={setInitialPasswordAction} className="account-form">
              <label>
                New password
                <input name="newPassword" type="password" autoComplete="new-password" required minLength={8} />
              </label>
              <label>
                Confirm new password
                <input name="confirmPassword" type="password" autoComplete="new-password" required minLength={8} />
              </label>
              <button type="submit">Set password</button>
            </form>
          </section>
        ) : null}

        <section className="panel" aria-label="Profile settings">
          <h2>Profile</h2>
          {params.profile ? <p className="notice">{profileMessages[params.profile] ?? profileMessages.failed}</p> : null}
          <form action={updateProfileAction} className="profile-form">
            <label>
              First name
              <input name="firstName" defaultValue={session.profile.firstName} autoComplete="given-name" required />
            </label>
            <label>
              Last name
              <input name="lastName" defaultValue={session.profile.lastName} autoComplete="family-name" required />
            </label>
            <label>
              Position
              <input name="position" defaultValue={session.profile.position} autoComplete="organization-title" required />
            </label>
            <label>
              Mobile number
              <input name="mobileNumber" defaultValue={session.profile.mobileNumber} autoComplete="tel" required />
            </label>
            <label>
              Recovery email
              <input
                name="recoveryEmail"
                type="email"
                defaultValue={session.profile.recoveryEmail}
                autoComplete="email"
                required
              />
            </label>
            <button type="submit">Save profile</button>
          </form>
        </section>

        <section className="panel" aria-label="Timezone settings">
          <h2>Timezone</h2>
          {params.timezone ? <p className="notice">{timezoneMessages[params.timezone] ?? timezoneMessages.failed}</p> : null}
          <form action={updateTimezoneAction} className="account-form">
            <label>
              Timezone
              <select name="timezone" defaultValue={session.timezone}>
                {timezoneOptions.map((timezone) => (
                  <option key={timezone} value={timezone}>
                    {timezone}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit">Save timezone</button>
          </form>
        </section>

        <section className="panel" aria-label="Password settings">
          <h2>Change password</h2>
          {params.password ? <p className="notice">{passwordMessages[params.password] ?? passwordMessages.failed}</p> : null}
          <form action={changePasswordAction} className="account-form">
            <label>
              Current password
              <input name="currentPassword" type="password" autoComplete="current-password" required />
            </label>
            <label>
              New password
              <input name="newPassword" type="password" autoComplete="new-password" required minLength={8} />
            </label>
            <label>
              Confirm new password
              <input name="confirmPassword" type="password" autoComplete="new-password" required minLength={8} />
            </label>
            <button type="submit">Update password</button>
          </form>
        </section>

        <section className="panel" aria-label="MFA settings">
          <h2>Authenticator MFA</h2>
          <p className="empty">
            Optional. Scan the setup QR code with Microsoft Authenticator or another TOTP authenticator app.
          </p>
          <MfaSettings />
        </section>

        <section className="panel" aria-label="Sign out">
          <h2>Session</h2>
          <form action={signOutAction} className="signout-form">
            <button type="submit">Sign out</button>
          </form>
        </section>
      </section>
    </main>
  );
}

function profileName(firstName: string, lastName: string) {
  const name = `${firstName} ${lastName}`.trim();

  return name || "Not set";
}
