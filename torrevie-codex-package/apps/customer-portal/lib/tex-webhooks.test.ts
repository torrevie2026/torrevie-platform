import { createHmac } from "node:crypto";
import { strict as assert } from "node:assert";
import type { QueryResult, QueryValue, TenantQueryClient } from "@torrevie/tenant-context";
import { setTexWhatsappNotificationDispatcherForTest } from "./tex";
import { handleTexWebhookRequest } from "./tex-webhooks";

setTexWhatsappNotificationDispatcherForTest(async (input) => ({
  ok: true,
  provider: input.provider,
  status: "sent",
  messageId: "test-whatsapp-message",
  error: null,
  httpStatus: 200
}));

const tenantId = "00000000-0000-4000-8000-000000001001";
const actorUserId = "00000000-0000-4000-8000-000000002001";

class RecordingWebhookClient implements TenantQueryClient {
  readonly calls: Array<{ sql: string; values: readonly QueryValue[] }> = [];

  async query<Row>(sql: string, values: readonly QueryValue[] = []): Promise<QueryResult<Row>> {
    this.calls.push({ sql, values });

    if (sql.trim().toLowerCase() === "begin" || sql.trim().toLowerCase() === "commit") {
      return { rows: [] };
    }

    if (sql.includes("api_secret.secret_value as api_key")) {
      return {
        rows: [
          {
            whatsapp_provider: "wappfly",
            whatsapp_instance_id: null,
            wappfly_session_id: "wappfly-session-1",
            meta_phone_number_id: null,
            api_key: "test-api-key"
          }
        ] as Row[]
      };
    }

    if (sql.includes("from public.tex_integration_settings")) {
      const provider = values[0] === "secret-token" ? values[1] : values[0];
      return {
        rows: [
          {
            tenant_id: tenantId,
            actor_user_id: actorUserId,
            webhook_verify_token: provider === "meta" ? "meta-token" : "secret-token",
            app_secret: provider === "meta" ? "meta-app-secret" : null
          }
        ] as Row[]
      };
    }

    if (sql.includes("from public.tex_employee_profiles")) {
      return { rows: [] };
    }

    if (sql.includes("insert into public.tex_unregistered_whatsapp_submissions")) {
      return {
        rows: [
          {
            id: "00000000-0000-4000-8000-000000007001",
            status: "open"
          }
        ] as Row[]
      };
    }

    return { rows: [] };
  }

  hasSql(fragment: string) {
    return this.calls.some((call) => call.sql.includes(fragment));
  }

  valuesContain(value: QueryValue) {
    return this.calls.some((call) => call.values.includes(value));
  }
}

async function main() {
  {
    const client = new RecordingWebhookClient();
    const body = JSON.stringify({
      event: "messages.received",
      session: { id: "wappfly-session-1" },
      data: {
        messages: {
          key: {
            id: "wamid.wappfly.1",
            fromMe: false,
            cleanedSenderPn: "+971500000001",
            remoteJid: "971500000001@s.whatsapp.net"
          },
          message: {
            conversation: "STATUS"
          }
        }
      }
    });
    const response = await handleTexWebhookRequest(client, {
      provider: "wappfly",
      method: "POST",
      url: "https://app.torrevie.com/api/tex/webhooks/wappfly?token=secret-token",
      headers: new Headers(),
      bodyText: body
    });

    assert.equal(response.status, 200);
    assert.match(JSON.stringify(response.body), /No TEX employee profile/);
    assert.equal(client.valuesContain("wappfly-session-1"), true);
    assert.equal(client.valuesContain("wamid.wappfly.1"), true);
    assert.equal(client.hasSql("insert into public.tex_unregistered_whatsapp_submissions"), true);
  }

  {
    const client = new RecordingWebhookClient();
    await assert.rejects(
      () =>
        handleTexWebhookRequest(client, {
          provider: "ultramsg",
          method: "POST",
          url: "https://app.torrevie.com/api/tex/webhooks/ultramsg?token=wrong-token",
          headers: new Headers(),
          bodyText: JSON.stringify({
            instanceId: "instance-1",
            data: {
              id: "wamid.ultra.1",
              from: "971500000002@c.us",
              type: "chat",
              body: "STATUS"
            }
          })
        }),
      {
        message: /token verification failed/,
        statusCode: 401
      }
    );
  }

  {
    const client = new RecordingWebhookClient();
    const response = await handleTexWebhookRequest(client, {
      provider: "meta",
      method: "GET",
      url: "https://app.torrevie.com/api/tex/webhooks/meta?hub.mode=subscribe&hub.verify_token=meta-token&hub.challenge=challenge-123",
      headers: new Headers(),
      bodyText: ""
    });

    assert.equal(response.status, 200);
    assert.equal(response.body, "challenge-123");
  }

  {
    const client = new RecordingWebhookClient();
    const body = JSON.stringify({
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: "meta-phone-1" },
                messages: [
                  {
                    id: "wamid.meta.1",
                    from: "971500000003",
                    text: { body: "STATUS" }
                  }
                ]
              }
            }
          ]
        }
      ]
    });
    const signature = `sha256=${createHmac("sha256", "meta-app-secret").update(body).digest("hex")}`;
    const response = await handleTexWebhookRequest(client, {
      provider: "meta",
      method: "POST",
      url: "https://app.torrevie.com/api/tex/webhooks/meta",
      headers: new Headers({ "x-hub-signature-256": signature }),
      bodyText: body
    });

    assert.equal(response.status, 200);
    assert.equal(client.valuesContain("meta-phone-1"), true);
    assert.equal(client.valuesContain("wamid.meta.1"), true);
  }

  console.log("TEX webhook tests passed.");
}

void main();
