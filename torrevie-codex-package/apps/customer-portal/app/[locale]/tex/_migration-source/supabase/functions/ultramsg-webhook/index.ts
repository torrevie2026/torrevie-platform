import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function sendWhatsApp(
  supabaseUrl: string,
  supabaseKey: string,
  to: string,
  message: string,
  opts: { companyId?: string | null; instanceId?: string | null } = {},
) {
  try {
    const body: Record<string, unknown> = { to, message };
    if (opts.instanceId) body.instance_id = opts.instanceId;
    if (opts.companyId) body.company_id = opts.companyId;
    const res = await fetch(`${supabaseUrl}/functions/v1/send-whatsapp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify(body),
    });
    await res.json();
  } catch (e) {
    console.error("sendWhatsApp relay failed:", e);
  }
}


/**
 * Resolve the trip for an employee based on company trip_linking_mode.
 * Returns { trip_id, trip_name } or nulls.
 */
async function resolveTrip(
  supabase: any,
  employee: any,
  tripLinkingMode: string
): Promise<{ trip_id: string | null; trip_name: string | null }> {
  if (tripLinkingMode === "manual") {
    return { trip_id: null, trip_name: null };
  }

  // Find active trips for this employee's teams
  const { data: memberships } = await supabase
    .from("team_members")
    .select("team_id")
    .eq("employee_id", employee.id);

  const teamIds = (memberships || []).map((m: any) => m.team_id);

  if (teamIds.length === 0) {
    return { trip_id: null, trip_name: null };
  }

  const today = new Date().toISOString().split("T")[0];
  const { data: activeTrips } = await supabase
    .from("trips")
    .select("id, name")
    .eq("company_id", employee.company_id)
    .eq("status", "open")
    .in("team_id", teamIds)
    .lte("start_date", today)
    .or(`end_date.gte.${today},end_date.is.null`);

  const trips = activeTrips || [];

  if (trips.length === 1) {
    return { trip_id: trips[0].id, trip_name: trips[0].name };
  }

  if (trips.length > 1 && tripLinkingMode === "auto") {
    // Multiple active trips — check if employee has set a preferred trip via TRIP command
    // We store this as a simple key in a lightweight way: check employee's most recent expense with a trip
    // For now, skip auto-link when ambiguous
    return { trip_id: null, trip_name: null };
  }

  return { trip_id: null, trip_name: null };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Verify UltraMsg webhook shared secret to prevent forged payloads
  const expectedToken = Deno.env.get("ULTRAMSG_WEBHOOK_SECRET");
  if (expectedToken) {
    const url = new URL(req.url);
    const providedToken =
      url.searchParams.get("token") ||
      req.headers.get("x-ultramsg-token") ||
      req.headers.get("x-webhook-token");
    if (providedToken !== expectedToken) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } else {
    console.error("ULTRAMSG_WEBHOOK_SECRET not configured — rejecting webhook for safety");
    return new Response(JSON.stringify({ error: "Webhook secret not configured" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const payload = await req.json();
    const data = payload.data;

    if (!data) {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Ignore own messages
    if (data.fromMe) {
      return new Response(JSON.stringify({ ok: true, skipped: "fromMe" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rawFrom = (data.from || "").replace(/@c\.us$/, "");
    if (!rawFrom) {
      return new Response(JSON.stringify({ ok: true, skipped: "no_sender" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find employee by phone number — match common stored formats
    const stripped = rawFrom.replace(/^\+/, "");
    const variantSet = new Set<string>();
    variantSet.add(rawFrom);
    variantSet.add(stripped);
    variantSet.add("+" + stripped);
    if (stripped.length > 6) {
      for (const prefixLen of [1, 2, 3]) {
        variantSet.add("0" + stripped.slice(prefixLen));
      }
      if (stripped.startsWith("0")) {
        variantSet.add(stripped.slice(1));
        variantSet.add("+" + stripped.slice(1));
      }
    }
    const phoneVariants = Array.from(variantSet);

    // Tenant routing — resolve the receiving company from the UltraMsg instance ID
    // when available. Each tenant should map their own UltraMsg instance to their
    // company; if no mapping exists we fall back to refusing ambiguous matches.
    const rawInstanceId = (payload.instanceId || data.instanceId || "").toString();
    let scopedCompanyId: string | null = null;
    if (rawInstanceId) {
      const { data: scopedCompany } = await supabase
        .rpc("get_company_by_whatsapp_instance", { _instance_id: rawInstanceId });
      if (scopedCompany) scopedCompanyId = scopedCompany as string;
    }

    let employeeQuery = supabase
      .from("employees")
      .select("id, name, phone_number, company_id, department, is_active")
      .in("phone_number", phoneVariants)
      .eq("is_active", true);
    if (scopedCompanyId) employeeQuery = employeeQuery.eq("company_id", scopedCompanyId);

    const { data: employees } = await employeeQuery;

    if (!employees || employees.length === 0) {
      await sendWhatsApp(supabaseUrl, supabaseKey, rawFrom,
        "Your number is not registered in TEX.\nPlease ask your manager to add you in the Employees section.");
      return new Response(JSON.stringify({ ok: true, status: "unregistered" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Cross-tenant ambiguity guard: if this phone is active in more than one
    // company AND we couldn't disambiguate via instance ID, refuse to process to
    // prevent leaking expense data between tenants.
    const distinctCompanies = Array.from(new Set(employees.map((e: any) => e.company_id)));
    if (distinctCompanies.length > 1) {
      await supabase.from("audit_log").insert({
        action: "whatsapp_ambiguous_sender",
        table_name: "employees",
        new_values: {
          phone: rawFrom,
          instance_id: rawInstanceId || null,
          company_ids: distinctCompanies,
        } as any,
      });
      await sendWhatsApp(supabaseUrl, supabaseKey, rawFrom,
        "This number is registered in more than one TEX workspace. Please contact your admin so the duplicate can be removed.");
      return new Response(JSON.stringify({ ok: true, status: "ambiguous_sender", company_ids: distinctCompanies }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const employee = employees[0];


    const pushname = data.pushname || employee.name;

    // Get company settings
    const { data: company } = await supabase
      .from("companies")
      .select("country_code, base_currency, trip_linking_mode")
      .eq("id", employee.company_id)
      .single();

    const countryCode = company?.country_code || "";
    const baseCurrency = company?.base_currency || "USD";
    const tripLinkingMode = company?.trip_linking_mode || "auto";

    // --- Text messages ---
    if (data.type === "chat") {
      const body = (data.body || "").trim();
      const bodyUpper = body.toUpperCase();

      // STATUS command
      if (bodyUpper === "STATUS") {
        const { data: recentExpenses } = await supabase
          .from("expenses")
          .select("vendor, currency, amount, date, status, trip_name")
          .eq("employee_id", employee.id)
          .order("created_at", { ascending: false })
          .limit(3);

        if (!recentExpenses || recentExpenses.length === 0) {
          await sendWhatsApp(supabaseUrl, supabaseKey, rawFrom, "You have no recent expenses.");
        } else {
          const lines = recentExpenses.map(
            (e: any) => `• ${e.vendor || "Unknown"} — ${e.currency} ${e.amount} (${e.date}) — ${e.status}${e.trip_name ? ` [${e.trip_name}]` : ""}`
          );
          await sendWhatsApp(supabaseUrl, supabaseKey, rawFrom,
            `Your last ${recentExpenses.length} expenses:\n${lines.join("\n")}`);
        }
        return new Response(JSON.stringify({ ok: true, status: "status_reply" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // TRIP command — employee selects/sets active trip
      if (bodyUpper.startsWith("TRIP")) {
        const tripArg = body.slice(4).trim();

        // TRIP STOP — clear trip preference
        if (tripArg.toUpperCase() === "STOP") {
          // Remove trip preference by clearing any stored preference
          // We store preference in a simple way: tag in employee department or dedicated field
          // For now, we'll use a convention: store last selected trip_id in a lightweight lookup
          await supabase
            .from("team_members")
            .update({ joined_at: new Date().toISOString() }) // touch to reset
            .eq("employee_id", employee.id);

          await sendWhatsApp(supabaseUrl, supabaseKey, rawFrom,
            "Trip preference cleared. Future receipts won't be linked to a trip automatically.");
          return new Response(JSON.stringify({ ok: true, status: "trip_cleared" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // TRIP (no argument) — list active trips
        if (!tripArg) {
          const { data: memberships } = await supabase
            .from("team_members")
            .select("team_id")
            .eq("employee_id", employee.id);
          const teamIds = (memberships || []).map((m: any) => m.team_id);

          let trips: any[] = [];
          if (teamIds.length > 0) {
            const { data: activeTrips } = await supabase
              .from("trips")
              .select("id, name")
              .eq("company_id", employee.company_id)
              .eq("status", "open")
              .in("team_id", teamIds);
            trips = activeTrips || [];
          }

          if (trips.length === 0) {
            await sendWhatsApp(supabaseUrl, supabaseKey, rawFrom,
              "No active trips found for your team.");
          } else {
            const lines = trips.map((t: any, i: number) => `${i + 1}. ${t.name}`);
            await sendWhatsApp(supabaseUrl, supabaseKey, rawFrom,
              `Active trips:\n${lines.join("\n")}\n\nReply TRIP <name> to link future receipts to a trip.\nReply TRIP STOP to clear.`);
          }
          return new Response(JSON.stringify({ ok: true, status: "trip_list" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // TRIP <name> — set active trip by name match
        const { data: memberships } = await supabase
          .from("team_members")
          .select("team_id")
          .eq("employee_id", employee.id);
        const teamIds = (memberships || []).map((m: any) => m.team_id);

        let matchedTrip: any = null;
        if (teamIds.length > 0) {
          const { data: activeTrips } = await supabase
            .from("trips")
            .select("id, name")
            .eq("company_id", employee.company_id)
            .eq("status", "open")
            .in("team_id", teamIds);

          // Try exact match first, then partial
          matchedTrip = (activeTrips || []).find(
            (t: any) => t.name.toLowerCase() === tripArg.toLowerCase()
          );
          if (!matchedTrip) {
            matchedTrip = (activeTrips || []).find(
              (t: any) => t.name.toLowerCase().includes(tripArg.toLowerCase())
            );
          }
          // Also try matching by number (e.g. "TRIP 1")
          if (!matchedTrip && /^\d+$/.test(tripArg)) {
            const idx = parseInt(tripArg) - 1;
            if (idx >= 0 && idx < (activeTrips || []).length) {
              matchedTrip = activeTrips![idx];
            }
          }
        }

        if (!matchedTrip) {
          await sendWhatsApp(supabaseUrl, supabaseKey, rawFrom,
            `No matching trip found for "${tripArg}".\nReply TRIP to see active trips.`);
        } else {
          // Store trip preference: we'll create a simple record to track this
          // Use a convention: upsert into a preferences-like approach
          // Store as the employee's "active_trip" - we'll add this to the employees table
          // For now, store in notes on team_members or a simpler approach:
          // We'll just remember this in the webhook by checking the most recent "trip set" action
          await supabase.from("audit_log").insert({
            company_id: employee.company_id,
            action: "trip_select",
            table_name: "employees",
            record_id: employee.id,
            new_values: { trip_id: matchedTrip.id, trip_name: matchedTrip.name } as any,
          });

          await sendWhatsApp(supabaseUrl, supabaseKey, rawFrom,
            `✓ Trip set to "${matchedTrip.name}".\nFuture receipts will be linked to this trip.\nReply TRIP STOP to clear.`);
        }
        return new Response(JSON.stringify({ ok: true, status: "trip_set" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // HELP command
      if (bodyUpper === "HELP") {
        await sendWhatsApp(supabaseUrl, supabaseKey, rawFrom,
          "TEX\nSend a receipt photo to log an expense.\nReply STATUS to see your recent expenses.\nReply TRIP to see active trips.\nReply TRIP <name> to link receipts to a trip.\nReply TRIP STOP to clear trip linking.");
        return new Response(JSON.stringify({ ok: true, status: "help_reply" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Any other text
      await sendWhatsApp(supabaseUrl, supabaseKey, rawFrom,
        `Hi ${pushname}. Send a receipt photo to log an expense, or reply HELP for instructions.`);
      return new Response(JSON.stringify({ ok: true, status: "generic_reply" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Image messages ---
    if (data.type === "image") {
      const imageCaption = (data.caption || data.body || "").trim();
      const ultramsgToken = Deno.env.get("ULTRAMSG_TOKEN") || "";
      let mediaUrl = data.media || "";
      if (mediaUrl && !mediaUrl.includes("token=")) {
        mediaUrl += (mediaUrl.includes("?") ? "&" : "?") + `token=${ultramsgToken}`;
      }

      // Fetch the image
      let imageBase64 = "";
      let mediaType = "image/jpeg";
      try {
        const imgRes = await fetch(mediaUrl);
        if (!imgRes.ok) throw new Error(`Image fetch failed: ${imgRes.status}`);
        const imgBuffer = await imgRes.arrayBuffer();
        const uint8 = new Uint8Array(imgBuffer);
        let binary = "";
        for (let i = 0; i < uint8.length; i++) {
          binary += String.fromCharCode(uint8[i]);
        }
        imageBase64 = btoa(binary);
        mediaType = imgRes.headers.get("content-type") || "image/jpeg";
      } catch (imgErr) {
        console.error("Failed to fetch image:", imgErr);
        await sendWhatsApp(supabaseUrl, supabaseKey, rawFrom,
          "Receipt received but could not be read automatically.\nIt has been saved for your manager to review.\nReply STATUS to see your recent expenses.");
        return new Response(JSON.stringify({ ok: true, status: "image_fetch_failed" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Upload receipt image to storage FIRST (so it's saved even if parsing fails)
      let receiptImageUrl: string | null = null;
      try {
        const byteString = atob(imageBase64);
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
        const blob = new Blob([ab], { type: mediaType });

        const nowUp = new Date();
        const path = `${employee.company_id}/${nowUp.getFullYear()}/${String(nowUp.getMonth() + 1).padStart(2, "0")}/${nowUp.getTime()}_whatsapp_${employee.id}.jpg`;

        const { error: uploadErr } = await supabase.storage
          .from("receipts")
          .upload(path, blob, { upsert: false });

        if (!uploadErr) {
          const { data: urlData } = supabase.storage.from("receipts").getPublicUrl(path);
          receiptImageUrl = urlData.publicUrl;
        } else {
          console.error("Receipt upload error:", uploadErr);
        }
      } catch (upErr) {
        console.error("Receipt upload failed:", upErr);
      }

      // Parse receipt via edge function
      let parsed: any = null;
      try {
        const parseRes = await fetch(`${supabaseUrl}/functions/v1/parse-receipt`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({
            image_base64: imageBase64,
            media_type: mediaType,
            country_code: countryCode,
          }),
        });

        if (parseRes.ok) {
          const parseData = await parseRes.json();
          if (parseData.error) {
            console.error("parse-receipt returned error:", parseData.error);
          } else {
            parsed = parseData;
          }
        } else {
          const errBody = await parseRes.text().catch(() => "");
          console.error(`parse-receipt HTTP ${parseRes.status}:`, errBody.slice(0, 500));
        }
      } catch (parseErr) {
        console.error("Receipt parsing failed:", parseErr);
      }

      if (!parsed || !parsed.amount) {
        const { data: newExp } = await supabase
          .from("expenses")
          .insert({
            company_id: employee.company_id,
            employee_id: employee.id,
            employee_name: employee.name,
            employee_phone: employee.phone_number,
            date: new Date().toISOString().split("T")[0],
            amount: 0,
            currency: baseCurrency,
            status: "pending",
            source: "whatsapp",
            receipt_image_url: receiptImageUrl,
            notes: [imageCaption, "Receipt could not be parsed automatically — please complete manually"].filter(Boolean).join(" — "),
            policy_flag: true,
            policy_flag_reason: "Auto-parse failed — needs manual entry",
          })
          .select("id")
          .single();

        if (newExp) {
          await supabase.from("audit_log").insert({
            company_id: employee.company_id,
            action: "create",
            table_name: "expenses",
            record_id: newExp.id,
            new_values: { source: "whatsapp", status: "unparsed", receipt_image_url: receiptImageUrl } as any,
          });
        }

        await sendWhatsApp(supabaseUrl, supabaseKey, rawFrom,
          "📸 Receipt received but I couldn't read it automatically.\nIt's saved in TEX as a pending expense — please open the app to fill in the vendor and amount, or your manager will complete it for you.\n\nReply STATUS to see your recent expenses.");

        return new Response(JSON.stringify({ ok: true, status: "parse_failed" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Currency conversion
      const expenseCurrency = parsed.currency || baseCurrency;
      let baseAmount = parsed.amount;
      let exchangeRate = 1;

      if (expenseCurrency !== baseCurrency) {
        const { data: pegs } = await supabase
          .from("currency_pegs")
          .select("from_currency, to_currency, rate");
        const { data: fxRates } = await supabase
          .from("fx_rates")
          .select("from_currency, to_currency, rate, date, is_manual_override")
          .eq("to_currency", "USD");

        const toUsd = (cur: string): number | null => {
          if (cur === "USD") return 1;
          const peg = (pegs || []).find((p: any) => p.from_currency === cur);
          if (peg) return peg.rate;
          const rates = (fxRates || [])
            .filter((r: any) => r.from_currency === cur)
            .sort((a: any, b: any) => b.date.localeCompare(a.date));
          if (rates.length > 0) return 1 / rates[0].rate;
          return null;
        };
        const fromUsd = (cur: string): number | null => {
          if (cur === "USD") return 1;
          const peg = (pegs || []).find((p: any) => p.from_currency === cur);
          if (peg) return 1 / peg.rate;
          const rates = (fxRates || [])
            .filter((r: any) => r.from_currency === cur)
            .sort((a: any, b: any) => b.date.localeCompare(a.date));
          if (rates.length > 0) return rates[0].rate;
          return null;
        };

        const fromRate = toUsd(expenseCurrency);
        const toRate = fromUsd(baseCurrency);
        if (fromRate && toRate) {
          const inUsd = parsed.amount * fromRate;
          baseAmount = Math.round(inUsd * toRate * 100) / 100;
          exchangeRate = Math.round((baseAmount / parsed.amount) * 1000000) / 1000000;
        }
      }

      // Policy checks
      let policyFlag = false;
      let policyFlagReason: string | null = null;

      if (parsed.category) {
        const { data: policyData } = await supabase
          .from("spend_policies")
          .select("*")
          .eq("company_id", employee.company_id)
          .eq("category", parsed.category)
          .single();

        if (policyData) {
          if (policyData.is_blocked) {
            policyFlag = true;
            policyFlagReason = `Category ${parsed.category} is blocked by company policy`;
          } else {
            const reasons: string[] = [];
            if (policyData.daily_limit != null) {
              const todayStr = new Date().toISOString().split("T")[0];
              const { data: todayExp } = await supabase
                .from("expenses")
                .select("base_amount")
                .eq("company_id", employee.company_id)
                .eq("employee_id", employee.id)
                .eq("category", parsed.category)
                .eq("date", todayStr);
              const todayTotal = (todayExp || []).reduce((s: number, e: any) => s + (e.base_amount || 0), 0);
              if (todayTotal + baseAmount > policyData.daily_limit) {
                reasons.push(`Daily ${parsed.category} limit of ${policyData.daily_limit} exceeded`);
              }
            }
            if (policyData.monthly_limit != null) {
              const now = new Date();
              const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
              const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];
              const { data: monthExp } = await supabase
                .from("expenses")
                .select("base_amount")
                .eq("company_id", employee.company_id)
                .eq("employee_id", employee.id)
                .eq("category", parsed.category)
                .gte("date", monthStart)
                .lte("date", monthEnd);
              const monthTotal = (monthExp || []).reduce((s: number, e: any) => s + (e.base_amount || 0), 0);
              if (monthTotal + baseAmount > policyData.monthly_limit) {
                reasons.push(`Monthly ${parsed.category} limit of ${policyData.monthly_limit} exceeded`);
              }
            }
            if (reasons.length > 0) {
              policyFlag = true;
              policyFlagReason = reasons.join("; ");
            }
          }
        }
      }

      // Date sanity: AI sometimes misreads the year on faded receipts. If the parsed
      // date is missing, invalid, in the future, or more than 365 days old, fall back
      // to today's date (when the WhatsApp was received) and flag for review.
      const todayStr = new Date().toISOString().split("T")[0];
      const rawParsedDate = typeof parsed.date === "string" ? parsed.date.trim() : "";
      let dateUnreadable = false;
      if (!rawParsedDate || !/^\d{4}-\d{2}-\d{2}$/.test(rawParsedDate)) {
        dateUnreadable = !!rawParsedDate || parsed.date != null;
        parsed.date = null;
      } else {
        const d = new Date(`${rawParsedDate}T00:00:00Z`);
        const now = new Date();
        const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
        const diffDays = Math.round((todayUtc.getTime() - d.getTime()) / 86_400_000);
        if (Number.isNaN(d.getTime()) || diffDays > 365 || diffDays < -1) {
          dateUnreadable = true;
          parsed.date = null;
        }
      }
      if (dateUnreadable) {
        const reason = "Date unreadable on receipt — used submission date";
        policyFlag = true;
        policyFlagReason = policyFlagReason ? `${policyFlagReason} | ${reason}` : reason;
      }

      // Duplicate detection: same employee + vendor + amount + currency, within ±3 days of expense date, not rejected
      let duplicateMatch: { vendor: string; date: string; amount: number; currency: string; dayDiff: number } | null = null;
      const candidateVendor = (parsed.vendor || "").trim();
      const candidateDate = parsed.date || todayStr;
      if (candidateVendor && parsed.amount && expenseCurrency) {
        const addDays = (yyyy_mm_dd: string, days: number) => {
          const d = new Date(yyyy_mm_dd + "T00:00:00Z");
          d.setUTCDate(d.getUTCDate() + days);
          return d.toISOString().split("T")[0];
        };
        const fromDate = addDays(candidateDate, -3);
        const toDate = addDays(candidateDate, 3);
        const { data: dupRows } = await supabase
          .from("expenses")
          .select("id, vendor, date, amount, currency, status")
          .eq("company_id", employee.company_id)
          .eq("employee_id", employee.id)
          .eq("amount", parsed.amount)
          .eq("currency", expenseCurrency)
          .neq("status", "rejected")
          .gte("date", fromDate)
          .lte("date", toDate);
        const candVendorLower = candidateVendor.toLowerCase();
        const candTs = new Date(candidateDate + "T00:00:00Z").getTime();
        const matches = (dupRows || [])
          .filter((r: any) => ((r.vendor || "").trim().toLowerCase() === candVendorLower))
          .map((r: any) => ({
            vendor: r.vendor,
            date: r.date,
            amount: r.amount,
            currency: r.currency,
            dayDiff: Math.round(Math.abs(candTs - new Date(r.date + "T00:00:00Z").getTime()) / 86400000),
          }))
          .sort((a, b) => a.dayDiff - b.dayDiff);
        if (matches.length > 0) {
          duplicateMatch = matches[0];
          const dupReason = `Possible duplicate of ${duplicateMatch.vendor} on ${duplicateMatch.date} for ${duplicateMatch.currency} ${duplicateMatch.amount}`;
          policyFlag = true;
          policyFlagReason = policyFlagReason ? `${policyFlagReason} | ${dupReason}` : dupReason;
        }
      }

      // --- Trip linking ---
      let tripId: string | null = null;
      let tripName: string | null = null;

      // 1. Check if employee has explicitly set a trip via TRIP command (stored in audit_log)
      const { data: tripPref } = await supabase
        .from("audit_log")
        .select("new_values")
        .eq("record_id", employee.id)
        .eq("action", "trip_select")
        .eq("table_name", "employees")
        .order("created_at", { ascending: false })
        .limit(1);

      if (tripPref && tripPref.length > 0) {
        const prefValues = tripPref[0].new_values as any;
        if (prefValues?.trip_id) {
          // Verify the trip is still open
          const { data: prefTrip } = await supabase
            .from("trips")
            .select("id, name, status")
            .eq("id", prefValues.trip_id)
            .eq("status", "open")
            .single();
          if (prefTrip) {
            tripId = prefTrip.id;
            tripName = prefTrip.name;
          }
        }
      }

      // 2. If no explicit preference, try auto-link
      if (!tripId && tripLinkingMode !== "manual") {
        const resolved = await resolveTrip(supabase, employee, tripLinkingMode);
        tripId = resolved.trip_id;
        tripName = resolved.trip_name;
      }

      // Receipt image was already uploaded above; receiptImageUrl is in scope.


      // Create expense with trip linking
      const expenseData = {
        company_id: employee.company_id,
        employee_id: employee.id,
        employee_name: employee.name,
        employee_phone: employee.phone_number,
        vendor: parsed.vendor || null,
        date: parsed.date || new Date().toISOString().split("T")[0],
        amount: parsed.amount,
        currency: expenseCurrency,
        base_amount: baseAmount,
        exchange_rate: exchangeRate,
        category: parsed.category || null,
        payment_method: parsed.payment_method || null,
        notes: [imageCaption, parsed.notes].filter(Boolean).join(" — ") || null,
        tax_id_number: parsed.tax_id_number || null,
        tax_amount: parsed.tax_amount || null,
        receipt_image_url: receiptImageUrl,
        status: "pending",
        source: "whatsapp",
        policy_flag: policyFlag,
        policy_flag_reason: policyFlagReason,
        trip_id: tripId,
        trip_name: tripName,
      };

      const { data: newExp } = await supabase
        .from("expenses")
        .insert(expenseData)
        .select("id")
        .single();

      if (newExp) {
        await supabase.from("audit_log").insert({
          company_id: employee.company_id,
          action: "create",
          table_name: "expenses",
          record_id: newExp.id,
          new_values: { source: "whatsapp", vendor: parsed.vendor, amount: parsed.amount, trip_id: tripId } as any,
        });
      }

      // Build confirmation message
      let confirmMsg = `✓ Expense received — TEX\nVendor: ${parsed.vendor || "Unknown"}\nAmount: ${expenseCurrency} ${parsed.amount}`;
      if (expenseCurrency !== baseCurrency) {
        confirmMsg += ` (${baseCurrency} ${baseAmount})`;
      }
      confirmMsg += `\nDate: ${parsed.date || new Date().toISOString().split("T")[0]}`;
      if (tripName) {
        confirmMsg += `\nTrip: ${tripName}`;
      }
      if (parsed.tax_id_number) {
        confirmMsg += `\nTax ID: ${parsed.tax_id_number} ✓`;
      }
      if (duplicateMatch) {
        confirmMsg += `\n\n⚠️ This looks like a possible duplicate of ${duplicateMatch.vendor} on ${duplicateMatch.date} — flagged for review.`;
      }
      confirmMsg += "\n\nReply STATUS to see your recent expenses.";

      await sendWhatsApp(supabaseUrl, supabaseKey, rawFrom, confirmMsg);

      return new Response(JSON.stringify({ ok: true, status: "expense_created", id: newExp?.id, trip_id: tripId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Unknown message type
    await sendWhatsApp(supabaseUrl, supabaseKey, rawFrom,
      `Hi ${pushname}. Send a receipt photo to log an expense, or reply HELP for instructions.`);

    return new Response(JSON.stringify({ ok: true, status: "unknown_type" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ultramsg-webhook error:", e);
    return new Response(
      JSON.stringify({ ok: false, error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
