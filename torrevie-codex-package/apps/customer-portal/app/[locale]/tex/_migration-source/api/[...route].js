import crypto from 'node:crypto';
import { getSql, json, readJson } from '../server/db.js';
import {
  clearSessionCookie,
  getSessionUser,
  hashPassword,
  issueSession,
  serializeAuthUser,
  setSessionCookie,
  verifyPassword,
} from '../server/auth.js';

function routePath(req) {
  const route = req.query.route;
  return Array.isArray(route) ? route.join('/') : String(route || '');
}

function notFound(res) {
  return json(res, 404, { error: 'Not found' });
}

function methodNotAllowed(res) {
  return json(res, 405, { error: 'Method not allowed' });
}

function appBaseUrl(req) {
  return process.env.APP_URL || `https://${req.headers.host || 'tex1.torrevie.com'}`;
}

function googleMapsApiKey() {
  return process.env.GOOGLE_MAPS_API_KEY
    || process.env.GOOGLE_MAPS_PLATFORM_KEY
    || process.env.GOOGLE_API_KEY
    || process.env.GOOGLE_AI_KEY
    || '';
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function isoDate(value = new Date()) {
  return value.toISOString().slice(0, 10);
}

function addDays(yyyyMmDd, days) {
  const date = new Date(`${yyyyMmDd}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return isoDate(date);
}

async function sendEmail({ to, subject, html, text }) {
  const provider = (process.env.EMAIL_PROVIDER || '').toLowerCase();
  const from = process.env.EMAIL_FROM || 'Torrevie TEX <no-reply@torrevie.com>';

  if ((provider === 'postmark' || process.env.POSTMARK_SERVER_TOKEN) && process.env.POSTMARK_SERVER_TOKEN) {
    const response = await fetch('https://api.postmarkapp.com/email', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Postmark-Server-Token': process.env.POSTMARK_SERVER_TOKEN,
      },
      body: JSON.stringify({
        From: from,
        To: to,
        Subject: subject,
        HtmlBody: html,
        TextBody: text,
        MessageStream: process.env.POSTMARK_MESSAGE_STREAM || 'outbound',
      }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Email provider rejected the message (${response.status})${detail ? `: ${detail}` : ''}`);
    }
    return { sent: true, provider: 'postmark' };
  }

  return { sent: false, provider: null };
}

function normalizePhone(value) {
  return String(value || '').replace(/[^\d]/g, '');
}

function phoneVariants(value) {
  const digits = normalizePhone(value);
  const variants = new Set([digits, `+${digits}`].filter((item) => item.length > 1));
  if (digits.startsWith('0')) {
    variants.add(digits.slice(1));
    variants.add(`+${digits.slice(1)}`);
  }
  if (digits.length > 6) {
    for (const prefixLen of [1, 2, 3]) variants.add(`0${digits.slice(prefixLen)}`);
  }
  return [...variants].filter(Boolean);
}

function stripDataUrl(value) {
  return String(value || '').replace(/^data:[^;]+;base64,/i, '').replace(/\s+/g, '').trim();
}

function isAllowedReceiptType(contentType) {
  return ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'].includes(String(contentType || '').toLowerCase());
}

function isImageMagic(buffer) {
  if (!buffer || buffer.length < 4) return false;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return true;
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return true;
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) return true;
  if (buffer.length >= 12
    && buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46
    && buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) return true;
  if (buffer.length >= 12 && buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70) return true;
  return false;
}

function base64ToBuffer(input) {
  const normalized = String(input || '').trim().replace(/-/g, '+').replace(/_/g, '/');
  if (!normalized) return Buffer.alloc(0);
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
  return Buffer.from(padded, 'base64');
}

function deriveWhatsAppImageKeys(mediaKey) {
  const key = base64ToBuffer(mediaKey);
  if (!key.length) return null;
  const derived = Buffer.from(crypto.hkdfSync('sha256', key, Buffer.alloc(32), Buffer.from('WhatsApp Image Keys'), 112));
  return {
    iv: derived.subarray(0, 16),
    cipherKey: derived.subarray(16, 48),
    macKey: derived.subarray(48, 80),
  };
}

async function decryptWhatsAppImage(imageNode) {
  const encryptedUrl = imageNode?.url || (imageNode?.directPath ? `https://mmg.whatsapp.net${imageNode.directPath}` : '');
  const mediaKey = imageNode?.mediaKey || imageNode?.media_key;
  if (!encryptedUrl || !mediaKey) return null;

  try {
    const response = await fetch(encryptedUrl);
    if (!response.ok) {
      console.error(`wappfly encrypted media download failed: HTTP ${response.status}`);
      return null;
    }
    const encryptedWithMac = Buffer.from(await response.arrayBuffer());
    if (encryptedWithMac.length <= 10) return null;
    const keys = deriveWhatsAppImageKeys(mediaKey);
    if (!keys) return null;

    const encrypted = encryptedWithMac.subarray(0, encryptedWithMac.length - 10);
    const receivedMac = encryptedWithMac.subarray(encryptedWithMac.length - 10);
    const fullMac = crypto.createHmac('sha256', keys.macKey).update(Buffer.concat([keys.iv, encrypted])).digest();
    const expectedMac = fullMac.subarray(0, 10);
    if (receivedMac.length !== expectedMac.length || !crypto.timingSafeEqual(receivedMac, expectedMac)) {
      console.error('wappfly encrypted media MAC check failed');
      return null;
    }

    const decipher = crypto.createDecipheriv('aes-256-cbc', keys.cipherKey, keys.iv);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    if (!isImageMagic(decrypted)) {
      console.error(`wappfly encrypted media decrypted but is not an image (${decrypted.length} bytes)`);
      return null;
    }
    return {
      buffer: decrypted,
      contentType: String(imageNode?.mimetype || 'image/jpeg').split(';')[0].toLowerCase(),
      source: 'encrypted',
    };
  } catch (error) {
    console.error('wappfly encrypted media handling failed:', error);
    return null;
  }
}

function collectObjects(value, out = []) {
  if (!value || typeof value !== 'object') return out;
  if (Array.isArray(value)) {
    for (const item of value) collectObjects(item, out);
    return out;
  }
  out.push(value);
  for (const nested of Object.values(value)) {
    if (nested && typeof nested === 'object') collectObjects(nested, out);
  }
  return out;
}

function getStringField(obj, keys) {
  for (const key of keys) {
    const value = obj?.[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number') return String(value);
  }
  return '';
}

function rowMessageId(row) {
  return getStringField(row, ['msg_id', 'message_id', 'messageId', 'id', 'key_id', 'keyId', 'stanzaId']) || getStringField(row?.key, ['id']);
}

function rowMediaPath(row) {
  return getStringField(row, ['media_path', 'mediaPath', 'media_url', 'mediaUrl', 'download_url', 'downloadUrl', 'url', 'file_url', 'fileUrl'])
    || getStringField(row?.media, ['path', 'url', 'media_path', 'mediaPath', 'download_url', 'downloadUrl']);
}

async function fetchWappflyMediaPath({ token, messageId, remoteJid }) {
  if (!token || !messageId) return null;
  const endpoints = [];
  if (remoteJid) endpoints.push(`https://wappfly.com/api/history?jid=${encodeURIComponent(remoteJid)}&limit=100`);
  endpoints.push('https://wappfly.com/api/messages/recent?limit=100');

  let matchedWithoutMedia = false;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint, { headers: { 'X-API-Token': token } });
        if (!response.ok) continue;
        const payload = await response.json();
        const hit = collectObjects(payload).find((row) => rowMessageId(row) === String(messageId));
        if (!hit) continue;
        const mediaPath = rowMediaPath(hit);
        if (mediaPath) return mediaPath;
        matchedWithoutMedia = true;
        if (attempt === 0) {
          console.log(`wappfly matched media row without path; keys=${JSON.stringify(Object.keys(hit))}`);
        }
      } catch (error) {
        console.log(`wappfly media lookup failed: ${error.message}`);
      }
    }
    if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  console.error(`wappfly media path unavailable for msg_id=${messageId}; matched_row=${matchedWithoutMedia}`);
  return null;
}

async function downloadWappflyReceiptMedia({ token, imageNode, documentNode, message, messageId, remoteJid }) {
  const decrypted = await decryptWhatsAppImage(imageNode);
  if (decrypted) return decrypted;

  const mediaKey = imageNode?.mediaKey || imageNode?.media_key;
  const directMediaPath = imageNode?.media_path || imageNode?.mediaPath || imageNode?.mediaUrl
    || (!mediaKey ? imageNode?.url : null)
    || documentNode?.media_path || documentNode?.mediaPath || documentNode?.mediaUrl
    || documentNode?.url
    || message?.media_url || message?.media_path || null;
  const mediaPath = directMediaPath || await fetchWappflyMediaPath({ token, messageId, remoteJid });
  if (!mediaPath) return { buffer: null, contentType: null, source: null, warning: 'Wappfly did not expose a downloadable receipt image' };

  const downloadUrl = String(mediaPath).startsWith('http')
    ? String(mediaPath)
    : `https://wappfly.com${String(mediaPath).startsWith('/') ? '' : '/'}${mediaPath}`;
  try {
    const response = await fetch(downloadUrl, { headers: { 'X-API-Token': token } });
    const contentType = String(response.headers.get('content-type') || imageNode?.mimetype || documentNode?.mimetype || 'image/jpeg').split(';')[0].toLowerCase();
    if (!response.ok) return { buffer: null, contentType, source: 'wappfly', warning: `Wappfly media download failed with HTTP ${response.status}` };
    if (!isAllowedReceiptType(contentType)) return { buffer: null, contentType, source: 'wappfly', warning: `Unsupported receipt media type: ${contentType}` };
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length <= 0 || buffer.length > 20 * 1024 * 1024) return { buffer: null, contentType, source: 'wappfly', warning: 'Receipt image is empty or too large' };
    if (contentType.startsWith('image/') && !isImageMagic(buffer)) return { buffer: null, contentType, source: 'wappfly', warning: 'Downloaded Wappfly media was not a valid image' };
    return { buffer, contentType, source: 'wappfly', warning: null };
  } catch (error) {
    return { buffer: null, contentType: null, source: 'wappfly', warning: error.message };
  }
}

async function parseReceiptImage({ imageBase64, mediaType, countryCode, taxIdLabel = 'Tax ID', taxName = 'VAT' }) {
  const apiKey = process.env.GOOGLE_AI_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    return { ok: false, error: 'Google Gemini OCR provider is not configured' };
  }
  const cleanImageBase64 = stripDataUrl(imageBase64);
  if (!cleanImageBase64) return { ok: false, error: 'Receipt image data is empty', status: 400 };

  const todayIso = isoDate();
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

Date rules: Receipts are almost always dated within the last 90 days. The year is often faint or partially printed. NEVER guess a year. If the year is not clearly legible, return null for "date".
Use null for any field not determinable.`;

  const configuredModels = process.env.GOOGLE_AI_MODELS || process.env.GOOGLE_AI_MODEL || process.env.GEMINI_MODEL || '';
  const models = (configuredModels || 'gemini-flash-latest,gemini-3.1-flash-lite,gemini-3.5-flash')
    .split(',')
    .map((item) => item.trim().replace(/^models\//, ''))
    .filter(Boolean);
  const failures = [];
  let result = null;
  let usedModel = null;
  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: `You are a receipt data extraction assistant. Return valid JSON only, with no markdown or explanation.\n\n${userPrompt}`,
                },
                {
                  inlineData: {
                    mimeType: mediaType,
                    data: cleanImageBase64,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: 'application/json',
          },
        }),
      });
      if (response.ok) {
        result = await response.json();
        usedModel = model;
        break;
      }
      const details = await response.text().catch(() => '');
      failures.push({ model, attempt: attempt + 1, status: response.status, details: details.slice(0, 1000) });
      if (![429, 500, 502, 503, 504].includes(response.status)) break;
      await new Promise((resolve) => setTimeout(resolve, 750 * (attempt + 1)));
    }
    if (result) break;
  }
  if (!result) {
    const last = failures[failures.length - 1] || {};
    return { ok: false, error: 'AI parsing failed', status: last.status || 503, details: JSON.stringify(failures) };
  }

  const textContent = result.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || '')
    .join('')
    .trim();
  if (!textContent) return { ok: false, error: 'No text response from AI', status: 503, details: JSON.stringify({ model: usedModel, result }) };

  let parsed;
  try {
    parsed = JSON.parse(textContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
  } catch {
    return { ok: false, error: 'Failed to parse AI response', raw: textContent, status: 502, details: JSON.stringify({ model: usedModel, raw: textContent }) };
  }

  if (typeof parsed.confidence === 'number' && parsed.confidence > 0 && parsed.confidence <= 1) {
    parsed.confidence = Math.round(parsed.confidence * 100);
  }
  parsed.ocr_model = usedModel;

  let dateWarning = null;
  const raw = typeof parsed.date === 'string' ? parsed.date.trim() : '';
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    if (parsed.date != null) dateWarning = 'unreadable';
    parsed.date = null;
  } else {
    const d = new Date(`${raw}T00:00:00Z`);
    const today = new Date(`${todayIso}T00:00:00Z`);
    const diffDays = Math.round((today.getTime() - d.getTime()) / 86400000);
    if (Number.isNaN(d.getTime())) {
      dateWarning = 'unreadable';
      parsed.date = null;
    } else if (diffDays < -1) {
      dateWarning = 'future';
      parsed.date = null;
    } else if (diffDays > 365) {
      dateWarning = 'too_old';
      parsed.date = null;
    }
  }
  if (dateWarning) parsed.date_warning = dateWarning;
  void countryCode;
  void taxName;
  return { ok: true, data: parsed };
}

function compactTextPreview(value, limit = 500) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function receiptFileName(prefix, messageId, contentType) {
  const ext = String(contentType || '').includes('png')
    ? 'png'
    : String(contentType || '').includes('webp')
      ? 'webp'
      : String(contentType || '').includes('pdf')
        ? 'pdf'
        : 'jpg';
  return `${prefix}-${String(messageId || Date.now()).replace(/[^a-zA-Z0-9_-]/g, '')}.${ext}`;
}

function wappflyReplyTarget(key = {}, message = {}, fallback = '') {
  const chatCandidates = [
    message.chat_jid,
    key.remoteJid,
  ].map((value) => String(value || '').trim()).filter(Boolean);
  const chatTarget = chatCandidates.find((value) => value.includes('@'))
    || chatCandidates[0]
    || '';
  if (chatTarget) return chatTarget;

  const senderCandidates = [
    message.sender_jid,
    key.senderLid,
    key.senderPn,
    fallback,
  ].map((value) => String(value || '').trim()).filter(Boolean);
  return senderCandidates.find((value) => value.includes('@lid'))
    || senderCandidates.find((value) => value.includes('@s.whatsapp.net'))
    || senderCandidates[0]
    || '';
}

async function sendWappflyText(token, to, message, options = {}) {
  if (!token) return { sent: false, error: 'Wappfly token not configured' };
  const rawTo = String(to || '').trim();
  const digits = normalizePhone(rawTo);
  if (!rawTo && !digits) return { sent: false, error: 'Recipient phone is missing' };
  const jid = rawTo.includes('@') ? rawTo : `${digits}@s.whatsapp.net`;
  const quotedMsgId = String(options.quotedMsgId || '').trim();
  if (quotedMsgId) {
    const directResponse = await fetch('https://wappfly.com/api/messages/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Token': token },
      body: JSON.stringify({ to: jid, text: message }),
    });
    const directResult = await directResponse.json().catch(() => ({}));
    if (directResponse.ok && !directResult.error) {
      return {
        sent: true,
        queued: directResult.queued === true,
        id: directResult.msg_id || directResult.id || null,
        to: jid,
        endpoint: 'send',
        status: directResponse.status,
        fallback_from: {
          endpoint: 'reply',
          skipped: 'direct_send_preferred_for_wappfly_delivery',
          quoted_msg_id: quotedMsgId,
        },
      };
    }
    return {
      sent: false,
      to: jid,
      endpoint: 'send',
      status: directResponse.status,
      error: typeof directResult.error === 'string'
        ? directResult.error
        : (directResult.error ? JSON.stringify(directResult.error) : `HTTP ${directResponse.status}`),
      fallback_from: {
        endpoint: 'reply',
        skipped: 'direct_send_preferred_for_wappfly_delivery',
        quoted_msg_id: quotedMsgId,
      },
    };
  }
  const endpoint = quotedMsgId ? 'reply' : 'send';
  const response = await fetch(`https://wappfly.com/api/messages/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Token': token },
    body: JSON.stringify({
      to: jid,
      text: message,
      ...(quotedMsgId ? { quoted_msg_id: quotedMsgId } : {}),
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.error) {
    if (quotedMsgId) {
      const fallbackResponse = await fetch('https://wappfly.com/api/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Token': token },
        body: JSON.stringify({ to: jid, text: message }),
      });
      const fallbackResult = await fallbackResponse.json().catch(() => ({}));
      if (fallbackResponse.ok && !fallbackResult.error) {
        return {
          sent: true,
          queued: fallbackResult.queued === true,
          id: fallbackResult.msg_id || fallbackResult.id || null,
          to: jid,
          endpoint: 'send',
          status: fallbackResponse.status,
          fallback_from: {
            endpoint,
            status: response.status,
            error: typeof result.error === 'string' ? result.error : (result.error ? JSON.stringify(result.error) : `HTTP ${response.status}`),
          },
        };
      }
      return {
        sent: false,
        to: jid,
        endpoint,
        status: response.status,
        error: typeof result.error === 'string' ? result.error : (result.error ? JSON.stringify(result.error) : `HTTP ${response.status}`),
        fallback: {
          endpoint: 'send',
          status: fallbackResponse.status,
          error: typeof fallbackResult.error === 'string' ? fallbackResult.error : (fallbackResult.error ? JSON.stringify(fallbackResult.error) : `HTTP ${fallbackResponse.status}`),
        },
      };
    }
    return {
      sent: false,
      to: jid,
      endpoint,
      status: response.status,
      error: typeof result.error === 'string' ? result.error : (result.error ? JSON.stringify(result.error) : `HTTP ${response.status}`),
    };
  }
  return {
    sent: true,
    queued: result.queued === true,
    id: result.msg_id || result.id || null,
    to: jid,
    endpoint,
    status: response.status,
  };
}

async function sendWappflyTextWithPhoneCopy(token, primaryTo, phoneTo, message, options = {}) {
  const primary = await sendWappflyText(token, primaryTo, message, options);
  const rawPrimary = String(primaryTo || '').trim();
  const phoneDigits = normalizePhone(phoneTo);
  const primaryDigits = normalizePhone(rawPrimary);
  const shouldSendPhoneCopy = phoneDigits
    && phoneDigits !== primaryDigits
    && rawPrimary.toLowerCase().includes('@lid');
  if (!shouldSendPhoneCopy) return { ...primary, phone_copy: null };

  const phoneCopy = await sendWappflyText(token, phoneDigits, message).catch((error) => ({
    sent: false,
    error: error.message,
  }));
  return {
    ...primary,
    phone_copy: phoneCopy,
  };
}

function metaWhatsAppConfig() {
  return {
    token: process.env.META_WHATSAPP_ACCESS_TOKEN || '',
    phoneNumberId: process.env.META_WHATSAPP_PHONE_NUMBER_ID || '',
  };
}

