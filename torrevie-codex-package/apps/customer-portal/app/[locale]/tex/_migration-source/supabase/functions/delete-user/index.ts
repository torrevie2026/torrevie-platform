import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: claimsData, error: claimsErr } = await adminClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const callerId = claimsData.claims.sub as string;

    // Check super_admin using service role (bypasses RLS)
    const { data: callerProfile } = await adminClient
      .from("profiles")
      .select("super_admin")
      .eq("id", callerId)
      .single();

    if (!callerProfile?.super_admin) {
      return new Response(JSON.stringify({ error: "Forbidden: super admin only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { user_id } = await req.json();

    if (!user_id) {
      return new Response(JSON.stringify({ error: "user_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (user_id === callerId) {
      return new Response(JSON.stringify({ error: "You cannot delete your own account" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Nullify references BEFORE deleting auth user (profile cascade-deletes with auth user)
    const cleanupResults = await Promise.all([
      adminClient.from("audit_log").update({ user_id: null }).eq("user_id", user_id),
      adminClient.from("expenses").update({ approved_by: null }).eq("approved_by", user_id),
      adminClient.from("expenses").update({ rejected_by: null }).eq("rejected_by", user_id),
      adminClient.from("expenses").update({ finance_reviewed_by: null }).eq("finance_reviewed_by", user_id),
      adminClient.from("expenses").update({ paid_by: null }).eq("paid_by", user_id),
      adminClient.from("notifications").update({ user_id: null }).eq("user_id", user_id),
      adminClient.from("trips").update({ created_by: null }).eq("created_by", user_id),
      adminClient.from("profiles").update({ manager_id: null }).eq("manager_id", user_id),
      adminClient.from("employees").update({ manager_profile_id: null }).eq("manager_profile_id", user_id),
    ]);

    const cleanupError = cleanupResults.find((result) => result.error)?.error;
    if (cleanupError) {
      return new Response(JSON.stringify({ error: cleanupError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: deleteAuthError } = await adminClient.auth.admin.deleteUser(user_id);
    if (deleteAuthError && !deleteAuthError.message.toLowerCase().includes("not found")) {
      return new Response(JSON.stringify({ error: deleteAuthError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Profile is cascade-deleted with auth user; ensure it's gone if auth user was already missing
    await adminClient.from("profiles").delete().eq("id", user_id);


    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
