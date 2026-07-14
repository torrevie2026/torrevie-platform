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
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

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

    // Get caller's profile (role + company + super_admin)
    const { data: callerProfile } = await adminClient
      .from("profiles")
      .select("super_admin, role, company_id")
      .eq("id", callerId)
      .single();

    const isSuper = !!callerProfile?.super_admin;
    const isTenantAdmin = callerProfile?.role === "admin";

    if (!isSuper && !isTenantAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden: admin only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { email, full_name, role, reinvite, manager_id } = body;
    // Tenant admins are pinned to their own company; super-admins may target any company.
    const company_id = isSuper ? body.company_id : callerProfile?.company_id;

    if (!email || !company_id || !role) {
      return new Response(
        JSON.stringify({ error: "email, company_id, and role are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const ALLOWED_ROLES = ["employee", "manager", "coordinator", "finance", "admin"];
    if (!ALLOWED_ROLES.includes(role)) {
      return new Response(JSON.stringify({ error: `Invalid role: ${role}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (reinvite) {
      const recoverRes = await fetch(`${supabaseUrl}/auth/v1/recover`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": anonKey,
        },
        body: JSON.stringify({ email, redirect_to: "https://tex.torrevie.com/set-password" }),
      });

      if (!recoverRes.ok) {
        const recoverText = await recoverRes.text();
        return new Response(JSON.stringify({ error: recoverText || "Failed to send recovery email" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({ success: true, message: "Recovery email sent" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Create user via admin API (sends invite email automatically)
    const { data: inviteData, error: inviteError } =
      await adminClient.auth.admin.inviteUserByEmail(email, {
        data: { full_name: full_name || "" },
        redirectTo: "https://tex.torrevie.com/set-password",
      });

    if (inviteError) {
      const msg = inviteError.message || "";
      const alreadyExists = /already been registered|already registered|already exists/i.test(msg);
      if (alreadyExists) {
        // Look up existing user and update their profile to this company/role
        let existingUserId: string | null = null;
        let page = 1;
        while (page <= 20 && !existingUserId) {
          const { data: list, error: listErr } = await adminClient.auth.admin.listUsers({ page, perPage: 200 });
          if (listErr) break;
          const found = list.users.find((u) => (u.email || "").toLowerCase() === email.toLowerCase());
          if (found) existingUserId = found.id;
          if (!list.users.length || list.users.length < 200) break;
          page++;
        }

        if (existingUserId) {
          const profileUpdate: Record<string, unknown> = { company_id, role };
          if (full_name) profileUpdate.full_name = full_name;
          if (manager_id) profileUpdate.manager_id = manager_id;
          await adminClient.from("profiles").update(profileUpdate).eq("id", existingUserId);
        }

        // Send password recovery so they can (re)set a password and access the tenant
        await fetch(`${supabaseUrl}/auth/v1/recover`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: anonKey },
          body: JSON.stringify({ email, redirect_to: "https://tex.torrevie.com/set-password" }),
        });

        return new Response(
          JSON.stringify({
            success: true,
            existed: true,
            user_id: existingUserId,
            message: "User already existed; profile updated and recovery email sent.",
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      return new Response(JSON.stringify({ error: msg }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const newUserId = inviteData.user.id;

    // Update the auto-created profile with company and role
    const profileUpdate: Record<string, unknown> = {
      company_id,
      role,
      full_name: full_name || "",
    };
    if (manager_id) {
      profileUpdate.manager_id = manager_id;
    }

    const { error: profileError } = await adminClient
      .from("profiles")
      .update(profileUpdate)
      .eq("id", newUserId);

    if (profileError) {
      return new Response(
        JSON.stringify({ error: `Profile update failed: ${profileError.message}` }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        user_id: newUserId,
        email: inviteData.user.email,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
