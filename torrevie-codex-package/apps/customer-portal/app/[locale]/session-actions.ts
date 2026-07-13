"use server";

import { createServerClient } from "@supabase/ssr";
import { requireSupabaseBrowserEnv } from "@torrevie/auth";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export async function signOutCustomerAction() {
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

  await supabase.auth.signOut();
  redirect("/login");
}
