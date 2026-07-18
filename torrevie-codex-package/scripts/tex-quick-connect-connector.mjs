import makeWASocket, {
  DisconnectReason,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  useMultiFileAuthState
} from "@whiskeysockets/baileys";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
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
  TEX_QUICK_CONNECT_RECONNECT_BASE_DELAY_MS=2000  Initial reconnect delay
  TEX_QUICK_CONNECT_RECONNECT_MAX_DELAY_MS=60000  Maximum reconnect delay
  TEX_QUICK_CONNECT_MAX_QR_PER_PAIRING=2          Stop QR registration loops after this many QR refs
  TEX_QUICK_CONNECT_ACKS_ENABLED=true             Send WhatsApp acknowledgement replies
  TEX_QUICK_CONNECT_ACKS_PER_TENANT_HOUR=10       Tenant-level outbound acknowledgement limit
  TEX_QUICK_CONNECT_ACKS_PER_CHAT_10M=3           Chat-level outbound acknowledgement limit
`);
  process.exit(0);
}

const databaseUrl = optionalEnv("DATABASE_URL", "POSTGRES_URL", "SUPABASE_DB_URL");
const supabaseUrl = optionalEnv("NEXT_PUBLIC_SUPABASE_URL");
const supabaseServiceRoleKey = optionalEnv("SUPABASE_SERVICE_ROLE_KEY");
const sessionRoot = resolve(process.env.TEX_QUICK_CONNECT_SESSION_DIR || ".tex-quick-connect-sessions");
const pollMs = Number(process.env.TEX_QUICK_CONNECT_POLL_MS || 5000);
const qrTtlSeconds = Number(process.env.TEX_QUICK_CONNECT_QR_TTL_SECONDS || 55);
const reconnectBaseDelayMs = Number(process.env.TEX_QUICK_CONNECT_RECONNECT_BASE_DELAY_MS || 2000);
const reconnectMaxDelayMs = Number(process.env.TEX_QUICK_CONNECT_RECONNECT_MAX_DELAY_MS || 60000);
const maxQrPerPairing = Number(process.env.TEX_QUICK_CONNECT_MAX_QR_PER_PAIRING || 2);
const acknowledgementsEnabled = process.env.TEX_QUICK_CONNECT_ACKS_ENABLED !== "false";
const ackPerTenantHour = Number(process.env.TEX_QUICK_CONNECT_ACKS_PER_TENANT_HOUR || 10);
const ackPerChatTenMinutes = Number(process.env.TEX_QUICK_CONNECT_ACKS_PER_CHAT_10M || 3);
const tenantFilter = process.env.TEX_QUICK_CONNECT_TENANT_ID?.trim() || null;
const manualSessionId = optionalEnv("TEX_QUICK_CONNECT_MANUAL_SESSION_ID");
const manualMode = Boolean(manualSessionId && tenantFilter);
const maxSessions = Number(process.env.TEX_QUICK_CONNECT_MAX_SESSIONS || 5);
const heartbeatMs = Number(process.env.TEX_QUICK_CONNECT_HEARTBEAT_MS || 30000);
const connectorInstanceId =
  optionalEnv("TEX_QUICK_CONNECT_INSTANCE_ID") || `${hostname()}:${process.pid}`;
const activeSessions = new Map();
const acknowledgementWindows = new Map();
const reconnectFailures = new Map();
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
    maxQrPerPairing,
    pollMs,
    ackPerChatTenMinutes,
    ackPerTenantHour,
    acknowledgementsEnabled,
    reconnectBaseDelayMs,
    reconnectMaxDelayMs,
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
    const activeRuntime = activeSessions.get(session.tenant_id);
    if (activeRuntime) {
      if (shouldRestartForPairingRequest(activeRuntime, session)) {
        logger.info(
          { tenantId: session.tenant_id },
          "Quick Connect restarting tenant socket for a new pairing request"
        );
        try {
          activeRuntime.sock?.end?.();
        } catch (error) {
          logger.warn(
            { error: errorMessage(error), tenantId: session.tenant_id },
            "Unable to close Quick Connect socket before pairing restart"
          );
        }
        stopTenantRuntime(session.tenant_id);
        clearQuickConnectAuthState(session.tenant_id);
      } else {
        continue;
      }
    }

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
  activeSessions.set(session.tenant_id, {
    pairingCode: session.pairing_code,
    startedAt: new Date().toISOString()
  });
  await insertQuickConnectEvent(session, {
    eventType: "quick_connect.connector_started",
    status: session.status,
    message: "Quick Connect connector started a WhatsApp linked-device socket.",
    metadata: {
      instance_id: connectorInstanceId
    }
  });

  const authDirectory = authDirectoryFor(session.tenant_id);
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
    pairingCode: session.pairing_code,
    pairingPaused: false,
    qrCount: 0,
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
    const runtime = activeSessions.get(session.tenant_id);
    const qrCount = (runtime?.qrCount ?? 0) + 1;
    if (runtime) {
      runtime.qrCount = qrCount;
    }

    if (Number.isFinite(maxQrPerPairing) && maxQrPerPairing > 0 && qrCount > maxQrPerPairing) {
      if (runtime) {
        runtime.pairingPaused = true;
      }
      await updateQuickConnectSession(session, {
        error: "Quick Connect paused QR generation to protect the WhatsApp account. Request a new pairing when ready.",
        qr_code_data: null,
        qr_expires_at: null,
        status: "qr_pending",
        updated_at: new Date().toISOString()
      });
      await insertQuickConnectEvent(session, {
        eventType: "quick_connect.qr.paused",
        status: "qr_pending",
        message: "Quick Connect paused repeated QR generation to protect the WhatsApp account.",
        metadata: {
          instance_id: connectorInstanceId,
          max_qr_per_pairing: String(maxQrPerPairing),
          pairing_code: session.pairing_code ?? "",
          qr_count: String(qrCount)
        }
      });
      logger.warn(
        { maxQrPerPairing, qrCount, tenantId: session.tenant_id },
        "Quick Connect QR generation paused"
      );
      try {
        sock.end?.();
      } catch (error) {
        logger.warn(
          { error: errorMessage(error), tenantId: session.tenant_id },
          "Unable to close Quick Connect socket after QR pause"
        );
      }
      return;
    }

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
        max_qr_per_pairing: String(maxQrPerPairing),
        qr_count: String(qrCount),
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
    reconnectFailures.delete(session.tenant_id);
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
    const closingRuntime = activeSessions.get(session.tenant_id);
    const shouldReconnect = statusCode !== DisconnectReason.loggedOut && !shuttingDown;

    stopTenantRuntime(session.tenant_id);

    if (closingRuntime?.pairingPaused) {
      await insertQuickConnectEvent(session, {
        eventType: "quick_connect.pairing_paused",
        status: "qr_pending",
        message: "WhatsApp socket closed after QR generation was paused.",
        metadata: {
          instance_id: connectorInstanceId,
          status_code: String(statusCode ?? "")
        }
      });
      return;
    }

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

    if (statusCode === DisconnectReason.loggedOut) {
      await resetQuickConnectPairing(session, statusCode, {
        clearAuthState: true,
        reason: "logged_out"
      });
      await sleep(2000);
      if (!activeSessions.has(session.tenant_id) && !shuttingDown) {
        void startTenantSocket({
          ...session,
          status: "qr_pending"
        });
      }
      return;
    }

    if (shouldReconnect) {
      const failureCount = (reconnectFailures.get(session.tenant_id) ?? 0) + 1;
      reconnectFailures.set(session.tenant_id, failureCount);
      const reconnectDelayMs = reconnectDelayFor(failureCount);
      const reconnectingStatus = session.status === "connected" ? "connected" : "qr_pending";
      const reconnectingMessage =
        failureCount >= 6
          ? "WhatsApp socket is still reconnecting. Saved linked-device credentials were preserved."
          : "WhatsApp socket closed and will reconnect.";

      await insertQuickConnectEvent(session, {
        eventType: "quick_connect.reconnecting",
        status: reconnectingStatus,
        message: reconnectingMessage,
        metadata: {
          failure_count: String(failureCount),
          instance_id: connectorInstanceId,
          reconnect_delay_ms: String(reconnectDelayMs),
          status_code: String(statusCode ?? "")
        }
      });
      await updateQuickConnectSession(session, {
        error:
          failureCount >= 6
            ? "WhatsApp connection is reconnecting. The saved linked-device session is being preserved."
            : null,
        qr_code_data: null,
        qr_expires_at: null,
        status: reconnectingStatus,
        updated_at: new Date().toISOString()
      });
      await sleep(reconnectDelayMs);
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

async function resetQuickConnectPairing(session, statusCode, options = {}) {
  if (options.clearAuthState) {
    clearQuickConnectAuthState(session.tenant_id);
  }
  await updateQuickConnectSession(session, {
    connected_phone: null,
    error:
      options.reason === "logged_out"
        ? "WhatsApp reported this linked device as logged out. A new QR pairing is required."
        : "WhatsApp linked-device session requires a new QR pairing.",
    qr_code_data: null,
    qr_expires_at: null,
    status: "qr_pending",
    updated_at: new Date().toISOString()
  });
  await insertQuickConnectEvent(session, {
    eventType: "quick_connect.repairing_required",
    status: "qr_pending",
    message: options.clearAuthState
      ? "Quick Connect cleared a logged-out WhatsApp linked-device session and requested a new QR."
      : "Quick Connect requested a new QR without clearing saved linked-device credentials.",
    metadata: {
      auth_state_cleared: String(Boolean(options.clearAuthState)),
      instance_id: connectorInstanceId,
      reason: options.reason ?? "",
      status_code: String(statusCode ?? "")
    }
  });
}

async function handleInboundMessage(session, sock, message) {
  if (!message.message || message.key.fromMe) {
    return;
  }

  const messageId = message.key.id || randomUUID();
  const remoteJid = message.key.remoteJid || null;
  const sender = resolveInboundSender(message);
  const content = unwrapWhatsappMessageContent(message.message);
  const text =
    content.conversation ||
    content.extendedTextMessage?.text ||
    content.imageMessage?.caption ||
    content.documentMessage?.caption ||
    "";
  const hasMedia = Boolean(content.imageMessage || content.documentMessage);
  let mediaInfo = null;
  let mediaError = null;

  if (hasMedia) {
    try {
      mediaInfo = await downloadMessageMedia(sock, message);
      if (!mediaInfo.dataBase64) {
        mediaError = "WhatsApp media download returned an empty file.";
      }
    } catch (error) {
      mediaError = errorMessage(error);
      await insertQuickConnectEvent(session, {
        eventType: "quick_connect.media_download_failed",
        status: "connected",
        message: "Quick Connect received WhatsApp media but could not download the attachment.",
        metadata: {
          error: mediaError,
          message_id: messageId,
          remote_jid: remoteJid ?? "",
          sender_jid: sender.jid ?? "",
          sender_phone: sender.phone ?? ""
        }
      });
      logger.warn(
        { error: mediaError, messageId, tenantId: session.tenant_id },
        "Quick Connect media download failed"
      );
    }
  }

  const processing = await processQuickConnectIngest(session, {
    hasMedia,
    mediaInfo,
    mediaError,
    message,
    messageId,
    remoteJid,
    sender,
    text
  }).catch(async (error) => {
    const errorText = errorMessage(error);
    await recordQuickConnectSubmission(session, {
      hasMedia,
      mediaInfo,
      mediaError,
      message,
      messageId,
      remoteJid,
      sender,
      text
    });
    await insertQuickConnectEvent(session, {
      eventType: "quick_connect.ingest_failed",
      status: "connected",
      message: "Quick Connect could not run the TEX OCR ingest workflow.",
      metadata: {
        error: errorText,
        message_id: messageId,
        remote_jid: remoteJid ?? "",
        sender_jid: sender.jid ?? "",
        sender_phone: sender.phone ?? ""
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
      replyText: fallbackQuickConnectReply(hasMedia, mediaError),
      status: "failed",
      submissionId: null
    };
  });
  const acknowledgement = await sendQuickConnectAcknowledgement(session, sock, {
    hasMedia,
    mediaError,
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
      remote_jid: remoteJid ?? "",
      sender_jid: sender.jid ?? "",
      sender_phone: sender.phone ?? ""
    }
  });
}

async function sendQuickConnectAcknowledgement(session, sock, input) {
  if (!input.remoteJid) {
    return { error: "Missing remote JID.", status: "skipped" };
  }

  if (!acknowledgementsEnabled) {
    await insertQuickConnectEvent(session, {
      eventType: "quick_connect.acknowledgement_skipped",
      status: "connected",
      message: "Quick Connect acknowledgement replies are disabled for this worker.",
      metadata: {
        message_id: input.messageId,
        remote_jid: input.remoteJid,
        reason: "disabled"
      }
    });
    return { error: null, status: "disabled" };
  }

  const acknowledgementLimit = reserveAcknowledgementSlot(session.tenant_id, input.remoteJid);
  if (!acknowledgementLimit.allowed) {
    await insertQuickConnectEvent(session, {
      eventType: "quick_connect.acknowledgement_skipped",
      status: "connected",
      message: "Quick Connect skipped an acknowledgement to protect the WhatsApp account.",
      metadata: {
        chat_count: String(acknowledgementLimit.chatCount),
        chat_limit: String(ackPerChatTenMinutes),
        message_id: input.messageId,
        reason: acknowledgementLimit.reason,
        remote_jid: input.remoteJid,
        tenant_count: String(acknowledgementLimit.tenantCount),
        tenant_limit: String(ackPerTenantHour)
      }
    });
    logger.warn(
      {
        messageId: input.messageId,
        reason: acknowledgementLimit.reason,
        remoteJid: input.remoteJid,
        tenantId: session.tenant_id
      },
      "Quick Connect acknowledgement skipped"
    );
    return { error: acknowledgementLimit.reason, status: "rate_limited" };
  }

  const text = input.replyText?.trim() || fallbackQuickConnectReply(input.hasMedia, input.mediaError);

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
      media: {
        error: input.mediaError,
        expected: Boolean(input.hasMedia),
        status: input.mediaError ? "download_failed" : input.mediaInfo ? "downloaded" : "not_provided"
      },
      mediaInfo: input.mediaInfo
        ? {
            bufferLength: input.mediaInfo.bufferLength,
            fileName: input.mediaInfo.fileName,
            mediaType: input.mediaInfo.mediaType,
            mimeType: input.mediaInfo.mimeType
          }
        : null,
      sender: input.sender,
      source: "quick_connect"
    },
    senderPhone: input.sender.phone,
    senderRaw: input.sender.raw,
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
      sender_jid: input.sender.jid ?? "",
      sender_phone: input.sender.phone ?? "",
      submission_id: body.submission?.id ?? ""
    }
  });

  return {
    error: null,
    expenseId: body.expense?.id ?? null,
    ocrStatus: body.ocrStatus ?? null,
    replyText: body.replyText || fallbackQuickConnectReply(Boolean(input.mediaInfo), input.mediaError),
    status: "processed",
    submissionId: body.submission?.id ?? null
  };
}

function fallbackQuickConnectReply(hasMedia, mediaError = null) {
  return hasMedia
    ? `Receipt received by TEX, but OCR could not finish because the attachment was not processed${mediaError ? ` (${mediaError})` : ""}. Please resend the receipt as a clear photo or PDF.`
    : "Message received by TEX. Send a receipt photo or document to queue it for finance review.";
}

async function downloadMessageMedia(sock, message) {
  const mediaMessage = {
    ...message,
    message: unwrapWhatsappMessageContent(message.message)
  };
  const buffer = await downloadMediaMessage(
    mediaMessage,
    "buffer",
    {},
    {
      logger,
      reuploadRequest: sock.updateMediaMessage
    }
  );
  const content = unwrapWhatsappMessageContent(message.message);
  const image = content.imageMessage;
  const document = content.documentMessage;

  return {
    bufferLength: Buffer.isBuffer(buffer) ? buffer.length : 0,
    dataBase64: Buffer.isBuffer(buffer) ? buffer.toString("base64") : "",
    fileName: document?.fileName || "whatsapp-receipt",
    mediaType: image ? "image" : "document",
    mimeType: image?.mimetype || document?.mimetype || null
  };
}

function unwrapWhatsappMessageContent(content, depth = 0) {
  if (!content || depth > 5) {
    return {};
  }

  return (
    content.ephemeralMessage?.message &&
      unwrapWhatsappMessageContent(content.ephemeralMessage.message, depth + 1)
  ) || (
    content.viewOnceMessage?.message &&
      unwrapWhatsappMessageContent(content.viewOnceMessage.message, depth + 1)
  ) || (
    content.viewOnceMessageV2?.message &&
      unwrapWhatsappMessageContent(content.viewOnceMessageV2.message, depth + 1)
  ) || (
    content.documentWithCaptionMessage?.message &&
      unwrapWhatsappMessageContent(content.documentWithCaptionMessage.message, depth + 1)
  ) || content;
}

async function recordQuickConnectSubmission(session, input) {
  const mediaUrl =
    input.mediaInfo?.dataBase64 && input.mediaInfo.mimeType
      ? `data:${input.mediaInfo.mimeType};base64,${input.mediaInfo.dataBase64}`
      : null;
  const ocrStatus = input.hasMedia && input.mediaInfo ? "failed" : "manual_review";
  const ocrError = input.mediaError || "Quick Connect app ingest failed before OCR could run.";
  const payload = {
    key: input.message.key,
    messageTimestamp: input.message.messageTimestamp,
    media: {
      error: input.mediaError,
      expected: Boolean(input.hasMedia),
      status: input.mediaError ? "download_failed" : input.mediaInfo ? "downloaded" : "not_provided"
    },
    mediaInfo: input.mediaInfo
      ? {
          bufferLength: input.mediaInfo.bufferLength,
          fileName: input.mediaInfo.fileName,
          mediaType: input.mediaInfo.mediaType,
          mimeType: input.mediaInfo.mimeType
        }
      : null,
    sender: input.sender,
    source: "quick_connect"
  };
  await insertWhatsappSubmission({
    media_url: mediaUrl,
    media_mime_type: input.mediaInfo?.mimeType ?? null,
    message_id: input.messageId,
    message_text: input.text,
    message_type: input.hasMedia || input.mediaInfo ? "receipt" : "text",
    ocr_error: ocrError,
    ocr_result: {},
    ocr_status: ocrStatus,
    payload,
    sender_phone: input.sender.phone,
    sender_raw: input.sender.raw,
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
            media_url: row.media_url,
            media_mime_type: row.media_mime_type,
            message_text: row.message_text,
            message_type: row.message_type,
            ocr_error: row.ocr_error,
            ocr_result: row.ocr_result,
            ocr_status: row.ocr_status,
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
        media_url,
        media_mime_type,
        ocr_status,
        ocr_result,
        ocr_error,
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
        $10,
        $11,
        $12::jsonb,
        $13,
        $14::jsonb,
        $15
      )
      on conflict (tenant_id, message_id)
      where message_id is not null
      do update set
        message_text = excluded.message_text,
        message_type = excluded.message_type,
        media_url = excluded.media_url,
        media_mime_type = excluded.media_mime_type,
        ocr_status = excluded.ocr_status,
        ocr_result = excluded.ocr_result,
        ocr_error = excluded.ocr_error,
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
      row.media_url,
      row.media_mime_type,
      row.ocr_status,
      JSON.stringify(row.ocr_result ?? {}),
      row.ocr_error,
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

function reconnectDelayFor(failureCount) {
  const safeBase = Number.isFinite(reconnectBaseDelayMs) && reconnectBaseDelayMs > 0 ? reconnectBaseDelayMs : 2000;
  const safeMax = Number.isFinite(reconnectMaxDelayMs) && reconnectMaxDelayMs > 0 ? reconnectMaxDelayMs : 60000;
  const exponential = safeBase * 2 ** Math.max(0, Math.min(failureCount - 1, 6));

  return Math.min(exponential, safeMax);
}

function reserveAcknowledgementSlot(tenantId, remoteJid) {
  const now = Date.now();
  const tenantKey = `tenant:${tenantId}`;
  const chatKey = `chat:${tenantId}:${remoteJid}`;
  const tenantWindow = pruneWindow(acknowledgementWindows.get(tenantKey), now - 60 * 60 * 1000);
  const chatWindow = pruneWindow(acknowledgementWindows.get(chatKey), now - 10 * 60 * 1000);
  const safeTenantLimit =
    Number.isFinite(ackPerTenantHour) && ackPerTenantHour >= 0 ? ackPerTenantHour : 10;
  const safeChatLimit =
    Number.isFinite(ackPerChatTenMinutes) && ackPerChatTenMinutes >= 0 ? ackPerChatTenMinutes : 3;

  if (safeTenantLimit === 0 || tenantWindow.length >= safeTenantLimit) {
    acknowledgementWindows.set(tenantKey, tenantWindow);
    acknowledgementWindows.set(chatKey, chatWindow);
    return {
      allowed: false,
      chatCount: chatWindow.length,
      reason: "tenant_rate_limit",
      tenantCount: tenantWindow.length
    };
  }

  if (safeChatLimit === 0 || chatWindow.length >= safeChatLimit) {
    acknowledgementWindows.set(tenantKey, tenantWindow);
    acknowledgementWindows.set(chatKey, chatWindow);
    return {
      allowed: false,
      chatCount: chatWindow.length,
      reason: "chat_rate_limit",
      tenantCount: tenantWindow.length
    };
  }

  tenantWindow.push(now);
  chatWindow.push(now);
  acknowledgementWindows.set(tenantKey, tenantWindow);
  acknowledgementWindows.set(chatKey, chatWindow);
  return {
    allowed: true,
    chatCount: chatWindow.length,
    reason: "",
    tenantCount: tenantWindow.length
  };
}

function pruneWindow(values, cutoff) {
  return Array.isArray(values) ? values.filter((value) => value >= cutoff) : [];
}

function clearQuickConnectAuthState(tenantId) {
  rmSync(authDirectoryFor(tenantId), { force: true, recursive: true });
}

function shouldRestartForPairingRequest(runtime, session) {
  return (
    session.status === "qr_pending" &&
    Boolean(session.pairing_code) &&
    runtime.pairingCode !== session.pairing_code
  );
}

function resolveInboundSender(message) {
  const key = message.key || {};
  const candidates = [
    key.participantPn,
    message.participantPn,
    key.senderPn,
    message.senderPn,
    key.participantAlt,
    message.participantAlt,
    key.participant,
    message.participant,
    key.remoteJidAlt,
    message.remoteJidAlt,
    key.remoteJid
  ].filter(Boolean);
  const jid = candidates.find((candidate) => isPersonalJid(candidate)) || key.remoteJid || null;
  const phone = jidToPhone(jid);

  return {
    jid,
    phone,
    raw: phone || jid
  };
}

function isPersonalJid(jid) {
  return /@(c|s)\.whatsapp\.net$/i.test(jid);
}

function jidToPhone(jid) {
  if (!jid || !isPersonalJid(jid)) {
    return null;
  }

  return jid.replace(/@(c|s)\.whatsapp\.net$/i, "").replace(/\D/g, "") || null;
}

function authDirectoryFor(tenantId) {
  return join(sessionRoot, tenantId);
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
