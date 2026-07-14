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

    // Require authenticated caller to prevent abuse of paid AI API
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    // Allow trusted internal callers (e.g. ultramsg-webhook) using the service role key
    if (token !== serviceKey) {
      const authClient = createClient(supabaseUrl, serviceKey);
      const { data: claimsData, error: claimsErr } = await authClient.auth.getClaims(token);
      if (claimsErr || !claimsData?.claims?.sub) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }


    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY is not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { image_base64, media_type, country_code } = await req.json();

    if (!image_base64 || !media_type) {
      return new Response(
        JSON.stringify({ error: "image_base64 and media_type are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Look up tax labels from country_configs
    let taxIdLabel = "Tax ID";
    let taxName = "VAT";

    if (country_code) {
      const supabase = createClient(supabaseUrl, serviceKey);

      const { data: cc } = await supabase
        .from("country_configs")
        .select("tax_id_label, tax_name")
        .eq("country_code", country_code)
        .single();

      if (cc) {
        taxIdLabel = cc.tax_id_label || "Tax ID";
        taxName = cc.tax_name || "VAT";
      }
    }

    const todayIso = new Date().toISOString().slice(0, 10);
    const userPrompt = `Extract all expense data from this receipt image. Today is ${todayIso}.
Return ONLY a valid JSON object:

{
  "vendor": "merchant or company name as shown",
  "date": "YYYY-MM-DD",
  "amount": numeric_total_only,
  "currency": "3-letter ISO code",
  "category": "exactly one of: Meals, Transport, Accommodation, Entertainment, Fuel, Other",
  "payment_method": "exactly one of: Corporate Card, Personal Card, Cash, Bank Transfer",
  "notes": "one line description of purchase",
  "tax_id_number": "the ${taxIdLabel} if visible, otherwise null",
  "tax_amount": numeric_tax_amount_or_null,
  "confidence": integer_0_to_100
}

Date rules: Receipts are almost always dated within the last 90 days. The year is often faint or partially printed — NEVER guess a year. If the year on the receipt is not clearly legible, or if the only plausible reading would put the date more than a year in the past or in the future relative to today (${todayIso}), return null for "date". Do not default to a printed year if you are not confident.

Use null for any field not determinable.`;

    const dataUrl = `data:${media_type};base64,${image_base64}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "You are a receipt data extraction assistant. You extract structured expense data from receipt images with high accuracy. You always return valid JSON only — no markdown, no code blocks, no explanation.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: userPrompt },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(
        JSON.stringify({ error: "AI parsing failed", status: response.status, details: errorText }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = await response.json();
    const textContent = result.choices?.[0]?.message?.content;

    if (!textContent) {
      return new Response(
        JSON.stringify({ error: "No text response from AI", raw: result }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }


    // Parse the JSON from the response (handle possible markdown wrapping)
    let parsed;
    try {
      const cleaned = textContent.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      return new Response(
        JSON.stringify({ error: "Failed to parse AI response", raw: textContent }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Post-validate the date the model returned — receipts older than 365 days
    // or in the future are almost always OCR misreads of the year.
    const MAX_PAST_DAYS = 365;
    const MAX_FUTURE_DAYS = 1;
    let dateWarning: 'unreadable' | 'too_old' | 'future' | null = null;
    if (parsed && typeof parsed === 'object') {
      const raw = typeof parsed.date === 'string' ? parsed.date.trim() : '';
      if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        if (parsed.date != null) dateWarning = 'unreadable';
        parsed.date = null;
      } else {
        const d = new Date(`${raw}T00:00:00Z`);
        if (Number.isNaN(d.getTime())) {
          dateWarning = 'unreadable';
          parsed.date = null;
        } else {
          const now = new Date();
          const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
          const diffDays = Math.round((todayUtc.getTime() - d.getTime()) / 86_400_000);
          if (diffDays < -MAX_FUTURE_DAYS) { dateWarning = 'future'; parsed.date = null; }
          else if (diffDays > MAX_PAST_DAYS) { dateWarning = 'too_old'; parsed.date = null; }
        }
      }
      if (dateWarning) parsed.date_warning = dateWarning;
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("parse-receipt error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
