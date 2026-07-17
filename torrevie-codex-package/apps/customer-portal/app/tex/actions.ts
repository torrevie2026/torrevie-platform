"use server";

import { redirect } from "next/navigation";
import { createTexTrialTenant, type TexTrialInput } from "../../lib/server/tex-trial-onboarding";

const trialErrorCodes = new Set([
  "existing_email",
  "trial_terms_required",
  "trial_company_invalid",
  "trial_admin_invalid",
  "trial_email_invalid",
  "trial_phone_invalid",
  "trial_country_invalid",
  "trial_password_invalid",
  "trial_auth_failed",
  "trial_seed_failed"
]);

export async function startTexTrial(formData: FormData) {
  const input: TexTrialInput = {
    adminName: stringValue(formData, "adminName"),
    companyName: stringValue(formData, "companyName"),
    country: stringValue(formData, "country"),
    email: stringValue(formData, "email"),
    password: stringValue(formData, "password"),
    phone: stringValue(formData, "phone"),
    termsAccepted: formData.get("terms") === "accepted"
  };

  try {
    await createTexTrialTenant(input);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    const code = trialErrorCodes.has(message) ? message : "trial_seed_failed";
    console.error(
      JSON.stringify({
        event: "tex.trial.create_failed",
        code,
        emailDomain: input.email.includes("@") ? input.email.split("@").pop() : null,
        hasCompanyName: input.companyName.length > 0,
        hasAdminName: input.adminName.length > 0,
        hasPhone: input.phone.length > 0,
        country: input.country,
        termsAccepted: input.termsAccepted
      })
    );
    redirect(
      `/tex?error=${code}&email=${encodeURIComponent(input.email)}&companyName=${encodeURIComponent(input.companyName)}&adminName=${encodeURIComponent(input.adminName)}&phone=${encodeURIComponent(input.phone)}&country=${encodeURIComponent(input.country)}`
    );
  }

  redirect(`/login?trial=created&email=${encodeURIComponent(input.email)}`);
}

function stringValue(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}
