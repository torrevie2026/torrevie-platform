import makeWASocket, {
  DisconnectReason,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  useMultiFileAuthState
} from "@whiskeysockets/baileys";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { hostname } from "node:os";
import { join, resolve } from "node:path";
import { clearInterval, setInterval as startInterval } from "node:timers";
import { setTimeout as sleep } from "node:timers/promises";
import { URLSearchParams } from "node:url";
import { Client } from "pg";
import pino from "pino";
import QRCode from "qrcode";

loadLocalEnv();

if (process.argv.includes("--help")) {
  console.log(`
Usage:
  pnpm tex:quick-connect:connector

Environment:
  DATABASE_URL | POSTGRES_URL | SUPABASE_DB_URL   Optional Postgres connection string
  NEXT_PUBLIC_SUPABASE_URL                        Supabase URL fallback when no database URL exists
  SUPABASE_SERVICE_ROLE_KEY                       Server-only key for Supabase REST fallback
  TEX_QUICK_CONNECT_MANUAL_SESSION_ID=<uuid>      Manual QR smoke-test mode without database access
  TEX_QUICK_CONNECT_QR_OUTPUT_FILE=<path>         Optional file for manual QR data URL output
  TORREVIE_DATABASE_SSL=true                      Enable TLS for hosted Supabase
  TEX_QUICK_CONNECT_TENANT_ID=<uuid>              Optional tenant filter
  TEX_QUICK_CONNECT_SESSION_DIR=<path>            Local auth state directory
  TEX_QUICK_CONNECT_POLL_MS=5000                  Poll interval
  TEX_QUICK_CONNECT_HEARTBEAT_MS=30000            Connector heartbeat interval
`);
  process.exit(0);
}

const databaseUrl = optionalEnv("DATABASE_URL", "POSTGRES_URL", "SUPABASE_DB_URL");
const supabaseUrl = optionalEnv("NEXT_PUBLIC_SUPABASE_URL");
const supabaseServiceRoleKey = optionalEnv("SUPABASE_SERVICE_ROLE_KEY");
const sessionRoot = resolve(process.env.TEX_QUICK_CONNECT_SESSION_DIR || ".tex-quick-connect-sessions");
const pollMs = Number(process.env.TEX_QUICK_CONNECT_POLL_MS || 5000);
const qrTtlSeconds = Number(process.env.TEX_QUICK_CONNECT_QR_TTL_SECONDS || 55);
const tenantFilter = process.env.TEX_QUICK_CONNECT_TENANT_ID?.trim() || null;
const manualSessionId = optionalEnv("TEX_QUICK_CONNECT_MANUAL_SESSION_ID");
const manualMode = Boolean(manualSessionId && tenantFilter);
const maxSessions = Number(process.env.TEX_QUICK_CONNECT_MAX_SESSIONS || 5);
const heartbeatMs = Number(process.env.TEX_QUICK_CONNECT_HEARTBEAT_MS || 30000);
const connectorInstanceId =
  optionalEnv("TEX_QUICK_CONNECT_INSTANCE_ID") || `${hostname()}:${process.pid}`;
const activeSessions = new Map();
const logger = pino({ level: process.env.TEX_QUICK_CONNECT_LOG_LEVEL || "info" });

if (!manualMode && !databaseUrl && (!supabaseUrl || !supabaseServiceRoleKey)) {
  throw new Error(
    "Configure DATABASE_URL/POSTGRES_URL/SUPABASE_DB_URL or NEXT_PUBLIC_SUPABASE_URL with SUPABASE_SERVICE_ROLE_KEY."
  );
}

mkdirSync(sessionRoot, { recursive: true });

logger.info(
  {
    dataAccess: databaseUrl ? "postgres" : "supabase-rest",
    heartbeatMs,
    instanceId: connectorInstanceId,
    manualMode,
    maxSessions,
    pollMs,
    sessionRoot,
    tenantFilter: tenantFilter ?? "all"
  },
  "TEX Quick Connect connector starting"
);

