"use client";

import { createBrowserClient } from "@supabase/ssr";
import { requireSupabaseBrowserEnv } from "@torrevie/auth";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type TotpFactor = {
  id: string;
  friendly_name?: string;
  status?: string;
};

export function CustomerMfaChallenge({ locale, nextPath }: { locale: string; nextPath: string }) {
  const router = useRouter();
  const env = requireSupabaseBrowserEnv();
  const supabase = createBrowserClient(env.url, env.anonKey);
  const [factor, setFactor] = useState<TotpFactor | null>(null);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void loadFactor();
  }, []);

  async function loadFactor() {
    const { data, error } = await supabase.auth.mfa.listFactors();

    if (error) {
      setMessage("Unable to load your MFA factor.");
      return;
    }

    const verifiedFactor = (data.totp ?? []).find((item) => item.status === "verified") ?? null;
    setFactor(verifiedFactor);

    if (!verifiedFactor) {
      setMessage("No verified authenticator factor is available. Open Account to enable MFA.");
    }
  }

  async function verifyCode() {
    if (!factor || code.trim().length < 6) {
      return;
    }

    setBusy(true);
    setMessage("");

    const challenge = await supabase.auth.mfa.challenge({ factorId: factor.id });

    if (challenge.error) {
      setBusy(false);
      setMessage("Unable to create MFA challenge.");
      return;
    }

    const verified = await supabase.auth.mfa.verify({
      factorId: factor.id,
      challengeId: challenge.data.id,
      code: code.trim()
    });

    if (verified.error) {
      setBusy(false);
      setMessage("The authenticator code was not accepted.");
      return;
    }

    setBusy(false);
    router.replace(nextPath);
    router.refresh();
  }

  return (
    <section className="login-panel customer-mfa-panel" aria-labelledby="mfa-title">
      <img src="/logo/torrevie_logo_color.png" alt="" width="48" height="48" />
      <p className="brand">Torrevie</p>
      <h1 id="mfa-title">Authenticator check</h1>
      <p className="login-slogan">Enter the 6-digit code from your authenticator app.</p>
      {message ? <p className="error">{message}</p> : null}
      {factor ? (
        <>
          <p className="tex-notice">{factor.friendly_name ?? "Authenticator app"}</p>
          <label>
            Authenticator code
            <input
              autoComplete="one-time-code"
              inputMode="numeric"
              maxLength={8}
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
          </label>
          <button type="button" onClick={() => void verifyCode()} disabled={busy || code.trim().length < 6}>
            Verify
          </button>
        </>
      ) : (
        <a className="tex-primary-button" href={`/${locale}/account?mfa=required`}>
          Open Account MFA setup
        </a>
      )}
    </section>
  );
}
