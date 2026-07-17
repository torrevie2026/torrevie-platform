"use server";

import { redirect } from "next/navigation";
import { createTexTrialTenant, type TexTrialInput } from "../../lib/server/tex-trial-onboarding";

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
    const code = error instanceof Error && error.message === "existing_email" ? "existing_email" : "invalid";
    const email = encodeURIComponent(input.email);
    redirect(`/tex?error=${code}&email=${email}`);
  }

  redirect(`/login?trial=created&email=${encodeURIComponent(input.email)}`);
}

function stringValue(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}
