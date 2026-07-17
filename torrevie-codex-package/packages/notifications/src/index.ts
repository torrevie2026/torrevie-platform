export type WhatsAppProvider = "ultramsg" | "wappfly" | "meta";

export type WhatsAppDispatchInput = {
  provider: WhatsAppProvider;
  to: string;
  message: string;
  apiKey?: string | null;
  instanceId?: string | null;
  wappflySessionId?: string | null;
  metaPhoneNumberId?: string | null;
  metaGraphApiVersion?: string | null;
};

export type WhatsAppDispatchResult = {
  ok: boolean;
  provider: WhatsAppProvider;
  status: "sent" | "skipped" | "failed";
  messageId: string | null;
  error: string | null;
  httpStatus: number | null;
};

export type EmailDispatchInput = {
  to: string | string[];
  subject: string;
  text: string;
  html?: string | null;
  provider?: "postmark" | null;
  from?: string | null;
  postmarkServerToken?: string | null;
  postmarkMessageStream?: string | null;
};

export type EmailDispatchResult = {
  ok: boolean;
  provider: "postmark" | null;
  status: "sent" | "skipped" | "failed";
  messageId: string | null;
  error: string | null;
  httpStatus: number | null;
};

export type NotificationFetch = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

export async function dispatchWhatsAppNotification(
  input: WhatsAppDispatchInput,
  fetcher: NotificationFetch = globalThis.fetch.bind(globalThis)
): Promise<WhatsAppDispatchResult> {
  const message = input.message.trim();
  const to = normalizeWhatsAppRecipient(input.to);

  if (!message || !to) {
    return skipped(input.provider, "Recipient and message are required.");
  }

  if (!input.apiKey?.trim()) {
    return skipped(input.provider, "WhatsApp API key is not configured.");
  }

  if (input.provider === "wappfly") {
    return sendWappflyMessage(input, to, message, fetcher);
  }

  if (input.provider === "meta") {
    return sendMetaMessage(input, to, message, fetcher);
  }

  return sendUltramsgMessage(input, to, message, fetcher);
}

export async function dispatchEmailNotification(
  input: EmailDispatchInput,
  fetcher: NotificationFetch = globalThis.fetch.bind(globalThis)
): Promise<EmailDispatchResult> {
  const recipients = normalizeEmailRecipients(input.to);
  const subject = input.subject.trim();
  const text = input.text.trim();
  const provider =
    input.provider ?? (process.env.EMAIL_PROVIDER === "postmark" ? "postmark" : null);
  const token = input.postmarkServerToken?.trim() || process.env.POSTMARK_SERVER_TOKEN?.trim();

  if (!recipients.length || !subject || !text) {
    return skippedEmail(provider, "Recipient, subject, and text body are required.");
  }

  if (provider !== "postmark" && !token) {
    return skippedEmail(null, "Email provider is not configured.");
  }

  if (!token) {
    return skippedEmail("postmark", "Postmark server token is not configured.");
  }

  const response = await fetcher("https://api.postmarkapp.com/email", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Postmark-Server-Token": token
    },
    body: JSON.stringify({
      From:
        input.from?.trim() ||
        process.env.EMAIL_FROM ||
        process.env.EMAIL_FROM_ADDRESS ||
        "Torrevie <no-reply@torrevie.com>",
      To: recipients.join(","),
      Subject: subject,
      HtmlBody: input.html?.trim() || text,
      TextBody: text,
      MessageStream:
        input.postmarkMessageStream?.trim() || process.env.POSTMARK_MESSAGE_STREAM || "outbound"
    })
  });
  const body = await safeJson(response);
  const error = readError(body);

  if (!response.ok || error) {
    return {
      ok: false,
      provider: "postmark",
      status: "failed",
      messageId: null,
      error: error ?? `HTTP ${response.status}`,
      httpStatus: response.status
    };
  }

  return {
    ok: true,
    provider: "postmark",
    status: "sent",
    messageId: firstPathString(body, ["MessageID", "MessageId", "messageId", "id"]),
    error: null,
    httpStatus: response.status
  };
}

