import Link from "next/link";
import { acceptPlatformInviteAction } from "./actions";

export const dynamic = "force-dynamic";

const errorMessages: Record<string, string> = {
  expired: "This invitation link is invalid or has expired. Ask a Torrevie admin to send a new invitation.",
  missing: "Open the invitation link from your email."
};

export default async function AcceptInvitePage({
  searchParams
}: {
  searchParams: Promise<{ error?: string; token?: string }>;
}) {
  const params = await searchParams;
  const token = params.token?.trim() ?? "";

  return (
    <main className="login-page">
      <section className="login-card" aria-label="Accept Admin Portal invitation">
        <p className="brand">Torrevie</p>
        <h1>Accept invitation</h1>
        {params.error ? <p className="error">{errorMessages[params.error] ?? errorMessages.expired}</p> : null}
        <p className="empty">Continue to create your secure Admin Portal session and set your password.</p>
        {token ? (
          <form action={acceptPlatformInviteAction} className="login-form">
            <input type="hidden" name="token" value={token} />
            <button type="submit">Continue</button>
          </form>
        ) : (
          <Link href="/login">Back to sign in</Link>
        )}
      </section>
    </main>
  );
}
