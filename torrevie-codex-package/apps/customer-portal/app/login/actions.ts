"use server";

import { createServerClient } from "@supabase/ssr";
import { requireSupabaseBrowserEnv } from "@torrevie/auth";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  assertTexStagingDemoAccessAllowed,
  ensureTexStagingDemoAccess,
  isTexStagingDemoCredential
} from "../../lib/server/tex-staging-demo-access";

export async function signIn(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const cookieStore = await cookies();
  const { url, anonKey } = requireSupabaseBrowserEnv();
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        for (const cookieToSet of cookiesToSet) {
          cookieStore.set(cookieToSet.name, cookieToSet.value, cookieToSet.options);
        }
      }
    }
  });

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error && isTexStagingDemoCredential(email, password)) {
    try {
      const headerStore = await headers();
      assertTexStagingDemoAccessAllowed(headerStore.get("host"));
      await ensureTexStagingDemoAccess();
      const retry = await supabase.auth.signInWithPassword({ email, password });

      if (!retry.error) {
        redirect("/en/tex");
      }
    } catch (caught) {
      console.error("TEX staging demo login setup failed.", {
        message: caught instanceof Error ? caught.message : "Unknown setup error"
      });
    }
  }

  if (error) {
    redirect("/login?error=invalid_credentials");
  }

  redirect("/en");
}
