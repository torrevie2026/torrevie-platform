import { strict as assert } from "node:assert";
import {
  dispatchWhatsAppNotification,
  normalizeWhatsAppRecipient,
  type NotificationFetch
} from "./index.js";

async function main() {
  assert.equal(normalizeWhatsAppRecipient("+971 50 000 0001"), "971500000001");
  assert.equal(normalizeWhatsAppRecipient("123"), null);

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

  console.log("Notification dispatch tests passed.");
}

void main();
