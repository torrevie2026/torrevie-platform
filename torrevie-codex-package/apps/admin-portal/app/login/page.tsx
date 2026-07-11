import { signIn } from "./actions";

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="login-shell">
      <section className="login-panel" aria-label="Admin sign in">
        <p className="brand">Torrevie</p>
        <h1>Admin sign in</h1>
        {params.error ? <p className="error">Sign in failed. Check the account and try again.</p> : null}
        <form action={signIn}>
          <label>
            Email
            <input name="email" type="email" autoComplete="email" required />
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
