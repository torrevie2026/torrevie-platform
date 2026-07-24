import { requestPasswordReset, signIn } from "./actions";

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ email?: string; error?: string; reset?: string; trial?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="login-shell">
      <section className="login-panel" aria-labelledby="login-title">
        <img src="/logo/torrevie_logo_color.png" alt="" width="48" height="48" />
        <p className="brand">Torrevie</p>
        <p className="login-slogan">Optimize. Execute. Scale.</p>
        <h1 id="login-title">Sign in</h1>
        {params.trial === "created" ? (
          <p className="success">Your TEX trial is ready. Sign in with the email and password you just created.</p>
        ) : null}
        {params.error ? <p className="error">Email or password is incorrect.</p> : null}
        {params.reset === "sent" ? (
          <p className="success">If this email exists, a secure password reset link has been sent.</p>
        ) : null}
        {params.reset === "invalid" ? <p className="error">Enter a valid email address to reset your password.</p> : null}
        {params.reset === "failed" ? (
          <p className="error">We could not send the reset email. Please try again.</p>
        ) : null}
        <form action={signIn}>
          <label>
            Email
            <input name="email" type="email" autoComplete="email" defaultValue={params.email ?? ""} required />
          </label>
          <label>
            Password
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          <button type="submit">Sign in</button>
        </form>
        <details className="login-reset-panel">
          <summary>Forgot password?</summary>
          <p>Enter your email and we will send a secure reset link.</p>
          <form action={requestPasswordReset}>
            <label>
              Email
              <input name="email" type="email" autoComplete="email" defaultValue={params.email ?? ""} required />
            </label>
            <button type="submit">Send reset link</button>
          </form>
        </details>
      </section>
    </main>
  );
}
