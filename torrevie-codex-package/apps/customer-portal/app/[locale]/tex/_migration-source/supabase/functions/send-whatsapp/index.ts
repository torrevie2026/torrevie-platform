import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Require authentication — accept service role key (internal callers) or a valid user JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const isServiceRole = token === serviceKey;
    let callerCompanyId: string | null = null;
    if (!isServiceRole) {
      const authClient = createClient(supabaseUrl, serviceKey);
      const { data: claimsData, error: claimsErr } = await authClient.auth.getClaims(token);
      if (claimsErr || !claimsData?.claims?.sub) {
        return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: prof } = await authClient
        .from("profiles")
        .select("company_id")
        .eq("id", claimsData.claims.sub)
        .maybeSingle();
      callerCompanyId = prof?.company_id ?? null;
      if (!callerCompanyId) {
        return new Response(JSON.stringify({ success: false, error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const { to, message, instance_id: bodyInstanceId, company_id: bodyCompanyId } = await req.json();

    if (!to || !message) {
      return new Response(
        JSON.stringify({ success: false, error: "to and message are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Basic E.164-ish format check
    const normalizedTo = String(to).replace(/[^\d]/g, "");
    if (normalizedTo.length < 8 || normalizedTo.length > 15) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid recipient number" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // For user-initiated calls, restrict 'to' to a phone number belonging to
    // an employee or profile in the caller's company.
    if (!isServiceRole && callerCompanyId) {
      const adminClient = createClient(supabaseUrl, serviceKey);
      const { data: emps } = await adminClient
        .from("employees")
        .select("id, phone_number")
        .eq("company_id", callerCompanyId);
      const { data: profs } = await adminClient
        .from("profiles")
        .select("id, phone_number")
        .eq("company_id", callerCompanyId);
      const digits = (s: any) => String(s ?? "").replace(/\D/g, "");
      const target = digits(to);
      const match = [...(emps || []), ...(profs || [])].some(
        (r: any) => digits(r.phone_number) === target,
      );
      if (!match) {
        console.warn(`send-whatsapp: skipped recipient ${target} not in company ${callerCompanyId}`);
        return new Response(
          JSON.stringify({
            success: false,
            skipped: true,
            code: "recipient_not_in_company",
            error: "Recipient is not registered in your company",
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }


    // Resolve outbound provider + credentials: explicit instance > company mapping > env default.
    const resolveCompanyId = bodyCompanyId || (!isServiceRole ? callerCompanyId : null);
    let provider: "ultramsg" | "wappfly" = "ultramsg";
    let instanceId = "";
    let wappflyToken = "";

    if (bodyInstanceId) {
      instanceId = String(bodyInstanceId);
    } else if (resolveCompanyId) {
      const adminClient = createClient(supabaseUrl, serviceKey);
      const { data: comp } = await adminClient
        .from("companies")
        .select("whatsapp_provider, whatsapp_instance_id, wappfly_api_token")
        .eq("id", resolveCompanyId)
        .maybeSingle();
      if (comp) {
        if ((comp as any).whatsapp_provider === "wappfly") {
          provider = "wappfly";
          wappflyToken = (comp as any).wappfly_api_token || "";
        } else if ((comp as any).whatsapp_instance_id) {
          instanceId = (comp as any).whatsapp_instance_id;
        }
      }
    }

    const logFailure = async (errMsg: string) => {
      try {
        const sb = createClient(supabaseUrl, serviceKey);
        await sb.from("audit_log").insert({
          action: "system",
          table_name: "whatsapp",
          new_values: { status: "send_failed", provider, to, error: errMsg } as any,
        });
      } catch (_) { /* swallow */ }
    };

    // ---- Wappfly branch ----
    if (provider === "wappfly") {
      if (!wappflyToken) {
        await logFailure("Wappfly token not configured");
        return new Response(
          JSON.stringify({ success: false, error: "Wappfly not configured" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const jid = `${normalizedTo}@s.whatsapp.net`;
      const res = await fetch("https://wappfly.com/api/messages/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Token": wappflyToken },
        body: JSON.stringify({ to: jid, text: message }),
      });
      const result = await res.json().catch(() => ({} as any));
      if (!res.ok || result.error) {
        const errMsg = result.error || `HTTP ${res.status}`;
        await logFailure(errMsg);
        return new Response(
          JSON.stringify({ success: false, error: errMsg }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ success: true, id: result.msg_id, provider: "wappfly" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ---- UltraMsg branch (default) ----
    if (!instanceId) instanceId = Deno.env.get("ULTRAMSG_INSTANCE_ID") || "";
    const ultramsgToken = Deno.env.get("ULTRAMSG_TOKEN");
    instanceId = instanceId.replace(/^instance/i, "");

    if (!instanceId || !ultramsgToken) {
      console.error("UltraMsg credentials not configured");
      return new Response(
        JSON.stringify({ success: false, error: "WhatsApp not configured" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = new URLSearchParams({ token: ultramsgToken, to, body: message });

    const res = await fetch(
      `https://api.ultramsg.com/instance${instanceId}/messages/chat`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      }
    );

    const result = await res.json();

    if (!res.ok || result.error) {
      console.error("UltraMsg send failed:", result);
      await logFailure(result.error || `HTTP ${res.status}`);
      return new Response(
        JSON.stringify({ success: false, error: result.error || "Send failed" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, id: result.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("send-whatsapp error:", e);
    return new Response(
      JSON.stringify({ success: false, error: e instanceof Error ? e.message : "Unknown error" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