let shuttingDown = false;
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

if (manualMode) {
  await startTenantSocket({
    id: manualSessionId,
    pairing_code: null,
    status: "qr_pending",
    tenant_id: tenantFilter
  });
}

while (!shuttingDown) {
  try {
    if (!manualMode) {
      await pollPendingSessions();
    }
  } catch (error) {
    logger.error({ error: errorMessage(error) }, "Quick Connect polling failed");
  }

  await sleep(pollMs);
}

async function pollPendingSessions() {
  const sessions = await getPendingSessions();

  for (const session of sessions) {
    if (activeSessions.has(session.tenant_id)) {
      continue;
    }

    void startTenantSocket(session).catch(async (error) => {
      stopTenantRuntime(session.tenant_id);
      logger.error(
        { error: errorMessage(error), tenantId: session.tenant_id },
        "Quick Connect socket failed"
      );
      await markFailed(session, errorMessage(error));
    });
  }
}

async function startTenantSocket(session) {
  activeSessions.set(session.tenant_id, { startedAt: new Date().toISOString() });
  await insertQuickConnectEvent(session, {
    eventType: "quick_connect.connector_started",
    status: session.status,
    message: "Quick Connect connector started a WhatsApp linked-device socket.",
    metadata: {
      instance_id: connectorInstanceId
    }
  });

  const authDirectory = join(sessionRoot, session.tenant_id);
  mkdirSync(authDirectory, { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(authDirectory);
  const { version } = await fetchLatestBaileysVersion();
  const sock = makeWASocket({
    auth: state,
    browser: ["Torrevie TEX", "Chrome", "1.0.0"],
    logger: logger.child({ tenantId: session.tenant_id }),
    markOnlineOnConnect: false,
    printQRInTerminal: false,
    syncFullHistory: false,
    version
  });

  activeSessions.set(session.tenant_id, {
    heartbeatTimer: startHeartbeat(session),
    sessionId: session.id,
    sock,
    startedAt: new Date().toISOString()
  });

  sock.ev.on("creds.update", saveCreds);
  sock.ev.on("connection.update", async (update) => {
    try {
      await handleConnectionUpdate(session, sock, update);
    } catch (error) {
      logger.error(
        { error: errorMessage(error), tenantId: session.tenant_id },
        "Quick Connect update handler failed"
      );
    }
  });
  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") {
      return;
    }

    for (const message of messages) {
      try {
        await handleInboundMessage(session, sock, message);
      } catch (error) {
        logger.error(
          { error: errorMessage(error), tenantId: session.tenant_id },
          "Quick Connect inbound message handling failed"
        );
      }
    }
  });
}