async function sendMetaWhatsAppText(to, message) {
  const { token, phoneNumberId } = metaWhatsAppConfig();
  const digits = normalizePhone(to);
  if (!token || !phoneNumberId) return { sent: false, skipped: 'meta_not_configured' };
  if (!digits) return { sent: false, error: 'Recipient phone is missing' };
  const response = await fetch(`https://graph.facebook.com/v23.0/${encodeURIComponent(phoneNumberId)}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: digits,
      type: 'text',
      text: {
        preview_url: false,
        body: message,
      },
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.error) {
    return {
      sent: false,
      provider: 'meta',
      to: digits,
      status: response.status,
      error: result.error?.message || result.error || `HTTP ${response.status}`,
      details: result.error || null,
    };
  }
  return {
    sent: true,
    provider: 'meta',
    to: digits,
    id: result.messages?.[0]?.id || null,
    status: response.status,
  };
}

async function downloadMetaWhatsAppMedia(mediaId, fallbackContentType = 'image/jpeg') {
  const { token } = metaWhatsAppConfig();
  if (!token || !mediaId) return { buffer: null, contentType: null, source: 'meta', warning: 'Meta media token or media id is missing' };
  const metaResponse = await fetch(`https://graph.facebook.com/v23.0/${encodeURIComponent(mediaId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const meta = await metaResponse.json().catch(() => ({}));
  if (!metaResponse.ok || !meta.url) {
    return { buffer: null, contentType: null, source: 'meta', warning: meta.error?.message || `Meta media lookup failed with HTTP ${metaResponse.status}` };
  }
  const mediaResponse = await fetch(meta.url, { headers: { Authorization: `Bearer ${token}` } });
  const contentType = String(mediaResponse.headers.get('content-type') || meta.mime_type || fallbackContentType || 'image/jpeg').split(';')[0].toLowerCase();
  if (!mediaResponse.ok) return { buffer: null, contentType, source: 'meta', warning: `Meta media download failed with HTTP ${mediaResponse.status}` };
  if (!isAllowedReceiptType(contentType)) return { buffer: null, contentType, source: 'meta', warning: `Unsupported receipt media type: ${contentType}` };
  const buffer = Buffer.from(await mediaResponse.arrayBuffer());
  if (buffer.length <= 0 || buffer.length > 20 * 1024 * 1024) return { buffer: null, contentType, source: 'meta', warning: 'Receipt image is empty or too large' };
  if (contentType.startsWith('image/') && !isImageMagic(buffer)) return { buffer: null, contentType, source: 'meta', warning: 'Downloaded Meta media was not a valid image' };
  return { buffer, contentType, source: 'meta', warning: null };
}

async function requireUser(req, res) {
  const user = await getSessionUser(req);
  if (!user) json(res, 401, { error: 'Not authenticated' });
  return user;
}

function requireSuperAdmin(user, res) {
  if (user.super_admin !== true) {
    json(res, 403, { error: 'Super admin access required' });
    return false;
  }
  return true;
}

function canAccessCompany(user, companyId) {
  if (user.super_admin === true) return true;
  if (user.company_id === companyId) return true;
  return (user.memberships || []).some((membership) => membership.company_id === companyId);
}

function canManageUsers(user, companyId) {
  if (!canAccessCompany(user, companyId)) return false;
  if (user.super_admin === true) return true;
  const companyRole = (user.memberships || []).find((membership) => membership.company_id === companyId)?.role || user.role;
  return ['admin', 'manager', 'coordinator', 'finance'].includes(companyRole);
}

function roleForCompany(user, companyId) {
  return (user.memberships || []).find((membership) => membership.company_id === companyId)?.role || user.role || 'employee';
}

function canFinanceForCompany(user, companyId) {
  if (user.super_admin === true) return true;
  return ['admin', 'finance'].includes(roleForCompany(user, companyId));
}

function moneyValue(value) {
  if (value == null || value === '') return 0;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

async function attachMemberships(sql, user) {
  if (!user) return user;
  const memberships = await sql`
    select
      m.company_id,
      m.role,
      m.is_default,
      c.name as company_name,
      c.base_currency,
      c.country_code,
      c.logo_url
    from user_company_memberships m
    join companies c on c.id = m.company_id
    where m.user_id = ${user.id}
    order by m.is_default desc, c.name
  `;
  let companies = memberships.map((membership) => ({
    id: membership.company_id,
    name: membership.company_name,
    base_currency: membership.base_currency,
    country_code: membership.country_code,
    logo_url: membership.logo_url,
    role: membership.role,
    is_default: membership.is_default,
  }));
  if (user.super_admin === true) {
    const allCompanies = await sql`
      select id, name, base_currency, country_code, logo_url
      from companies
      order by name
    `;
    const existingIds = new Set(companies.map((company) => company.id));
    companies = [
      ...companies,
      ...allCompanies
        .filter((company) => !existingIds.has(company.id))
        .map((company) => ({
          ...company,
          role: user.role || 'admin',
          is_default: false,
        })),
    ];
    const defaultCompanyId =
      (user.company_id && companies.some((company) => company.id === user.company_id) ? user.company_id : null)
      || companies.find((company) => company.is_default)?.id
      || companies[0]?.id
      || null;
    companies = companies.map((company) => ({
      ...company,
      is_default: company.id === defaultCompanyId,
    }));
  }
  return { ...user, memberships, companies };
}

async function requireCompanyAccess(sql, req, res, companyId) {
  const user = await requireUser(req, res);
  if (!user) return null;
  const userWithMemberships = await attachMemberships(sql, user);
  if (!canAccessCompany(userWithMemberships, companyId)) {
    json(res, 403, { error: 'Company access required' });
    return null;
  }
  return userWithMemberships;
}

async function findDuplicateExpense(sql, candidate, excludeExpenseId = null) {
  const vendor = String(candidate.vendor || '').trim();
  if (!candidate.company_id || !candidate.amount || !candidate.currency || !candidate.date || !vendor) return null;
  const from = addDays(candidate.date, -3);
  const to = addDays(candidate.date, 3);
  const rows = await sql`
    select id, vendor, date, amount::float as amount, currency, employee_id, employee_name
    from expenses
    where company_id = ${candidate.company_id}
      and amount = ${Number(candidate.amount)}
      and currency = ${candidate.currency}
      and status <> 'rejected'
      and date >= ${from}
      and date <= ${to}
      and (${excludeExpenseId}::uuid is null or id <> ${excludeExpenseId})
  `;
  const vendorLower = vendor.toLowerCase();
  const vendorKey = normalizeVendorForDuplicate(vendor);
  const candidateDate = new Date(`${candidate.date}T00:00:00Z`).getTime();
  const matches = rows
    .map((row) => {
      const rowVendor = String(row.vendor || '').trim();
      const sameEmployee = candidate.employee_id
        ? String(row.employee_id || '') === String(candidate.employee_id)
        : String(row.employee_name || '') === String(candidate.employee_name || '');
      const exactVendor = rowVendor.toLowerCase() === vendorLower;
      const vendorFamily = vendorLooksDuplicate(vendorKey, normalizeVendorForDuplicate(rowVendor));
      return { row, sameEmployee, exactVendor, vendorFamily };
    })
    .filter((match) => match.exactVendor || match.vendorFamily)
    .map((row) => ({
      ...row,
      dayDiff: Math.round(Math.abs(candidateDate - new Date(`${isoDate(row.row.date)}T00:00:00Z`).getTime()) / 86_400_000),
    }))
    .sort((a, b) => {
      const employeeScore = Number(b.sameEmployee) - Number(a.sameEmployee);
      if (employeeScore) return employeeScore;
      const vendorScore = Number(b.exactVendor) - Number(a.exactVendor);
      if (vendorScore) return vendorScore;
      return a.dayDiff - b.dayDiff;
    });
  if (!matches.length) return null;
  const { row, dayDiff, sameEmployee } = matches[0];
  return {
    id: row.id,
    vendor: row.vendor,
    date: isoDate(row.date),
    amount: row.amount,
    currency: row.currency,
    employee_name: row.employee_name,
    dayDiff,
    reason: `Possible duplicate of ${row.vendor} on ${isoDate(row.date)} for ${row.currency} ${row.amount}${sameEmployee ? '' : ` submitted by ${row.employee_name || 'another employee'}`}`,
  };
}

function normalizeVendorForDuplicate(value) {
  const stopWords = new Set(['llc', 'l.l.c', 'ltd', 'limited', 'co', 'company', 'retail', 'store', 'stores', 'branch', 'uae', 'dubai', 'abu', 'dhabi']);
  const tokens = String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token && !stopWords.has(token));
  return {
    compact: tokens.join(''),
    tokens,
  };
}

function vendorLooksDuplicate(left, right) {
  if (!left.compact || !right.compact) return false;
  if (left.compact === right.compact) return true;
  if (left.compact.length >= 4 && right.compact.length >= 4 && (left.compact.includes(right.compact) || right.compact.includes(left.compact))) return true;
  const leftTokens = new Set(left.tokens);
  const shared = right.tokens.filter((token) => leftTokens.has(token));
  return shared.length > 0 && (shared.length >= Math.min(left.tokens.length, right.tokens.length) || shared.some((token) => token.length >= 4));
}

async function calculateExchange(sql, amount, currency, baseCurrency) {
  const amt = Number(amount);
  if (currency === baseCurrency) return { rate: 1, baseAmount: amt, warning: null };
  const pegs = await sql`
    select from_currency, to_currency, rate::float as rate
    from currency_pegs
    where from_currency in (${currency}, ${baseCurrency})
      and to_currency = 'USD'
    order by effective_from desc
  `;
  const fromPeg = pegs.find((peg) => peg.from_currency === currency);
  const toPeg = pegs.find((peg) => peg.from_currency === baseCurrency);
  if (fromPeg && toPeg) {
    const amountInUsd = amt * fromPeg.rate;
    return { rate: fromPeg.rate / toPeg.rate, baseAmount: amountInUsd / toPeg.rate, warning: null };
  }
  if (fromPeg && baseCurrency === 'USD') return { rate: fromPeg.rate, baseAmount: amt * fromPeg.rate, warning: null };
  const today = isoDate();
  const todayRate = (await sql`
    select rate::float as rate, date
    from fx_rates
    where from_currency = ${currency}
      and to_currency = ${baseCurrency}
      and date = ${today}
    limit 1
  `)[0];
  if (todayRate) return { rate: todayRate.rate, baseAmount: amt * todayRate.rate, warning: null };
  const recentRate = (await sql`
    select rate::float as rate, date
    from fx_rates
    where from_currency = ${currency}
      and to_currency = ${baseCurrency}
    order by date desc
    limit 1
  `)[0];
  if (recentRate) {
    return { rate: recentRate.rate, baseAmount: amt * recentRate.rate, warning: `Using rate from ${isoDate(recentRate.date)}` };
  }
  return { rate: 1, baseAmount: amt, warning: 'No exchange rate found. Amount saved without conversion.' };
}

function googleWaypoint({ placeId, address }) {
  const cleanPlaceId = String(placeId || '').trim();
  if (cleanPlaceId) return { placeId: cleanPlaceId };
  return { address: String(address || '').trim() };
}

async function googlePlaceAutocomplete(input) {
  const key = googleMapsApiKey();
  if (!key) {
    const error = new Error('Google Maps API key is not configured');
    error.statusCode = 501;
    throw error;
  }
  const response = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'suggestions.placePrediction.placeId,suggestions.placePrediction.text.text,suggestions.placePrediction.structuredFormat.mainText.text,suggestions.placePrediction.structuredFormat.secondaryText.text',
    },
    body: JSON.stringify({
      input,
      includedRegionCodes: ['ae', 'sa', 'bh', 'kw', 'om', 'qa'],
      includeQueryPredictions: false,
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result?.error?.message || `Google Places rejected the request (${response.status})`);
    error.statusCode = [401, 403].includes(response.status) ? 502 : response.status;
    error.googleStatusCode = response.status;
    throw error;
  }
  return (result.suggestions || [])
    .map((suggestion) => suggestion.placePrediction)
    .filter(Boolean)
    .map((prediction) => ({
      place_id: prediction.placeId,
      label: prediction.text?.text || prediction.structuredFormat?.mainText?.text || '',
      main_text: prediction.structuredFormat?.mainText?.text || prediction.text?.text || '',
      secondary_text: prediction.structuredFormat?.secondaryText?.text || '',
    }))
    .filter((item) => item.place_id && item.label);
}

async function googleRouteEstimate({ origin, origin_place_id, destination, destination_place_id }) {
  const key = googleMapsApiKey();
  if (!key) {
    const error = new Error('Google Maps API key is not configured');
    error.statusCode = 501;
    throw error;
  }
  const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline',
    },
    body: JSON.stringify({
      origin: googleWaypoint({ placeId: origin_place_id, address: origin }),
      destination: googleWaypoint({ placeId: destination_place_id, address: destination }),
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_UNAWARE',
      units: 'METRIC',
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result?.error?.message || `Google Routes rejected the request (${response.status})`);
    error.statusCode = [401, 403].includes(response.status) ? 502 : response.status;
    error.googleStatusCode = response.status;
    throw error;
  }
  const route = result.routes?.[0];
  if (!route?.distanceMeters) {
    const error = new Error('Google Maps could not estimate this route');
    error.statusCode = 404;
    throw error;
  }
  const durationSeconds = route.duration ? Number(String(route.duration).replace(/s$/, '')) : null;
  return {
    distance_meters: route.distanceMeters,
    distance_km: Math.round((route.distanceMeters / 1000) * 10) / 10,
    duration_seconds: Number.isFinite(durationSeconds) ? durationSeconds : null,
    route_polyline: route.polyline?.encodedPolyline || null,
    source: 'google_maps_routes',
  };
}

async function googleReturnRouteEstimate({ origin, origin_place_id, destination, destination_place_id, return_to_origin }) {
  const outbound = await googleRouteEstimate({ origin, origin_place_id, destination, destination_place_id });
  if (!return_to_origin) {
    return {
      ...outbound,
      is_return_trip: false,
      return_distance_km: null,
      return_duration_seconds: null,
      total_distance_km: outbound.distance_km,
    };
  }

  try {
    const inbound = await googleRouteEstimate({
      origin: destination,
      origin_place_id: destination_place_id,
      destination: origin,
      destination_place_id: origin_place_id,
    });
    return {
      ...outbound,
      is_return_trip: true,
      return_distance_km: inbound.distance_km,
      return_duration_seconds: inbound.duration_seconds,
      total_distance_km: Math.round((outbound.distance_km + inbound.distance_km) * 10) / 10,
      source: 'google_maps_routes_return',
    };
  } catch {
    return {
      ...outbound,
      is_return_trip: true,
      return_distance_km: outbound.distance_km,
      return_duration_seconds: outbound.duration_seconds,
      total_distance_km: Math.round((outbound.distance_km * 2) * 10) / 10,
      source: 'google_maps_routes_return_estimated',
    };
  }
}

function expenseLabel(expense) {
  const vendor = expense.vendor || 'Expense';
  const amount = `${expense.currency || ''} ${Number(expense.amount || 0).toFixed(2)}`.trim();
  return `${vendor} - ${amount}`;
}

function dateLabel(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  return isoDate(value);
}

const GENERAL_EXPENSE_CATEGORIES = new Set([
  'general',
  'general expense',
  'maintenance',
  'repair',
  'repairs',
  'office',
  'office supplies',
  'supplies',
  'utilities',
  'admin',
  'administration',
  'tools',
  'other',
]);

function isGeneralExpenseCategory(category) {
  return GENERAL_EXPENSE_CATEGORIES.has(String(category || '').trim().toLowerCase());
}

function expenseApprovalBlockReason(expense) {
  if (expense?.trip_id || isGeneralExpenseCategory(expense?.category)) return null;
  return 'Select a trip before approving, or classify this as a general/maintenance expense category.';
}

function expenseStatusMessage({ expense, status, reason, actorName }) {
  const label = expenseLabel(expense);
  if (status === 'approved') {
    return [
      'TEX expense approved',
      label,
      `Date: ${dateLabel(expense.date)}`,
      `Approved by: ${actorName || 'your manager'}`,
      'Finance will process your reimbursement.',
    ].join('\n');
  }
  if (status === 'rejected') {
    return [
      'TEX expense rejected',
      label,
      `Date: ${dateLabel(expense.date)}`,
      `Reason: ${reason || 'No reason provided'}`,
      `Rejected by: ${actorName || 'TEX'}`,
    ].join('\n');
  }
  if (status === 'paid') {
    return [
      'TEX expense reimbursed',
      label,
      `Date: ${dateLabel(expense.date)}`,
      `Processed by: ${actorName || 'Finance'}`,
    ].join('\n');
  }
  return null;
}

function duplicateReceiptMessage({ employeeName, duplicate, vendor, currency, amount, date }) {
  return [
    'TEX duplicate receipt rejected',
    employeeName ? `Employee: ${employeeName}` : null,
    `Receipt: ${vendor || duplicate?.vendor || 'Unknown vendor'} - ${currency || duplicate?.currency || ''} ${Number(amount || duplicate?.amount || 0).toFixed(2)}`.trim(),
    `Date: ${date || duplicate?.date || 'Unknown date'}`,
    duplicate?.reason ? `Matched: ${duplicate.reason}` : 'Matched an existing expense already in TEX.',
    'Status: rejected',
  ].filter(Boolean).join('\n');
}

async function sendExpenseWhatsAppFeedback(company, expense, message, options = {}) {
  const recipient = expense?.whatsapp_chat_jid || expense?.employee_phone;
  if (!message || !recipient) return { sent: false, skipped: 'missing_recipient_or_message' };
  if (company?.whatsapp_provider === 'meta') {
    return sendMetaWhatsAppText(recipient, message);
  }
  if (company?.whatsapp_provider !== 'wappfly' || !company?.wappfly_api_token) {
    return { sent: false, skipped: 'wappfly_not_configured' };
  }
  return sendWappflyText(company.wappfly_api_token, recipient, message, {
    quotedMsgId: options.quotedMsgId,
  });
}

function parseTripSelectionReply(text) {
  const value = String(text || '').trim();
  const match = value.match(/^\s*(\d{1,2})\s*$/);
  return match ? Number(match[1]) : null;
}

function tripOptionLabel(trip) {
  const route = [trip.origin, trip.destination].filter(Boolean).join(' -> ');
  const driver = trip.driver_name ? ` (${trip.driver_name})` : '';
  return `${trip.name}${route ? ` - ${route}` : ''}${driver}`;
}

function tripSelectionMessage({ employeeName, expense, options, currency, amount, date, vendor }) {
  return [
    'TEX receipt received',
    employeeName ? `Employee: ${employeeName}` : null,
    vendor ? `Vendor: ${vendor}` : 'Vendor: needs review',
    amount ? `Amount: ${currency} ${Number(amount).toFixed(2)}` : 'Amount: needs review',
    date ? `Date: ${date}` : null,
    '',
    'Which open trip should this receipt be assigned to?',
    ...options.map((option) => `${option.number}. ${option.label}`),
    '',
    `Reply with ${options.map((option) => option.number).join(', ')}.`,
  ].filter((line) => line !== null).join('\n');
}

async function buildTripSelectionOptions(sql, companyId, employeeId) {
  const driverTrips = await sql`
    select t.id, t.name, t.origin, t.destination, de.name as driver_name
    from trips t
    left join employees de on de.id = t.driver_employee_id
    where t.company_id = ${companyId}
      and t.status = 'open'
      and t.driver_employee_id = ${employeeId}
    order by t.start_date nulls last, t.created_at desc
    limit 7
  `;
  let trips = driverTrips;
  if (trips.length === 0) {
    trips = await sql`
      select t.id, t.name, t.origin, t.destination, de.name as driver_name
      from trips t
      left join employees de on de.id = t.driver_employee_id
      where t.company_id = ${companyId}
        and t.status = 'open'
      order by
        case when t.driver_employee_id is null then 0 else 1 end,
        t.start_date nulls last,
        t.created_at desc
      limit 7
    `;
  }
  const options = trips.map((trip, index) => ({
    number: index + 1,
    type: 'trip',
    trip_id: trip.id,
    trip_name: trip.name,
    label: tripOptionLabel(trip),
  }));
  options.push({
    number: options.length + 1,
    type: 'general',
    trip_id: null,
    trip_name: null,
    label: 'General / Maintenance Expense',
  });
  return options;
}

async function createTripSelectionPrompt(sql, { company, employee, expense, provider, recipient, messageId, sendText }) {
  if (!expense?.id || expense.status === 'rejected') return { created: false, skipped: 'not_promptable' };
  await sql`
    update whatsapp_pending_actions
    set status = 'cancelled', resolved_at = now()
    where company_id = ${company.id}
      and employee_id = ${employee.id}
      and status = 'open'
  `;
  const options = await buildTripSelectionOptions(sql, company.id, employee.id);
  const action = (await sql`
    insert into whatsapp_pending_actions (
      company_id, employee_id, expense_id, sender_phone, whatsapp_chat_jid,
      provider, action, options, expires_at
    )
    values (
      ${company.id}, ${employee.id}, ${expense.id}, ${employee.phone_number || null},
      ${recipient || null}, ${provider}, 'select_trip', ${JSON.stringify(options)}::jsonb,
      now() + interval '1 hour'
    )
    returning id
  `)[0];
  const message = tripSelectionMessage({
    employeeName: employee.name,
    expense,
    options,
    currency: expense.currency,
    amount: expense.amount,
    date: expense.date,
    vendor: expense.vendor,
  });
  const reply = await sendText(message).catch((error) => ({ sent: false, error: error.message }));
  await sql`
    insert into audit_log (company_id, action, table_name, record_id, new_values)
    values (${company.id}, 'whatsapp_trip_selection_prompt', 'whatsapp_pending_actions', ${action.id}, ${JSON.stringify({
      expense_id: expense.id,
      employee_id: employee.id,
      provider,
      option_count: options.length,
      message_id: messageId || null,
      whatsapp_ack: { ...reply, message_preview: compactTextPreview(message) },
    })}::jsonb)
  `;
  return { created: true, action_id: action.id, reply };
}

