"use client";

import { createBrowserClient } from "@supabase/ssr";
import { requireSupabaseBrowserEnv } from "@torrevie/auth";
import { useEffect, useState } from "react";

type TotpFactor = {
  id: string;
  friendly_name?: string;
  status?: string;
};

export function MfaChallenge() {
  const [factors, setFactors] = useState<TotpFactor[]>([]);
  const [factorId, setFactorId] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const supabase = createBrowserClient(requireSupabaseBrowserEnv().url, requireSupabaseBrowserEnv().anonKey);

  useEffect(() => {
    void loadFactors();
  }, []);

  async function loadFactors() {
    const { data, error } = await supabase.auth.mfa.listFactors();

    if (error) {
      setMessage("Unable to load MFA factors.");
      return;
    }

    const verified = (data.totp ?? []).filter((factor) => factor.status === "verified");
    setFactors(verified);
    setFactorId(verified[0]?.id ?? "");
  }

  async function verifyMfa() {
    if (!factorId || !code.trim()) {
      return;
    }

    setBusy(true);
    setMessage("");

    const challenge = await supabase.auth.mfa.challenge({ factorId });

    if (challenge.error) {
      setBusy(false);
      setMessage("Unable to create MFA challenge.");
      return;
    }

    const verified = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.data.id,
      code: code.trim()
    });

    if (verified.error) {
      setBusy(false);
      setMessage("The authenticator code was not accepted.");
      return;
    }

    window.location.href = "/";
  }

  return (
    <section className="login-panel" aria-label="MFA verification">
      <p className="login-brand">Torrevie</p>
      <h1>Authenticator code</h1>
      {message ? <p className="error">{message}</p> : null}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void verifyMfa();
        }}
      >
        <label>
          Authenticator app
          <select value={factorId} onChange={(event) => setFactorId(event.target.value)} required>
            {factors.map((factor) => (
              <option key={factor.id} value={factor.id}>
                {factor.friendly_name ?? "Authenticator app"}
              </option>
            ))}
          </select>
        </label>
        <label>
          Code
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            required
          />
        </label>
        <button type="submit" disabled={busy || !factorId || code.trim().length < 6}>
          Verify
        </button>
      </form>
    </section>
  );
}