async function handleConnectionUpdate(session, sock, update) {
  if (update.qr) {
    const qrCodeData = await QRCode.toDataURL(update.qr, {
      errorCorrectionLevel: "M",
      margin: 2,
      scale: 8
    });
    const expiresAt = new Date(Date.now() + qrTtlSeconds * 1000).toISOString();

    await updateQuickConnectSession(session, {
      error: null,
      qr_code_data: qrCodeData,
      qr_expires_at: expiresAt,
      status: "qr_pending",
      updated_at: new Date().toISOString()
    });
    await insertQuickConnectEvent(session, {
      eventType: "quick_connect.qr.generated",
      status: "qr_pending",
      message: "WhatsApp linked-device QR generated and sent to TEX.",
      metadata: {
        qr_expires_at: expiresAt
      }
    });
    logger.info({ tenantId: session.tenant_id }, "Quick Connect QR generated");
  }

  if (update.connection === "open") {
    const connectedPhone = sock.user?.id ?? null;
    const now = new Date().toISOString();
    await updateQuickConnectSession(session, {
      connected_at: now,
      connected_phone: connectedPhone,
      error: null,
      last_seen_at: now,
      qr_code_data: null,
      qr_expires_at: null,
      status: "connected",
      updated_at: now
    });
    await insertQuickConnectEvent(session, {
      eventType: "quick_connect.connected",
      status: "connected",
      message: "WhatsApp linked-device session connected.",
      metadata: {
        connected_phone: connectedPhone ?? ""
      }
    });
    logger.info({ connectedPhone, tenantId: session.tenant_id }, "Quick Connect connected");
  }

  if (update.connection === "close") {
    const statusCode = statusCodeFromDisconnect(update.lastDisconnect?.error);
    const shouldReconnect = statusCode !== DisconnectReason.loggedOut && !shuttingDown;

    stopTenantRuntime(session.tenant_id);

    if (shuttingDown) {
      await insertQuickConnectEvent(session, {
        eventType: "quick_connect.connector_stopping",
        status: session.status,
        message: "WhatsApp socket closed because the Quick Connect connector is stopping.",
        metadata: {
          instance_id: connectorInstanceId,
          status_code: String(statusCode ?? "")
        }
      });
      return;
    }

    if (shouldReconnect) {
      await insertQuickConnectEvent(session, {
        eventType: "quick_connect.reconnecting",
        status: "qr_pending",
        message: "WhatsApp socket closed and will reconnect.",
        metadata: {
          instance_id: connectorInstanceId,
          status_code: String(statusCode ?? "")
        }
      });
      await sleep(2000);
      if (!activeSessions.has(session.tenant_id) && !shuttingDown) {
        void startTenantSocket(session);
      }
      return;
    }

    await updateQuickConnectSession(session, {
      qr_code_data: null,
      qr_expires_at: null,
      status: "disconnected",
      updated_at: new Date().toISOString()
    });
    await insertQuickConnectEvent(session, {
      eventType: "quick_connect.disconnected",
      status: "disconnected",
      message: "WhatsApp linked-device session disconnected.",
      metadata: {
        instance_id: connectorInstanceId,
        status_code: String(statusCode ?? "")
      }
    });
  }
}

async function handleInboundMessage(session, sock, message) {
  if (!message.message || message.key.fromMe) {
    return;
  }

  const messageId = message.key.id || randomUUID();
  const remoteJid = message.key.remoteJid || null;
  const text =
    message.message.conversation ||
    message.message.extendedTextMessage?.text ||
    message.message.imageMessage?.caption ||
    message.message.documentMessage?.caption ||
    "";
  const hasMedia = Boolean(message.message.imageMessage || message.message.documentMessage);
  let mediaInfo = null;

  if (hasMedia) {
    mediaInfo = await downloadMessageMedia(sock, message);
  }

  const processing = await processQuickConnectIngest(session, {
    mediaInfo,
    message,
    messageId,
    remoteJid,
    text
  }).catch(async (error) => {
    const errorText = errorMessage(error);
    await recordQuickConnectSubmission(session, {
      mediaInfo,
      message,
      messageId,
      remoteJid,
      text
    });
    await insertQuickConnectEvent(session, {
      eventType: "quick_connect.ingest_failed",
      status: "connected",
      message: "Quick Connect could not run the TEX OCR ingest workflow.",
      metadata: {
        error: errorText,
        message_id: messageId,
        remote_jid: remoteJid ?? ""
      }
    });
    logger.warn(
      { error: errorText, messageId, tenantId: session.tenant_id },
      "Quick Connect ingest failed"
    );
    return {
      error: errorText,
      expenseId: null,
      ocrStatus: "failed",
      replyText: fallbackQuickConnectReply(hasMedia),
      status: "failed",
      submissionId: null
    };
  });
  const acknowledgement = await sendQuickConnectAcknowledgement(session, sock, {
    hasMedia,
    messageId,
    remoteJid,
    replyText: processing.replyText
  });
  const now = new Date().toISOString();
  await updateQuickConnectSession(session, {
    last_seen_at: now,
    updated_at: now
  });
  await insertQuickConnectEvent(session, {
    eventType: "quick_connect.message_received",
    status: "connected",
    message: hasMedia ? "Inbound WhatsApp media received." : "Inbound WhatsApp message received.",
    metadata: {
      acknowledgement_status: acknowledgement.status,
      acknowledgement_error: acknowledgement.error ?? "",
      expense_id: processing.expenseId ?? "",
      message_id: messageId,
      ocr_status: processing.ocrStatus ?? "",
      remote_jid: remoteJid ?? ""
    }
  });
}