export function normalizeWhatsAppRecipient(value: string | null | undefined) {
  const digits = value?.replace(/\D/g, "") ?? "";
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

export function normalizeEmailRecipients(value: string | string[] | null | undefined) {
  const recipients = Array.isArray(value)
    ? value
    : String(value ?? "")
        .split(/[,\n;]/)
        .map((item) => item.trim());

  return recipients
    .map((recipient) => recipient.trim().toLowerCase())
    .filter(
      (recipient, index, all) => isEmailAddress(recipient) && all.indexOf(recipient) === index
    );
}

async function sendWappflyMessage(
  input: WhatsAppDispatchInput,
  to: string,
  message: string,
  fetcher: NotificationFetch
): Promise<WhatsAppDispatchResult> {
  const response = await fetcher("https://wappfly.com/api/messages/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Token": input.apiKey?.trim() ?? ""
    },
    body: JSON.stringify({
      to: `${to}@s.whatsapp.net`,
      text: message
    })
  });

  return mapProviderResponse(input.provider, response, await safeJson(response), [
    "msg_id",
    "id",
    "messageId"
  ]);
}

async function sendUltramsgMessage(
  input: WhatsAppDispatchInput,
  to: string,
  message: string,
  fetcher: NotificationFetch
): Promise<WhatsAppDispatchResult> {
  const instanceId = input.instanceId?.trim().replace(/^instance/i, "") ?? "";
  if (!instanceId) {
    return skipped(input.provider, "UltraMsg instance id is not configured.");
  }

  const body = new URLSearchParams({
    token: input.apiKey?.trim() ?? "",
    to,
    body: message
  });

  const response = await fetcher(
    `https://api.ultramsg.com/instance${encodeURIComponent(instanceId)}/messages/chat`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString()
    }
  );

  return mapProviderResponse(input.provider, response, await safeJson(response), [
    "id",
    "messageId"
  ]);
}

async function sendMetaMessage(
  input: WhatsAppDispatchInput,
  to: string,
  message: string,
  fetcher: NotificationFetch
): Promise<WhatsAppDispatchResult> {
  const phoneNumberId = input.metaPhoneNumberId?.trim() ?? "";
  if (!phoneNumberId) {
    return skipped(input.provider, "Meta phone number id is not configured.");
  }

  const graphVersion = input.metaGraphApiVersion?.trim() || "v21.0";
  const response = await fetcher(
    `https://graph.facebook.com/${encodeURIComponent(graphVersion)}/${encodeURIComponent(
      phoneNumberId
    )}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey?.trim() ?? ""}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: {
          preview_url: false,
          body: message
        }
      })
    }
  );

  return mapProviderResponse(input.provider, response, await safeJson(response), [
    "messages.0.id",
    "id",
    "messageId"
  ]);
}

async function safeJson(response: Response) {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function mapProviderResponse(
  provider: WhatsAppProvider,
  response: Response,
  body: Record<string, unknown>,
  idPaths: readonly string[]
): WhatsAppDispatchResult {
  const error = readError(body);

  if (!response.ok || error) {
    return {
      ok: false,
      provider,
      status: "failed",
      messageId: null,
      error: error ?? `HTTP ${response.status}`,
      httpStatus: response.status
    };
  }

  return {
    ok: true,
    provider,
    status: "sent",
    messageId: firstPathString(body, idPaths),
    error: null,
    httpStatus: response.status
  };
}

function skipped(provider: WhatsAppProvider, error: string): WhatsAppDispatchResult {
  return {
    ok: false,
    provider,
    status: "skipped",
    messageId: null,
    error,
    httpStatus: null
  };
}

function skippedEmail(provider: "postmark" | null, error: string): EmailDispatchResult {
  return {
    ok: false,
    provider,
    status: "skipped",
    messageId: null,
    error,
    httpStatus: null
  };
}

function isEmailAddress(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function readError(body: Record<string, unknown>) {
  const error = body.error;

  if (typeof error === "string") {
    return error;
  }

  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    return typeof message === "string" ? message : "WhatsApp provider returned an error.";
  }

  return null;
}

function firstPathString(body: Record<string, unknown>, paths: readonly string[]) {
  for (const path of paths) {
    const value = readPath(body, path);
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function readPath(body: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((cursor, segment) => {
    if (cursor === null || cursor === undefined) {
      return undefined;
    }

    if (Array.isArray(cursor)) {
      const index = Number(segment);
      return Number.isInteger(index) ? cursor[index] : undefined;
    }

    if (typeof cursor === "object") {
      return (cursor as Record<string, unknown>)[segment];
    }

    return undefined;
  }, body);
}
