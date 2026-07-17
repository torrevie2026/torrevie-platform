import { signIn } from "./actions";

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ email?: string; error?: string; trial?: string }>;
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
      </section>
    </main>
  );
}