async function sendQuickConnectAcknowledgement(session, sock, input) {
  if (!input.remoteJid) {
    return { error: "Missing remote JID.", status: "skipped" };
  }

  const text = input.replyText?.trim() || fallbackQuickConnectReply(input.hasMedia);

  try {
    const result = await sock.sendMessage(input.remoteJid, { text });
    await insertQuickConnectEvent(session, {
      eventType: "quick_connect.acknowledgement_sent",
      status: "connected",
      message: "Quick Connect sent a linked-device WhatsApp acknowledgement.",
      metadata: {
        message_id: input.messageId,
        outbound_message_id: result?.key?.id ?? "",
        remote_jid: input.remoteJid
      }
    });
    logger.info(
      { messageId: input.messageId, tenantId: session.tenant_id },
      "Quick Connect acknowledgement sent"
    );
    return { error: null, status: "sent" };
  } catch (error) {
    const errorText = errorMessage(error);
    await insertQuickConnectEvent(session, {
      eventType: "quick_connect.acknowledgement_failed",
      status: "connected",
      message: "Quick Connect could not send the linked-device WhatsApp acknowledgement.",
      metadata: {
        error: errorText,
        message_id: input.messageId,
        remote_jid: input.remoteJid
      }
    });
    logger.warn(
      { error: errorText, messageId: input.messageId, tenantId: session.tenant_id },
      "Quick Connect acknowledgement failed"
    );
    return { error: errorText, status: "failed" };
  }
}

async function processQuickConnectIngest(session, input) {
  if (!quickConnectIngestUrl() || !supabaseServiceRoleKey) {
    throw new Error("Quick Connect ingest endpoint or service role key is not configured.");
  }

  const payload = {
    media: input.mediaInfo
      ? {
          dataBase64: input.mediaInfo.dataBase64,
          fileName: input.mediaInfo.fileName,
          mimeType: input.mediaInfo.mimeType
        }
      : null,
    messageId: input.messageId,
    messageText: input.text,
    payload: {
      key: input.message.key,
      messageTimestamp: input.message.messageTimestamp,
      mediaInfo: input.mediaInfo
        ? {
            bufferLength: input.mediaInfo.bufferLength,
            fileName: input.mediaInfo.fileName,
            mediaType: input.mediaInfo.mediaType,
            mimeType: input.mediaInfo.mimeType
          }
        : null,
      source: "quick_connect"
    },
    senderPhone: jidToPhone(input.remoteJid),
    senderRaw: jidToPhone(input.remoteJid),
    sessionId: session.id,
    tenantId: session.tenant_id,
    whatsappChatJid: input.remoteJid
  };
  const response = await fetch(quickConnectIngestUrl(), {
    body: JSON.stringify(payload),
    headers: {
      Authorization: `Bearer ${supabaseServiceRoleKey}`,
      "Content-Type": "application/json"
    },
    method: "POST"
  });
  const bodyText = await response.text();
  const body = bodyText ? JSON.parse(bodyText) : {};

  if (!response.ok) {
    throw new Error(`TEX Quick Connect ingest failed: ${response.status} ${body.error ?? bodyText}`);
  }

  await insertQuickConnectEvent(session, {
    eventType: "quick_connect.ingest_processed",
    status: "connected",
    message: "Quick Connect processed inbound WhatsApp content through TEX OCR ingest.",
    metadata: {
      expense_id: body.expense?.id ?? "",
      message_id: input.messageId,
      ocr_status: body.ocrStatus ?? "",
      receipt_file_id: body.receipt?.id ?? "",
      remote_jid: input.remoteJid ?? "",
      submission_id: body.submission?.id ?? ""
    }
  });

  return {
    error: null,
    expenseId: body.expense?.id ?? null,
    ocrStatus: body.ocrStatus ?? null,
    replyText: body.replyText || fallbackQuickConnectReply(Boolean(input.mediaInfo)),
    status: "processed",
    submissionId: body.submission?.id ?? null
  };
}

