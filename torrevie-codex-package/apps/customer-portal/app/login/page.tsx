import { signIn } from "./actions";

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="login-shell">
      <section className="login-panel" aria-labelledby="login-title">
        <p className="brand">Torrevie</p>
        <h1 id="login-title">Sign in</h1>
        {params.error ? <p className="error">Email or password is incorrect.</p> : null}
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
