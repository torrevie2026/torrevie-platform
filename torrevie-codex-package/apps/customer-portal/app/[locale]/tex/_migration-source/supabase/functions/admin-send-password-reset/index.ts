import * as React from "npm:react@18.3.1";
import { renderAsync } from "npm:@react-email/components@0.0.22";
import { createClient } from "npm:@supabase/supabase-js@2";
import { RecoveryEmail } from "../_shared/email-templates/recovery.tsx";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SITE_NAME = "TEX";
const SENDER_DOMAIN = "notify.tex.torrevie.com";
const FROM_DOMAIN = "notify.tex.torrevie.com";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await admin.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) return json({ error: "Invalid token" }, 401);
    const callerId = claimsData.claims.sub as string;

    const { data: caller } = await admin
      .from("profiles")
      .select("super_admin, role, company_id")
      .eq("id", callerId)
      .single();

    const isSuper = !!caller?.super_admin;
    const isAdmin = caller?.role === "admin";
    if (!isSuper && !isAdmin) return json({ error: "Forbidden: admin only" }, 403);

    const body = await req.json().catch(() => ({}));
    const targetEmailRaw: string | undefined = body?.email;
    const targetUserId: string | undefined = body?.user_id;
    const redirectTo: string = body?.redirect_to || "https://tex.torrevie.com/set-password";

    if (!targetEmailRaw && !targetUserId) return json({ error: "email or user_id required" }, 400);

    // Resolve target user
    let email = (targetEmailRaw || "").trim().toLowerCase();
    let userId = targetUserId || "";
    if (!userId) {
      let page = 1;
      while (page <= 20 && !userId) {
        const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page, perPage: 200 });
        if (listErr) break;
        const found = list.users.find((u) => (u.email || "").toLowerCase() === email);
        if (found) {
          userId = found.id;
          email = found.email!.toLowerCase();
        }
        if (!list.users.length || list.users.length < 200) break;
        page++;
      }
      if (!userId) return json({ error: "User not found" }, 404);
    } else {
      const { data: got, error: getErr } = await admin.auth.admin.getUserById(userId);
      if (getErr || !got?.user) return json({ error: "User not found" }, 404);
      email = got.user.email!.toLowerCase();
    }

    // Tenant scoping: admins can only reset users in their own company
    if (!isSuper) {
      const { data: targetProfile } = await admin
        .from("profiles")
        .select("company_id")
        .eq("id", userId)
        .single();
      if (!targetProfile || targetProfile.company_id !== caller?.company_id) {
        return json({ error: "Forbidden: target not in your company" }, 403);
      }
    }

    // Generate a recovery link (does not send email on its own)
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo },
    });
    if (linkErr || !linkData?.properties?.action_link) {
      return json({ error: linkErr?.message || "Failed to generate link" }, 500);
    }

    const actionLink = linkData.properties.action_link;

    // Render branded recovery email using the same template as auth-email-hook
    const html = await renderAsync(
      React.createElement(RecoveryEmail, { siteName: SITE_NAME, confirmationUrl: actionLink }),
    );
    const text = await renderAsync(
      React.createElement(RecoveryEmail, { siteName: SITE_NAME, confirmationUrl: actionLink }),
      { plainText: true },
    );

    // Enqueue directly into our own queue — bypasses the public /recover throttle
    const messageId = crypto.randomUUID();
    const idempotencyKey = `admin-recovery-${userId}-${Date.now()}`;

    await admin.from("email_send_log").insert({
      message_id: messageId,
      template_name: "recovery",
      recipient_email: email,
      status: "pending",
    });

    // Mint / reuse an unsubscribe token for this recipient (required for app-style sends)
    let unsubscribeToken: string;
    const { data: existingTok } = await admin
      .from("email_unsubscribe_tokens")
      .select("token")
      .eq("email", email)
      .maybeSingle();
    if (existingTok?.token) {
      unsubscribeToken = existingTok.token as string;
    } else {
      unsubscribeToken = crypto.randomUUID();
      await admin.from("email_unsubscribe_tokens").insert({ email, token: unsubscribeToken });
    }

    const { error: enqueueError } = await admin.rpc("enqueue_email", {
      queue_name: "auth_emails",
      payload: {
        message_id: messageId,
        to: email,
        from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
        sender_domain: SENDER_DOMAIN,
        subject: "Reset your TEX password",
        html,
        text,
        purpose: "transactional",
        label: "recovery",
        idempotency_key: idempotencyKey,
        unsubscribe_token: unsubscribeToken,
        queued_at: new Date().toISOString(),
      },
    });

    let emailSent = true;
    let emailError: string | null = null;
    if (enqueueError) {
      emailSent = false;
      emailError = enqueueError.message;
      await admin.from("email_send_log").insert({
        message_id: messageId,
        template_name: "recovery",
        recipient_email: email,
        status: "failed",
        error_message: `enqueue failed: ${enqueueError.message}`.slice(0, 1000),
      });
    }

    // Audit
    await admin.from("audit_log").insert({
      company_id: caller?.company_id ?? null,
      user_id: callerId,
      action: "admin_send_password_reset",
      table_name: "auth.users",
      record_id: userId,
      new_values: { email, email_sent: emailSent },
    });

    return json({
      success: true,
      user_id: userId,
      email,
      action_link: actionLink,
      email_sent: emailSent,
      email_error: emailError,
    });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