function fallbackQuickConnectReply(hasMedia) {
  return hasMedia
    ? "Receipt received by TEX. It has been queued for finance review."
    : "Message received by TEX. Send a receipt photo or document to queue it for finance review.";
}

async function downloadMessageMedia(sock, message) {
  const buffer = await downloadMediaMessage(
    message,
    "buffer",
    {},
    {
      logger,
      reuploadRequest: sock.updateMediaMessage
    }
  );
  const image = message.message?.imageMessage;
  const document = message.message?.documentMessage;

  return {
    bufferLength: Buffer.isBuffer(buffer) ? buffer.length : 0,
    dataBase64: Buffer.isBuffer(buffer) ? buffer.toString("base64") : "",
    fileName: document?.fileName || "whatsapp-receipt",
    mediaType: image ? "image" : "document",
    mimeType: image?.mimetype || document?.mimetype || null
  };
}

async function recordQuickConnectSubmission(session, input) {
  const payload = {
    key: input.message.key,
    messageTimestamp: input.message.messageTimestamp,
    mediaInfo: input.mediaInfo,
    source: "quick_connect"
  };
  await insertWhatsappSubmission({
    media_mime_type: input.mediaInfo?.mimeType ?? null,
    message_id: input.messageId,
    message_text: input.text,
    message_type: input.mediaInfo ? "receipt" : "text",
    payload,
    sender_phone: jidToPhone(input.remoteJid),
    sender_raw: jidToPhone(input.remoteJid),
    session_id: session.id,
    status: "open",
    tenant_id: session.tenant_id,
    whatsapp_chat_jid: input.remoteJid
  });
}

async function markFailed(session, error) {
  await updateQuickConnectSession(session, {
    error: error.slice(0, 500),
    status: "failed",
    updated_at: new Date().toISOString()
  });
  await insertQuickConnectEvent(session, {
    eventType: "quick_connect.failed",
    status: "failed",
    message: error.slice(0, 500),
    metadata: {}
  });
}

async function getPendingSessions() {
  if (!databaseUrl) {
    const params = new URLSearchParams({
      limit: String(maxSessions),
      or: "(status.in.(qr_pending,connected),and(status.eq.disconnected,connected_phone.not.is.null))",
      order: "updated_at.desc",
      select: "id,tenant_id,status,pairing_code"
    });
    if (tenantFilter) {
      params.set("tenant_id", `eq.${tenantFilter}`);
    }

    return supabaseFetch(`/rest/v1/tex_quick_connect_sessions?${params.toString()}`);
  }

  return queryRows(
    `
      select id, tenant_id, status, pairing_code
      from public.tex_quick_connect_sessions
      where (
          status in ('qr_pending', 'connected')
          or (status = 'disconnected' and connected_phone is not null)
        )
        and ($1::uuid is null or tenant_id = $1::uuid)
      order by updated_at desc
      limit $2
    `,
    [tenantFilter, maxSessions]
  );
}

