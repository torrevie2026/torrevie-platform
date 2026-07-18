import { strict as assert } from "node:assert";
import {
  dispatchEmailNotification,
  dispatchWhatsAppNotification,
  normalizeEmailRecipients,
  normalizeWhatsAppRecipient,
  type NotificationFetch
} from "./index.js";

async function main() {
  assert.equal(normalizeWhatsAppRecipient("+971 50 000 0001"), "971500000001");
  assert.equal(normalizeWhatsAppRecipient("123"), null);
  assert.deepEqual(normalizeEmailRecipients("A@Example.com; bad; b@example.com"), [
    "a@example.com",
    "b@example.com"
  ]);

  {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const result = await dispatchWhatsAppNotification(
      {
        provider: "wappfly",
        to: "+971500000001",
        message: "Receipt received.",
        apiKey: "secret"
      },
      async (url: Parameters<NotificationFetch>[0], init?: RequestInit) => {
        calls.push({ url: String(url), init });
        return Response.json({ msg_id: "wf-1" });
      }
    );

    assert.equal(result.ok, true);
    assert.equal(result.messageId, "wf-1");
    assert.equal(calls[0]?.url, "https://wappfly.com/api/messages/send");
  }

  {
    const result = await dispatchWhatsAppNotification({
      provider: "ultramsg",
      to: "+971500000001",
      message: "Receipt received.",
      apiKey: "secret"
    });

    assert.equal(result.status, "skipped");
    assert.match(result.error ?? "", /instance id/);
  }

  {
    const result = await dispatchWhatsAppNotification(
      {
        provider: "meta",
        to: "+971500000001",
        message: "Receipt received.",
        apiKey: "secret",
        metaPhoneNumberId: "phone-1"
      },
      async () =>
        Response.json({
          messages: [{ id: "meta-1" }]
        })
    );

    assert.equal(result.ok, true);
    assert.equal(result.messageId, "meta-1");
  }

  {
    const previousEnv = {
      EMAIL_PROVIDER: process.env.EMAIL_PROVIDER,
      POSTMARK_SERVER_TOKEN: process.env.POSTMARK_SERVER_TOKEN,
      RESEND_API_KEY: process.env.RESEND_API_KEY
    };
    let result: Awaited<ReturnType<typeof dispatchEmailNotification>> | null = null;

    try {
      delete process.env.EMAIL_PROVIDER;
      delete process.env.POSTMARK_SERVER_TOKEN;
      delete process.env.RESEND_API_KEY;
      result = await dispatchEmailNotification({
        to: "finance@example.test",
        subject: "TEX summary",
        text: "Summary"
      });
    } finally {
      for (const [key, value] of Object.entries(previousEnv)) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    }

    assert.equal(result?.status, "skipped");
    assert.match(result?.error ?? "", /provider/);
  }

  {
    const previousEnv = {
      EMAIL_PROVIDER: process.env.EMAIL_PROVIDER,
      RESEND_API_KEY: process.env.RESEND_API_KEY,
      RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL
    };
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    let result: Awaited<ReturnType<typeof dispatchEmailNotification>> | null = null;

    try {
      delete process.env.EMAIL_PROVIDER;
      process.env.RESEND_API_KEY = "re-secret";
      process.env.RESEND_FROM_EMAIL = "Torrevie <noreply@torrevie.com>";
      result = await dispatchEmailNotification(
        {
          to: ["finance@example.test", "ops@example.test"],
          subject: "TEX summary",
          text: "Summary",
          html: "<p>Summary</p>"
        },
        async (url: Parameters<NotificationFetch>[0], init?: RequestInit) => {
          calls.push({ url: String(url), init });
          return Response.json({ id: "resend-1" });
        }
      );
    } finally {
      for (const [key, value] of Object.entries(previousEnv)) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    }

    const body = JSON.parse(String(calls[0]?.init?.body ?? "{}")) as {
      from?: string;
      to?: string[];
    };
    const headers = new Headers(calls[0]?.init?.headers);

    assert.equal(result?.ok, true);
    assert.equal(result?.provider, "resend");
    assert.equal(result?.messageId, "resend-1");
    assert.equal(calls[0]?.url, "https://api.resend.com/emails");
    assert.equal(headers.get("Authorization"), "Bearer re-secret");
    assert.equal(body.from, "Torrevie <noreply@torrevie.com>");
    assert.deepEqual(body.to, ["finance@example.test", "ops@example.test"]);
  }

  {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const result = await dispatchEmailNotification(
      {
        provider: "postmark",
        postmarkServerToken: "pm-secret",
        from: "Torrevie <no-reply@torrevie.com>",
        to: ["finance@example.test", "ops@example.test"],
        subject: "TEX summary",
        text: "Summary",
        html: "<p>Summary</p>"
      },
      async (url: Parameters<NotificationFetch>[0], init?: RequestInit) => {
        calls.push({ url: String(url), init });
        return Response.json({ MessageID: "pm-1" });
      }
    );
    const body = JSON.parse(String(calls[0]?.init?.body ?? "{}")) as { To?: string };

    assert.equal(result.ok, true);
    assert.equal(result.messageId, "pm-1");
    assert.equal(calls[0]?.url, "https://api.postmarkapp.com/email");
    assert.equal(body.To, "finance@example.test,ops@example.test");
  }

  console.log("Notification dispatch tests passed.");
}

void main();
