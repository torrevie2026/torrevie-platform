import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TARGET_CURRENCIES = [
  "EUR", "GBP", "EGP", "KES", "NGN", "ZAR", "MAD", "CHF",
  "SEK", "NOK", "DKK", "PLN", "CZK", "HUF", "TRY", "INR",
  "PKR", "CAD", "AUD", "JPY", "CNY",
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Restrict to service-role / cron callers only
  const authHeader = req.headers.get("Authorization") || "";
  const cronSecret = req.headers.get("x-cron-secret");
  const expectedCronSecret = Deno.env.get("CRON_SECRET");
  const isServiceRole = authHeader === `Bearer ${supabaseKey}`;
  const isCron = expectedCronSecret && cronSecret === expectedCronSecret;
  if (!isServiceRole && !isCron) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const today = new Date().toISOString().split("T")[0];
  let rateSource = "live";
  let successCount = 0;
  let skipCount = 0;
  const errorMessages: string[] = [];

  try {
    // Step 1: Get pegged currencies — these are never fetched externally
    const { data: pegs } = await supabase
      .from("currency_pegs")
      .select("from_currency, rate");
    const peggedCodes = new Set((pegs || []).map((p) => p.from_currency));

    // Filter out pegged currencies from fetch targets
    const currenciesToFetch = TARGET_CURRENCIES.filter((c) => !peggedCodes.has(c));

    // Step 2: Fetch rates from primary API
    const rates: Record<string, number> = {};
    const FX_API_KEY = Deno.env.get("FX_API_KEY");

    if (FX_API_KEY) {
      try {
        const res = await fetch(
          `https://v6.exchangerate-api.com/v6/${FX_API_KEY}/latest/USD`
        );
        if (res.ok) {
          const data = await res.json();
          if (data.result === "success" && data.conversion_rates) {
            for (const cur of currenciesToFetch) {
              if (data.conversion_rates[cur] != null) {
                rates[cur] = data.conversion_rates[cur];
              }
            }
          }
        } else {
          throw new Error(`Primary API returned ${res.status}`);
        }
      } catch (e) {
        console.error("Primary FX API failed:", e);
        // Step 6: Fallback
        rateSource = "fallback";
        try {
          const fallbackRes = await fetch(
            "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json"
          );
          if (fallbackRes.ok) {
            const fallbackData = await fallbackRes.json();
            const usdRates = fallbackData.usd;
            if (usdRates) {
              for (const cur of currenciesToFetch) {
                const key = cur.toLowerCase();
                if (usdRates[key] != null) {
                  rates[key.toUpperCase()] = usdRates[key];
                }
              }
            }
          } else {
            throw new Error(`Fallback API returned ${fallbackRes.status}`);
          }
        } catch (fallbackErr) {
          errorMessages.push(`Fallback API also failed: ${fallbackErr}`);
        }
      }
    } else {
      errorMessages.push("FX_API_KEY not configured");
    }

    // Step 5: Upsert rates, respecting manual overrides
    for (const [cur, rate] of Object.entries(rates)) {
      // Check if manual override exists for today
      const { data: existing } = await supabase
        .from("fx_rates")
        .select("is_manual_override")
        .eq("date", today)
        .eq("from_currency", cur)
        .eq("to_currency", "USD")
        .single();

      if (existing?.is_manual_override) {
        skipCount++;
        continue;
      }

      // Upsert: delete old + insert new (since we have a unique constraint)
      await supabase
        .from("fx_rates")
        .delete()
        .eq("date", today)
        .eq("from_currency", cur)
        .eq("to_currency", "USD")
        .eq("is_manual_override", false);

      const { error: insertErr } = await supabase.from("fx_rates").insert({
        date: today,
        from_currency: cur,
        to_currency: "USD",
        rate,
        is_manual_override: false,
      });

      if (insertErr) {
        errorMessages.push(`Failed to insert ${cur}: ${insertErr.message}`);
      } else {
        successCount++;
      }
    }

    // Also insert pegged rates into fx_rates for today so they're queryable
    for (const peg of pegs || []) {
      const { data: existing } = await supabase
        .from("fx_rates")
        .select("id")
        .eq("date", today)
        .eq("from_currency", peg.from_currency)
        .eq("to_currency", "USD")
        .single();

      if (!existing) {
        await supabase.from("fx_rates").insert({
          date: today,
          from_currency: peg.from_currency,
          to_currency: "USD",
          rate: peg.rate,
          is_manual_override: false,
        });
      }
    }

    // Step 7: Audit log
    const success = errorMessages.length === 0;
    await supabase.from("audit_log").insert({
      action: "system",
      table_name: "fx_rates",
      new_values: {
        status: success ? "success" : "partial_failure",
        source: rateSource,
        currencies_updated: successCount,
        currencies_skipped: skipCount,
        errors: errorMessages,
        date: today,
      },
    });

    return new Response(
      JSON.stringify({
        success,
        source: rateSource,
        updated: successCount,
        skipped: skipCount,
        errors: errorMessages,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("fetch-fx-rates error:", e);

    // Log failure
    await supabase.from("audit_log").insert({
      action: "system",
      table_name: "fx_rates",
      new_values: {
        status: "error",
        error: e instanceof Error ? e.message : "Unknown error",
        date: today,
      },
    });

    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
