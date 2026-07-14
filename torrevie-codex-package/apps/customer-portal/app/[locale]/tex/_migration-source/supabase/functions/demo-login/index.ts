// Returns a magic-link token hash for the demo CEO so the browser can establish
// a session without exposing the demo password. Public endpoint, no auth required.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEMO_EMAIL = "demo.ceo@tex-demo.com";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, key);

    const { data, error } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: DEMO_EMAIL,
    });
    if (error || !data?.properties?.hashed_token) {
      return new Response(JSON.stringify({ error: error?.message ?? "Failed to generate demo link" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(
      JSON.stringify({ token_hash: data.properties.hashed_token, email: DEMO_EMAIL }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
