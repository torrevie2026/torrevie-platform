"use client";

import { createBrowserClient } from "@supabase/ssr";
import { requireSupabaseBrowserEnv } from "@torrevie/auth";
import { useEffect, useState } from "react";
import { updateCustomerMfaEnrollmentAction } from "./actions";

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

export function CustomerMfaSettings() {
  const [verifiedFactors, setVerifiedFactors] = useState<TotpFactor[]>([]);
  const [enrolledFactor, setEnrolledFactor] = useState<EnrolledFactor | null>(null);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const env = requireSupabaseBrowserEnv();
  const supabase = createBrowserClient(env.url, env.anonKey);

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
      friendlyName: "Authenticator app"
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
    if (!enrolledFactor || code.trim().length < 6) {
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

    await updateCustomerMfaEnrollmentAction(true);
    setBusy(false);
    setCode("");
    setEnrolledFactor(null);
    setMessage("MFA is enabled.");
    await refreshFactors();
  }

  return (
    <div className="customer-account-stack">
      {message ? <p className="tex-notice">{message}</p> : null}
      {verifiedFactors.length > 0 ? (
        <div className="customer-mfa-list">
          {verifiedFactors.map((factor) => (
            <article key={factor.id}>
              <strong>{factor.friendly_name ?? "Authenticator app"}</strong>
              <span>Verified</span>
            </article>
          ))}
        </div>
      ) : null}
      {!enrolledFactor && verifiedFactors.length === 0 ? (
        <button type="button" className="tex-primary-button" onClick={() => void startEnrollment()} disabled={busy}>
          Enable authenticator MFA
        </button>
      ) : null}
      {enrolledFactor ? (
        <div className="customer-mfa-enrollment">
          <img src={enrolledFactor.qrCode} alt="Authenticator MFA QR code" />
          <p>Scan this QR code, then enter the 6-digit code.</p>
          <code>{enrolledFactor.secret}</code>
          <label>
            Authenticator code
            <input inputMode="numeric" value={code} onChange={(event) => setCode(event.target.value)} />
          </label>
          <button type="button" className="tex-primary-button" onClick={() => void verifyEnrollment()} disabled={busy || code.trim().length < 6}>
            Verify and enable MFA
          </button>
        </div>
      ) : null}
    </div>
  );
}