async function updateQuickConnectSession(session, patch) {
  if (manualMode) {
    if (patch.qr_code_data && process.env.TEX_QUICK_CONNECT_QR_OUTPUT_FILE) {
      await import("node:fs/promises").then(({ writeFile }) =>
        writeFile(resolve(process.env.TEX_QUICK_CONNECT_QR_OUTPUT_FILE), patch.qr_code_data, "utf8")
      );
    }
    logger.info({ patchKeys: Object.keys(patch), tenantId: session.tenant_id }, "Manual session update");
    return;
  }

  if (!databaseUrl) {
    await supabaseFetch(
      `/rest/v1/tex_quick_connect_sessions?id=eq.${session.id}&tenant_id=eq.${session.tenant_id}`,
      {
        body: JSON.stringify(patch),
        headers: {
          Prefer: "return=minimal"
        },
        method: "PATCH"
      }
    );
    return;
  }

  const entries = Object.entries(patch);
  if (entries.length === 0) {
    return;
  }

  const assignments = entries.map(([key], index) => `${key} = $${index + 1}`).join(", ");
  await queryRows(
    `
      update public.tex_quick_connect_sessions
         set ${assignments}
       where id = $${entries.length + 1}
         and tenant_id = $${entries.length + 2}
    `,
    [...entries.map(([, value]) => value), session.id, session.tenant_id]
  );
}

async function insertWhatsappSubmission(row) {
  if (manualMode) {
    logger.info(
      { messageId: row.message_id, tenantId: row.tenant_id },
      "Manual mode received WhatsApp submission"
    );
    return;
  }

  if (!databaseUrl) {
    try {
      await supabaseFetch("/rest/v1/tex_unregistered_whatsapp_submissions", {
        body: JSON.stringify(row),
        headers: {
          Prefer: "return=minimal"
        },
        method: "POST"
      });
      return;
    } catch (error) {
      if (!isDuplicateError(error) || !row.message_id) {
        throw error;
      }

      await supabaseFetch(
        `/rest/v1/tex_unregistered_whatsapp_submissions?tenant_id=eq.${row.tenant_id}&message_id=eq.${row.message_id}`,
        {
          body: JSON.stringify({
            media_mime_type: row.media_mime_type,
            message_text: row.message_text,
            message_type: row.message_type,
            payload: row.payload,
            updated_at: new Date().toISOString()
          }),
          headers: {
            Prefer: "return=minimal"
          },
          method: "PATCH"
        }
      );
      return;
    }
  }

  await queryRows(
    `
      insert into public.tex_unregistered_whatsapp_submissions (
        tenant_id,
        sender_raw,
        sender_phone,
        whatsapp_chat_jid,
        message_id,
        session_id,
        message_text,
        message_type,
        media_mime_type,
        payload,
        status
      )
      values (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        $10::jsonb,
        $11
      )
      on conflict (tenant_id, message_id)
      where message_id is not null
      do update set
        message_text = excluded.message_text,
        message_type = excluded.message_type,
        media_mime_type = excluded.media_mime_type,
        payload = excluded.payload,
        updated_at = now()
    `,
    [
      row.tenant_id,
      row.sender_raw,
      row.sender_phone,
      row.whatsapp_chat_jid,
      row.message_id,
      row.session_id,
      row.message_text,
      row.message_type,
      row.media_mime_type,
      JSON.stringify(row.payload),
      row.status
    ]
  );
}

async function insertQuickConnectEvent(session, event) {
  const row = {
    direction: "system",
    event_type: event.eventType,
    message: event.message,
    metadata: event.metadata,
    session_id: session.id,
    status: event.status,
    tenant_id: session.tenant_id
  };

  if (manualMode) {
    logger.info({ event: row, tenantId: session.tenant_id }, "Manual Quick Connect event");
    return;
  }

  if (!databaseUrl) {
    await supabaseFetch("/rest/v1/tex_quick_connect_events", {
      body: JSON.stringify(row),
      headers: {
        Prefer: "return=minimal"
      },
      method: "POST"
    });
    return;
  }

  await queryRows(
    `
      insert into public.tex_quick_connect_events (
        tenant_id,
        session_id,
        event_type,
        direction,
        status,
        message,
        metadata
      )
      values ($1, $2, $3, 'system', $4, $5, $6::jsonb)
    `,
    [
      row.tenant_id,
      row.session_id,
      row.event_type,
      row.status,
      row.message,
      JSON.stringify(row.metadata)
    ]
  );
}

