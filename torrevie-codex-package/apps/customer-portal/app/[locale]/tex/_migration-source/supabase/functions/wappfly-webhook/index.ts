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
  companyId: string | null,
) {
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/send-whatsapp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({ to, message, company_id: companyId }),
    });
    await res.json();
  } catch (e) {
    console.error("sendWhatsApp relay failed:", e);
  }
}

async function resolveTrip(
  supabase: any,
  employee: any,
  tripLinkingMode: string,
): Promise<{ trip_id: string | null; trip_name: string | null }> {
  if (tripLinkingMode === "manual") return { trip_id: null, trip_name: null };
  const { data: memberships } = await supabase
    .from("team_members").select("team_id").eq("employee_id", employee.id);
  const teamIds = (memberships || []).map((m: any) => m.team_id);
  if (teamIds.length === 0) return { trip_id: null, trip_name: null };
  const today = new Date().toISOString().split("T")[0];
  const { data: activeTrips } = await supabase
    .from("trips").select("id, name")
    .eq("company_id", employee.company_id).eq("status", "open").in("team_id", teamIds)
    .lte("start_date", today).or(`end_date.gte.${today},end_date.is.null`);
  const trips = activeTrips || [];
  if (trips.length === 1) return { trip_id: trips[0].id, trip_name: trips[0].name };
  return { trip_id: null, trip_name: null };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Auth via shared secret in query string
  const expected = Deno.env.get("WAPPFLY_WEBHOOK_SECRET");
  if (!expected) {
    console.error("WAPPFLY_WEBHOOK_SECRET not configured");
    return new Response(JSON.stringify({ error: "Webhook secret not configured" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const url = new URL(req.url);
  const provided = url.searchParams.get("token") || req.headers.get("x-webhook-token");
  if (provided !== expected) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const payload = await req.json();
    try {
      console.log(`wappfly inbound payload: ${JSON.stringify(payload).slice(0, 2000)}`);
    } catch (_) { /* ignore */ }
    if (payload.event && payload.event !== "messages.received") {
      return new Response(JSON.stringify({ ok: true, skipped: payload.event }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sessionId = payload?.session?.id;
    const msg = payload?.data?.messages;
    if (!msg) {
      return new Response(JSON.stringify({ ok: true, skipped: "no_message" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const key = msg.key || {};
    if (key.fromMe) {
      return new Response(JSON.stringify({ ok: true, skipped: "fromMe" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rawFrom = String(key.cleanedSenderPn || (key.senderPn || "").replace(/@s\.whatsapp\.net$/, "") || "").replace(/^\+/, "");
    if (!rawFrom) {
      return new Response(JSON.stringify({ ok: true, skipped: "no_sender" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve tenant by Wappfly session id
    let scopedCompanyId: string | null = null;
    if (sessionId != null) {
      const { data: companyId } = await supabase
        .rpc("get_company_by_wappfly_session", { _session_id: String(sessionId) });
      if (companyId) scopedCompanyId = companyId as string;
    }
    if (!scopedCompanyId) {
      console.error("wappfly-webhook: unmapped session", sessionId);
      return new Response(JSON.stringify({ ok: true, status: "unmapped_session", session_id: sessionId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Look up employee within this tenant
    const stripped = rawFrom.replace(/^\+/, "");
    const variantSet = new Set<string>();
    variantSet.add(rawFrom);
    variantSet.add(stripped);
    variantSet.add("+" + stripped);
    if (stripped.length > 6) {
      for (const prefixLen of [1, 2, 3]) variantSet.add("0" + stripped.slice(prefixLen));
      if (stripped.startsWith("0")) {
        variantSet.add(stripped.slice(1));
        variantSet.add("+" + stripped.slice(1));
      }
    }
    const phoneVariants = Array.from(variantSet);

    const { data: employees } = await supabase
      .from("employees")
      .select("id, name, phone_number, company_id, department, is_active")
      .in("phone_number", phoneVariants)
      .eq("is_active", true)
      .eq("company_id", scopedCompanyId);

    if (!employees || employees.length === 0) {
      await sendWhatsApp(supabaseUrl, supabaseKey, rawFrom,
        "Your number is not registered in TEX.\nPlease ask your manager to add you in the Employees section.",
        scopedCompanyId);
      return new Response(JSON.stringify({ ok: true, status: "unregistered" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const employee = employees[0];
    const pushname = msg.pushName || employee.name;

    const { data: company } = await supabase
      .from("companies")
      .select("country_code, base_currency, trip_linking_mode, wappfly_api_token")
      .eq("id", employee.company_id).single();
    const countryCode = company?.country_code || "";
    const baseCurrency = company?.base_currency || "USD";
    const tripLinkingMode = company?.trip_linking_mode || "auto";
    const wappflyToken: string = (company as any)?.wappfly_api_token || "";

    // Determine message type + body
    const messageNode = msg.message || {};
    const textBody: string =
      messageNode.conversation
      || messageNode.extendedTextMessage?.text
      || (typeof msg.messageBody === "string" && !messageNode.imageMessage ? msg.messageBody : "")
      || "";

    const imageNode = messageNode.imageMessage;

    // --- Text messages ---
    if (!imageNode && textBody) {
      const body = textBody.trim();
      const bodyUpper = body.toUpperCase();

      if (bodyUpper === "STATUS") {
        const { data: recent } = await supabase
          .from("expenses")
          .select("vendor, currency, amount, date, status, trip_name")
          .eq("employee_id", employee.id)
          .order("created_at", { ascending: false }).limit(3);
        if (!recent || recent.length === 0) {
          await sendWhatsApp(supabaseUrl, supabaseKey, rawFrom, "You have no recent expenses.", scopedCompanyId);
        } else {
          const lines = recent.map((e: any) =>
            `• ${e.vendor || "Unknown"} — ${e.currency} ${e.amount} (${e.date}) — ${e.status}${e.trip_name ? ` [${e.trip_name}]` : ""}`);
          await sendWhatsApp(supabaseUrl, supabaseKey, rawFrom,
            `Your last ${recent.length} expenses:\n${lines.join("\n")}`, scopedCompanyId);
        }
        return new Response(JSON.stringify({ ok: true, status: "status_reply" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (bodyUpper.startsWith("TRIP")) {
        const tripArg = body.slice(4).trim();
        if (tripArg.toUpperCase() === "STOP") {
          await supabase.from("audit_log").insert({
            company_id: employee.company_id, action: "trip_select",
            table_name: "employees", record_id: employee.id,
            new_values: { trip_id: null, trip_name: null } as any,
          });
          await sendWhatsApp(supabaseUrl, supabaseKey, rawFrom,
            "Trip preference cleared. Future receipts won't be linked to a trip automatically.", scopedCompanyId);
          return new Response(JSON.stringify({ ok: true, status: "trip_cleared" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const { data: memberships } = await supabase
          .from("team_members").select("team_id").eq("employee_id", employee.id);
        const teamIds = (memberships || []).map((m: any) => m.team_id);
        let trips: any[] = [];
        if (teamIds.length > 0) {
          const { data: at } = await supabase
            .from("trips").select("id, name")
            .eq("company_id", employee.company_id).eq("status", "open").in("team_id", teamIds);
          trips = at || [];
        }

        if (!tripArg) {
          if (trips.length === 0) {
            await sendWhatsApp(supabaseUrl, supabaseKey, rawFrom, "No active trips found for your team.", scopedCompanyId);
          } else {
            const lines = trips.map((t: any, i: number) => `${i + 1}. ${t.name}`);
            await sendWhatsApp(supabaseUrl, supabaseKey, rawFrom,
              `Active trips:\n${lines.join("\n")}\n\nReply TRIP <name> to link future receipts to a trip.\nReply TRIP STOP to clear.`, scopedCompanyId);
          }
          return new Response(JSON.stringify({ ok: true, status: "trip_list" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        let matched: any = trips.find((t: any) => t.name.toLowerCase() === tripArg.toLowerCase())
          || trips.find((t: any) => t.name.toLowerCase().includes(tripArg.toLowerCase()));
        if (!matched && /^\d+$/.test(tripArg)) {
          const idx = parseInt(tripArg) - 1;
          if (idx >= 0 && idx < trips.length) matched = trips[idx];
        }

        if (!matched) {
          await sendWhatsApp(supabaseUrl, supabaseKey, rawFrom,
            `No matching trip found for "${tripArg}".\nReply TRIP to see active trips.`, scopedCompanyId);
        } else {
          await supabase.from("audit_log").insert({
            company_id: employee.company_id, action: "trip_select",
            table_name: "employees", record_id: employee.id,
            new_values: { trip_id: matched.id, trip_name: matched.name } as any,
          });
          await sendWhatsApp(supabaseUrl, supabaseKey, rawFrom,
            `✓ Trip set to "${matched.name}".\nFuture receipts will be linked to this trip.\nReply TRIP STOP to clear.`, scopedCompanyId);
        }
        return new Response(JSON.stringify({ ok: true, status: "trip_set" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (bodyUpper === "HELP") {
        await sendWhatsApp(supabaseUrl, supabaseKey, rawFrom,
          "TEX\nSend a receipt photo to log an expense.\nReply STATUS to see your recent expenses.\nReply TRIP to see active trips.\nReply TRIP <name> to link receipts to a trip.\nReply TRIP STOP to clear trip linking.", scopedCompanyId);
        return new Response(JSON.stringify({ ok: true, status: "help_reply" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await sendWhatsApp(supabaseUrl, supabaseKey, rawFrom,
        `Hi ${pushname}. Send a receipt photo to log an expense, or reply HELP for instructions.`, scopedCompanyId);
      return new Response(JSON.stringify({ ok: true, status: "generic_reply" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- Image messages ---
    if (imageNode) {
      const imageCaption = (msg.messageBody || imageNode.caption || "").trim();
      const mediaType: string = imageNode.mimetype || "image/jpeg";
      const msgId: string = key.id || "";
      const remoteJid: string = key.remoteJid || "";

      const isImageMagic = (b: Uint8Array): boolean => {
        if (b.length < 4) return false;
        if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return true; // JPEG
        if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return true; // PNG
        if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return true; // GIF
        if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46
            && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return true; // WEBP
        if (b.length >= 12 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) return true; // HEIC
        return false;
      };

      const base64ToBytes = (input: string): Uint8Array => {
        const normalized = input.trim().replace(/-/g, "+").replace(/_/g, "/");
        const padded = normalized.padEnd(normalized.length + ((4 - normalized.length % 4) % 4), "=");
        const binary = atob(padded);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes;
      };

      const bytesToBase64 = (bytes: Uint8Array): string => {
        let binary = "";
        const chunkSize = 0x8000;
        for (let i = 0; i < bytes.length; i += chunkSize) {
          const chunk = bytes.subarray(i, i + chunkSize);
          binary += String.fromCharCode(...chunk);
        }
        return btoa(binary);
      };

      const asArrayBuffer = (bytes: Uint8Array): ArrayBuffer =>
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

      const deriveWhatsAppMediaKeys = async (mediaKey: string) => {
        const keyMaterial = await crypto.subtle.importKey(
          "raw",
          asArrayBuffer(base64ToBytes(mediaKey)),
          "HKDF",
          false,
          ["deriveBits"],
        );
        const hkdfInfo = new TextEncoder().encode("WhatsApp Image Keys");
        const derived = new Uint8Array(await crypto.subtle.deriveBits(
          {
            name: "HKDF",
            hash: "SHA-256",
            salt: asArrayBuffer(new Uint8Array(32)),
            info: asArrayBuffer(hkdfInfo),
          },
          keyMaterial,
          112 * 8,
        ));
        return {
          iv: derived.slice(0, 16),
          cipherKey: derived.slice(16, 48),
          macKey: derived.slice(48, 80),
        };
      };

      const timingSafeEqual = (a: Uint8Array, b: Uint8Array): boolean => {
        if (a.length !== b.length) return false;
        let diff = 0;
        for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
        return diff === 0;
      };

      const downloadEncryptedWhatsAppImage = async (): Promise<Uint8Array | null> => {
        const encryptedUrl = imageNode.url
          || (imageNode.directPath ? `https://mmg.whatsapp.net${imageNode.directPath}` : "");
        const mediaKey = imageNode.mediaKey;
        if (!encryptedUrl || !mediaKey) return null;

        const res = await fetch(encryptedUrl);
        if (!res.ok) {
          console.error(`wappfly encrypted media download -> HTTP ${res.status}`);
          return null;
        }

        const encryptedWithMac = new Uint8Array(await res.arrayBuffer());
        if (encryptedWithMac.length <= 10) {
          console.error(`wappfly encrypted media too small (${encryptedWithMac.length} bytes)`);
          return null;
        }

        const { iv, cipherKey, macKey } = await deriveWhatsAppMediaKeys(mediaKey);
        const encrypted = encryptedWithMac.slice(0, encryptedWithMac.length - 10);
        const receivedMac = encryptedWithMac.slice(encryptedWithMac.length - 10);

        try {
          const hmacKey = await crypto.subtle.importKey("raw", asArrayBuffer(macKey), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
          const macInput = new Uint8Array(iv.length + encrypted.length);
          macInput.set(iv, 0);
          macInput.set(encrypted, iv.length);
          const fullMac = new Uint8Array(await crypto.subtle.sign("HMAC", hmacKey, asArrayBuffer(macInput)));
          if (!timingSafeEqual(fullMac.slice(0, 10), receivedMac)) {
            console.error("wappfly encrypted media MAC check failed");
            return null;
          }
        } catch (err) {
          console.error(`wappfly encrypted media MAC check error: ${(err as Error).message}`);
          return null;
        }

        try {
          const aesKey = await crypto.subtle.importKey("raw", asArrayBuffer(cipherKey), "AES-CBC", false, ["decrypt"]);
          const decrypted = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-CBC", iv: asArrayBuffer(iv) }, aesKey, asArrayBuffer(encrypted)));
          const hex = Array.from(decrypted.slice(0, 16)).map((x) => x.toString(16).padStart(2, "0")).join("");
          if (!isImageMagic(decrypted)) {
            console.error(`wappfly encrypted media decrypted but not image (${decrypted.length} bytes, first16=${hex})`);
            return null;
          }
          console.log(`wappfly decrypted encrypted media ${decrypted.length} bytes, magic=${hex.slice(0, 8)}`);
          return decrypted;
        } catch (err) {
          console.error(`wappfly encrypted media decrypt error: ${(err as Error).message}`);
          return null;
        }
      };

      // Documented Wappfly inbound-media flow:
      //   1. GET /api/history?jid=<remoteJid>&limit=50  -> rows with media_path
      //   2. fallback GET /api/messages/recent?limit=100
      //   Each row matching msg_id has a `media_path` field (null for text).
      //   Download via https://wappfly.com<media_path> with header `X-API-Token`.
      // Wappfly populates media_path asynchronously after the webhook fires, so
      // we retry for longer before saving the receipt as manual-entry.
      const collectObjects = (value: unknown, out: any[] = []): any[] => {
        if (!value || typeof value !== "object") return out;
        if (Array.isArray(value)) {
          for (const item of value) collectObjects(item, out);
          return out;
        }
        const obj = value as Record<string, unknown>;
        out.push(obj);
        for (const nested of Object.values(obj)) {
          if (nested && typeof nested === "object") collectObjects(nested, out);
        }
        return out;
      };

      const getStringField = (obj: any, keys: string[]): string => {
        for (const k of keys) {
          const v = obj?.[k];
          if (typeof v === "string" && v.trim()) return v.trim();
          if (typeof v === "number") return String(v);
        }
        return "";
      };

      const rowMessageId = (row: any): string => getStringField(row, [
        "msg_id", "message_id", "messageId", "id", "key_id", "keyId", "stanzaId",
      ]) || getStringField(row?.key, ["id"]);

      const rowMediaPath = (row: any): string => getStringField(row, [
        "media_path", "mediaPath", "media_url", "mediaUrl", "download_url", "downloadUrl", "url", "file_url", "fileUrl",
      ]) || getStringField(row?.media, ["path", "url", "media_path", "mediaPath", "download_url", "downloadUrl"]);

      const fetchMediaPath = async (): Promise<string | null> => {
        if (!msgId || !wappflyToken) return null;
        const endpoints: string[] = [];
        if (remoteJid) endpoints.push(`https://wappfly.com/api/history?jid=${encodeURIComponent(remoteJid)}&limit=100`);
        endpoints.push(`https://wappfly.com/api/messages/recent?limit=100`);
        const headers = { "X-API-Token": wappflyToken };
        let matchedWithoutMedia = false;
        let loggedRowSample = false;

        for (let attempt = 0; attempt < 6; attempt++) {
          for (const ep of endpoints) {
            try {
              const r = await fetch(ep, { headers });
              if (!r.ok) {
                console.log(`wappfly ${ep} -> HTTP ${r.status}`);
                continue;
              }
              const payload = await r.json();
              const rows = collectObjects(payload);
              const hit = rows.find((row: any) => rowMessageId(row) === msgId);
              if (hit) {
                const mediaPath = rowMediaPath(hit);
                if (mediaPath) {
                  console.log(`wappfly history hit msg_id=${msgId} attempt=${attempt + 1} media_path=${mediaPath}`);
                  return mediaPath;
                }
                matchedWithoutMedia = true;
                if (!loggedRowSample) {
                  loggedRowSample = true;
                  try {
                    console.log(`wappfly matched row keys=${JSON.stringify(Object.keys(hit))}`);
                    console.log(`wappfly matched row sample=${JSON.stringify(hit).slice(0, 2000)}`);
                  } catch (_) { /* ignore */ }
                }
                console.log(`wappfly history matched msg_id=${msgId} attempt=${attempt + 1} but media_path is empty`);
              }
            } catch (err) {
              console.log(`wappfly ${ep} -> error: ${(err as Error).message}`);
            }
          }
          if (attempt < 5) await new Promise((res) => setTimeout(res, 2500));
        }
        console.error(`wappfly image: no downloadable media_path for msg_id=${msgId} after retries; matched_row=${matchedWithoutMedia}`);
        return null;
      };

      let imageBase64 = "";
      const decryptedImage = await downloadEncryptedWhatsAppImage();
      if (decryptedImage) {
        imageBase64 = bytesToBase64(decryptedImage);
      }

      const mediaPath = imageBase64 ? null : await fetchMediaPath();
      if (!imageBase64 && mediaPath) {
        const downloadUrl = mediaPath.startsWith("http")
          ? mediaPath
          : `https://wappfly.com${mediaPath.startsWith("/") ? "" : "/"}${mediaPath}`;
        try {
          const r = await fetch(downloadUrl, { headers: { "X-API-Token": wappflyToken } });
          if (!r.ok) {
            console.error(`wappfly media download ${downloadUrl} -> HTTP ${r.status}`);
          } else {
            const buf = new Uint8Array(await r.arrayBuffer());
            const hex = Array.from(buf.slice(0, 16)).map((x) => x.toString(16).padStart(2, "0")).join("");
            if (!isImageMagic(buf)) {
              console.error(`wappfly media download ${downloadUrl} -> not an image (${buf.length} bytes, first16=${hex})`);
            } else {
              imageBase64 = bytesToBase64(buf);
              console.log(`wappfly downloaded ${buf.length} bytes, magic=${hex.slice(0, 8)}`);
            }
          }
        } catch (err) {
          console.error(`wappfly media download error: ${(err as Error).message}`);
        }
      } else if (!imageBase64) {
        console.error(`wappfly image: media_path not yet available for msg_id=${msgId}`);
      }


      // Upload to storage (only if we have real image bytes)
      let receiptImageUrl: string | null = null;
      if (imageBase64) {
        try {
          const byteString = atob(imageBase64);
          const ab = new ArrayBuffer(byteString.length);
          const ia = new Uint8Array(ab);
          for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
          const blob = new Blob([ab], { type: mediaType });
          const now = new Date();
          const path = `${employee.company_id}/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getTime()}_whatsapp_${employee.id}.jpg`;
          const { error: upErr } = await supabase.storage.from("receipts").upload(path, blob, { upsert: false });
          if (!upErr) {
            const { data: urlData } = supabase.storage.from("receipts").getPublicUrl(path);
            receiptImageUrl = urlData.publicUrl;
          }
        } catch (e) {
          console.error("Receipt upload failed:", e);
        }
      }

      // Parse via AI (only when we actually have image bytes)
      let parsed: any = null;
      if (imageBase64) {
        try {
          const parseRes = await fetch(`${supabaseUrl}/functions/v1/parse-receipt`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${supabaseKey}` },
            body: JSON.stringify({ image_base64: imageBase64, media_type: mediaType, country_code: countryCode }),
          });
          if (parseRes.ok) {
            const pd = await parseRes.json();
            if (!pd.error) parsed = pd;
          }
        } catch (e) {
          console.error("parse-receipt failed:", e);
        }
      }

      if (!parsed || !parsed.amount) {
        const { data: newExp } = await supabase.from("expenses").insert({
          company_id: employee.company_id,
          employee_id: employee.id,
          employee_name: employee.name,
          employee_phone: employee.phone_number,
          date: new Date().toISOString().split("T")[0],
          amount: 0, currency: baseCurrency, status: "pending", source: "whatsapp",
          receipt_image_url: receiptImageUrl,
          notes: [imageCaption, imageBase64 ? "Receipt could not be parsed automatically — please complete manually" : "Wappfly did not provide a downloadable receipt image — please complete manually"].filter(Boolean).join(" — "),
          policy_flag: true,
          policy_flag_reason: imageBase64 ? "Auto-parse failed — needs manual entry" : "Wappfly media download unavailable — needs manual entry",
        }).select("id").single();
        if (newExp) {
          await supabase.from("audit_log").insert({
            company_id: employee.company_id, action: "create", table_name: "expenses", record_id: newExp.id,
            new_values: { source: "whatsapp", status: "unparsed", receipt_image_url: receiptImageUrl } as any,
          });
        }
        await sendWhatsApp(supabaseUrl, supabaseKey, rawFrom,
          "📸 Receipt received but I couldn't read it automatically.\nIt's saved in TEX as a pending expense — please open the app to fill in the vendor and amount, or your manager will complete it for you.\n\nReply STATUS to see your recent expenses.",
          scopedCompanyId);
        return new Response(JSON.stringify({ ok: true, status: "parse_failed" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // FX conversion
      const expenseCurrency = parsed.currency || baseCurrency;
      let baseAmount = parsed.amount;
      let exchangeRate = 1;
      if (expenseCurrency !== baseCurrency) {
        const { data: pegs } = await supabase.from("currency_pegs").select("from_currency, to_currency, rate");
        const { data: fxRates } = await supabase.from("fx_rates")
          .select("from_currency, to_currency, rate, date").eq("to_currency", "USD");
        const toUsd = (cur: string): number | null => {
          if (cur === "USD") return 1;
          const peg = (pegs || []).find((p: any) => p.from_currency === cur);
          if (peg) return peg.rate;
          const r = (fxRates || []).filter((r: any) => r.from_currency === cur)
            .sort((a: any, b: any) => b.date.localeCompare(a.date));
          return r.length > 0 ? 1 / r[0].rate : null;
        };
        const fromUsd = (cur: string): number | null => {
          if (cur === "USD") return 1;
          const peg = (pegs || []).find((p: any) => p.from_currency === cur);
          if (peg) return 1 / peg.rate;
          const r = (fxRates || []).filter((r: any) => r.from_currency === cur)
            .sort((a: any, b: any) => b.date.localeCompare(a.date));
          return r.length > 0 ? r[0].rate : null;
        };
        const fr = toUsd(expenseCurrency); const tr = fromUsd(baseCurrency);
        if (fr && tr) {
          baseAmount = Math.round(parsed.amount * fr * tr * 100) / 100;
          exchangeRate = Math.round((baseAmount / parsed.amount) * 1000000) / 1000000;
        }
      }

      // Policy + date sanity + duplicate
      let policyFlag = false;
      let policyFlagReason: string | null = null;

      const todayStr = new Date().toISOString().split("T")[0];
      const rawDate = typeof parsed.date === "string" ? parsed.date.trim() : "";
      let dateUnreadable = false;
      if (!rawDate || !/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
        dateUnreadable = !!rawDate || parsed.date != null;
        parsed.date = null;
      } else {
        const d = new Date(`${rawDate}T00:00:00Z`);
        const now = new Date();
        const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
        const diff = Math.round((today.getTime() - d.getTime()) / 86_400_000);
        if (Number.isNaN(d.getTime()) || diff > 365 || diff < -1) {
          dateUnreadable = true; parsed.date = null;
        }
      }
      if (dateUnreadable) {
        policyFlag = true;
        policyFlagReason = "Date unreadable on receipt — used submission date";
      }

      // Duplicate detection
      let duplicateMatch: any = null;
      const candVendor = (parsed.vendor || "").trim();
      const candDate = parsed.date || todayStr;
      if (candVendor && parsed.amount && expenseCurrency) {
        const addDays = (s: string, d: number) => {
          const dt = new Date(s + "T00:00:00Z"); dt.setUTCDate(dt.getUTCDate() + d);
          return dt.toISOString().split("T")[0];
        };
        const { data: dups } = await supabase.from("expenses")
          .select("id, vendor, date, amount, currency, status")
          .eq("company_id", employee.company_id).eq("employee_id", employee.id)
          .eq("amount", parsed.amount).eq("currency", expenseCurrency).neq("status", "rejected")
          .gte("date", addDays(candDate, -3)).lte("date", addDays(candDate, 3));
        const cvl = candVendor.toLowerCase();
        const hit = (dups || []).find((r: any) => (r.vendor || "").trim().toLowerCase() === cvl);
        if (hit) {
          duplicateMatch = hit;
          const dr = `Possible duplicate of ${hit.vendor} on ${hit.date} for ${hit.currency} ${hit.amount}`;
          policyFlag = true;
          policyFlagReason = policyFlagReason ? `${policyFlagReason} | ${dr}` : dr;
        }
      }

      // Trip linking
      let tripId: string | null = null;
      let tripName: string | null = null;
      const { data: tripPref } = await supabase.from("audit_log")
        .select("new_values").eq("record_id", employee.id)
        .eq("action", "trip_select").eq("table_name", "employees")
        .order("created_at", { ascending: false }).limit(1);
      if (tripPref && tripPref.length > 0) {
        const pv = tripPref[0].new_values as any;
        if (pv?.trip_id) {
          const { data: pt } = await supabase.from("trips")
            .select("id, name, status").eq("id", pv.trip_id).eq("status", "open").single();
          if (pt) { tripId = pt.id; tripName = pt.name; }
        }
      }
      if (!tripId && tripLinkingMode !== "manual") {
        const r = await resolveTrip(supabase, employee, tripLinkingMode);
        tripId = r.trip_id; tripName = r.trip_name;
      }

      const { data: newExp } = await supabase.from("expenses").insert({
        company_id: employee.company_id,
        employee_id: employee.id,
        employee_name: employee.name,
        employee_phone: employee.phone_number,
        vendor: parsed.vendor || null,
        date: parsed.date || todayStr,
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
      }).select("id").single();

      if (newExp) {
        await supabase.from("audit_log").insert({
          company_id: employee.company_id, action: "create",
          table_name: "expenses", record_id: newExp.id,
          new_values: { source: "whatsapp", vendor: parsed.vendor, amount: parsed.amount, trip_id: tripId } as any,
        });
      }

      let confirm = `✓ Expense received — TEX\nVendor: ${parsed.vendor || "Unknown"}\nAmount: ${expenseCurrency} ${parsed.amount}`;
      if (expenseCurrency !== baseCurrency) confirm += ` (${baseCurrency} ${baseAmount})`;
      confirm += `\nDate: ${parsed.date || todayStr}`;
      if (tripName) confirm += `\nTrip: ${tripName}`;
      if (parsed.tax_id_number) confirm += `\nTax ID: ${parsed.tax_id_number} ✓`;
      if (duplicateMatch) confirm += `\n\n⚠️ This looks like a possible duplicate of ${duplicateMatch.vendor} on ${duplicateMatch.date} — flagged for review.`;
      confirm += "\n\nReply STATUS to see your recent expenses.";
      await sendWhatsApp(supabaseUrl, supabaseKey, rawFrom, confirm, scopedCompanyId);

      return new Response(JSON.stringify({ ok: true, status: "expense_created", id: newExp?.id, trip_id: tripId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Unknown
    await sendWhatsApp(supabaseUrl, supabaseKey, rawFrom,
      `Hi ${pushname}. Send a receipt photo to log an expense, or reply HELP for instructions.`,
      scopedCompanyId);
    return new Response(JSON.stringify({ ok: true, status: "unknown_type" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("wappfly-webhook error:", e);
    return new Response(
      JSON.stringify({ ok: false, error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