async function resolveTripSelectionReply(sql, { company, employee, replyText, provider, recipient, messageId, sendText }) {
  const selectedNumber = parseTripSelectionReply(replyText);
  if (!selectedNumber) return { handled: false };
  const action = (await sql`
    select id, expense_id, options, expires_at
    from whatsapp_pending_actions
    where company_id = ${company.id}
      and employee_id = ${employee.id}
      and status = 'open'
      and action = 'select_trip'
    order by created_at desc
    limit 1
  `)[0] || null;
  if (!action) return { handled: false };
  if (new Date(action.expires_at).getTime() < Date.now()) {
    await sql`
      update whatsapp_pending_actions
      set status = 'expired', resolved_at = now()
      where id = ${action.id}
    `;
    const expiredText = 'This trip selection has expired. Please assign the receipt in TEX or resend the receipt.';
    const reply = await sendText(expiredText).catch((error) => ({ sent: false, error: error.message }));
    return { handled: true, status: 'expired', reply };
  }
  const options = Array.isArray(action.options)
    ? action.options
    : (() => {
        try {
          const parsed = JSON.parse(String(action.options || '[]'));
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      })();
  const selected = options.find((option) => Number(option.number) === selectedNumber);
  if (!selected) {
    const valid = options.map((option) => option.number).join(', ');
    const invalidText = `Please reply with one of the listed numbers: ${valid}.`;
    const reply = await sendText(invalidText).catch((error) => ({ sent: false, error: error.message }));
    return { handled: true, status: 'invalid_selection', reply };
  }

  let expense;
  if (selected.type === 'trip') {
    expense = (await sql`
      update expenses
      set trip_id = ${selected.trip_id},
          trip_name = ${selected.trip_name},
          updated_at = now()
      where id = ${action.expense_id}
        and company_id = ${company.id}
      returning id, vendor, amount::float as amount, currency, date, trip_name, category
    `)[0];
  } else {
    expense = (await sql`
      update expenses
      set trip_id = null,
          trip_name = null,
          category = case
            when category is null or lower(category) = 'receipt' then 'General'
            else category
          end,
          updated_at = now()
      where id = ${action.expense_id}
        and company_id = ${company.id}
      returning id, vendor, amount::float as amount, currency, date, trip_name, category
    `)[0];
  }
  await sql`
    update whatsapp_pending_actions
    set status = 'resolved', resolved_at = now()
    where id = ${action.id}
  `;
  const confirmation = selected.type === 'trip'
    ? [
        'Done. Receipt linked to trip:',
        selected.trip_name,
        `${expense?.currency || ''} ${Number(expense?.amount || 0).toFixed(2)}${expense?.vendor ? ` - ${expense.vendor}` : ''}`.trim(),
        'Status: pending approval',
      ].join('\n')
    : [
        'Done. Receipt marked as General / Maintenance Expense.',
        `${expense?.currency || ''} ${Number(expense?.amount || 0).toFixed(2)}${expense?.vendor ? ` - ${expense.vendor}` : ''}`.trim(),
        'Status: pending approval',
      ].join('\n');
  const reply = await sendText(confirmation).catch((error) => ({ sent: false, error: error.message }));
  await sql`
    insert into audit_log (company_id, action, table_name, record_id, new_values)
    values (${company.id}, 'whatsapp_trip_selection_resolved', 'expenses', ${action.expense_id}, ${JSON.stringify({
      pending_action_id: action.id,
      employee_id: employee.id,
      provider,
      selected_number: selectedNumber,
      selected,
      message_id: messageId || null,
      whatsapp_ack: { ...reply, message_preview: compactTextPreview(confirmation) },
    })}::jsonb)
  `;
  return { handled: true, status: 'resolved', expense_id: action.expense_id, selected, reply };
}

async function auth(req, res, pathName) {
  const sql = getSql();

  if (pathName === 'auth/me' && req.method === 'GET') {
    const user = await getSessionUser(req);
    if (!user) return json(res, 200, { user: null, session: null, profile: null });
    return json(res, 200, serializeAuthUser(await attachMemberships(sql, user)));
  }

  if (pathName === 'auth/signout' && req.method === 'POST') {
    clearSessionCookie(res);
    return json(res, 200, { ok: true });
  }

  if (pathName === 'auth/signin' && req.method === 'POST') {
    const body = await readJson(req);
    const email = String(body.email || '').trim().toLowerCase();
    const user = (await sql`
      select id, email, password_hash, full_name, avatar_url, company_id, role, super_admin, manager_id, is_ceo,
             approval_limit_aed, created_at, updated_at
      from app_users
      where email = ${email}
      limit 1
    `)[0];
    if (!user || !(await verifyPassword(String(body.password || ''), user.password_hash))) {
      return json(res, 401, { error: 'Invalid email or password' });
    }
    setSessionCookie(res, await issueSession(user));
    return json(res, 200, serializeAuthUser(await attachMemberships(sql, user)));
  }

  if (pathName === 'auth/request-password-reset' && req.method === 'POST') {
    const body = await readJson(req);
    const email = String(body.email || '').trim().toLowerCase();
    const targetUserId = body.target_user_id ? String(body.target_user_id).trim() : '';
    const requester = await getSessionUser(req);
    const requesterWithMemberships = requester ? await attachMemberships(sql, requester) : null;
    const user = targetUserId
      ? (await sql`select id, email, company_id from app_users where id = ${targetUserId} limit 1`)[0]
      : (email ? (await sql`select id, email, company_id from app_users where email = ${email} limit 1`)[0] : null);
    if (targetUserId && !requesterWithMemberships) return json(res, 401, { error: 'Not authenticated' });
    if (user) {
      if (targetUserId) {
        if (email && email !== String(user.email || '').toLowerCase()) {
          return json(res, 400, { error: 'Requested user does not match the submitted email' });
        }
        if (!canManageUsers(requesterWithMemberships, user.company_id)) {
          return json(res, 403, { error: 'You are not allowed to reset this user password' });
        }
      }
      await sql`
        update password_reset_tokens
        set used_at = now()
        where user_id = ${user.id}
          and used_at is null
      `;
      const token = crypto.randomBytes(32).toString('base64url');
      await sql`
        insert into password_reset_tokens (user_id, token_hash, expires_at)
        values (${user.id}, ${sha256(token)}, now() + interval '24 hours')
      `;
      const resetLink = `${appBaseUrl(req).replace(/\/$/, '')}/set-password?token=${encodeURIComponent(token)}`;
      const emailResult = await sendEmail({
        to: user.email,
        subject: 'Set your Torrevie TEX password',
        text: `Use this link to set your Torrevie TEX password: ${resetLink}`,
        html: `<p>Use this link to set your Torrevie TEX password:</p><p><a href="${resetLink}">Set password</a></p><p>This link expires in 24 hours.</p>`,
      });
      const canReturnLink = body.return_link && targetUserId && canManageUsers(requesterWithMemberships, user.company_id);
      return json(res, 200, { ok: true, sent: emailResult.sent, resetLink: canReturnLink ? resetLink : undefined, user: { id: user.id, email: user.email } });
    }
    return json(res, 200, { ok: true, sent: false });
  }

  if (pathName === 'auth/reset-password' && req.method === 'POST') {
    const body = await readJson(req);
    const password = String(body.password || '');
    if (password.length < 6) return json(res, 400, { error: 'Password must be at least 6 characters' });
    const row = (await sql`
      select rt.id, rt.user_id
      from password_reset_tokens rt
      where rt.token_hash = ${sha256(String(body.token || ''))}
        and rt.used_at is null
        and rt.expires_at > now()
      limit 1
    `)[0];
    if (!row) return json(res, 400, { error: 'This reset link is invalid or expired' });
    const user = (await sql`
      update app_users
      set password_hash = ${await hashPassword(password)}, updated_at = now()
      where id = ${row.user_id}
      returning id, email, full_name, avatar_url, company_id, role, super_admin, manager_id, is_ceo,
                approval_limit_aed, created_at, updated_at
    `)[0];
    await sql`update password_reset_tokens set used_at = now() where id = ${row.id}`;
    setSessionCookie(res, await issueSession(user));
    return json(res, 200, serializeAuthUser(await attachMemberships(sql, user)));
  }

  return methodNotAllowed(res);
}

async function webhooks(req, res, pathName) {
  const sql = getSql();

  if (pathName === 'webhooks/meta-whatsapp' && req.method === 'GET') {
    const verifyToken = process.env.META_WHATSAPP_VERIFY_TOKEN || '';
    const mode = String(req.query['hub.mode'] || '');
    const token = String(req.query['hub.verify_token'] || '');
    const challenge = String(req.query['hub.challenge'] || '');
    if (mode === 'subscribe' && verifyToken && token === verifyToken) {
      res.setHeader('Content-Type', 'text/plain');
      return res.status(200).send(challenge);
    }
    return json(res, 403, { error: 'Webhook verification failed' });
  }

  if (pathName === 'webhooks/meta-whatsapp' && req.method === 'POST') {
    const payload = await readJson(req);
    const handled = [];
    const entries = Array.isArray(payload?.entry) ? payload.entry : [];
    for (const entry of entries) {
      const changes = Array.isArray(entry?.changes) ? entry.changes : [];
      for (const change of changes) {
        if (change?.field !== 'messages') continue;
        const value = change.value || {};
        const phoneNumberId = String(value.metadata?.phone_number_id || '');
        let company = phoneNumberId ? (await sql`
          select id, name, country_code, base_currency, whatsapp_provider, wappfly_api_token
          from companies
          where meta_phone_number_id = ${phoneNumberId}
          limit 1
        `)[0] || null : null;
        if (!company) {
          company = (await sql`
            select id, name, country_code, base_currency, whatsapp_provider, wappfly_api_token
            from companies
            where name ilike '%Al Ameen%'
            order by created_at desc
            limit 1
          `)[0] || (await sql`
            select id, name, country_code, base_currency, whatsapp_provider, wappfly_api_token
            from companies
            order by created_at desc
            limit 1
          `)[0] || null;
        }
        if (!company) continue;

        const messages = Array.isArray(value.messages) ? value.messages : [];
        for (const message of messages) {
          const senderDigits = normalizePhone(message.from || '');
          const messageId = message.id || null;
          const messageType = String(message.type || '').toLowerCase();
          const imageNode = message.image || null;
          const documentNode = message.document || null;
          const hasReceiptMedia = !!imageNode || !!documentNode || ['image', 'document'].includes(messageType);
          const bodyText = String(message.text?.body || imageNode?.caption || documentNode?.caption || '').trim();
          if (!senderDigits || !messageId) continue;

          const employees = await sql`
            select id, name, phone_number, company_id, department, is_active
            from employees
            where company_id = ${company.id}
              and is_active = true
          `;
          const inboundVariants = new Set(phoneVariants(senderDigits).map(normalizePhone));
          const employee = employees.find((candidate) => inboundVariants.has(normalizePhone(candidate.phone_number)))
            || (hasReceiptMedia && employees.length === 1 ? employees[0] : null);

          if (messageId) {
            const existingAudit = (await sql`
              select record_id
              from audit_log
              where action in ('meta_whatsapp_receipt', 'meta_whatsapp_unregistered')
                and new_values->>'message_id' = ${String(messageId)}
              limit 1
            `)[0] || null;
            if (existingAudit) {
              handled.push({ message_id: messageId, status: 'duplicate' });
              continue;
            }
          }

          if (employee && !hasReceiptMedia) {
            const selection = await resolveTripSelectionReply(sql, {
              company,
              employee,
              replyText: bodyText,
              provider: 'meta',
              recipient: senderDigits,
              messageId,
              sendText: (text) => sendMetaWhatsAppText(senderDigits, text),
            });
            if (selection.handled) {
              handled.push({ message_id: messageId, status: `trip_selection_${selection.status}`, expense_id: selection.expense_id || null });
              continue;
            }
          }

          if (!hasReceiptMedia) {
            const reply = await sendMetaWhatsAppText(senderDigits, employee
              ? `Hi ${employee.name}. Please send a receipt photo to log an expense.`
              : 'Your number is not registered in TEX. Please ask your manager to add your WhatsApp number to TEX.'
            ).catch((error) => ({ sent: false, error: error.message }));
            await sql`
              insert into audit_log (company_id, action, table_name, new_values)
              values (${company.id}, 'meta_whatsapp_text', 'webhooks', ${JSON.stringify({ sender: senderDigits, message_id: messageId, reply })}::jsonb)
            `;
            handled.push({ message_id: messageId, status: 'text_reply' });
            continue;
          }

          let receiptImageUrl = null;
          let receiptFileId = null;
          let mediaWarning = null;
          let parsedReceipt = null;
          let parseWarning = null;
          const mediaId = imageNode?.id || documentNode?.id || null;
          const receiptMedia = await downloadMetaWhatsAppMedia(mediaId, imageNode?.mime_type || documentNode?.mime_type || 'image/jpeg');
          if (receiptMedia?.buffer) {
            try {
              const receipt = (await sql`
                insert into receipt_files (company_id, uploaded_by, file_name, content_type, size_bytes, data)
                values (
                  ${company.id}, ${null},
                  ${receiptFileName(employee ? 'meta-whatsapp' : 'meta-whatsapp-unregistered', messageId, receiptMedia.contentType || 'image/jpeg')},
                  ${receiptMedia.contentType || 'image/jpeg'},
                  ${receiptMedia.buffer.length},
                  decode(${receiptMedia.buffer.toString('base64')}, 'base64')
                )
                returning id
              `)[0];
              receiptFileId = receipt.id;
              receiptImageUrl = `/api/tex/receipts/${receipt.id}`;
              if (String(receiptMedia.contentType || '').startsWith('image/')) {
                const parsed = await parseReceiptImage({
                  imageBase64: receiptMedia.buffer.toString('base64'),
                  mediaType: receiptMedia.contentType || 'image/jpeg',
                  countryCode: company.country_code,
                });
                if (parsed.ok) parsedReceipt = parsed.data;
                else parseWarning = parsed.status ? `${parsed.error || 'Receipt OCR failed'} (${parsed.status})` : (parsed.error || 'Receipt OCR failed');
              }
            } catch (error) {
              console.error('meta media storage failed:', error);
              mediaWarning = error.message;
            }
          } else {
            mediaWarning = receiptMedia?.warning || 'Receipt image was not available from Meta';
          }

          if (!employee) {
            const submission = (await sql`
              insert into unregistered_whatsapp_submissions (
                company_id, sender_raw, sender_phone, whatsapp_chat_jid, message_id, session_id,
                message_text, receipt_file_id, receipt_image_url, payload
              )
              values (
                ${company.id}, ${senderDigits}, ${senderDigits}, ${senderDigits},
                ${String(messageId)}, ${phoneNumberId || null}, ${bodyText || null},
                ${receiptFileId}, ${receiptImageUrl},
                ${JSON.stringify({ provider: 'meta', media_warning: mediaWarning, message_type: messageType })}::jsonb
              )
              returning id
            `)[0];
            const replyText = [
              'Your number is not registered in TEX.',
              receiptImageUrl ? 'The receipt was held for admin review and was not added to expenses yet.' : 'An admin has been notified, but the receipt image could not be stored.',
              'Please ask your manager to add your WhatsApp number to TEX.',
            ].join('\n');
            const reply = await sendMetaWhatsAppText(senderDigits, replyText).catch((error) => ({ sent: false, error: error.message }));
            await sql`
              insert into audit_log (company_id, action, table_name, record_id, new_values)
              values (${company.id}, 'meta_whatsapp_unregistered', 'unregistered_whatsapp_submissions', ${submission.id}, ${JSON.stringify({
                sender: senderDigits,
                message_id: messageId,
                phone_number_id: phoneNumberId || null,
                receipt_media_saved: !!receiptImageUrl,
                media_warning: mediaWarning,
                whatsapp_ack: { ...reply, message_preview: compactTextPreview(replyText) },
              })}::jsonb)
            `;
            await sql`
              insert into notifications (company_id, user_id, title, body, type)
              values (${company.id}, null, 'Unregistered WhatsApp sender', ${`Receipt received from ${senderDigits}. Review it from Notifications to add the sender or assign it to an employee.`}, 'wappfly_unregistered')
            `;
            handled.push({ message_id: messageId, status: 'unregistered_queued', submission_id: submission.id });
            continue;
          }

          const baseCurrency = String(company.base_currency || 'AED').toUpperCase();
          const parsedAmount = Number(parsedReceipt?.amount || 0);
          const parsedCurrency = String(parsedReceipt?.currency || baseCurrency).toUpperCase();
          const parsedDate = parsedReceipt?.date || isoDate();
          const exchange = parsedAmount > 0
            ? await calculateExchange(sql, parsedAmount, parsedCurrency, baseCurrency)
            : { rate: 1, baseAmount: 0, warning: null };
          const vendor = String(parsedReceipt?.vendor || '').trim() || null;
          const policyReasons = [];
          if (!receiptImageUrl || !parsedReceipt || !vendor || !parsedAmount) policyReasons.push(receiptImageUrl ? 'WhatsApp receipt OCR requires manual review' : 'Meta receipt image unavailable');
          if (parseWarning) policyReasons.push(parseWarning);
          if (mediaWarning && !receiptImageUrl) policyReasons.push(mediaWarning);
          if (parsedReceipt?.date_warning) policyReasons.push('Receipt date was unreadable; submission date used');
          if (exchange.warning) policyReasons.push(exchange.warning);
          const duplicate = vendor && parsedAmount > 0 ? await findDuplicateExpense(sql, {
            company_id: company.id,
            employee_id: employee.id,
            vendor,
            amount: parsedAmount,
            currency: parsedCurrency,
            date: parsedDate,
          }) : null;
          if (duplicate) policyReasons.push(`Duplicate receipt rejected: ${duplicate.reason}`);
          const notes = [
            parsedReceipt?.notes || null,
            bodyText || null,
            receiptImageUrl && (!parsedReceipt || !vendor || !parsedAmount) ? 'Receipt image saved; pending manual OCR review' : null,
          ].filter(Boolean).join(' | ') || null;
          const expense = (await sql`
            insert into expenses (
              company_id, employee_id, employee_name, employee_phone, whatsapp_chat_jid, vendor, date,
              amount, currency, base_amount, exchange_rate, category, expense_type,
              payment_method, notes, tax_id_number, tax_amount, receipt_image_url,
              status, source, policy_flag, policy_flag_reason, rejected_at, rejected_reason
            )
            values (
              ${company.id}, ${employee.id}, ${employee.name}, ${employee.phone_number}, ${senderDigits}, ${vendor}, ${parsedDate},
              ${parsedAmount}, ${parsedCurrency}, ${exchange.baseAmount}, ${exchange.rate}, ${parsedReceipt?.category || 'Receipt'}, ${'receipt'},
              ${parsedReceipt?.payment_method || null}, ${notes},
              ${parsedReceipt?.tax_id_number || null}, ${parsedReceipt?.tax_amount == null ? null : Number(parsedReceipt.tax_amount)},
              ${receiptImageUrl}, ${duplicate ? 'rejected' : 'pending'}, ${'whatsapp'}, ${policyReasons.length > 0}, ${policyReasons.join(' | ') || null},
              ${duplicate ? new Date().toISOString() : null}, ${duplicate ? duplicate.reason : null}
            )
            returning id, company_id, employee_name, employee_phone, whatsapp_chat_jid, vendor, date, amount::float as amount, currency, status, source, receipt_image_url
          `)[0];
          await sql`
            insert into audit_log (company_id, action, table_name, record_id, new_values)
            values (${company.id}, 'meta_whatsapp_receipt', 'expenses', ${expense.id}, ${JSON.stringify({
              ...expense,
              message_id: messageId,
              phone_number_id: phoneNumberId || null,
              receipt_media_saved: !!receiptImageUrl,
              ocr_applied: !!parsedReceipt,
              ocr_model: parsedReceipt?.ocr_model || null,
              ocr_warning: parseWarning,
              media_warning: mediaWarning,
              duplicate,
            })}::jsonb)
          `;
          await sql`
            insert into notifications (company_id, user_id, title, body, type, related_expense_id)
            values (${company.id}, null, ${duplicate ? 'Duplicate WhatsApp receipt rejected' : 'WhatsApp receipt received'}, ${duplicate ? `${employee.name} sent a duplicate receipt that was automatically rejected.` : `${employee.name} sent a receipt via WhatsApp${policyReasons.length ? '. Manual review required.' : `: ${parsedCurrency} ${parsedAmount}`}`}, ${duplicate ? 'policy_violation' : 'expense_submitted'}, ${expense.id})
          `;
          if (duplicate) {
            const replyText = duplicateReceiptMessage({ employeeName: employee.name, duplicate, vendor, currency: parsedCurrency, amount: parsedAmount, date: parsedDate });
            const reply = await sendMetaWhatsAppText(senderDigits, replyText).catch((error) => ({ sent: false, error: error.message }));
            await sql`
              update audit_log
              set new_values = coalesce(new_values, '{}'::jsonb) || ${JSON.stringify({ whatsapp_ack: { ...reply, message_preview: compactTextPreview(replyText) } })}::jsonb
              where company_id = ${company.id}
                and action = 'meta_whatsapp_receipt'
                and record_id = ${expense.id}
            `;
          } else {
            await createTripSelectionPrompt(sql, {
              company,
              employee,
              expense,
              provider: 'meta',
              recipient: senderDigits,
              messageId,
              sendText: (text) => sendMetaWhatsAppText(senderDigits, text),
            });
          }
          handled.push({ message_id: messageId, status: 'receipt_saved', expense_id: expense.id });
        }
      }
    }
    return json(res, 200, { ok: true, handled });
  }

  if (pathName === 'webhooks/wappfly' && req.method === 'OPTIONS') {
    return json(res, 200, { ok: true });
  }

  if (pathName === 'webhooks/wappfly' && req.method === 'POST') {
    const expected = process.env.WAPPFLY_WEBHOOK_SECRET || '';
    if (expected) {
      const provided = String(req.query.token || req.headers['x-webhook-token'] || '');
      if (provided !== expected) return json(res, 401, { error: 'Unauthorized' });
    }

    const payload = await readJson(req);
    const event = payload?.event || 'messages.received';
    if (event !== 'messages.received') return json(res, 200, { ok: true, skipped: event });

    const message = payload?.data?.messages || payload?.message || payload;
    const key = message?.key || {};
    if (key.fromMe === true || key.from_me === true || message?.from_me === true) {
      return json(res, 200, { ok: true, skipped: 'fromMe' });
    }

    const sessionId = payload?.session?.id != null ? String(payload.session.id) : String(payload?.session_id || '');
    const sender =
      key.cleanedSenderPn ||
      key.senderPn ||
      key.remoteJid ||
      key.senderLid ||
      message?.sender_jid ||
      message?.chat_jid ||
      message?.from ||
      message?.phone ||
      '';
    const senderRaw = String(sender || '').trim();
    const senderDigits = normalizePhone(senderRaw.replace(/@s\.whatsapp\.net$/i, ''));
    if (!senderRaw && !senderDigits) return json(res, 200, { ok: true, skipped: 'no_sender' });
    const replyTo = wappflyReplyTarget(key, message, senderRaw || senderDigits);

    const messageNode = message?.message || {};
    const bodyText = String(
      messageNode.conversation ||
      messageNode.extendedTextMessage?.text ||
      message?.messageBody ||
      message?.body ||
      '',
    ).trim();
    const imageNode = messageNode.imageMessage || message?.imageMessage || null;
    const documentNode = messageNode.documentMessage || message?.documentMessage || null;
    const hasReceiptMedia = !!imageNode || !!documentNode || ['image', 'document'].includes(String(message?.type || '').toLowerCase());
    const messageId = key.id || message?.msg_id || message?.id || null;

    let company = null;
    if (sessionId) {
      company = (await sql`
        select id, name, country_code, base_currency, wappfly_api_token, wappfly_session_id
        from companies
        where whatsapp_provider = 'wappfly'
          and wappfly_session_id = ${sessionId}
        limit 1
      `)[0] || null;
    }
    if (!company) {
      company = (await sql`
        select id, name, country_code, base_currency, wappfly_api_token, wappfly_session_id
        from companies
        where whatsapp_provider = 'wappfly'
          and wappfly_api_token is not null
        order by created_at desc
        limit 1
      `)[0] || null;
    }
    if (!company) return json(res, 200, { ok: true, status: 'unmapped_session', session_id: sessionId || null });

    const employees = await sql`
      select id, name, phone_number, company_id, department, is_active
      from employees
      where company_id = ${company.id}
        and is_active = true
    `;
    const inboundVariants = new Set(phoneVariants(senderDigits).map(normalizePhone));
    const pushName = String(message?.pushName || message?.push_name || '').trim().toLowerCase();
    const employee = employees.find((candidate) => inboundVariants.has(normalizePhone(candidate.phone_number)))
      || (pushName ? employees.find((candidate) => String(candidate.name || '').trim().toLowerCase() === pushName) : null)
      || (hasReceiptMedia && employees.length === 1 ? employees[0] : null);
    if (!employee) {
      const duplicateSubmission = messageId ? (await sql`
        select id, status
        from unregistered_whatsapp_submissions
        where company_id = ${company.id}
          and message_id = ${String(messageId)}
        limit 1
      `)[0] || null : null;
      if (duplicateSubmission) {
        return json(res, 200, { ok: true, status: 'duplicate_unregistered', submission_id: duplicateSubmission.id });
      }

      let receiptImageUrl = null;
      let receiptFileId = null;
      let mediaWarning = null;
      let receiptMedia = null;
      if (hasReceiptMedia) {
        receiptMedia = await downloadWappflyReceiptMedia({
          token: company.wappfly_api_token,
          imageNode,
          documentNode,
          message,
          messageId,
          remoteJid: key.remoteJid || message?.chat_jid || message?.sender_jid || '',
        });
        if (receiptMedia?.buffer) {
          try {
            const receipt = (await sql`
              insert into receipt_files (company_id, uploaded_by, file_name, content_type, size_bytes, data)
              values (
                ${company.id}, ${null},
                ${receiptFileName('whatsapp-unregistered', messageId, receiptMedia.contentType || 'image/jpeg')},
                ${receiptMedia.contentType || 'image/jpeg'},
                ${receiptMedia.buffer.length},
                decode(${receiptMedia.buffer.toString('base64')}, 'base64')
              )
              returning id
            `)[0];
            receiptFileId = receipt.id;
            receiptImageUrl = `/api/tex/receipts/${receipt.id}`;
          } catch (error) {
            console.error('wappfly unregistered media storage failed:', error);
            mediaWarning = error.message;
          }
        } else {
          mediaWarning = receiptMedia?.warning || 'Receipt image was not available from Wappfly';
        }
      }

      const submission = (await sql`
        insert into unregistered_whatsapp_submissions (
          company_id, sender_raw, sender_phone, whatsapp_chat_jid, message_id, session_id,
          message_text, receipt_file_id, receipt_image_url, payload
        )
        values (
          ${company.id}, ${senderRaw || null}, ${senderDigits || null}, ${replyTo || null},
          ${messageId ? String(messageId) : null}, ${sessionId || null},
          ${String(bodyText || imageNode?.caption || documentNode?.caption || '').trim() || null},
          ${receiptFileId}, ${receiptImageUrl},
          ${JSON.stringify({
            warning: mediaWarning,
            has_receipt_media: hasReceiptMedia,
            receipt_media_source: receiptMedia?.source || null,
            message_keys: Object.keys(message || {}),
          })}::jsonb
        )
        returning id, sender_phone, receipt_image_url, created_at
      `)[0];

      const replyText = [
        'Your number is not registered in TEX.',
        hasReceiptMedia
          ? 'The receipt was held for admin review and was not added to expenses yet.'
          : 'An admin has been notified, but only registered employees can submit receipts.',
        'Please ask your manager to add your WhatsApp number to TEX.',
      ].join('\n');
      const reply = await sendWappflyTextWithPhoneCopy(
        company.wappfly_api_token,
        replyTo,
        senderDigits,
        replyText,
        { quotedMsgId: messageId },
      ).catch((error) => ({ sent: false, error: error.message }));
      await sql`
        insert into audit_log (company_id, action, table_name, record_id, new_values)
        values (${company.id}, 'wappfly_unregistered', 'unregistered_whatsapp_submissions', ${submission.id}, ${JSON.stringify({
          sender: senderDigits,
          sender_raw: senderRaw,
          reply_to: replyTo || null,
          session_id: sessionId || null,
          message_id: messageId,
          receipt_media_saved: !!receiptImageUrl,
          media_warning: mediaWarning,
          whatsapp_ack: {
            ...reply,
            to: reply?.to || replyTo || null,
            message_preview: compactTextPreview(replyText),
          },
        })}::jsonb)
      `;
      const recentNotice = (await sql`
        select id
        from notifications
        where company_id = ${company.id}
          and type = 'wappfly_unregistered'
          and body like ${`%${senderDigits || senderRaw}%`}
          and created_at >= now() - interval '2 minutes'
        limit 1
      `)[0] || null;
      if (!recentNotice) {
        await sql`
          insert into notifications (company_id, user_id, title, body, type)
          values (${company.id}, null, 'Unregistered WhatsApp sender', ${`${hasReceiptMedia ? 'Receipt' : 'Message'} received from ${senderDigits || senderRaw}. Review it from Notifications to add the sender or assign it to an employee.`}, 'wappfly_unregistered')
        `;
      }
      return json(res, 200, { ok: true, status: 'unregistered_queued', submission });
    }

    const upper = bodyText.toUpperCase();
    if (!hasReceiptMedia) {
      const selection = await resolveTripSelectionReply(sql, {
        company,
        employee,
        replyText: bodyText,
        provider: 'wappfly',
        recipient: replyTo,
        messageId,
        sendText: (text) => sendWappflyText(company.wappfly_api_token, replyTo, text, { quotedMsgId: messageId }),
      });
      if (selection.handled) {
        return json(res, 200, { ok: true, status: `trip_selection_${selection.status}`, expense_id: selection.expense_id || null, reply: selection.reply });
      }
    }

    if (!hasReceiptMedia && upper === 'HELP') {
      const reply = await sendWappflyText(
        company.wappfly_api_token,
        replyTo,
        'TEX: send a receipt photo to log an expense. Reply STATUS to see your recent expenses.',
        { quotedMsgId: messageId },
      ).catch((error) => ({ sent: false, error: error.message }));
      return json(res, 200, { ok: true, status: 'help_reply', reply });
    }

    if (!hasReceiptMedia && upper === 'STATUS') {
      const recent = await sql`
        select vendor, currency, amount::float as amount, date, status
        from expenses
        where company_id = ${company.id}
          and employee_id = ${employee.id}
        order by created_at desc
        limit 3
      `;
      const text = recent.length === 0
        ? 'You have no recent expenses in TEX.'
        : `Your last ${recent.length} expenses:\n${recent.map((expense) => `- ${expense.vendor || 'Pending receipt'} ${expense.currency} ${expense.amount} (${expense.date}) - ${expense.status}`).join('\n')}`;
      const reply = await sendWappflyText(company.wappfly_api_token, replyTo, text, { quotedMsgId: messageId })
        .catch((error) => ({ sent: false, error: error.message }));
      return json(res, 200, { ok: true, status: 'status_reply', reply });
    }

    if (!hasReceiptMedia) {
      const reply = await sendWappflyText(
        company.wappfly_api_token,
        replyTo,
        `Hi ${employee.name}. Please send a receipt photo to log an expense, or reply HELP for instructions.`,
        { quotedMsgId: messageId },
      ).catch((error) => ({ sent: false, error: error.message }));
      return json(res, 200, { ok: true, status: 'generic_reply', reply });
    }

    if (messageId) {
      const existing = (await sql`
        select record_id
        from audit_log
        where company_id = ${company.id}
          and action = 'wappfly_receipt'
          and new_values->>'message_id' = ${String(messageId)}
        limit 1
      `)[0];
      if (existing?.record_id) return json(res, 200, { ok: true, status: 'duplicate', expense_id: existing.record_id });
    }

    const caption = String(bodyText || imageNode?.caption || documentNode?.caption || '').trim();
    let receiptImageUrl = null;
    let mediaWarning = null;
    let parsedReceipt = null;
    let parseWarning = null;
    const receiptMedia = await downloadWappflyReceiptMedia({
      token: company.wappfly_api_token,
      imageNode,
      documentNode,
      message,
      messageId,
      remoteJid: key.remoteJid || message?.chat_jid || message?.sender_jid || '',
    });
    if (receiptMedia?.buffer) {
      try {
        const receipt = (await sql`
          insert into receipt_files (company_id, uploaded_by, file_name, content_type, size_bytes, data)
          values (${company.id}, ${null}, ${receiptFileName('whatsapp', messageId, receiptMedia.contentType || 'image/jpeg')}, ${receiptMedia.contentType || 'image/jpeg'}, ${receiptMedia.buffer.length}, decode(${receiptMedia.buffer.toString('base64')}, 'base64'))
          returning id
        `)[0];
        receiptImageUrl = `/api/tex/receipts/${receipt.id}`;
        const parsed = await parseReceiptImage({
          imageBase64: receiptMedia.buffer.toString('base64'),
          mediaType: receiptMedia.contentType || 'image/jpeg',
          countryCode: company.country_code,
        });
        if (parsed.ok) parsedReceipt = parsed.data;
        else parseWarning = parsed.status ? `${parsed.error || 'Receipt OCR failed'} (${parsed.status})` : (parsed.error || 'Receipt OCR failed');
      } catch (error) {
        console.error('wappfly media storage failed:', error);
        mediaWarning = error.message;
      }
    } else {
      mediaWarning = receiptMedia?.warning || 'Receipt image was not available from Wappfly';
    }

    const baseCurrency = String(company.base_currency || 'AED').toUpperCase();
    const parsedAmount = Number(parsedReceipt?.amount || 0);
    const parsedCurrency = String(parsedReceipt?.currency || baseCurrency).toUpperCase();
    const parsedDate = parsedReceipt?.date || isoDate();
    const exchange = parsedAmount > 0
      ? await calculateExchange(sql, parsedAmount, parsedCurrency, baseCurrency)
      : { rate: 1, baseAmount: 0, warning: null };
    const vendor = String(parsedReceipt?.vendor || '').trim() || null;
    const needsManual = !receiptImageUrl || !parsedReceipt || !vendor || !parsedAmount;
    const policyReasons = [];
    if (needsManual) {
      policyReasons.push(receiptImageUrl ? 'WhatsApp receipt OCR requires manual review' : 'Wappfly receipt image unavailable');
    }
    if (parseWarning) policyReasons.push(parseWarning);
    if (mediaWarning && !receiptImageUrl) policyReasons.push(mediaWarning);
    if (parsedReceipt?.date_warning) policyReasons.push('Receipt date was unreadable; submission date used');
    if (exchange.warning) policyReasons.push(exchange.warning);

    const duplicate = !needsManual ? await findDuplicateExpense(sql, {
      company_id: company.id,
      employee_id: employee.id,
      vendor,
      amount: parsedAmount,
      currency: parsedCurrency,
      date: parsedDate,
    }) : null;
    if (duplicate) policyReasons.push(`Duplicate receipt rejected: ${duplicate.reason}`);

    const notes = [
      parsedReceipt?.notes || null,
      caption || null,
      !receiptImageUrl ? 'Receipt image could not be downloaded from Wappfly; manual entry required' : null,
      receiptImageUrl && needsManual ? 'Receipt image saved; pending manual OCR review' : null,
    ].filter(Boolean).join(' | ') || null;

    const expense = (await sql`
      insert into expenses (
        company_id, employee_id, employee_name, employee_phone, whatsapp_chat_jid, vendor, date,
        amount, currency, base_amount, exchange_rate, category, expense_type,
        payment_method, notes, tax_id_number, tax_amount, receipt_image_url,
        status, source, policy_flag, policy_flag_reason, rejected_at, rejected_reason
      )
      values (
        ${company.id}, ${employee.id}, ${employee.name}, ${employee.phone_number}, ${replyTo || null}, ${vendor}, ${parsedDate},
        ${parsedAmount}, ${parsedCurrency}, ${exchange.baseAmount}, ${exchange.rate}, ${parsedReceipt?.category || 'Receipt'}, ${'receipt'},
        ${parsedReceipt?.payment_method || null}, ${notes},
        ${parsedReceipt?.tax_id_number || null}, ${parsedReceipt?.tax_amount == null ? null : Number(parsedReceipt.tax_amount)},
        ${receiptImageUrl}, ${duplicate ? 'rejected' : 'pending'}, ${'whatsapp'}, ${policyReasons.length > 0}, ${policyReasons.join(' | ') || null},
        ${duplicate ? new Date().toISOString() : null}, ${duplicate ? duplicate.reason : null}
      )
      returning id, company_id, employee_name, employee_phone, whatsapp_chat_jid, vendor, date, amount::float as amount, currency, status, source, receipt_image_url
    `)[0];
    await sql`
      insert into audit_log (company_id, action, table_name, record_id, new_values)
      values (${company.id}, 'wappfly_receipt', 'expenses', ${expense.id}, ${JSON.stringify({
        ...expense,
        message_id: messageId,
        session_id: sessionId || null,
        reply_to: replyTo || null,
        receipt_media_source: receiptMedia?.source || null,
        receipt_media_saved: !!receiptImageUrl,
        ocr_applied: !!parsedReceipt,
        ocr_model: parsedReceipt?.ocr_model || null,
        ocr_warning: parseWarning,
        media_warning: mediaWarning,
        duplicate,
        payload_debug: {
          message_keys: Object.keys(message || {}),
          image_keys: Object.keys(imageNode || {}),
          document_keys: Object.keys(documentNode || {}),
        },
      })}::jsonb)
    `;
    await sql`
      insert into notifications (company_id, user_id, title, body, type, related_expense_id)
      values (${company.id}, null, ${duplicate ? 'Duplicate WhatsApp receipt rejected' : 'WhatsApp receipt received'}, ${duplicate ? `${employee.name} sent a duplicate receipt that was automatically rejected.` : `${employee.name} sent a receipt via WhatsApp${needsManual ? '. Manual review required.' : `: ${parsedCurrency} ${parsedAmount}`}`}, ${duplicate ? 'policy_violation' : 'expense_submitted'}, ${expense.id})
    `;
    let reply = null;
    if (duplicate) {
      const replyText = duplicateReceiptMessage({ employeeName: employee.name, duplicate, vendor, currency: parsedCurrency, amount: parsedAmount, date: parsedDate });
      reply = await sendWappflyText(
        company.wappfly_api_token,
        replyTo,
        replyText,
        { quotedMsgId: messageId },
      ).catch((error) => ({ sent: false, error: error.message }));
      await sql`
        update audit_log
        set new_values = coalesce(new_values, '{}'::jsonb) || ${JSON.stringify({
          whatsapp_ack: {
            ...reply,
            to: reply?.to || replyTo || null,
            message_preview: compactTextPreview(replyText),
          },
        })}::jsonb
        where company_id = ${company.id}
          and action = 'wappfly_receipt'
          and record_id = ${expense.id}
      `;
    } else {
      const prompt = await createTripSelectionPrompt(sql, {
        company,
        employee,
        expense,
        provider: 'wappfly',
        recipient: replyTo,
        messageId,
        sendText: (text) => sendWappflyText(company.wappfly_api_token, replyTo, text, { quotedMsgId: messageId }),
      });
      reply = prompt.reply;
    }

    return json(res, 200, { ok: true, status: 'receipt_saved', expense, reply });
  }

  return notFound(res);
}

async function tex(req, res, pathName) {
  let user = await requireUser(req, res);
  if (!user) return;
  const sql = getSql();
  user = await attachMemberships(sql, user);

  if (pathName === 'tex/onboarding/countries' && req.method === 'GET') {
    const countries = await sql`
      select country_code, country_name, base_currency, currency_name, vat_rate, tax_name
      from country_configs
      order by country_name
    `;
    return json(res, 200, { countries });
  }

  if (pathName === 'tex/onboarding/complete' && req.method === 'POST') {
    if (user.super_admin === true) {
      return json(res, 400, { error: 'Platform admins create tenants from Admin Panel.' });
    }
    if (user.company_id || (user.memberships || []).length > 0) {
      return json(res, 409, { error: 'This account is already assigned to a company.' });
    }

    const body = await readJson(req);
    const name = String(body.company_name || '').trim();
    const countryCode = String(body.country_code || '').trim().toUpperCase();
    const fullName = String(body.full_name || '').trim() || user.full_name || null;
    const ceoName = String(body.ceo_name || '').trim();
    if (!name) return json(res, 400, { error: 'Company name is required' });
    if (!countryCode) return json(res, 400, { error: 'Country is required' });

    const config = (await sql`
      select country_code, base_currency
      from country_configs
      where country_code = ${countryCode}
      limit 1
    `)[0];
    if (!config) return json(res, 400, { error: 'Selected country is not configured' });

    const company = (await sql`
      insert into companies (name, country_code, base_currency)
      values (${name}, ${config.country_code}, ${config.base_currency})
      returning id, name, country_code, base_currency, plan, created_at
    `)[0];
    const isCeo = !ceoName || (fullName && ceoName.toLowerCase() === fullName.toLowerCase());
    const updatedUser = (await sql`
      update app_users
      set
        company_id = ${company.id},
        full_name = ${fullName},
        role = 'admin',
        is_ceo = ${isCeo},
        manager_id = null,
        updated_at = now()
      where id = ${user.id}
      returning id, email, full_name, avatar_url, company_id, role, super_admin, manager_id, is_ceo,
                approval_limit_aed, created_at, updated_at
    `)[0];
    await sql`
      insert into user_company_memberships (user_id, company_id, role, is_default)
      values (${updatedUser.id}, ${company.id}, 'admin', true)
      on conflict (user_id, company_id) do update set
        role = excluded.role,
        is_default = true,
        updated_at = now()
    `;
    await sql`
      insert into audit_log (company_id, user_id, action, table_name, record_id, new_values)
      values (${company.id}, ${updatedUser.id}, 'create', 'companies', ${company.id}, ${JSON.stringify(company)}::jsonb)
    `;

    return json(res, 201, serializeAuthUser(await attachMemberships(sql, updatedUser)));
  }

  if (pathName === 'tex/bootstrap' && req.method === 'GET') {
    const company = user.company_id
      ? (await sql`select id, name, base_currency, country_code, logo_url from companies where id = ${user.company_id} limit 1`)[0] || null
      : null;
    return json(res, 200, {
      profile: serializeAuthUser(user).profile,
      company,
    });
  }

  if (pathName === 'tex/notifications' && req.method === 'GET') {
    const companyId = String(req.query.company_id || '');
    if (!companyId) return json(res, 400, { error: 'company_id is required' });
    const scopedUser = await requireCompanyAccess(sql, req, res, companyId);
    if (!scopedUser) return;
    const role = roleForCompany(scopedUser, companyId);
    const canSeeBroadcast = scopedUser.super_admin === true || ['admin', 'finance', 'manager', 'coordinator'].includes(role);
    const notifications = await sql`
      select
        id, company_id, user_id, title, body, type, related_expense_id, related_trip_id, is_read, created_at
      from notifications
      where company_id = ${companyId}
        and (
          user_id = ${scopedUser.id}
          or (${canSeeBroadcast} = true and user_id is null)
        )
      order by created_at desc
      limit 100
    `;
    return json(res, 200, { notifications });
  }

  if (pathName === 'tex/notifications' && req.method === 'POST') {
    const body = await readJson(req);
    const companyId = String(body.company_id || '');
    if (!companyId) return json(res, 400, { error: 'company_id is required' });
    const scopedUser = await requireCompanyAccess(sql, req, res, companyId);
    if (!scopedUser) return;
    const title = String(body.title || '').trim();
    if (!title) return json(res, 400, { error: 'Notification title is required' });
    const targetUserId = body.user_id ? String(body.user_id) : null;
    if (targetUserId && targetUserId !== scopedUser.id && scopedUser.super_admin !== true && !['admin', 'manager', 'finance', 'coordinator'].includes(roleForCompany(scopedUser, companyId))) {
      return json(res, 403, { error: 'You are not allowed to notify this user' });
    }
    const relatedExpenseId = body.related_expense_id ? String(body.related_expense_id) : null;
    const relatedTripId = body.related_trip_id ? String(body.related_trip_id) : null;
    const notification = (await sql`
      insert into notifications (company_id, user_id, title, body, type, related_expense_id, related_trip_id)
      values (
        ${companyId}, ${targetUserId}, ${title},
        ${String(body.body || '').trim() || null},
        ${String(body.type || 'sync_complete').trim() || 'sync_complete'},
        ${relatedExpenseId},
        ${relatedTripId}
      )
      returning id, company_id, user_id, title, body, type, related_expense_id, related_trip_id, is_read, created_at
    `)[0];
    return json(res, 201, { notification });
  }

  if (pathName === 'tex/notifications/read-all' && req.method === 'PATCH') {
    const body = await readJson(req);
    const companyId = String(body.company_id || req.query.company_id || '');
    if (!companyId) return json(res, 400, { error: 'company_id is required' });
    const scopedUser = await requireCompanyAccess(sql, req, res, companyId);
    if (!scopedUser) return;
    const role = roleForCompany(scopedUser, companyId);
    const canSeeBroadcast = scopedUser.super_admin === true || ['admin', 'finance', 'manager', 'coordinator'].includes(role);
    const updated = await sql`
      update notifications
      set is_read = true
      where company_id = ${companyId}
        and is_read = false
        and (
          user_id = ${scopedUser.id}
          or (${canSeeBroadcast} = true and user_id is null)
        )
      returning id
    `;
    return json(res, 200, { updated: updated.length });
  }

  const notificationMatch = pathName.match(/^tex\/notifications\/([0-9a-f-]+)\/read$/i);
  if (notificationMatch && req.method === 'PATCH') {
    const existing = (await sql`select id, company_id, user_id from notifications where id = ${notificationMatch[1]} limit 1`)[0];
    if (!existing) return json(res, 404, { error: 'Notification not found' });
    const scopedUser = await requireCompanyAccess(sql, req, res, existing.company_id);
    if (!scopedUser) return;
    const role = roleForCompany(scopedUser, existing.company_id);
    const canReadBroadcast = scopedUser.super_admin === true || ['admin', 'finance', 'manager', 'coordinator'].includes(role);
    if (existing.user_id && existing.user_id !== scopedUser.id) return json(res, 403, { error: 'You are not allowed to update this notification' });
    if (!existing.user_id && !canReadBroadcast) return json(res, 403, { error: 'You are not allowed to update this notification' });
    const notification = (await sql`
      update notifications
      set is_read = true
      where id = ${existing.id}
      returning id, company_id, user_id, title, body, type, related_expense_id, related_trip_id, is_read, created_at
    `)[0];
    return json(res, 200, { notification });
  }

  if (pathName === 'tex/unregistered-whatsapp' && req.method === 'GET') {
    const companyId = String(req.query.company_id || '');
    if (!companyId) return json(res, 400, { error: 'company_id is required' });
    const scopedUser = await requireCompanyAccess(sql, req, res, companyId);
    if (!scopedUser) return;
    const role = roleForCompany(scopedUser, companyId);
    if (scopedUser.super_admin !== true && !['admin', 'finance', 'manager', 'coordinator'].includes(role)) {
      return json(res, 403, { error: 'You are not allowed to review WhatsApp submissions' });
    }
    const submissions = await sql`
      select
        id, company_id, sender_raw, sender_phone, whatsapp_chat_jid, message_id, session_id,
        message_text, receipt_file_id, receipt_image_url, status, resolved_expense_id,
        resolved_employee_id, resolved_by, resolved_at, created_at
      from unregistered_whatsapp_submissions
      where company_id = ${companyId}
        and status = coalesce(${req.query.status ? String(req.query.status) : null}, status)
      order by created_at desc
      limit 100
    `;
    return json(res, 200, {
      submissions: submissions.map((submission) => ({
        ...submission,
        receipt_image_url: submission.receipt_file_id
          ? `/api/tex/receipts/${submission.receipt_file_id}`
          : submission.receipt_image_url,
      })),
    });
  }

  const unregisteredResolveMatch = pathName.match(/^tex\/unregistered-whatsapp\/([0-9a-f-]+)\/resolve$/i);
  if (unregisteredResolveMatch && req.method === 'PATCH') {
    const body = await readJson(req);
    const submission = (await sql`
      select
        s.*, c.country_code, c.base_currency, c.whatsapp_provider, c.wappfly_api_token,
        cc.tax_id_label, cc.tax_name
      from unregistered_whatsapp_submissions s
      join companies c on c.id = s.company_id
      left join country_configs cc on cc.country_code = c.country_code
      where s.id = ${unregisteredResolveMatch[1]}
      limit 1
    `)[0];
    if (!submission) return json(res, 404, { error: 'Submission not found' });
    const scopedUser = await requireCompanyAccess(sql, req, res, submission.company_id);
    if (!scopedUser) return;
    const role = roleForCompany(scopedUser, submission.company_id);
    if (scopedUser.super_admin !== true && !['admin', 'finance', 'manager', 'coordinator'].includes(role)) {
      return json(res, 403, { error: 'You are not allowed to resolve WhatsApp submissions' });
    }
    if (submission.status !== 'open') return json(res, 409, { error: 'This submission has already been resolved' });

    const mode = String(body.mode || '').trim();
    let employee = null;
    if (mode === 'existing_employee') {
      const employeeId = String(body.employee_id || '').trim();
      if (!employeeId) return json(res, 400, { error: 'employee_id is required' });
      employee = (await sql`
        select id, name, phone_number, company_id
        from employees
        where id = ${employeeId}
          and company_id = ${submission.company_id}
          and is_active = true
        limit 1
      `)[0] || null;
      if (!employee) return json(res, 400, { error: 'Selected employee does not belong to this company' });
    } else if (mode === 'new_employee') {
      const name = String(body.employee_name || '').trim();
      const phoneNumber = String(body.phone_number || submission.sender_phone || '').trim();
      if (!name || !phoneNumber) return json(res, 400, { error: 'Employee name and phone number are required' });
      employee = (await sql`
        insert into employees (company_id, name, phone_number, department, monthly_salary, is_active)
        values (
          ${submission.company_id}, ${name}, ${phoneNumber},
          ${String(body.department || '').trim() || null},
          ${Math.max(0, moneyValue(body.monthly_salary))},
          true
        )
        on conflict (company_id, phone_number) do update set
          name = excluded.name,
          department = coalesce(excluded.department, employees.department),
          monthly_salary = case when excluded.monthly_salary > 0 then excluded.monthly_salary else employees.monthly_salary end,
          is_active = true
        returning id, name, phone_number, company_id
      `)[0];
      await sql`
        insert into audit_log (company_id, user_id, action, table_name, record_id, new_values)
        values (${submission.company_id}, ${scopedUser.id}, 'create_from_unregistered_whatsapp', 'employees', ${employee.id}, ${JSON.stringify(employee)}::jsonb)
      `;
    } else {
      return json(res, 400, { error: 'mode must be existing_employee or new_employee' });
    }

    const receipt = submission.receipt_file_id ? (await sql`
      select id, content_type, encode(data, 'base64') as data_base64
      from receipt_files
      where id = ${submission.receipt_file_id}
        and company_id = ${submission.company_id}
      limit 1
    `)[0] || null : null;
    const receiptImageUrl = receipt?.id ? `/api/tex/receipts/${receipt.id}` : submission.receipt_image_url || null;
    let parsedReceipt = null;
    let parseWarning = null;
    if (receipt?.data_base64 && String(receipt.content_type || '').startsWith('image/')) {
      const parsed = await parseReceiptImage({
        imageBase64: receipt.data_base64,
        mediaType: receipt.content_type,
        countryCode: submission.country_code || '',
        taxIdLabel: submission.tax_id_label || 'Tax ID',
        taxName: submission.tax_name || 'VAT',
      });
      if (parsed.ok) parsedReceipt = parsed.data;
      else parseWarning = parsed.status ? `${parsed.error || 'Receipt OCR failed'} (${parsed.status})` : (parsed.error || 'Receipt OCR failed');
    } else if (receipt) {
      parseWarning = 'OCR currently supports image receipts only';
    }

    const baseCurrency = String(submission.base_currency || 'AED').toUpperCase();
    const parsedAmount = Number(parsedReceipt?.amount || 0);
    const parsedCurrency = String(parsedReceipt?.currency || baseCurrency).toUpperCase();
    const parsedDate = parsedReceipt?.date || isoDate();
    const exchange = parsedAmount > 0
      ? await calculateExchange(sql, parsedAmount, parsedCurrency, baseCurrency)
      : { rate: 1, baseAmount: 0, warning: null };
    const vendor = String(parsedReceipt?.vendor || '').trim() || null;
    const policyReasons = ['Receipt came from an unregistered WhatsApp number and was assigned by admin'];
    if (!receiptImageUrl) policyReasons.push('Receipt image unavailable');
    if (!parsedReceipt || !vendor || !parsedAmount) policyReasons.push('Receipt OCR requires manual review');
    if (parseWarning) policyReasons.push(parseWarning);
    if (parsedReceipt?.date_warning) policyReasons.push('Receipt date was unreadable; submission date used');
    if (exchange.warning) policyReasons.push(exchange.warning);
    const duplicate = vendor && parsedAmount > 0 ? await findDuplicateExpense(sql, {
      company_id: submission.company_id,
      employee_id: employee.id,
      vendor,
      amount: parsedAmount,
      currency: parsedCurrency,
      date: parsedDate,
    }) : null;
    if (duplicate) policyReasons.push(duplicate.reason);
    const notes = [
      parsedReceipt?.notes || null,
      submission.message_text || null,
      `Originally received from unregistered WhatsApp sender ${submission.sender_phone || submission.sender_raw || 'unknown'}`,
      !parsedReceipt || !vendor || !parsedAmount ? 'Pending manual receipt review' : null,
    ].filter(Boolean).join(' | ');

    const expense = (await sql`
      insert into expenses (
        company_id, employee_id, employee_name, employee_phone, whatsapp_chat_jid, vendor, date,
        amount, currency, base_amount, exchange_rate, category, expense_type,
        payment_method, notes, tax_id_number, tax_amount, receipt_image_url,
        status, source, policy_flag, policy_flag_reason
      )
      values (
        ${submission.company_id}, ${employee.id}, ${employee.name}, ${employee.phone_number},
        ${submission.whatsapp_chat_jid || null}, ${vendor}, ${parsedDate},
        ${parsedAmount}, ${parsedCurrency}, ${exchange.baseAmount}, ${exchange.rate},
        ${parsedReceipt?.category || 'Receipt'}, ${'receipt'},
        ${parsedReceipt?.payment_method || null}, ${notes},
        ${parsedReceipt?.tax_id_number || null}, ${parsedReceipt?.tax_amount == null ? null : Number(parsedReceipt.tax_amount)},
        ${receiptImageUrl}, ${'pending'}, ${'whatsapp'}, ${policyReasons.length > 0}, ${policyReasons.join(' | ') || null}
      )
      returning id, company_id, employee_name, employee_phone, whatsapp_chat_jid, vendor, date, amount::float as amount, currency, status, source, receipt_image_url
    `)[0];

    await sql`
      update unregistered_whatsapp_submissions
      set status = 'resolved',
          resolved_expense_id = ${expense.id},
          resolved_employee_id = ${employee.id},
          resolved_by = ${scopedUser.id},
          resolved_at = now()
      where id = ${submission.id}
    `;
    await sql`
      insert into audit_log (company_id, user_id, action, table_name, record_id, new_values)
      values (${submission.company_id}, ${scopedUser.id}, 'resolve_unregistered_whatsapp', 'expenses', ${expense.id}, ${JSON.stringify({
        expense,
        submission_id: submission.id,
        employee_id: employee.id,
        ocr_applied: !!parsedReceipt,
        ocr_model: parsedReceipt?.ocr_model || null,
        ocr_warning: parseWarning,
      })}::jsonb)
    `;
    await sql`
      insert into notifications (company_id, user_id, title, body, type, related_expense_id)
      values (${submission.company_id}, null, 'WhatsApp receipt assigned', ${`${employee.name}: unregistered WhatsApp receipt assigned and queued for review.`}, 'expense_submitted', ${expense.id})
    `;

    let whatsapp = { sent: false, skipped: 'not_attempted' };
    const replyText = [
      'TEX receipt assigned',
      `Employee: ${employee.name}`,
      vendor ? `Vendor: ${vendor}` : 'Vendor: needs review',
      parsedAmount ? `Amount: ${parsedCurrency} ${parsedAmount}` : 'Amount: needs review',
      `Date: ${parsedDate}`,
      'Status: pending approval',
    ].join('\n');
    try {
      whatsapp = await sendExpenseWhatsAppFeedback({
        whatsapp_provider: submission.whatsapp_provider,
        wappfly_api_token: submission.wappfly_api_token,
      }, expense, replyText, { quotedMsgId: submission.message_id || null });
    } catch (error) {
      whatsapp = { sent: false, error: error.message };
    }
    await sql`
      update audit_log
      set new_values = coalesce(new_values, '{}'::jsonb) || ${JSON.stringify({
        whatsapp_ack: {
          ...whatsapp,
          to: whatsapp?.to || submission.whatsapp_chat_jid || null,
          message_preview: compactTextPreview(replyText),
        },
      })}::jsonb
      where company_id = ${submission.company_id}
        and action = 'resolve_unregistered_whatsapp'
        and record_id = ${expense.id}
    `;

    return json(res, 200, { submission_id: submission.id, employee, expense, duplicate, exchange, whatsapp });
  }

  const unregisteredIgnoreMatch = pathName.match(/^tex\/unregistered-whatsapp\/([0-9a-f-]+)\/ignore$/i);
  if (unregisteredIgnoreMatch && req.method === 'PATCH') {
    const body = await readJson(req);
    const submission = (await sql`
      select id, company_id, status
      from unregistered_whatsapp_submissions
      where id = ${unregisteredIgnoreMatch[1]}
      limit 1
    `)[0];
    if (!submission) return json(res, 404, { error: 'Submission not found' });
    const scopedUser = await requireCompanyAccess(sql, req, res, submission.company_id);
    if (!scopedUser) return;
    const role = roleForCompany(scopedUser, submission.company_id);
    if (scopedUser.super_admin !== true && !['admin', 'finance', 'manager', 'coordinator'].includes(role)) {
      return json(res, 403, { error: 'You are not allowed to resolve WhatsApp submissions' });
    }
    if (submission.status !== 'open') return json(res, 409, { error: 'This submission has already been resolved' });
    const updated = (await sql`
      update unregistered_whatsapp_submissions
      set status = 'ignored',
          resolved_by = ${scopedUser.id},
          resolved_at = now()
      where id = ${submission.id}
      returning id, status
    `)[0];
    await sql`
      insert into audit_log (company_id, user_id, action, table_name, record_id, new_values)
      values (${submission.company_id}, ${scopedUser.id}, 'ignore_unregistered_whatsapp', 'unregistered_whatsapp_submissions', ${submission.id}, ${JSON.stringify({ reason: String(body.reason || '').trim() || null })}::jsonb)
    `;
    return json(res, 200, { submission: updated });
  }

  if (pathName === 'tex/receipts' && req.method === 'POST') {
    const body = await readJson(req);
    const companyId = String(body.company_id || '');
    if (!companyId) return json(res, 400, { error: 'company_id is required' });
    const scopedUser = await requireCompanyAccess(sql, req, res, companyId);
    if (!scopedUser) return;

    const fileName = String(body.file_name || 'receipt').trim().slice(0, 180) || 'receipt';
    const contentType = String(body.content_type || '').trim().toLowerCase();
    const base64 = stripDataUrl(body.data_base64);
    if (!isAllowedReceiptType(contentType)) return json(res, 400, { error: 'Unsupported receipt file type' });
    if (!base64) return json(res, 400, { error: 'Receipt data is required' });

    const sizeBytes = Buffer.byteLength(base64, 'base64');
    if (sizeBytes <= 0) return json(res, 400, { error: 'Receipt file is empty' });
    if (sizeBytes > 20 * 1024 * 1024) return json(res, 400, { error: 'Receipt file exceeds 20MB' });

    const receipt = (await sql`
      insert into receipt_files (company_id, uploaded_by, file_name, content_type, size_bytes, data)
      values (${companyId}, ${scopedUser.id}, ${fileName}, ${contentType}, ${sizeBytes}, decode(${base64}, 'base64'))
      returning id, company_id, file_name, content_type, size_bytes, created_at
    `)[0];
    await sql`
      insert into audit_log (company_id, user_id, action, table_name, record_id, new_values)
      values (${companyId}, ${scopedUser.id}, 'upload', 'receipt_files', ${receipt.id}, ${JSON.stringify(receipt)}::jsonb)
    `;
    return json(res, 201, { receipt: { ...receipt, url: `/api/tex/receipts/${receipt.id}` } });
  }

  const receiptMatch = pathName.match(/^tex\/receipts\/([0-9a-f-]+)$/i);
  if (receiptMatch && req.method === 'GET') {
    const receipt = (await sql`
      select id, company_id, file_name, content_type, encode(data, 'base64') as data_base64
      from receipt_files
      where id = ${receiptMatch[1]}
      limit 1
    `)[0];
    if (!receipt) return json(res, 404, { error: 'Receipt not found' });
    const scopedUser = await requireCompanyAccess(sql, req, res, receipt.company_id);
    if (!scopedUser) return;
    const buffer = Buffer.from(receipt.data_base64, 'base64');
    res.setHeader('Content-Type', receipt.content_type);
    res.setHeader('Content-Length', String(buffer.length));
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('Content-Disposition', `inline; filename="${String(receipt.file_name || 'receipt').replace(/"/g, '')}"`);
    return res.status(200).send(buffer);
  }

  if (pathName === 'tex/receipts/parse' && req.method === 'POST') {
    const body = await readJson(req);
    const companyId = String(body.company_id || '');
    if (!companyId) return json(res, 400, { error: 'company_id is required' });
    const scopedUser = await requireCompanyAccess(sql, req, res, companyId);
    if (!scopedUser) return;

    const contentType = String(body.content_type || '').trim().toLowerCase();
    const base64 = stripDataUrl(body.image_base64 || body.data_base64);
    if (!contentType.startsWith('image/')) return json(res, 400, { error: 'OCR currently supports image receipts only' });
    if (!base64) return json(res, 400, { error: 'image_base64 is required' });
    const company = (await sql`
      select c.country_code, cc.tax_id_label, cc.tax_name
      from companies c
      left join country_configs cc on cc.country_code = c.country_code
      where c.id = ${companyId}
      limit 1
    `)[0] || {};
    const parsed = await parseReceiptImage({
      imageBase64: base64,
      mediaType: contentType,
      countryCode: company.country_code || '',
      taxIdLabel: company.tax_id_label || 'Tax ID',
      taxName: company.tax_name || 'VAT',
    });
    if (!parsed.ok) {
      return json(res, parsed.status === 400 ? 400 : 503, {
        error: parsed.error,
        details: parsed.details || null,
      });
    }
    return json(res, 200, parsed.data);
  }

  if (pathName === 'tex/people/bootstrap' && req.method === 'GET') {
    const companyId = String(req.query.company_id || '');
    if (!companyId) return json(res, 400, { error: 'company_id is required' });
    const scopedUser = await requireCompanyAccess(sql, req, res, companyId);
    if (!scopedUser) return;
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const monthEnd = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0));
    const [employees, profiles, expenseRows] = await Promise.all([
      sql`
        select id, name, phone_number, department, monthly_salary::float as monthly_salary, is_active, company_id, created_at, manager_profile_id
        from employees
        where company_id = ${companyId}
        order by name
      `,
      sql`
        select id, email, full_name, role, is_ceo, manager_id
        from app_users
        where id in (
          select user_id from user_company_memberships where company_id = ${companyId}
          union
          select id from app_users where company_id = ${companyId}
        )
        order by full_name nulls last, email
      `,
      sql`
        select employee_id, count(*)::int as count
        from expenses
        where company_id = ${companyId}
          and date >= ${monthStart.toISOString().slice(0, 10)}
          and date <= ${monthEnd.toISOString().slice(0, 10)}
          and employee_id is not null
        group by employee_id
      `,
    ]);
    return json(res, 200, { employees, profiles, expenseCounts: expenseRows });
  }

  if (pathName === 'tex/profiles/names' && req.method === 'GET') {
    const ids = String(req.query.ids || '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    if (ids.length === 0) return json(res, 200, { profiles: [] });
    const profiles = await sql`
      select id, full_name
      from app_users
      where id = any(${ids}::uuid[])
    `;
    return json(res, 200, { profiles });
  }

  if (pathName === 'tex/settings/company' && req.method === 'GET') {
    const companyId = String(req.query.company_id || '');
    if (!companyId) return json(res, 400, { error: 'company_id is required' });
    const scopedUser = await requireCompanyAccess(sql, req, res, companyId);
    if (!scopedUser) return;
    const [company, countries] = await Promise.all([
      sql`
        select
          id, name, country_code, base_currency, logo_url, tax_registration_number,
          plan, trial_expires_at,
          whatsapp_provider, whatsapp_instance_id, wappfly_session_id,
          meta_phone_number_id, meta_whatsapp_business_account_id,
          (wappfly_api_token is not null and length(wappfly_api_token) > 0) as wappfly_token_set,
          (${Boolean(process.env.META_WHATSAPP_ACCESS_TOKEN)} = true) as meta_token_set
        from companies
        where id = ${companyId}
        limit 1
      `,
      sql`
        select country_code, country_name, base_currency
        from country_configs
        order by country_name
      `,
    ]);
    if (!company[0]) return json(res, 404, { error: 'Company not found' });
    return json(res, 200, { company: company[0], countries });
  }

  if (pathName === 'tex/settings/company' && req.method === 'PATCH') {
    const body = await readJson(req);
    const companyId = String(body.company_id || '');
    if (!companyId) return json(res, 400, { error: 'company_id is required' });
    const scopedUser = await requireCompanyAccess(sql, req, res, companyId);
    if (!scopedUser) return;
    if (!['admin', 'finance'].includes(scopedUser.role) && scopedUser.super_admin !== true) {
      return json(res, 403, { error: 'You are not allowed to update company settings' });
    }
    const name = String(body.name || '').trim();
    const countryCode = String(body.country_code || '').trim().toUpperCase();
    const provider = String(body.whatsapp_provider || 'ultramsg').trim().toLowerCase();
    if (!name) return json(res, 400, { error: 'Company name is required' });
    if (!countryCode) return json(res, 400, { error: 'Country is required' });
    if (!['ultramsg', 'wappfly', 'meta'].includes(provider)) return json(res, 400, { error: 'Unsupported WhatsApp provider' });
    const config = (await sql`select country_code from country_configs where country_code = ${countryCode} limit 1`)[0];
    if (!config) return json(res, 400, { error: 'Selected country is not configured' });
    const tokenInput = typeof body.wappfly_api_token === 'string' ? body.wappfly_api_token.trim() : '';
    const company = (await sql`
      update companies
      set
        name = ${name},
        country_code = ${countryCode},
        tax_registration_number = ${String(body.tax_registration_number || '').trim() || null},
        whatsapp_provider = ${provider},
        whatsapp_instance_id = ${String(body.whatsapp_instance_id || '').trim() || null},
        wappfly_session_id = ${String(body.wappfly_session_id || '').trim() || null},
        meta_phone_number_id = ${String(body.meta_phone_number_id || '').trim() || null},
        meta_whatsapp_business_account_id = ${String(body.meta_whatsapp_business_account_id || '').trim() || null},
        wappfly_api_token = case when ${tokenInput} = '' then wappfly_api_token else ${tokenInput} end
      where id = ${companyId}
      returning
        id, name, country_code, base_currency, logo_url, tax_registration_number,
        plan, trial_expires_at,
        whatsapp_provider, whatsapp_instance_id, wappfly_session_id,
        meta_phone_number_id, meta_whatsapp_business_account_id,
        (wappfly_api_token is not null and length(wappfly_api_token) > 0) as wappfly_token_set,
        (${Boolean(process.env.META_WHATSAPP_ACCESS_TOKEN)} = true) as meta_token_set
    `)[0];
    await sql`
      insert into audit_log (company_id, user_id, action, table_name, record_id, new_values)
      values (${companyId}, ${scopedUser.id}, 'update', 'companies', ${companyId}, ${JSON.stringify(company)}::jsonb)
    `;
    return json(res, 200, { company });
  }

  if (pathName === 'tex/dashboard' && req.method === 'GET') {
    const companyId = String(req.query.company_id || '');
    if (!companyId) return json(res, 400, { error: 'company_id is required' });
    const scopedUser = await requireCompanyAccess(sql, req, res, companyId);
    if (!scopedUser) return;
    const role = roleForCompany(scopedUser, companyId);
    const canViewCompany = scopedUser.super_admin === true || ['admin', 'finance', 'manager', 'coordinator'].includes(role);
    const today = new Date();
    const dateFrom = String(req.query.date_from || `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}-01`);
    const dateTo = String(req.query.date_to || isoDate(today));
    const lastMonthStartDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
    const lastMonthEndDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0));
    const sixMonthsAgo = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 5, 1));
    const month = Number(req.query.month || (today.getUTCMonth() + 1));
    const year = Number(req.query.year || today.getUTCFullYear());

    const expenseSelect = sql`
      select
        id, date, vendor, employee_name, employee_phone, category,
        amount::float as amount, currency, base_amount::float as base_amount,
        status, source, policy_flag, policy_flag_reason,
        trip_id, trip_name, created_at, paid_at
      from expenses
      where company_id = ${companyId}
        and (${canViewCompany} = true or employee_name = ${scopedUser.full_name || ''})
        and date >= ${dateFrom}
        and date <= ${dateTo}
      order by created_at desc
      limit 500
    `;
    const [
      companyRows,
      expenses,
      lastMonthRows,
      activeTrips,
      budgets,
      pendingRows,
      approvedRows,
      approved,
      paidThisMonth,
      recentPaid,
      paidLast6,
      tripSpendRows,
      advanceRows,
      unpaidTripPayoutRows,
      myMonthExpenses,
      myRecentExpenses,
      teamPendingExpenses,
    ] = await Promise.all([
      sql`select id, base_currency from companies where id = ${companyId} limit 1`,
      expenseSelect,
      sql`
        select coalesce(sum(base_amount), 0)::float as total
        from expenses
        where company_id = ${companyId}
          and (${canViewCompany} = true or employee_name = ${scopedUser.full_name || ''})
          and date >= ${isoDate(lastMonthStartDate)}
          and date <= ${isoDate(lastMonthEndDate)}
          and status <> 'rejected'
      `,
      sql`
        select
          t.id, t.name, t.status, t.budget_aed::float as budget_aed,
          t.driver_trip_amount::float as driver_trip_amount,
          t.subcontractor_amount::float as subcontractor_amount,
          coalesce(es.total_spend, 0)::float as total_spend
        from trips t
        left join (
          select trip_id, sum(case when status <> 'rejected' then coalesce(base_amount, 0) else 0 end)::float as total_spend
          from expenses
          where company_id = ${companyId} and trip_id is not null
          group by trip_id
        ) es on es.trip_id = t.id
        where t.company_id = ${companyId}
          and t.status = 'open'
        order by t.created_at desc
      `,
      sql`
        select department, budget_amount::float as budget_amount
        from budgets
        where company_id = ${companyId}
          and month = ${month}
          and year = ${year}
      `,
      sql`select count(*)::int as count from expenses where company_id = ${companyId} and status = 'pending'`,
      sql`select count(*)::int as count from expenses where company_id = ${companyId} and status = 'approved'`,
      sql`
        select id, date, vendor, employee_name, category, amount::float as amount, currency,
               base_amount::float as base_amount, status, policy_flag, created_at, trip_id, trip_name
        from expenses
        where company_id = ${companyId}
          and status = 'approved'
        order by date desc
        limit 500
      `,
      sql`
        select id, date, vendor, employee_name, category, amount::float as amount, currency,
               base_amount::float as base_amount, status, policy_flag, created_at, trip_id, trip_name
        from expenses
        where company_id = ${companyId}
          and status = 'paid'
          and date >= ${dateFrom}
          and date <= ${dateTo}
        order by date desc
        limit 500
      `,
      sql`
        select id, date, vendor, employee_name, category, amount::float as amount, currency,
               base_amount::float as base_amount, status, policy_flag, created_at, trip_id, trip_name
        from expenses
        where company_id = ${companyId}
          and status = 'paid'
        order by coalesce(paid_at, created_at) desc
        limit 10
      `,
      sql`
        select id, date, vendor, employee_name, category, amount::float as amount, currency,
               base_amount::float as base_amount, status, policy_flag, created_at, trip_id, trip_name
        from expenses
        where company_id = ${companyId}
          and status = 'paid'
          and date >= ${isoDate(sixMonthsAgo)}
        order by date
      `,
      sql`
        select trip_id, coalesce(sum(base_amount), 0)::float as total
        from expenses
        where company_id = ${companyId}
          and trip_id is not null
          and status <> 'rejected'
        group by trip_id
      `,
      sql`
        select (
          coalesce((
            select sum(base_amount)
            from driver_advances
            where company_id = ${companyId}
              and month = ${month}
              and year = ${year}
          ), 0) +
          coalesce((
            select sum(budget_aed)
            from trips
            where company_id = ${companyId}
              and coalesce(budget_aed, 0) > 0
              and extract(month from created_at::date)::int = ${month}
              and extract(year from created_at::date)::int = ${year}
          ), 0)
        )::float as total
      `,
      sql`
        select coalesce(sum(coalesce(driver_trip_amount, 0) + coalesce(subcontractor_amount, 0)), 0)::float as total
        from trips
        where company_id = ${companyId}
          and driver_payout_status <> 'paid'
      `,
      sql`
        select id, date, vendor, category, amount::float as amount, currency,
               base_amount::float as base_amount, status, trip_id, trip_name
        from expenses
        where company_id = ${companyId}
          and employee_name = ${scopedUser.full_name || ''}
          and date >= ${dateFrom}
          and date <= ${dateTo}
        order by date desc
      `,
      sql`
        select id, date, vendor, category, amount::float as amount, currency,
               base_amount::float as base_amount, status, trip_id, trip_name
        from expenses
        where company_id = ${companyId}
          and employee_name = ${scopedUser.full_name || ''}
        order by created_at desc
        limit 10
      `,
      sql`
        select id, date, vendor, category, amount::float as amount, currency,
               base_amount::float as base_amount, status, employee_name
        from expenses
        where company_id = ${companyId}
          and status = 'pending'
        order by date
        limit 50
      `,
    ]);
    return json(res, 200, {
      company: companyRows[0] || null,
      expenses,
      lastMonthTotal: lastMonthRows[0]?.total || 0,
      activeTrips,
      budgets,
      pendingCount: pendingRows[0]?.count || 0,
      approvedCount: approvedRows[0]?.count || 0,
      approved,
      paidThisMonth,
      recentPaid,
      paidLast6,
      tripSpend: Object.fromEntries(tripSpendRows.map((row) => [row.trip_id, row.total || 0])),
      driverAdvanceTotal: advanceRows[0]?.total || 0,
      unpaidTripPayoutTotal: unpaidTripPayoutRows[0]?.total || 0,
      myMonthExpenses,
      myRecentExpenses,
      teamPendingExpenses,
    });
  }

  if (pathName === 'tex/finance-review' && req.method === 'GET') {
    const companyId = String(req.query.company_id || '');
    if (!companyId) return json(res, 400, { error: 'company_id is required' });
    const scopedUser = await requireCompanyAccess(sql, req, res, companyId);
    if (!scopedUser) return;
    if (!canFinanceForCompany(scopedUser, companyId)) return json(res, 403, { error: 'Finance or admin access required' });
    const now = new Date();
    const month = Number(req.query.month || (now.getUTCMonth() + 1));
    const year = Number(req.query.year || now.getUTCFullYear());
    const periodStart = `${year}-${String(month).padStart(2, '0')}-01`;
    const periodEndDate = new Date(Date.UTC(year, month, 0));
    const periodEnd = isoDate(periodEndDate);
    const [
      companyRows,
      expenses,
      employees,
      trips,
      profiles,
      pendingRows,
      advances,
      tripBudgetAdvances,
      salaryPayments,
      tripPayouts,
    ] = await Promise.all([
      sql`select id, base_currency from companies where id = ${companyId} limit 1`,
      sql`
        select
          id, date, vendor, employee_name, employee_phone, category,
          amount::float as amount, currency, base_amount::float as base_amount,
          status, source, policy_flag, policy_flag_reason, receipt_image_url,
          notes, payment_method, trip_id, trip_name, created_at, employee_id,
          approved_by, paid_at
        from expenses
        where company_id = ${companyId}
          and (
            (status in ('approved', 'finance_review') and date >= ${periodStart} and date <= ${periodEnd})
            or (status = 'paid' and coalesce(paid_at::date, date) >= ${periodStart} and coalesce(paid_at::date, date) <= ${periodEnd})
          )
        order by date desc, created_at desc
      `,
      sql`
        select id, name, department, phone_number, monthly_salary::float as monthly_salary, submission_frequency
        from employees
        where company_id = ${companyId}
          and is_active = true
        order by name
      `,
      sql`select id, name from trips where company_id = ${companyId} order by name`,
      sql`select id, full_name, is_ceo from app_users where company_id = ${companyId} or id in (select user_id from user_company_memberships where company_id = ${companyId})`,
      sql`select count(*)::int as count from expenses where company_id = ${companyId} and status = 'pending'`,
      sql`
        select
          da.id, da.company_id, da.employee_id, e.name as employee_name, e.phone_number as employee_phone,
          e.department, da.amount::float as amount, da.currency, da.base_amount::float as base_amount,
          da.advance_date, da.month, da.year, da.notes, da.created_at
        from driver_advances da
        join employees e on e.id = da.employee_id
        where da.company_id = ${companyId}
          and da.month = ${month}
          and da.year = ${year}
        order by da.advance_date desc, da.created_at desc
      `,
      sql`
        select
          t.id,
          t.company_id,
          t.driver_employee_id as employee_id,
          coalesce(e.name, 'Unassigned driver') as employee_name,
          e.phone_number as employee_phone,
          e.department,
          t.budget_aed::float as amount,
          c.base_currency as currency,
          t.budget_aed::float as base_amount,
          t.created_at::date as advance_date,
          extract(month from t.created_at::date)::int as month,
          extract(year from t.created_at::date)::int as year,
          concat('Trip budget paid advance: ', t.name) as notes,
          t.created_at,
          t.id as trip_id,
          t.name as trip_name,
          t.advance_deposit_slip_url,
          true as is_trip_budget_advance
        from trips t
        join companies c on c.id = t.company_id
        left join employees e on e.id = t.driver_employee_id
        where t.company_id = ${companyId}
          and coalesce(t.budget_aed, 0) > 0
          and extract(month from t.created_at::date)::int = ${month}
          and extract(year from t.created_at::date)::int = ${year}
        order by t.created_at desc
      `,
      sql`
        select employee_id, amount::float as amount
        from employee_salary_payments
        where company_id = ${companyId}
          and month = ${month}
          and year = ${year}
      `,
      sql`
        select
          t.id, t.name, t.start_date, t.end_date, t.origin, t.destination,
          t.driver_employee_id, e.name as driver_name, e.phone_number as driver_phone,
          e.department as driver_department,
          t.driver_trip_amount::float as driver_trip_amount,
          t.subcontractor_driver_name, t.subcontractor_amount::float as subcontractor_amount,
          t.subcontractor_notes, t.driver_payout_status, t.driver_payout_paid_at
        from trips t
        left join employees e on e.id = t.driver_employee_id
        where t.company_id = ${companyId}
          and (coalesce(t.driver_trip_amount, 0) > 0 or coalesce(t.subcontractor_amount, 0) > 0)
          and (
            (
              t.driver_payout_status <> 'paid'
              and coalesce(t.end_date, t.start_date, t.created_at::date) >= ${periodStart}
              and coalesce(t.end_date, t.start_date, t.created_at::date) <= ${periodEnd}
            )
            or (t.driver_payout_paid_at::date >= ${periodStart} and t.driver_payout_paid_at::date <= ${periodEnd})
          )
        order by coalesce(t.end_date, t.start_date, t.created_at::date) desc
      `,
    ]);
    return json(res, 200, {
      company: companyRows[0] || null,
      expenses,
      employees,
      trips,
      profiles,
      pendingManagerCount: pendingRows[0]?.count || 0,
      advances,
      tripBudgetAdvances,
      salaryPayments,
      tripPayouts,
      period: { month, year, start: periodStart, end: periodEnd },
    });
  }

  if (pathName === 'tex/driver-advances' && req.method === 'POST') {
    const body = await readJson(req);
    const companyId = String(body.company_id || '');
    if (!companyId) return json(res, 400, { error: 'company_id is required' });
    const scopedUser = await requireCompanyAccess(sql, req, res, companyId);
    if (!scopedUser) return;
    if (!canFinanceForCompany(scopedUser, companyId)) return json(res, 403, { error: 'Finance or admin access required' });
    const employeeId = String(body.employee_id || '');
    const amount = moneyValue(body.amount);
    const advanceDate = String(body.advance_date || isoDate()).slice(0, 10);
    const month = Number(body.month || Number(advanceDate.slice(5, 7)));
    const year = Number(body.year || Number(advanceDate.slice(0, 4)));
    if (!employeeId) return json(res, 400, { error: 'Driver is required' });
    if (!amount || amount <= 0) return json(res, 400, { error: 'Advance amount must be greater than 0' });
    const [company, employee] = await Promise.all([
      sql`select base_currency from companies where id = ${companyId} limit 1`,
      sql`select id, name from employees where id = ${employeeId} and company_id = ${companyId} limit 1`,
    ]);
    if (!company[0]) return json(res, 404, { error: 'Company not found' });
    if (!employee[0]) return json(res, 400, { error: 'Selected driver does not belong to this company' });
    const advance = (await sql`
      insert into driver_advances (
        company_id, employee_id, amount, currency, base_amount,
        advance_date, month, year, notes, created_by
      )
      values (
        ${companyId}, ${employeeId}, ${amount}, ${company[0].base_currency}, ${amount},
        ${advanceDate}, ${month}, ${year}, ${String(body.notes || '').trim() || null}, ${scopedUser.id}
      )
      returning id, company_id, employee_id, amount::float as amount, currency,
                base_amount::float as base_amount, advance_date, month, year, notes, created_at
    `)[0];
    await sql`
      insert into audit_log (company_id, user_id, action, table_name, record_id, new_values)
      values (${companyId}, ${scopedUser.id}, 'create', 'driver_advances', ${advance.id}, ${JSON.stringify(advance)}::jsonb)
    `;
    return json(res, 201, { advance });
  }

  const driverAdvanceMatch = pathName.match(/^tex\/driver-advances\/([0-9a-f-]+)$/i);
  if (driverAdvanceMatch && req.method === 'DELETE') {
    const existing = (await sql`select id, company_id from driver_advances where id = ${driverAdvanceMatch[1]} limit 1`)[0];
    if (!existing) return json(res, 404, { error: 'Advance not found' });
    const scopedUser = await requireCompanyAccess(sql, req, res, existing.company_id);
    if (!scopedUser) return;
    if (!canFinanceForCompany(scopedUser, existing.company_id)) return json(res, 403, { error: 'Finance or admin access required' });
    await sql`delete from driver_advances where id = ${existing.id}`;
    await sql`
      insert into audit_log (company_id, user_id, action, table_name, record_id, old_values)
      values (${existing.company_id}, ${scopedUser.id}, 'delete', 'driver_advances', ${existing.id}, ${JSON.stringify(existing)}::jsonb)
    `;
    return json(res, 200, { ok: true });
  }

  if (pathName === 'tex/finance-review/settlements/pay' && req.method === 'POST') {
    const body = await readJson(req);
    const companyId = String(body.company_id || '');
    if (!companyId) return json(res, 400, { error: 'company_id is required' });
    const scopedUser = await requireCompanyAccess(sql, req, res, companyId);
    if (!scopedUser) return;
    if (!canFinanceForCompany(scopedUser, companyId)) return json(res, 403, { error: 'Finance or admin access required' });
    const expenseIds = Array.isArray(body.expense_ids) ? [...new Set(body.expense_ids.map((id) => String(id)).filter(Boolean))] : [];
    const tripIds = Array.isArray(body.trip_ids) ? [...new Set(body.trip_ids.map((id) => String(id)).filter(Boolean))] : [];
    const salaryEmployeeIds = Array.isArray(body.salary_employee_ids) ? [...new Set(body.salary_employee_ids.map((id) => String(id)).filter(Boolean))] : [];
    const salaryMonth = Number(body.month || new Date().getUTCMonth() + 1);
    const salaryYear = Number(body.year || new Date().getUTCFullYear());
    let paidExpenses = [];
    let paidTrips = [];
    let paidSalaries = [];
    if (expenseIds.length > 0) {
      paidExpenses = await sql`
        update expenses
        set status = 'paid',
            paid_by = ${scopedUser.id},
            paid_at = now()
        where company_id = ${companyId}
          and status = 'approved'
          and id = any(${expenseIds}::uuid[])
        returning id
      `;
    }
    if (tripIds.length > 0) {
      paidTrips = await sql`
        update trips
        set driver_payout_status = 'paid',
            driver_payout_paid_by = ${scopedUser.id},
            driver_payout_paid_at = now()
        where company_id = ${companyId}
          and driver_payout_status <> 'paid'
          and id = any(${tripIds}::uuid[])
        returning id
      `;
    }
    if (salaryEmployeeIds.length > 0) {
      paidSalaries = await sql`
        insert into employee_salary_payments (
          company_id, employee_id, month, year, amount, currency, paid_by, note
        )
        select
          ${companyId}, e.id, ${salaryMonth}, ${salaryYear}, e.monthly_salary, c.base_currency, ${scopedUser.id},
          ${String(body.note || '').trim() || null}
        from employees e
        join companies c on c.id = e.company_id
        where e.company_id = ${companyId}
          and e.id = any(${salaryEmployeeIds}::uuid[])
          and e.is_active = true
          and coalesce(e.monthly_salary, 0) > 0
        on conflict (company_id, employee_id, month, year) do nothing
        returning id, employee_id
      `;
    }
    await sql`
      insert into audit_log (company_id, user_id, action, table_name, new_values)
      values (${companyId}, ${scopedUser.id}, 'finance_settlement_paid', 'finance_review', ${JSON.stringify({
        expense_ids: paidExpenses.map((row) => row.id),
        trip_ids: paidTrips.map((row) => row.id),
        salary_employee_ids: paidSalaries.map((row) => row.employee_id),
        salary_period: { month: salaryMonth, year: salaryYear },
        employee_id: body.employee_id || null,
        note: String(body.note || '').trim() || null,
      })}::jsonb)
    `;
    return json(res, 200, { paid_expenses: paidExpenses.length, paid_trips: paidTrips.length, paid_salaries: paidSalaries.length });
  }

  if (pathName === 'tex/trips' && req.method === 'GET') {
    const companyId = String(req.query.company_id || '');
    if (!companyId) return json(res, 400, { error: 'company_id is required' });
    const scopedUser = await requireCompanyAccess(sql, req, res, companyId);
    if (!scopedUser) return;
    const [companyRows, trips, teams] = await Promise.all([
      sql`select id, base_currency from companies where id = ${companyId} limit 1`,
      sql`
        select
          t.id, t.name, t.description, t.start_date, t.end_date,
          t.budget_aed::float as budget_aed, t.advance_deposit_slip_url, t.advance_deposit_slip_file_id,
          t.status, t.created_by, t.company_id,
          t.created_at, t.enforce_currency, t.enforced_currency, t.team_id,
          t.trip_type, t.origin, t.destination, t.container_number,
          t.driver_employee_id, de.name as driver_name,
          t.driver_trip_amount::float as driver_trip_amount,
          t.subcontractor_driver_name,
          t.subcontractor_amount::float as subcontractor_amount,
          t.subcontractor_notes,
          t.driver_payout_status, t.driver_payout_paid_at,
          tm.name as team_name,
          coalesce(es.expense_count, 0)::int as expense_count,
          coalesce(es.total_spend, 0)::float as total_spend,
          coalesce(ls.leg_count, 0)::int as leg_count
        from trips t
        left join teams tm on tm.id = t.team_id
        left join employees de on de.id = t.driver_employee_id
        left join (
          select
            trip_id,
            count(*)::int as expense_count,
            sum(case when status in ('approved', 'paid') then coalesce(base_amount, 0) else 0 end)::float as total_spend
          from expenses
          where company_id = ${companyId}
            and trip_id is not null
          group by trip_id
        ) es on es.trip_id = t.id
        left join (
          select trip_id, count(*)::int as leg_count
          from trip_legs
          where company_id = ${companyId}
          group by trip_id
        ) ls on ls.trip_id = t.id
        where t.company_id = ${companyId}
        order by t.created_at desc
      `,
      sql`select id, name from teams where company_id = ${companyId} order by name`,
    ]);
    const employees = await sql`
      select id, name, phone_number, department
      from employees
      where company_id = ${companyId}
        and is_active = true
      order by name
    `;
    return json(res, 200, { company: companyRows[0] || null, trips, teams, employees });
  }

  if (pathName === 'tex/trips' && req.method === 'POST') {
    const body = await readJson(req);
    const companyId = String(body.company_id || '');
    if (!companyId) return json(res, 400, { error: 'company_id is required' });
    const scopedUser = await requireCompanyAccess(sql, req, res, companyId);
    if (!scopedUser) return;
    if (!['admin', 'coordinator'].includes(roleForCompany(scopedUser, companyId)) && scopedUser.super_admin !== true) {
      return json(res, 403, { error: 'You are not allowed to manage trips' });
    }
    const name = String(body.name || '').trim();
    const origin = String(body.origin || '').trim();
    const destination = String(body.destination || '').trim();
    if (!name) return json(res, 400, { error: 'Trip name is required' });
    if (!origin || !destination) return json(res, 400, { error: 'Origin and destination are required' });
    const tripType = String(body.trip_type || 'general').trim().toLowerCase();
    if (!['general', 'logistics'].includes(tripType)) return json(res, 400, { error: 'Unsupported trip type' });
    const teamId = body.team_id ? String(body.team_id) : null;
    if (teamId) {
      const team = (await sql`select id from teams where id = ${teamId} and company_id = ${companyId} limit 1`)[0];
      if (!team) return json(res, 400, { error: 'Selected team does not belong to this company' });
    }
    const driverEmployeeId = body.driver_employee_id ? String(body.driver_employee_id) : null;
    if (driverEmployeeId) {
      const driver = (await sql`select id from employees where id = ${driverEmployeeId} and company_id = ${companyId} limit 1`)[0];
      if (!driver) return json(res, 400, { error: 'Selected driver does not belong to this company' });
    }
    const company = (await sql`select base_currency from companies where id = ${companyId} limit 1`)[0];
    if (!company) return json(res, 404, { error: 'Company not found' });
    const enforcedCurrency = body.enforce_currency === true ? company.base_currency : null;
    const trip = (await sql`
      insert into trips (
        company_id, name, description, start_date, end_date, budget_aed,
        advance_deposit_slip_url, advance_deposit_slip_file_id,
        enforce_currency, enforced_currency, team_id, trip_type, origin,
        destination, container_number, driver_employee_id, driver_trip_amount,
        subcontractor_driver_name, subcontractor_amount, subcontractor_notes,
        created_by, status
      )
      values (
        ${companyId}, ${name}, ${String(body.description || '').trim() || null},
        ${body.start_date || null}, ${body.end_date || null},
        ${body.budget_aed == null || body.budget_aed === '' ? null : Number(body.budget_aed)},
        ${String(body.advance_deposit_slip_url || '').trim() || null},
        ${String(body.advance_deposit_slip_file_id || '').trim() || null},
        ${body.enforce_currency === true}, ${enforcedCurrency}, ${teamId},
        ${tripType}, ${origin}, ${destination},
        ${String(body.container_number || '').trim() || null},
        ${driverEmployeeId},
        ${moneyValue(body.driver_trip_amount)},
        ${String(body.subcontractor_driver_name || '').trim() || null},
        ${moneyValue(body.subcontractor_amount)},
        ${String(body.subcontractor_notes || '').trim() || null},
        ${scopedUser.id}, 'open'
      )
      returning id, name, description, start_date, end_date, budget_aed::float as budget_aed,
                advance_deposit_slip_url, advance_deposit_slip_file_id,
                status, created_by, company_id, created_at, enforce_currency, enforced_currency,
                team_id, trip_type, origin, destination, container_number,
                driver_employee_id, driver_trip_amount::float as driver_trip_amount,
                subcontractor_driver_name, subcontractor_amount::float as subcontractor_amount,
                subcontractor_notes, driver_payout_status, driver_payout_paid_at
    `)[0];
    await sql`
      insert into audit_log (company_id, user_id, action, table_name, record_id, new_values)
      values (${companyId}, ${scopedUser.id}, 'create', 'trips', ${trip.id}, ${JSON.stringify(trip)}::jsonb)
    `;
    return json(res, 201, { trip });
  }

  const closeTripMatch = pathName.match(/^tex\/trips\/([0-9a-f-]+)\/close$/i);
  if (closeTripMatch && req.method === 'PATCH') {
    const existing = (await sql`select id, company_id from trips where id = ${closeTripMatch[1]} limit 1`)[0];
    if (!existing) return json(res, 404, { error: 'Trip not found' });
    const scopedUser = await requireCompanyAccess(sql, req, res, existing.company_id);
    if (!scopedUser) return;
    if (!['admin', 'coordinator'].includes(roleForCompany(scopedUser, existing.company_id)) && scopedUser.super_admin !== true) {
      return json(res, 403, { error: 'You are not allowed to manage trips' });
    }
    const trip = (await sql`
      update trips
      set status = 'closed'
      where id = ${closeTripMatch[1]}
      returning id, status, company_id
    `)[0];
    await sql`
      insert into audit_log (company_id, user_id, action, table_name, record_id, new_values)
      values (${existing.company_id}, ${scopedUser.id}, 'update', 'trips', ${trip.id}, ${JSON.stringify({ status: 'closed' })}::jsonb)
    `;
    return json(res, 200, { trip });
  }

  const tripMatch = pathName.match(/^tex\/trips\/([0-9a-f-]+)$/i);
  if (tripMatch && req.method === 'DELETE') {
    const existing = (await sql`
      select id, company_id, name, budget_aed::float as budget_aed, advance_deposit_slip_file_id
      from trips
      where id = ${tripMatch[1]}
      limit 1
    `)[0];
    if (!existing) return json(res, 404, { error: 'Trip not found' });
    const scopedUser = await requireCompanyAccess(sql, req, res, existing.company_id);
    if (!scopedUser) return;
    if (!['admin', 'coordinator'].includes(roleForCompany(scopedUser, existing.company_id)) && scopedUser.super_admin !== true) {
      return json(res, 403, { error: 'You are not allowed to delete trips' });
    }

    const expenseRows = await sql`
      select id, receipt_image_url
      from expenses
      where company_id = ${existing.company_id}
        and trip_id = ${existing.id}
    `;
    const expenseIds = expenseRows.map((row) => row.id);
    const receiptIds = expenseRows
      .map((row) => String(row.receipt_image_url || '').match(/\/api\/tex\/receipts\/([0-9a-f-]+)/i)?.[1])
      .filter(Boolean);
    if (existing.advance_deposit_slip_file_id) receiptIds.push(existing.advance_deposit_slip_file_id);

    if (expenseIds.length > 0) {
      await sql`
        delete from expenses
        where company_id = ${existing.company_id}
          and trip_id = ${existing.id}
      `;
    }
    if (receiptIds.length > 0) {
      await sql`
        delete from receipt_files
        where company_id = ${existing.company_id}
          and id = any(${receiptIds}::uuid[])
      `;
    }
    await sql`
      delete from trips
      where id = ${existing.id}
        and company_id = ${existing.company_id}
    `;
    await sql`
      insert into audit_log (company_id, user_id, action, table_name, record_id, old_values)
      values (${existing.company_id}, ${scopedUser.id}, 'delete', 'trips', ${existing.id}, ${JSON.stringify({
        trip: existing,
        deleted_expense_count: expenseIds.length,
        deleted_receipt_count: receiptIds.length,
        deleted_trip_budget_advance: Number(existing.budget_aed || 0),
      })}::jsonb)
    `;
    return json(res, 200, {
      ok: true,
      deleted: {
        trip_id: existing.id,
        expense_count: expenseIds.length,
        receipt_count: receiptIds.length,
        trip_budget_advance: Number(existing.budget_aed || 0),
      },
    });
  }

  if (tripMatch && req.method === 'PATCH') {
    const body = await readJson(req);
    const existing = (await sql`select id, company_id from trips where id = ${tripMatch[1]} limit 1`)[0];
    if (!existing) return json(res, 404, { error: 'Trip not found' });
    const scopedUser = await requireCompanyAccess(sql, req, res, existing.company_id);
    if (!scopedUser) return;
    if (!['admin', 'coordinator'].includes(roleForCompany(scopedUser, existing.company_id)) && scopedUser.super_admin !== true) {
      return json(res, 403, { error: 'You are not allowed to manage trips' });
    }
    const teamId = body.team_id ? String(body.team_id) : null;
    if (teamId) {
      const team = (await sql`select id from teams where id = ${teamId} and company_id = ${existing.company_id} limit 1`)[0];
      if (!team) return json(res, 400, { error: 'Selected team does not belong to this company' });
    }
    const driverEmployeeId = body.driver_employee_id ? String(body.driver_employee_id) : null;
    if (driverEmployeeId) {
      const driver = (await sql`select id from employees where id = ${driverEmployeeId} and company_id = ${existing.company_id} limit 1`)[0];
      if (!driver) return json(res, 400, { error: 'Selected driver does not belong to this company' });
    }
    const tripType = String(body.trip_type || 'general').trim().toLowerCase();
    if (!['general', 'logistics'].includes(tripType)) return json(res, 400, { error: 'Unsupported trip type' });
    const name = String(body.name || '').trim();
    const origin = String(body.origin || '').trim();
    const destination = String(body.destination || '').trim();
    if (!name) return json(res, 400, { error: 'Trip name is required' });
    if (!origin || !destination) return json(res, 400, { error: 'Origin and destination are required' });
    const company = (await sql`select base_currency from companies where id = ${existing.company_id} limit 1`)[0];
    if (!company) return json(res, 404, { error: 'Company not found' });
    const enforcedCurrency = body.enforce_currency === true ? company.base_currency : null;
    const driverTripAmount = moneyValue(body.driver_trip_amount);
    const subcontractorAmount = moneyValue(body.subcontractor_amount);
    const driverPayoutTotal = driverTripAmount + subcontractorAmount;
    const trip = (await sql`
      update trips
      set
        name = ${name},
        description = ${String(body.description || '').trim() || null},
        start_date = ${body.start_date || null},
        end_date = ${body.end_date || null},
        budget_aed = ${body.budget_aed == null || body.budget_aed === '' ? null : Number(body.budget_aed)},
        advance_deposit_slip_url = ${String(body.advance_deposit_slip_url || '').trim() || null},
        advance_deposit_slip_file_id = ${String(body.advance_deposit_slip_file_id || '').trim() || null},
        enforce_currency = ${body.enforce_currency === true},
        enforced_currency = ${enforcedCurrency},
        team_id = ${teamId},
        trip_type = ${tripType},
        origin = ${origin},
        destination = ${destination},
        container_number = ${String(body.container_number || '').trim() || null},
        driver_employee_id = ${driverEmployeeId},
        driver_trip_amount = ${driverTripAmount},
        subcontractor_driver_name = ${String(body.subcontractor_driver_name || '').trim() || null},
        subcontractor_amount = ${subcontractorAmount},
        subcontractor_notes = ${String(body.subcontractor_notes || '').trim() || null},
        driver_payout_status = case
          when ${driverPayoutTotal}::numeric = 0 then 'unpaid'
          when driver_payout_status = 'paid'
            and (
              driver_employee_id is distinct from ${driverEmployeeId}
              or driver_trip_amount is distinct from ${driverTripAmount}::numeric
              or subcontractor_amount is distinct from ${subcontractorAmount}::numeric
            )
            then 'unpaid'
          else driver_payout_status
        end,
        driver_payout_paid_by = case
          when driver_payout_status = 'paid'
            and (
              driver_employee_id is distinct from ${driverEmployeeId}
              or driver_trip_amount is distinct from ${driverTripAmount}::numeric
              or subcontractor_amount is distinct from ${subcontractorAmount}::numeric
            )
            then null
          else driver_payout_paid_by
        end,
        driver_payout_paid_at = case
          when driver_payout_status = 'paid'
            and (
              driver_employee_id is distinct from ${driverEmployeeId}
              or driver_trip_amount is distinct from ${driverTripAmount}::numeric
              or subcontractor_amount is distinct from ${subcontractorAmount}::numeric
            )
            then null
          else driver_payout_paid_at
        end,
        status = coalesce(${body.status || null}, status)
      where id = ${tripMatch[1]}
      returning id, name, description, start_date, end_date, budget_aed::float as budget_aed,
                advance_deposit_slip_url, advance_deposit_slip_file_id,
                status, created_by, company_id, created_at, enforce_currency, enforced_currency,
                team_id, trip_type, origin, destination, container_number,
                driver_employee_id, driver_trip_amount::float as driver_trip_amount,
                subcontractor_driver_name, subcontractor_amount::float as subcontractor_amount,
                subcontractor_notes, driver_payout_status, driver_payout_paid_at
    `)[0];
    await sql`
      insert into audit_log (company_id, user_id, action, table_name, record_id, new_values)
      values (${existing.company_id}, ${scopedUser.id}, 'update', 'trips', ${trip.id}, ${JSON.stringify(trip)}::jsonb)
    `;
    return json(res, 200, { trip });
  }

  const tripLegsMatch = pathName.match(/^tex\/trips\/([0-9a-f-]+)\/legs$/i);
  if (tripLegsMatch && req.method === 'GET') {
    const trip = (await sql`select id, company_id from trips where id = ${tripLegsMatch[1]} limit 1`)[0];
    if (!trip) return json(res, 404, { error: 'Trip not found' });
    const scopedUser = await requireCompanyAccess(sql, req, res, trip.company_id);
    if (!scopedUser) return;
    const legs = await sql`
      select
        id, company_id, trip_id, sequence, origin, origin_place_id,
        origin_lat::float as origin_lat, origin_lng::float as origin_lng,
        origin_country, destination, destination_place_id,
        destination_lat::float as destination_lat, destination_lng::float as destination_lng,
        destination_country, mode, status, planned_start, planned_end,
        actual_start, actual_end, distance_km::float as distance_km,
        is_return_trip,
        return_distance_km::float as return_distance_km,
        return_duration_seconds,
        coalesce(total_distance_km, distance_km + coalesce(return_distance_km, 0))::float as total_distance_km,
        duration_seconds, distance_source, route_polyline,
        budget::float as budget, container_ref, notes, created_at, updated_at
      from trip_legs
      where trip_id = ${trip.id}
        and company_id = ${trip.company_id}
      order by sequence
    `;
    return json(res, 200, { legs });
  }

  if (tripLegsMatch && req.method === 'PUT') {
    const body = await readJson(req);
    const trip = (await sql`select id, company_id from trips where id = ${tripLegsMatch[1]} limit 1`)[0];
    if (!trip) return json(res, 404, { error: 'Trip not found' });
    const scopedUser = await requireCompanyAccess(sql, req, res, trip.company_id);
    if (!scopedUser) return;
    if (!['admin', 'coordinator'].includes(roleForCompany(scopedUser, trip.company_id)) && scopedUser.super_admin !== true) {
      return json(res, 403, { error: 'You are not allowed to manage trip legs' });
    }
    const incoming = Array.isArray(body.legs) ? body.legs : [];
    const savedIds = [];
    for (const [index, item] of incoming.entries()) {
      const origin = String(item.origin || '').trim();
      const destination = String(item.destination || '').trim();
      if (!origin || !destination) return json(res, 400, { error: 'Every leg needs an origin and destination' });
      const status = String(item.status || 'planned').trim();
      if (!['planned', 'in_transit', 'completed', 'cancelled'].includes(status)) return json(res, 400, { error: 'Unsupported leg status' });
      const mode = item.mode ? String(item.mode).trim() : null;
      if (mode && !['road', 'sea', 'air', 'rail'].includes(mode)) return json(res, 400, { error: 'Unsupported leg mode' });
      const id = item.id ? String(item.id) : null;
      const existingLeg = id ? (await sql`
        select id from trip_legs
        where id = ${id}
          and trip_id = ${trip.id}
          and company_id = ${trip.company_id}
        limit 1
      `)[0] : null;
      const commonValues = {
        sequence: index + 1,
        origin,
        origin_place_id: String(item.origin_place_id || '').trim() || null,
        origin_lat: item.origin_lat == null || item.origin_lat === '' ? null : Number(item.origin_lat),
        origin_lng: item.origin_lng == null || item.origin_lng === '' ? null : Number(item.origin_lng),
        origin_country: String(item.origin_country || '').trim() || null,
        destination,
        destination_place_id: String(item.destination_place_id || '').trim() || null,
        destination_lat: item.destination_lat == null || item.destination_lat === '' ? null : Number(item.destination_lat),
        destination_lng: item.destination_lng == null || item.destination_lng === '' ? null : Number(item.destination_lng),
        destination_country: String(item.destination_country || '').trim() || null,
        mode,
        status,
        planned_start: item.planned_start || null,
        planned_end: item.planned_end || null,
        distance_km: item.distance_km == null || item.distance_km === '' ? null : Number(item.distance_km),
        is_return_trip: item.is_return_trip === true,
        return_distance_km: item.return_distance_km == null || item.return_distance_km === '' ? null : Number(item.return_distance_km),
        return_duration_seconds: item.return_duration_seconds == null || item.return_duration_seconds === '' ? null : Number(item.return_duration_seconds),
        duration_seconds: item.duration_seconds == null || item.duration_seconds === '' ? null : Number(item.duration_seconds),
        distance_source: String(item.distance_source || '').trim() || null,
        route_polyline: String(item.route_polyline || '').trim() || null,
        budget: item.budget == null || item.budget === '' ? null : Number(item.budget),
        container_ref: String(item.container_ref || '').trim() || null,
        notes: String(item.notes || '').trim() || null,
      };
      commonValues.total_distance_km = commonValues.distance_km == null
        ? null
        : commonValues.is_return_trip
          ? Number(commonValues.distance_km) + Number(commonValues.return_distance_km ?? commonValues.distance_km)
          : Number(commonValues.distance_km);
      if (existingLeg) {
        const updated = (await sql`
          update trip_legs
          set sequence = ${commonValues.sequence},
              origin = ${commonValues.origin},
              origin_place_id = ${commonValues.origin_place_id},
              origin_lat = ${commonValues.origin_lat},
              origin_lng = ${commonValues.origin_lng},
              origin_country = ${commonValues.origin_country},
              destination = ${commonValues.destination},
              destination_place_id = ${commonValues.destination_place_id},
              destination_lat = ${commonValues.destination_lat},
              destination_lng = ${commonValues.destination_lng},
              destination_country = ${commonValues.destination_country},
              mode = ${commonValues.mode},
              status = ${commonValues.status},
              planned_start = ${commonValues.planned_start},
              planned_end = ${commonValues.planned_end},
              distance_km = ${commonValues.distance_km},
              is_return_trip = ${commonValues.is_return_trip},
              return_distance_km = ${commonValues.is_return_trip ? commonValues.return_distance_km : null},
              return_duration_seconds = ${commonValues.is_return_trip ? commonValues.return_duration_seconds : null},
              total_distance_km = ${commonValues.total_distance_km},
              duration_seconds = ${commonValues.duration_seconds},
              distance_source = ${commonValues.distance_source},
              route_polyline = ${commonValues.route_polyline},
              budget = ${commonValues.budget},
              container_ref = ${commonValues.container_ref},
              notes = ${commonValues.notes},
              updated_at = now()
          where id = ${existingLeg.id}
          returning id
        `)[0];
        savedIds.push(updated.id);
      } else {
        const inserted = (await sql`
          insert into trip_legs (
            company_id, trip_id, sequence, origin, origin_place_id, origin_lat, origin_lng, origin_country,
            destination, destination_place_id, destination_lat, destination_lng, destination_country,
            mode, status, planned_start, planned_end, distance_km, is_return_trip, return_distance_km,
            return_duration_seconds, total_distance_km, duration_seconds, distance_source,
            route_polyline, budget, container_ref, notes
          )
          values (
            ${trip.company_id}, ${trip.id}, ${commonValues.sequence}, ${commonValues.origin}, ${commonValues.origin_place_id},
            ${commonValues.origin_lat}, ${commonValues.origin_lng}, ${commonValues.origin_country},
            ${commonValues.destination}, ${commonValues.destination_place_id}, ${commonValues.destination_lat},
            ${commonValues.destination_lng}, ${commonValues.destination_country}, ${commonValues.mode}, ${commonValues.status},
            ${commonValues.planned_start}, ${commonValues.planned_end}, ${commonValues.distance_km},
            ${commonValues.is_return_trip}, ${commonValues.is_return_trip ? commonValues.return_distance_km : null},
            ${commonValues.is_return_trip ? commonValues.return_duration_seconds : null}, ${commonValues.total_distance_km},
            ${commonValues.duration_seconds}, ${commonValues.distance_source}, ${commonValues.route_polyline},
            ${commonValues.budget}, ${commonValues.container_ref}, ${commonValues.notes}
          )
          returning id
        `)[0];
        savedIds.push(inserted.id);
      }
    }
    if (savedIds.length > 0) {
      await sql`
        delete from trip_legs
        where trip_id = ${trip.id}
          and company_id = ${trip.company_id}
          and id <> all(${savedIds}::uuid[])
      `;
    } else {
      await sql`delete from trip_legs where trip_id = ${trip.id} and company_id = ${trip.company_id}`;
    }
    await sql`
      insert into audit_log (company_id, user_id, action, table_name, record_id, new_values)
      values (${trip.company_id}, ${scopedUser.id}, 'update', 'trip_legs', ${trip.id}, ${JSON.stringify({ leg_count: savedIds.length })}::jsonb)
    `;
    const legs = await sql`
      select
        id, company_id, trip_id, sequence, origin, origin_place_id,
        origin_lat::float as origin_lat, origin_lng::float as origin_lng,
        origin_country, destination, destination_place_id,
        destination_lat::float as destination_lat, destination_lng::float as destination_lng,
        destination_country, mode, status, planned_start, planned_end,
        actual_start, actual_end, distance_km::float as distance_km,
        is_return_trip,
        return_distance_km::float as return_distance_km,
        return_duration_seconds,
        coalesce(total_distance_km, distance_km + coalesce(return_distance_km, 0))::float as total_distance_km,
        duration_seconds, distance_source, route_polyline,
        budget::float as budget, container_ref, notes, created_at, updated_at
      from trip_legs
      where trip_id = ${trip.id}
        and company_id = ${trip.company_id}
      order by sequence
    `;
    return json(res, 200, { legs });
  }

  const tripLegEstimateMatch = pathName.match(/^tex\/trips\/([0-9a-f-]+)\/legs\/estimate$/i);
  if (tripLegEstimateMatch && req.method === 'POST') {
    const body = await readJson(req);
    const trip = (await sql`select id, company_id from trips where id = ${tripLegEstimateMatch[1]} limit 1`)[0];
    if (!trip) return json(res, 404, { error: 'Trip not found' });
    const scopedUser = await requireCompanyAccess(sql, req, res, trip.company_id);
    if (!scopedUser) return;
    const origin = String(body.origin || '').trim();
    const destination = String(body.destination || '').trim();
    if (!origin || !destination) return json(res, 400, { error: 'Origin and destination are required' });
    try {
      const estimate = await googleReturnRouteEstimate({
        origin,
        origin_place_id: body.origin_place_id || null,
        destination,
        destination_place_id: body.destination_place_id || null,
        return_to_origin: body.return_to_origin === true,
      });
      return json(res, 200, { estimate });
    } catch (error) {
      return json(res, error.statusCode || 502, { error: error.message || 'Google Maps route estimate failed' });
    }
  }

  const tripLegDeleteMatch = pathName.match(/^tex\/trips\/([0-9a-f-]+)\/legs\/([0-9a-f-]+)$/i);
  if (tripLegDeleteMatch && req.method === 'DELETE') {
    const trip = (await sql`select id, company_id from trips where id = ${tripLegDeleteMatch[1]} limit 1`)[0];
    if (!trip) return json(res, 404, { error: 'Trip not found' });
    const scopedUser = await requireCompanyAccess(sql, req, res, trip.company_id);
    if (!scopedUser) return;
    if (!['admin', 'coordinator'].includes(roleForCompany(scopedUser, trip.company_id)) && scopedUser.super_admin !== true) {
      return json(res, 403, { error: 'You are not allowed to manage trip legs' });
    }
    await sql`
      delete from trip_legs
      where id = ${tripLegDeleteMatch[2]}
        and trip_id = ${trip.id}
        and company_id = ${trip.company_id}
    `;
    await sql`
      insert into audit_log (company_id, user_id, action, table_name, record_id, old_values)
      values (${trip.company_id}, ${scopedUser.id}, 'delete', 'trip_legs', ${tripLegDeleteMatch[2]}, ${JSON.stringify({ trip_id: trip.id })}::jsonb)
    `;
    return json(res, 200, { ok: true });
  }

  if (pathName === 'tex/maps/places/autocomplete' && req.method === 'POST') {
    const body = await readJson(req);
    const companyId = String(body.company_id || '');
    if (!companyId) return json(res, 400, { error: 'company_id is required' });
    const scopedUser = await requireCompanyAccess(sql, req, res, companyId);
    if (!scopedUser) return;
    const input = String(body.input || '').trim();
    if (input.length < 2) return json(res, 200, { suggestions: [] });
    try {
      const suggestions = await googlePlaceAutocomplete(input);
      return json(res, 200, { suggestions });
    } catch (error) {
      return json(res, error.statusCode || 502, { error: error.message || 'Google Places autocomplete failed' });
    }
  }

  if (pathName === 'tex/expenses/bootstrap' && req.method === 'GET') {
    const companyId = String(req.query.company_id || '');
    if (!companyId) return json(res, 400, { error: 'company_id is required' });
    const scopedUser = await requireCompanyAccess(sql, req, res, companyId);
    if (!scopedUser) return;
    const [companyRows, countryRows, pegs, trips, employees, policies, categories] = await Promise.all([
      sql`select id, country_code, base_currency from companies where id = ${companyId} limit 1`,
      sql`
        select country_code, base_currency, currency_name, currency_symbol, has_vat, tax_name, tax_id_label, vat_rate::float as vat_rate
        from country_configs
        where country_code = (select country_code from companies where id = ${companyId})
        limit 1
      `,
      sql`
        select distinct on (from_currency, to_currency)
          from_currency, to_currency, rate::float as rate
        from currency_pegs
        order by from_currency, to_currency, effective_from desc
      `,
      sql`
        select id, name, enforce_currency, enforced_currency, team_id
        from trips
        where company_id = ${companyId}
          and status = 'open'
        order by name
      `,
      sql`
        select id, name, phone_number
        from employees
        where company_id = ${companyId}
          and is_active = true
        order by name
      `,
      sql`
        select category, daily_limit::float as daily_limit, monthly_limit::float as monthly_limit,
               requires_notes_above::float as requires_notes_above, is_blocked
        from spend_policies
        where company_id = ${companyId}
      `,
      sql`
        select id, name, is_active, sort_order, is_system
        from expense_categories
        where company_id = ${companyId}
          and is_active = true
        order by sort_order, name
      `,
    ]);
    return json(res, 200, {
      company: companyRows[0] || null,
      countryConfig: countryRows[0] || null,
      pegs,
      trips,
      employees,
      policies,
      categories,
    });
  }

  if (pathName === 'tex/expenses/duplicate' && req.method === 'GET') {
    const companyId = String(req.query.company_id || '');
    if (!companyId) return json(res, 400, { error: 'company_id is required' });
    const scopedUser = await requireCompanyAccess(sql, req, res, companyId);
    if (!scopedUser) return;
    const match = await findDuplicateExpense(sql, {
      company_id: companyId,
      employee_id: req.query.employee_id ? String(req.query.employee_id) : null,
      employee_name: req.query.employee_name ? String(req.query.employee_name) : null,
      vendor: req.query.vendor ? String(req.query.vendor) : null,
      amount: Number(req.query.amount || 0),
      currency: String(req.query.currency || ''),
      date: String(req.query.date || ''),
    });
    return json(res, 200, { match });
  }

  if (pathName === 'tex/expenses/employee-team' && req.method === 'GET') {
    const companyId = String(req.query.company_id || '');
    const employeeId = String(req.query.employee_id || '');
    if (!companyId || !employeeId) return json(res, 400, { error: 'company_id and employee_id are required' });
    const scopedUser = await requireCompanyAccess(sql, req, res, companyId);
    if (!scopedUser) return;
    const team = (await sql`
      select t.name
      from team_members tm
      join teams t on t.id = tm.team_id
      where t.company_id = ${companyId}
        and tm.employee_id = ${employeeId}
      order by t.name
      limit 1
    `)[0] || null;
    return json(res, 200, { team });
  }

  if (pathName === 'tex/expenses/team' && req.method === 'GET') {
    const companyId = String(req.query.company_id || '');
    const teamId = String(req.query.team_id || '');
    if (!companyId || !teamId) return json(res, 400, { error: 'company_id and team_id are required' });
    const scopedUser = await requireCompanyAccess(sql, req, res, companyId);
    if (!scopedUser) return;
    const [team, members] = await Promise.all([
      sql`select id, name from teams where id = ${teamId} and company_id = ${companyId} limit 1`,
      sql`
        select employee_id
        from team_members tm
        join teams t on t.id = tm.team_id
        where t.company_id = ${companyId}
          and tm.team_id = ${teamId}
      `,
    ]);
    return json(res, 200, { team: team[0] || null, members });
  }

  if (pathName === 'tex/expenses' && req.method === 'GET') {
    const companyId = String(req.query.company_id || '');
    if (!companyId) return json(res, 400, { error: 'company_id is required' });
    const scopedUser = await requireCompanyAccess(sql, req, res, companyId);
    if (!scopedUser) return;
    const role = roleForCompany(scopedUser, companyId);
    const canViewOthers = scopedUser.super_admin === true || ['admin', 'finance', 'manager', 'coordinator'].includes(role);
    const page = Math.max(0, Number(req.query.page || 0) || 0);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.page_size || 25) || 25));
    const offset = page * pageSize;
    const dateFrom = String(req.query.date_from || '');
    const dateTo = String(req.query.date_to || '');
    const tripId = String(req.query.trip_id || '');
    const category = String(req.query.category || '');
    const status = String(req.query.status || '');
    const employeeId = String(req.query.employee_id || '');
    const mineOnly = ['1', 'true', 'yes'].includes(String(req.query.mine || '').trim().toLowerCase());
    const search = String(req.query.search || '').trim();
    const teamMemberIds = String(req.query.team_member_ids || '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);

    const rows = await sql`
      select
        id, date, vendor, employee_name, trip_name, category,
        amount::float as amount, currency, base_amount::float as base_amount,
        status, source, policy_flag, policy_flag_reason, receipt_image_url,
        notes, payment_method, expense_type, tax_amount::float as tax_amount,
        tax_id_number, exchange_rate::float as exchange_rate, employee_phone, whatsapp_chat_jid,
        employee_id, trip_id, company_id, created_at, approved_at, approved_by,
        rejected_at, rejected_by, rejected_reason, finance_reviewed_at,
        finance_reviewed_by, paid_at, paid_by
      from expenses
      where company_id = ${companyId}
        and (${canViewOthers} = true or employee_name = ${scopedUser.full_name || ''})
        and (${mineOnly} = false or employee_name = ${scopedUser.full_name || ''})
        and (${dateFrom} = '' or date >= ${dateFrom || null})
        and (${dateTo} = '' or date <= ${dateTo || null})
        and (${tripId} = '' or trip_id = ${tripId || null})
        and (${category} = '' or category = ${category || null})
        and (${status} = '' or status = ${status || null})
        and (${employeeId} = '' or employee_id = ${employeeId || null})
        and (${teamMemberIds.length === 0} = true or employee_id = any(${teamMemberIds}::uuid[]))
        and (${search} = '' or vendor ilike ${`%${search}%`} or notes ilike ${`%${search}%`} or employee_name ilike ${`%${search}%`})
      order by created_at desc
      limit ${pageSize}
      offset ${offset}
    `;
    const totalRows = await sql`
      select count(*)::int as count
      from expenses
      where company_id = ${companyId}
        and (${canViewOthers} = true or employee_name = ${scopedUser.full_name || ''})
        and (${mineOnly} = false or employee_name = ${scopedUser.full_name || ''})
        and (${dateFrom} = '' or date >= ${dateFrom || null})
        and (${dateTo} = '' or date <= ${dateTo || null})
        and (${tripId} = '' or trip_id = ${tripId || null})
        and (${category} = '' or category = ${category || null})
        and (${status} = '' or status = ${status || null})
        and (${employeeId} = '' or employee_id = ${employeeId || null})
        and (${teamMemberIds.length === 0} = true or employee_id = any(${teamMemberIds}::uuid[]))
        and (${search} = '' or vendor ilike ${`%${search}%`} or notes ilike ${`%${search}%`} or employee_name ilike ${`%${search}%`})
    `;
    return json(res, 200, { expenses: rows, total: totalRows[0]?.count || 0 });
  }

  const expenseStatusMatch = pathName.match(/^tex\/expenses\/([0-9a-f-]+)\/status$/i);
  if (expenseStatusMatch && req.method === 'PATCH') {
    const body = await readJson(req);
    const requestedStatus = String(body.status || '').trim().toLowerCase();
    if (!['approved', 'rejected', 'paid'].includes(requestedStatus)) {
      return json(res, 400, { error: 'Unsupported expense status' });
    }
    const reason = String(body.reason || '').trim();
    if (requestedStatus === 'rejected' && !reason) {
      return json(res, 400, { error: 'Rejection reason is required' });
    }

    const existing = (await sql`
      select
        e.*, e.amount::float as amount, e.base_amount::float as base_amount,
        e.tax_amount::float as tax_amount, e.exchange_rate::float as exchange_rate,
        c.base_currency as company_base_currency, c.whatsapp_provider, c.wappfly_api_token
      from expenses e
      join companies c on c.id = e.company_id
      where e.id = ${expenseStatusMatch[1]}
      limit 1
    `)[0];
    if (!existing) return json(res, 404, { error: 'Expense not found' });
    const scopedUser = await requireCompanyAccess(sql, req, res, existing.company_id);
    if (!scopedUser) return;

    const role = roleForCompany(scopedUser, existing.company_id);
    const allowed = scopedUser.super_admin === true
      || (requestedStatus === 'approved' && ['admin', 'manager'].includes(role))
      || (requestedStatus === 'rejected' && ['admin', 'manager', 'finance'].includes(role))
      || (requestedStatus === 'paid' && ['admin', 'finance'].includes(role));
    if (!allowed) return json(res, 403, { error: 'You are not allowed to update this expense status' });

    if (requestedStatus === 'approved') {
      const blockReason = expenseApprovalBlockReason(existing);
      if (blockReason) return json(res, 400, { error: blockReason });
    }

    if (requestedStatus === 'approved') {
      await sql`
        update expenses
        set status = 'approved',
            approved_by = ${scopedUser.id},
            approved_at = now(),
            rejected_by = null,
            rejected_at = null,
            rejected_reason = null
        where id = ${existing.id}
      `;
    } else if (requestedStatus === 'rejected') {
      await sql`
        update expenses
        set status = 'rejected',
            rejected_by = ${scopedUser.id},
            rejected_at = now(),
            rejected_reason = ${reason}
        where id = ${existing.id}
      `;
    } else if (requestedStatus === 'paid') {
      await sql`
        update expenses
        set status = 'paid',
            paid_by = ${scopedUser.id},
            paid_at = now()
        where id = ${existing.id}
      `;
    }

    const expense = (await sql`
      select
        id, date, vendor, employee_name, trip_name, category,
        amount::float as amount, currency, base_amount::float as base_amount,
        status, source, policy_flag, policy_flag_reason, receipt_image_url,
        notes, payment_method, expense_type, tax_amount::float as tax_amount,
        tax_id_number, exchange_rate::float as exchange_rate, employee_phone,
        employee_id, trip_id, company_id, created_at, approved_at, approved_by,
        rejected_at, rejected_by, rejected_reason, finance_reviewed_at,
        finance_reviewed_by, paid_at, paid_by
      from expenses
      where id = ${existing.id}
      limit 1
    `)[0];

    const message = expenseStatusMessage({
      expense,
      status: requestedStatus,
      reason,
      actorName: scopedUser.full_name || scopedUser.email,
    });
    const receiptAudit = expense.whatsapp_chat_jid
      ? (await sql`
          select new_values->>'message_id' as message_id
          from audit_log
          where company_id = ${expense.company_id}
            and action = 'wappfly_receipt'
            and record_id = ${expense.id}
          order by created_at desc
          limit 1
        `)[0] || null
      : null;
    let whatsapp = { sent: false, skipped: 'not_attempted' };
    try {
      whatsapp = await sendExpenseWhatsAppFeedback({
        whatsapp_provider: existing.whatsapp_provider,
        wappfly_api_token: existing.wappfly_api_token,
      }, expense, message, {
        quotedMsgId: receiptAudit?.message_id || null,
      });
    } catch (error) {
      whatsapp = { sent: false, error: error.message };
    }

    const action = requestedStatus === 'approved'
      ? 'manager_approve'
      : requestedStatus === 'rejected'
        ? (role === 'finance' ? 'finance_reject' : 'manager_reject')
        : 'finance_paid';
    await sql`
      insert into audit_log (company_id, user_id, action, table_name, record_id, old_values, new_values)
      values (
        ${expense.company_id}, ${scopedUser.id}, ${action}, 'expenses', ${expense.id},
        ${JSON.stringify({ status: existing.status, rejected_reason: existing.rejected_reason || null })}::jsonb,
        ${JSON.stringify({ status: requestedStatus, rejected_reason: reason || null, whatsapp })}::jsonb
      )
    `;
    const notificationTitle = requestedStatus === 'approved'
      ? 'Expense approved'
      : requestedStatus === 'rejected'
        ? 'Expense rejected'
        : 'Expense marked paid';
    await sql`
      insert into notifications (company_id, user_id, title, body, type, related_expense_id)
      values (
        ${expense.company_id}, null, ${notificationTitle},
        ${`${expense.employee_name || 'Employee'}: ${expenseLabel(expense)}${requestedStatus === 'rejected' ? ` - ${reason}` : ''}`},
        ${requestedStatus === 'approved' ? 'expense_approved' : requestedStatus === 'rejected' ? 'expense_rejected' : 'expense_paid'},
        ${expense.id}
      )
    `;

    return json(res, 200, { expense, whatsapp });
  }

  const expenseTripMatch = pathName.match(/^tex\/expenses\/([0-9a-f-]+)\/trip$/i);
  if (expenseTripMatch && req.method === 'PATCH') {
    const body = await readJson(req);
    const existing = (await sql`select id, company_id from expenses where id = ${expenseTripMatch[1]} limit 1`)[0];
    if (!existing) return json(res, 404, { error: 'Expense not found' });
    const scopedUser = await requireCompanyAccess(sql, req, res, existing.company_id);
    if (!scopedUser) return;
    const role = roleForCompany(scopedUser, existing.company_id);
    if (scopedUser.super_admin !== true && !['admin', 'manager', 'finance', 'coordinator'].includes(role)) {
      return json(res, 403, { error: 'You are not allowed to assign trips' });
    }
    const tripId = body.trip_id ? String(body.trip_id) : null;
    let tripName = null;
    if (tripId) {
      const trip = (await sql`select id, name from trips where id = ${tripId} and company_id = ${existing.company_id} limit 1`)[0];
      if (!trip) return json(res, 400, { error: 'Selected trip does not belong to this company' });
      tripName = trip.name;
    }
    const expense = (await sql`
      update expenses
      set trip_id = ${tripId}, trip_name = ${tripName}
      where id = ${existing.id}
      returning id, company_id, trip_id, trip_name
    `)[0];
    await sql`
      insert into audit_log (company_id, user_id, action, table_name, record_id, new_values)
      values (${existing.company_id}, ${scopedUser.id}, 'assign_trip', 'expenses', ${expense.id}, ${JSON.stringify({ trip_id: tripId, trip_name: tripName })}::jsonb)
    `;
    return json(res, 200, { expense });
  }

  const expenseMatch = pathName.match(/^tex\/expenses\/([0-9a-f-]+)$/i);
  if (expenseMatch && req.method === 'GET') {
    const companyId = String(req.query.company_id || '');
    if (!companyId) return json(res, 400, { error: 'company_id is required' });
    const scopedUser = await requireCompanyAccess(sql, req, res, companyId);
    if (!scopedUser) return;
    const expense = (await sql`
      select *, amount::float as amount, base_amount::float as base_amount,
             tax_amount::float as tax_amount, exchange_rate::float as exchange_rate
      from expenses
      where id = ${expenseMatch[1]}
        and company_id = ${companyId}
      limit 1
    `)[0];
    if (!expense) return json(res, 404, { error: 'Expense not found' });
    return json(res, 200, { expense });
  }

  if (expenseMatch && req.method === 'PATCH') {
    const body = await readJson(req);
    const existing = (await sql`
      select *, amount::float as amount, base_amount::float as base_amount,
             tax_amount::float as tax_amount, exchange_rate::float as exchange_rate
      from expenses
      where id = ${expenseMatch[1]}
      limit 1
    `)[0];
    if (!existing) return json(res, 404, { error: 'Expense not found' });

    const scopedUser = await requireCompanyAccess(sql, req, res, existing.company_id);
    if (!scopedUser) return;
    const role = roleForCompany(scopedUser, existing.company_id);
    const ownsExpense = existing.employee_name && scopedUser.full_name && existing.employee_name === scopedUser.full_name;
    const allowed = scopedUser.super_admin === true
      || ['admin', 'manager', 'finance', 'coordinator'].includes(role)
      || (role === 'employee' && ownsExpense && existing.status === 'pending');
    if (!allowed) return json(res, 403, { error: 'You are not allowed to edit this expense' });

    const vendor = String(body.vendor || '').trim();
    const amount = Number(body.amount || 0);
    const currency = String(body.currency || '').trim().toUpperCase();
    const date = String(body.date || '').trim().slice(0, 10);
    const category = body.category ? String(body.category).trim() : null;
    const paymentMethod = body.payment_method ? String(body.payment_method).trim() : null;
    const tripId = body.trip_id ? String(body.trip_id) : null;
    const notes = String(body.notes || '').trim() || null;
    const taxIdNumber = String(body.tax_id_number || '').trim() || null;
    const taxAmount = body.tax_amount == null || body.tax_amount === '' ? null : Number(body.tax_amount);
    const employeeChangeRequested = Object.prototype.hasOwnProperty.call(body, 'employee_id');

    if (!vendor) return json(res, 400, { error: 'Vendor is required' });
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return json(res, 400, { error: 'A valid date is required' });
    if (!amount || amount <= 0) return json(res, 400, { error: 'Amount must be greater than 0' });
    if (!currency) return json(res, 400, { error: 'Currency is required' });
    if (taxAmount != null && Number.isNaN(taxAmount)) return json(res, 400, { error: 'Tax amount must be numeric' });

    const company = (await sql`select base_currency from companies where id = ${existing.company_id} limit 1`)[0];
    if (!company) return json(res, 404, { error: 'Company not found' });

    let tripName = null;
    if (tripId) {
      const trip = (await sql`select id, name from trips where id = ${tripId} and company_id = ${existing.company_id} limit 1`)[0];
      if (!trip) return json(res, 400, { error: 'Selected trip does not belong to this company' });
      tripName = trip.name;
    }
    let nextEmployeeId = existing.employee_id || null;
    let nextEmployeeName = existing.employee_name || null;
    let nextEmployeePhone = existing.employee_phone || null;
    if (employeeChangeRequested) {
      const canReassignEmployee = scopedUser.super_admin === true || ['admin', 'manager', 'finance', 'coordinator'].includes(role);
      if (!canReassignEmployee) return json(res, 403, { error: 'You are not allowed to change the expense employee' });
      const employeeId = body.employee_id ? String(body.employee_id) : null;
      if (employeeId) {
        const employee = (await sql`
          select id, name, phone_number
          from employees
          where id = ${employeeId}
            and company_id = ${existing.company_id}
            and is_active = true
          limit 1
        `)[0];
        if (!employee) return json(res, 400, { error: 'Selected employee does not belong to this company' });
        nextEmployeeId = employee.id;
        nextEmployeeName = employee.name;
        nextEmployeePhone = employee.phone_number || null;
      } else {
        nextEmployeeId = null;
        nextEmployeeName = body.employee_name ? String(body.employee_name).trim() || null : null;
        nextEmployeePhone = body.employee_phone ? String(body.employee_phone).trim() || null : null;
      }
    }

    const approvalBlockReason = expenseApprovalBlockReason({ trip_id: tripId, category });
    if (['approved', 'paid'].includes(existing.status) && approvalBlockReason) {
      return json(res, 400, { error: approvalBlockReason });
    }

    const exchange = await calculateExchange(sql, amount, currency, company.base_currency);
    let policyFlag = false;
    const policyReasons = [];
    if (existing.status !== 'draft' && category) {
      const policy = (await sql`
        select daily_limit::float as daily_limit, monthly_limit::float as monthly_limit,
               requires_notes_above::float as requires_notes_above, is_blocked
        from spend_policies
        where company_id = ${existing.company_id}
          and category = ${category}
        limit 1
      `)[0];
      if (policy?.is_blocked) return json(res, 400, { error: 'This category is not permitted by your company policy' });
      if (policy?.requires_notes_above != null && exchange.baseAmount > policy.requires_notes_above && !notes) {
        return json(res, 400, { error: `Notes are required for expenses over ${policy.requires_notes_above} in this category` });
      }
      if (policy?.daily_limit != null) {
        const daily = (await sql`
          select coalesce(sum(base_amount), 0)::float as total
          from expenses
          where company_id = ${existing.company_id}
            and category = ${category}
            and date = ${date}
            and status <> 'rejected'
            and id <> ${existing.id}
        `)[0];
        if ((daily?.total || 0) + exchange.baseAmount > policy.daily_limit) policyReasons.push(`Daily ${category} limit of ${policy.daily_limit} exceeded`);
      }
      if (policy?.monthly_limit != null) {
        const monthStart = `${date.slice(0, 7)}-01`;
        const monthEndDate = new Date(`${monthStart}T00:00:00Z`);
        monthEndDate.setUTCMonth(monthEndDate.getUTCMonth() + 1);
        monthEndDate.setUTCDate(0);
        const monthly = (await sql`
          select coalesce(sum(base_amount), 0)::float as total
          from expenses
          where company_id = ${existing.company_id}
            and category = ${category}
            and date >= ${monthStart}
            and date <= ${isoDate(monthEndDate)}
            and status <> 'rejected'
            and id <> ${existing.id}
        `)[0];
        if ((monthly?.total || 0) + exchange.baseAmount > policy.monthly_limit) policyReasons.push(`Monthly ${category} limit of ${policy.monthly_limit} exceeded`);
      }
      policyFlag = policyReasons.length > 0;
    }

    const duplicate = existing.status !== 'draft' ? await findDuplicateExpense(sql, {
      company_id: existing.company_id,
      employee_id: nextEmployeeId,
      employee_name: nextEmployeeName,
      vendor,
      amount,
      currency,
      date,
    }, existing.id) : null;
    if (duplicate) {
      policyFlag = true;
      policyReasons.push(duplicate.reason);
    }

    const expense = (await sql`
      update expenses
      set vendor = ${vendor},
          date = ${date},
          amount = ${amount},
          currency = ${currency},
          base_amount = ${exchange.baseAmount},
          exchange_rate = ${exchange.rate},
          category = ${category},
          employee_id = ${nextEmployeeId},
          employee_name = ${nextEmployeeName},
          employee_phone = ${nextEmployeePhone},
          payment_method = ${paymentMethod},
          trip_id = ${tripId},
          trip_name = ${tripName},
          notes = ${notes},
          tax_id_number = ${taxIdNumber},
          tax_amount = ${taxAmount},
          policy_flag = ${policyFlag},
          policy_flag_reason = ${policyReasons.join(' | ') || null},
          updated_at = now()
      where id = ${existing.id}
      returning
        id, date, vendor, employee_name, trip_name, category,
        amount::float as amount, currency, base_amount::float as base_amount,
        status, source, policy_flag, policy_flag_reason, receipt_image_url,
        notes, payment_method, expense_type, tax_amount::float as tax_amount,
        tax_id_number, exchange_rate::float as exchange_rate, employee_phone,
        employee_id, trip_id, company_id, created_at, approved_at, approved_by,
        rejected_at, rejected_by, rejected_reason, finance_reviewed_at,
        finance_reviewed_by, paid_at, paid_by
    `)[0];

    await sql`
      insert into audit_log (company_id, user_id, action, table_name, record_id, old_values, new_values)
      values (
        ${existing.company_id}, ${scopedUser.id}, 'update', 'expenses', ${existing.id},
        ${JSON.stringify(existing)}::jsonb,
        ${JSON.stringify(expense)}::jsonb
      )
    `;

    return json(res, 200, { expense, duplicate, exchange });
  }

  if (expenseMatch && req.method === 'DELETE') {
    const existing = (await sql`select id, company_id, status from expenses where id = ${expenseMatch[1]} limit 1`)[0];
    if (!existing) return json(res, 404, { error: 'Expense not found' });
    const scopedUser = await requireCompanyAccess(sql, req, res, existing.company_id);
    if (!scopedUser) return;
    const role = roleForCompany(scopedUser, existing.company_id);
    if (scopedUser.super_admin !== true && role !== 'admin') {
      return json(res, 403, { error: 'Only admins can delete expenses' });
    }
    await sql`delete from expenses where id = ${existing.id}`;
    await sql`
      insert into audit_log (company_id, user_id, action, table_name, record_id, old_values)
      values (${existing.company_id}, ${scopedUser.id}, 'delete', 'expenses', ${existing.id}, ${JSON.stringify(existing)}::jsonb)
    `;
    return json(res, 200, { ok: true });
  }

  if (pathName === 'tex/expenses' && req.method === 'POST') {
    const body = await readJson(req);
    const companyId = String(body.company_id || '');
    if (!companyId) return json(res, 400, { error: 'company_id is required' });
    const scopedUser = await requireCompanyAccess(sql, req, res, companyId);
    if (!scopedUser) return;
    const vendor = String(body.vendor || '').trim();
    const amount = Number(body.amount || 0);
    const currency = String(body.currency || '').trim().toUpperCase();
    const date = String(body.date || '').trim();
    if (!vendor) return json(res, 400, { error: 'Vendor is required' });
    if (!date) return json(res, 400, { error: 'Date is required' });
    if (!amount || amount <= 0) return json(res, 400, { error: 'Amount must be greater than 0' });
    if (!currency) return json(res, 400, { error: 'Currency is required' });

    const company = (await sql`select base_currency from companies where id = ${companyId} limit 1`)[0];
    if (!company) return json(res, 404, { error: 'Company not found' });
    const employeeId = body.employee_id ? String(body.employee_id) : null;
    const tripId = body.trip_id ? String(body.trip_id) : null;
    if (employeeId) {
      const employee = (await sql`select id from employees where id = ${employeeId} and company_id = ${companyId} limit 1`)[0];
      if (!employee) return json(res, 400, { error: 'Selected employee does not belong to this company' });
    }
    if (tripId) {
      const trip = (await sql`select id from trips where id = ${tripId} and company_id = ${companyId} limit 1`)[0];
      if (!trip) return json(res, 400, { error: 'Selected trip does not belong to this company' });
    }

    let policyFlag = false;
    const policyReasons = [];
    if (body.status !== 'draft' && body.category) {
      const category = String(body.category);
      const policy = (await sql`
        select daily_limit::float as daily_limit, monthly_limit::float as monthly_limit,
               requires_notes_above::float as requires_notes_above, is_blocked
        from spend_policies
        where company_id = ${companyId}
          and category = ${category}
        limit 1
      `)[0];
      if (policy?.is_blocked) return json(res, 400, { error: 'This category is not permitted by your company policy' });
      if (policy?.requires_notes_above != null && amount > policy.requires_notes_above && !String(body.notes || '').trim()) {
        return json(res, 400, { error: `Notes are required for expenses over ${policy.requires_notes_above} in this category` });
      }
      if (policy?.daily_limit != null) {
        const daily = (await sql`
          select coalesce(sum(base_amount), 0)::float as total
          from expenses
          where company_id = ${companyId}
            and category = ${category}
            and date = ${date}
            and status <> 'rejected'
        `)[0];
        if ((daily?.total || 0) + amount > policy.daily_limit) policyReasons.push(`Daily ${category} limit of ${policy.daily_limit} exceeded`);
      }
      if (policy?.monthly_limit != null) {
        const monthStart = `${date.slice(0, 7)}-01`;
        const monthEndDate = new Date(`${monthStart}T00:00:00Z`);
        monthEndDate.setUTCMonth(monthEndDate.getUTCMonth() + 1);
        monthEndDate.setUTCDate(0);
        const monthly = (await sql`
          select coalesce(sum(base_amount), 0)::float as total
          from expenses
          where company_id = ${companyId}
            and category = ${category}
            and date >= ${monthStart}
            and date <= ${isoDate(monthEndDate)}
            and status <> 'rejected'
        `)[0];
        if ((monthly?.total || 0) + amount > policy.monthly_limit) policyReasons.push(`Monthly ${category} limit of ${policy.monthly_limit} exceeded`);
      }
      policyFlag = policyReasons.length > 0;
    }

    const exchange = await calculateExchange(sql, amount, currency, company.base_currency);
    const duplicate = body.status !== 'draft' ? await findDuplicateExpense(sql, {
      company_id: companyId,
      employee_id: employeeId,
      employee_name: body.employee_name || null,
      vendor,
      amount,
      currency,
      date,
    }) : null;
    if (duplicate) {
      policyFlag = true;
      policyReasons.push(duplicate.reason);
    }

    const expense = (await sql`
      insert into expenses (
        company_id, submitter_id, employee_id, employee_name, employee_phone,
        vendor, date, amount, currency, base_amount, exchange_rate, category,
        payment_method, trip_id, trip_name, notes, tax_id_number, tax_amount,
        receipt_image_url, status, source, policy_flag, policy_flag_reason
      )
      values (
        ${companyId}, ${scopedUser.id}, ${employeeId}, ${body.employee_name || null}, ${body.employee_phone || null},
        ${vendor}, ${date}, ${amount}, ${currency}, ${exchange.baseAmount}, ${exchange.rate}, ${body.category || null},
        ${body.payment_method || null}, ${tripId}, ${body.trip_name || null}, ${String(body.notes || '').trim() || null},
        ${String(body.tax_id_number || '').trim() || null}, ${body.tax_amount == null || body.tax_amount === '' ? null : Number(body.tax_amount)},
        ${body.receipt_image_url || null}, ${body.status || 'pending'}, 'web', ${policyFlag}, ${policyReasons.join(' | ') || null}
      )
      returning id, company_id, vendor, date, amount::float as amount, currency, base_amount::float as base_amount,
                exchange_rate::float as exchange_rate, status, policy_flag, policy_flag_reason
    `)[0];
    await sql`
      insert into audit_log (company_id, user_id, action, table_name, record_id, new_values)
      values (${companyId}, ${scopedUser.id}, 'create', 'expenses', ${expense.id}, ${JSON.stringify(expense)}::jsonb)
    `;
    if (body.status !== 'draft') {
      await sql`
        insert into notifications (company_id, user_id, title, body, type, related_expense_id)
        values (${companyId}, null, 'New expense submitted', ${`${body.employee_name || 'Employee'} submitted ${vendor} - ${currency} ${amount}`}, 'expense_submitted', ${expense.id})
      `;
      if (policyFlag && policyReasons.length > 0) {
        await sql`
          insert into notifications (company_id, user_id, title, body, type, related_expense_id)
          values (${companyId}, null, ${duplicate ? 'Possible duplicate flagged' : 'Policy violation flagged'}, ${`${body.employee_name || 'Employee'}: ${policyReasons.join(' | ')}`}, 'policy_violation', ${expense.id})
        `;
      }
    }
    return json(res, 201, { expense, duplicate, exchange });
  }

  if (pathName === 'tex/people/employees' && req.method === 'POST') {
    const body = await readJson(req);
    const companyId = String(body.company_id || '');
    if (!companyId) return json(res, 400, { error: 'company_id is required' });
    const scopedUser = await requireCompanyAccess(sql, req, res, companyId);
    if (!scopedUser) return;
    if (!['admin', 'manager', 'coordinator', 'finance'].includes(scopedUser.role) && scopedUser.super_admin !== true) {
      return json(res, 403, { error: 'You are not allowed to manage employees' });
    }
    const name = String(body.name || '').trim();
    const phoneNumber = String(body.phone_number || '').trim();
    if (!name || !phoneNumber) return json(res, 400, { error: 'Name and phone number are required' });
    const managerId = body.manager_profile_id ? String(body.manager_profile_id) : null;
    const employee = (await sql`
      insert into employees (company_id, name, phone_number, department, monthly_salary, manager_profile_id, is_active)
      values (${companyId}, ${name}, ${phoneNumber}, ${body.department || null}, ${Math.max(0, moneyValue(body.monthly_salary))}, ${managerId}, true)
      returning id, name, phone_number, department, monthly_salary::float as monthly_salary, is_active, company_id, created_at, manager_profile_id
    `)[0];
    await sql`
      insert into audit_log (company_id, user_id, action, table_name, record_id, new_values)
      values (${companyId}, ${scopedUser.id}, 'create', 'employees', ${employee.id}, ${JSON.stringify(employee)}::jsonb)
    `;
    return json(res, 201, { employee });
  }

  if (pathName === 'tex/people/users/invite' && req.method === 'POST') {
    const body = await readJson(req);
    const companyId = String(body.company_id || '').trim();
    if (!companyId) return json(res, 400, { error: 'company_id is required' });
    const scopedUser = await requireCompanyAccess(sql, req, res, companyId);
    if (!scopedUser) return;
    if (!['admin', 'manager', 'coordinator', 'finance'].includes(scopedUser.role) && scopedUser.super_admin !== true) {
      return json(res, 403, { error: 'You are not allowed to invite users' });
    }
    const email = String(body.email || '').trim().toLowerCase();
    const fullName = String(body.full_name || '').trim() || null;
    const role = String(body.role || 'employee').trim().toLowerCase();
    const managerId = body.manager_id ? String(body.manager_id) : null;
    const allowedRoles = ['admin', 'finance', 'manager', 'employee', 'coordinator'];
    if (!email) return json(res, 400, { error: 'Email is required' });
    if (!allowedRoles.includes(role)) return json(res, 400, { error: 'Unsupported user role' });
    if (managerId) {
      const manager = (await sql`
        select id from app_users
        where id = ${managerId}
          and (
            company_id = ${companyId}
            or id in (select user_id from user_company_memberships where company_id = ${companyId})
          )
        limit 1
      `)[0];
      if (!manager) return json(res, 400, { error: 'Selected manager does not have access to this company' });
    }
    let invitedUser = (await sql`select id, email from app_users where email = ${email} limit 1`)[0];
    if (!invitedUser) {
      invitedUser = (await sql`
        insert into app_users (email, password_hash, full_name, company_id, role, manager_id)
        values (${email}, ${await hashPassword(crypto.randomBytes(24).toString('base64url'))}, ${fullName}, ${companyId}, ${role}, ${managerId})
        returning id, email
      `)[0];
    } else {
      await sql`
        update app_users
        set full_name = coalesce(${fullName}, full_name),
            company_id = coalesce(company_id, ${companyId}),
            role = ${role},
            manager_id = ${managerId},
            updated_at = now()
        where id = ${invitedUser.id}
      `;
    }
    await sql`
      insert into user_company_memberships (user_id, company_id, role, is_default)
      values (${invitedUser.id}, ${companyId}, ${role}, not exists (select 1 from user_company_memberships where user_id = ${invitedUser.id}))
      on conflict (user_id, company_id) do update set
        role = excluded.role,
        updated_at = now()
    `;
    const token = crypto.randomBytes(32).toString('base64url');
    await sql`
      insert into password_reset_tokens (user_id, token_hash, expires_at)
      values (${invitedUser.id}, ${sha256(token)}, now() + interval '24 hours')
    `;
    const actionLink = `${appBaseUrl(req).replace(/\/$/, '')}/set-password?token=${encodeURIComponent(token)}`;
    const emailResult = await sendEmail({
      to: email,
      subject: 'You are invited to Torrevie TEX',
      text: `Use this link to set your Torrevie TEX password: ${actionLink}`,
      html: `<p>You have been invited to Torrevie TEX.</p><p><a href="${actionLink}">Set password</a></p><p>This link expires in 24 hours.</p>`,
    });
    return json(res, 201, { ok: true, sent: emailResult.sent, actionLink: (!emailResult.sent || body.return_link) ? actionLink : undefined });
  }

  const employeeMatch = pathName.match(/^tex\/people\/employees\/([0-9a-f-]+)$/i);
  if (employeeMatch && req.method === 'PATCH') {
    const body = await readJson(req);
    const existing = (await sql`select id, company_id from employees where id = ${employeeMatch[1]} limit 1`)[0];
    if (!existing) return json(res, 404, { error: 'Employee not found' });
    const scopedUser = await requireCompanyAccess(sql, req, res, existing.company_id);
    if (!scopedUser) return;
    if (!['admin', 'manager', 'coordinator', 'finance'].includes(scopedUser.role) && scopedUser.super_admin !== true) {
      return json(res, 403, { error: 'You are not allowed to manage employees' });
    }
    const employee = (await sql`
      update employees
      set
        name = coalesce(${body.name || null}, name),
        phone_number = coalesce(${body.phone_number || null}, phone_number),
        department = ${body.department ?? null},
        monthly_salary = case
          when ${Object.prototype.hasOwnProperty.call(body, 'monthly_salary')} = true then ${Math.max(0, moneyValue(body.monthly_salary))}
          else monthly_salary
        end,
        manager_profile_id = ${body.manager_profile_id || null},
        is_active = coalesce(${typeof body.is_active === 'boolean' ? body.is_active : null}, is_active)
      where id = ${employeeMatch[1]}
      returning id, name, phone_number, department, monthly_salary::float as monthly_salary, is_active, company_id, created_at, manager_profile_id
    `)[0];
    await sql`
      insert into audit_log (company_id, user_id, action, table_name, record_id, new_values)
      values (${existing.company_id}, ${scopedUser.id}, 'update', 'employees', ${employee.id}, ${JSON.stringify(employee)}::jsonb)
    `;
    return json(res, 200, { employee });
  }

  if (pathName === 'tex/admin/bootstrap' && req.method === 'GET') {
    if (!requireSuperAdmin(user, res)) return;
    const [companies, admins, countries] = await Promise.all([
      sql`
        select id, name, country_code, base_currency, plan, created_at
        from companies
        order by name
      `,
      sql`
        select id, full_name, role, super_admin, company_id, email, manager_id
        from app_users
        order by full_name nulls last, email
      `,
      sql`
        select country_code, country_name, base_currency
        from country_configs
        order by country_name
      `,
    ]);
    const memberships = await sql`
      select user_id, company_id, role, is_default
      from user_company_memberships
      order by is_default desc
    `;
    const adminsWithMemberships = admins.map((admin) => ({
      ...admin,
      membership_company_ids: memberships
        .filter((membership) => membership.user_id === admin.id)
        .map((membership) => membership.company_id),
    }));
    return json(res, 200, { companies, admins: adminsWithMemberships, countries });
  }

  if (pathName === 'tex/admin/users/invite' && req.method === 'POST') {
    if (!requireSuperAdmin(user, res)) return;
    const body = await readJson(req);
    const email = String(body.email || '').trim().toLowerCase();
    const fullName = String(body.full_name || '').trim() || null;
    const companyId = String(body.company_id || '').trim();
    const isSuperAdminInvite = body.super_admin === true;
    const role = isSuperAdminInvite ? 'admin' : String(body.role || 'employee').trim().toLowerCase();
    const managerId = isSuperAdminInvite ? null : (body.manager_id ? String(body.manager_id) : null);
    const allowedRoles = ['admin', 'finance', 'manager', 'employee', 'coordinator'];
    if (!email) return json(res, 400, { error: 'Email is required' });
    if (!isSuperAdminInvite && !companyId) return json(res, 400, { error: 'Company is required for company-level users' });
    if (!allowedRoles.includes(role)) return json(res, 400, { error: 'Unsupported user role' });
    const company = companyId ? (await sql`select id from companies where id = ${companyId} limit 1`)[0] : null;
    if (companyId && !company) return json(res, 404, { error: 'Company not found' });
    if (managerId) {
      const manager = (await sql`
        select id from app_users
        where id = ${managerId}
          and (
            company_id = ${companyId}
            or id in (select user_id from user_company_memberships where company_id = ${companyId})
          )
        limit 1
      `)[0];
      if (!manager) return json(res, 400, { error: 'Selected manager does not have access to this company' });
    }

    let invitedUser = (await sql`select id, email from app_users where email = ${email} limit 1`)[0];
    if (!invitedUser) {
      invitedUser = (await sql`
        insert into app_users (email, password_hash, full_name, company_id, role, super_admin, manager_id)
        values (${email}, ${await hashPassword(crypto.randomBytes(24).toString('base64url'))}, ${fullName}, ${companyId || null}, ${role}, ${isSuperAdminInvite}, ${managerId})
        returning id, email
      `)[0];
    } else {
      await sql`
        update app_users
        set full_name = coalesce(${fullName}, full_name),
            company_id = ${companyId || null},
            role = ${role},
            super_admin = ${isSuperAdminInvite},
            manager_id = ${managerId},
            updated_at = now()
        where id = ${invitedUser.id}
      `;
    }
    if (companyId) {
      await sql`
        insert into user_company_memberships (user_id, company_id, role, is_default)
        values (${invitedUser.id}, ${companyId}, ${role}, true)
        on conflict (user_id, company_id) do update set
          role = excluded.role,
          is_default = true,
          updated_at = now()
      `;
      await sql`
        update user_company_memberships
        set is_default = false
        where user_id = ${invitedUser.id} and company_id <> ${companyId}
      `;
    }

    const token = crypto.randomBytes(32).toString('base64url');
    await sql`
      insert into password_reset_tokens (user_id, token_hash, expires_at)
      values (${invitedUser.id}, ${sha256(token)}, now() + interval '24 hours')
    `;
    const actionLink = `${appBaseUrl(req).replace(/\/$/, '')}/set-password?token=${encodeURIComponent(token)}`;
    const emailResult = await sendEmail({
      to: email,
      subject: 'You are invited to Torrevie TEX',
      text: `Use this link to set your Torrevie TEX password: ${actionLink}`,
      html: `<p>You have been invited to Torrevie TEX.</p><p><a href="${actionLink}">Set password</a></p><p>This link expires in 24 hours.</p>`,
    });
    return json(res, 201, {
      ok: true,
      sent: emailResult.sent,
      actionLink: (!emailResult.sent || body.return_link) ? actionLink : undefined,
      user: { id: invitedUser.id, email, full_name: fullName, company_id: companyId || null, role, super_admin: isSuperAdminInvite },
    });
  }

  if (pathName === 'tex/admin/companies' && req.method === 'POST') {
    if (!requireSuperAdmin(user, res)) return;
    const body = await readJson(req);
    const name = String(body.name || '').trim();
    const countryCode = String(body.country_code || '').trim().toUpperCase();
    if (!name) return json(res, 400, { error: 'Company name is required' });
    if (!countryCode) return json(res, 400, { error: 'Country is required' });
    const config = (await sql`
      select country_code, base_currency
      from country_configs
      where country_code = ${countryCode}
      limit 1
    `)[0];
    if (!config) return json(res, 400, { error: 'Selected country is not configured' });
    const company = (await sql`
      insert into companies (name, country_code, base_currency)
      values (${name}, ${config.country_code}, ${config.base_currency})
      returning id, name, country_code, base_currency, plan, created_at
    `)[0];
    return json(res, 201, { company });
  }

  const companyPlanMatch = pathName.match(/^tex\/admin\/companies\/([0-9a-f-]+)\/plan$/i);
  if (companyPlanMatch && req.method === 'PATCH') {
    if (!requireSuperAdmin(user, res)) return;
    const body = await readJson(req);
    const plan = String(body.plan || '').trim().toLowerCase();
    const allowedPlans = ['trial', 'starter', 'business', 'enterprise'];
    if (!allowedPlans.includes(plan)) return json(res, 400, { error: 'Unsupported company plan' });
    const company = (await sql`
      update companies
      set
        plan = ${plan},
        trial_expires_at = case when ${plan} = 'trial' then trial_expires_at else null end
      where id = ${companyPlanMatch[1]}
      returning id, name, country_code, base_currency, plan, created_at
    `)[0];
    if (!company) return json(res, 404, { error: 'Company not found' });
    return json(res, 200, { company });
  }

  const adminUserMatch = pathName.match(/^tex\/admin\/users\/([0-9a-f-]+)$/i);
  if (adminUserMatch && req.method === 'PATCH') {
    if (!requireSuperAdmin(user, res)) return;
    const body = await readJson(req);
    const userId = adminUserMatch[1];
    const fullName = String(body.full_name || '').trim() || null;
    const isSuperAdminUpdate = body.super_admin === true;
    if (userId === user.id && body.super_admin === false) {
      return json(res, 400, { error: 'You cannot remove your own super admin access' });
    }
    const role = isSuperAdminUpdate ? 'admin' : String(body.role || 'employee').trim().toLowerCase();
    const companyId = body.company_id ? String(body.company_id) : null;
    const membershipCompanyIds = Array.isArray(body.membership_company_ids)
      ? [...new Set(body.membership_company_ids.map((id) => String(id)).filter(Boolean))]
      : [];
    const allowedRoles = ['admin', 'finance', 'manager', 'employee', 'coordinator'];
    if (!allowedRoles.includes(role)) return json(res, 400, { error: 'Unsupported user role' });
    if (!isSuperAdminUpdate && !companyId) return json(res, 400, { error: 'Default company is required for company-level users' });
    if (companyId && !membershipCompanyIds.includes(companyId)) membershipCompanyIds.unshift(companyId);

    const updatedUser = (await sql`
      update app_users
      set full_name = ${fullName},
          role = ${role},
          super_admin = ${isSuperAdminUpdate},
          company_id = ${companyId || null},
          updated_at = now()
      where id = ${userId}
      returning id, full_name, role, super_admin, company_id, email
    `)[0];
    if (!updatedUser) return json(res, 404, { error: 'User not found' });

    await sql`delete from user_company_memberships where user_id = ${userId}`;
    if (!isSuperAdminUpdate) {
      for (const membershipCompanyId of membershipCompanyIds) {
        await sql`
          insert into user_company_memberships (user_id, company_id, role, is_default)
          values (${userId}, ${membershipCompanyId}, ${role}, ${membershipCompanyId === companyId})
          on conflict (user_id, company_id) do update set
            role = excluded.role,
            is_default = excluded.is_default,
            updated_at = now()
        `;
      }
    }

    return json(res, 200, {
      user: {
        ...updatedUser,
        membership_company_ids: isSuperAdminUpdate ? [] : membershipCompanyIds,
      },
    });
  }

  return notFound(res);
}

export default async function handler(req, res) {
  try {
    const pathName = routePath(req);
    if (pathName.startsWith('auth/')) return auth(req, res, pathName);
    if (pathName.startsWith('webhooks/')) return webhooks(req, res, pathName);
    if (pathName.startsWith('tex/')) return tex(req, res, pathName);
    return notFound(res);
  } catch (error) {
    console.error(error);
    return json(res, 500, { error: 'Internal server error' });
  }
}
