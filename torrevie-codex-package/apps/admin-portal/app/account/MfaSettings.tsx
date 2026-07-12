"use client";

import { createBrowserClient } from "@supabase/ssr";
import { requireSupabaseBrowserEnv } from "@torrevie/auth";
import { useEffect, useState } from "react";
import { updateMfaEnrollmentAction } from "./actions";

type TotpFactor = {
  id: string;
  friendly_name?: string;
  status?: string;
};

type EnrolledFactor = {
  id: string;
  qrCode: string;
  secret: string;
};

export function MfaSettings() {
  const [verifiedFactors, setVerifiedFactors] = useState<TotpFactor[]>([]);
  const [enrolledFactor, setEnrolledFactor] = useState<EnrolledFactor | null>(null);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const supabase = createBrowserClient(requireSupabaseBrowserEnv().url, requireSupabaseBrowserEnv().anonKey);

  useEffect(() => {
    void refreshFactors();
  }, []);

  async function refreshFactors() {
    const { data, error } = await supabase.auth.mfa.listFactors();

    if (error) {
      setMessage("Unable to load MFA factors.");
      return;
    }

    setVerifiedFactors((data.totp ?? []).filter((factor) => factor.status === "verified"));
  }

  async function startEnrollment() {
    setBusy(true);
    setMessage("");

    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "Microsoft Authenticator"
    });

    setBusy(false);

    if (error) {
      setMessage("Unable to start MFA setup.");
      return;
    }

    setEnrolledFactor({
      id: data.id,
      qrCode: data.totp.qr_code,
      secret: data.totp.secret
    });
  }

  async function verifyEnrollment() {
    if (!enrolledFactor || !code.trim()) {
      return;
    }

    setBusy(true);
    setMessage("");

    const challenge = await supabase.auth.mfa.challenge({ factorId: enrolledFactor.id });

    if (challenge.error) {
      setBusy(false);
      setMessage("Unable to create MFA challenge.");
      return;
    }

    const verified = await supabase.auth.mfa.verify({
      factorId: enrolledFactor.id,
      challengeId: challenge.data.id,
      code: code.trim()
    });

    if (verified.error) {
      setBusy(false);
      setMessage("The authenticator code was not accepted.");
      return;
    }

    await updateMfaEnrollmentAction(true);
    setBusy(false);
    setCode("");
    setEnrolledFactor(null);
    setMessage("MFA is enabled.");
    await refreshFactors();
  }

  async function disableMfa(factorId: string) {
    setBusy(true);
    setMessage("");

    const { error } = await supabase.auth.mfa.unenroll({ factorId });

    if (error) {
      setBusy(false);
      setMessage("Unable to disable MFA.");
      return;
    }

    await updateMfaEnrollmentAction(false);
    setBusy(false);
    setMessage("MFA is disabled.");
    await refreshFactors();
  }

  return (
    <div className="mfa-settings">
      {message ? <p className="notice">{message}</p> : null}
      {verifiedFactors.length > 0 ? (
        <div className="mfa-factor-list">
          {verifiedFactors.map((factor) => (
            <article key={factor.id}>
              <div>
                <strong>{factor.friendly_name ?? "Authenticator app"}</strong>
                <span>Verified</span>
              </div>
              <button type="button" onClick={() => void disableMfa(factor.id)} disabled={busy}>
                Disable MFA
              </button>
            </article>
          ))}
        </div>
      ) : null}

      {!enrolledFactor && verifiedFactors.length === 0 ? (
        <button type="button" onClick={() => void startEnrollment()} disabled={busy}>
          Enable authenticator MFA
        </button>
      ) : null}

      {enrolledFactor ? (
        <div className="mfa-enrollment">
          <img src={enrolledFactor.qrCode} alt="Authenticator MFA QR code" />
          <p>Scan this QR code in Microsoft Authenticator, then enter the 6-digit code.</p>
          <code>{enrolledFactor.secret}</code>
          <label>
            Authenticator code
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
          </label>
          <button type="button" onClick={() => void verifyEnrollment()} disabled={busy || code.trim().length < 6}>
            Verify and enable MFA
          </button>
        </div>
      ) : null}
    </div>
  );
}