async function supabaseFetch(path, init = {}) {
  const response = await fetch(`${supabaseUrl}${path}`, {
    ...init,
    headers: {
      apikey: supabaseServiceRoleKey,
      Authorization: `Bearer ${supabaseServiceRoleKey}`,
      "Content-Type": "application/json",
      ...(init.headers || {})
    }
  });

  if (!response.ok) {
    const body = await response.text();
    const error = new Error(`Supabase REST ${response.status}: ${body}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }

  if (response.status === 204) {
    return [];
  }

  const text = await response.text();
  return text ? JSON.parse(text) : [];
}

async function queryRows(sql, values = []) {
  const client = new Client({
    connectionString: databaseUrl,
    ssl: databaseSslConfig()
  });
  await client.connect();

  try {
    const result = await client.query(sql, values);
    return result.rows;
  } finally {
    await client.end();
  }
}

function statusCodeFromDisconnect(error) {
  return error?.output?.statusCode ?? error?.statusCode ?? null;
}

function startHeartbeat(session) {
  if (!Number.isFinite(heartbeatMs) || heartbeatMs <= 0) {
    return null;
  }

  return startInterval(() => {
    void insertQuickConnectEvent(session, {
      eventType: "quick_connect.connector_heartbeat",
      status: session.status,
      message: "Quick Connect connector heartbeat.",
      metadata: {
        instance_id: connectorInstanceId
      }
    }).catch((error) => {
      logger.warn(
        { error: errorMessage(error), tenantId: session.tenant_id },
        "Quick Connect heartbeat failed"
      );
    });
  }, heartbeatMs);
}

function stopTenantRuntime(tenantId) {
  const runtime = activeSessions.get(tenantId);
  if (runtime?.heartbeatTimer) {
    clearInterval(runtime.heartbeatTimer);
  }
  activeSessions.delete(tenantId);
}

function jidToPhone(jid) {
  return jid?.replace(/@(c|s)\.whatsapp\.net$/i, "").replace(/\D/g, "") || null;
}

function databaseSslConfig() {
  if (process.env.TORREVIE_DATABASE_SSL !== "true") {
    return undefined;
  }

  return {
    rejectUnauthorized: process.env.TORREVIE_DATABASE_SSL_REJECT_UNAUTHORIZED === "true"
  };
}

function optionalEnv(...keys) {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value && value !== '""' && value !== "''") {
      return value;
    }
  }

  return null;
}

function quickConnectIngestUrl() {
  const explicit = optionalEnv("TEX_QUICK_CONNECT_INGEST_URL");
  if (explicit) {
    return explicit;
  }

  const baseUrl =
    optionalEnv("NEXT_PUBLIC_CUSTOMER_PORTAL_URL", "CUSTOMER_PORTAL_URL", "APP_URL") ||
    "https://app.torrevie.com";
  return `${baseUrl.replace(/\/+$/, "")}/api/tex/quick-connect/ingest`;
}

function isDuplicateError(error) {
  return error?.status === 409 || String(error?.body || "").includes("23505");
}

function loadLocalEnv() {
  for (const fileName of [".env.local", ".env"]) {
    if (!existsSync(fileName)) {
      continue;
    }

    const lines = readFileSync(fileName, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      const separator = trimmed.indexOf("=");
      if (separator === -1) {
        continue;
      }

      const key = trimmed.slice(0, separator).trim();
      let value = trimmed.slice(separator + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = process.env[key] || value;
    }
  }
}

async function shutdown() {
  shuttingDown = true;
  logger.info("TEX Quick Connect connector shutting down");

  for (const [tenantId, runtime] of activeSessions) {
    try {
      runtime.sock?.end?.();
    } catch (error) {
      logger.warn({ error: errorMessage(error), tenantId }, "Unable to close Quick Connect socket");
    }
    stopTenantRuntime(tenantId);
  }
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
