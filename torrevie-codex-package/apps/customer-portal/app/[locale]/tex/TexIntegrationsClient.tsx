"use client";

import { useEffect, useState } from "react";
import type { TexIntegrationWorkspace } from "../../../lib/tex";

type WhatsappProvider = "wappfly" | "ultramsg" | "meta" | "quickconnect";

type TexIntegrationsClientProps = {
  adminIntegrationsHref: string;
  initialWorkspace: TexIntegrationWorkspace | null;
};

type ProviderGuide = {
  key: WhatsappProvider;
  label: string;
  summary: string;
  dashboardUrl: string | null;
  requiredFields: string[];
  steps: string[];
  webhookSteps: string[];
  testSteps: string[];
};

const providerGuides: ProviderGuide[] = [
  {
    key: "wappfly",
    label: "Wappfly",
    summary: "Fastest option for tenants who already use a connected Wappfly WhatsApp session.",
    dashboardUrl: "https://wappfly.com/login",
    requiredFields: ["Session ID", "API key"],
    steps: [
      "Open Wappfly and confirm the WhatsApp session is connected.",
      "Copy the Wappfly Session ID.",
      "Copy the Wappfly API key.",
      "Paste both values in Torrevie customer administration.",
      "Save the provider profile and mark it as default."
    ],
    webhookSteps: [
      "Copy the Torrevie webhook URL below.",
      "Paste it into the Wappfly webhook/callback setting for inbound messages.",
      "Save the Wappfly webhook setting."
    ],
    testSteps: [
      "Send a receipt image or expense message to the connected WhatsApp number.",
      "Return to TEX and open WhatsApp review.",
      "Confirm the message appears as a known or unregistered sender submission."
    ]
  },
  {
    key: "ultramsg",
    label: "UltraMsg",
    summary: "Useful when the tenant manages WhatsApp through an UltraMsg instance.",
    dashboardUrl: "https://user.ultramsg.com",
    requiredFields: ["Instance ID", "Token or API key"],
    steps: [
      "Open the UltraMsg instance dashboard.",
      "Confirm the instance status is connected.",
      "Copy the Instance ID.",
      "Copy the token/API key.",
      "Paste both values in Torrevie customer administration."
    ],
    webhookSteps: [
      "Copy the Torrevie webhook URL below.",
      "Paste it into the UltraMsg webhook setting.",
      "Enable inbound message events and save."
    ],
    testSteps: [
      "Send a test WhatsApp text or receipt image to the connected number.",
      "Refresh this page and check the active provider details.",
      "Open WhatsApp review to confirm the inbound record arrived."
    ]
  },
  {
    key: "meta",
    label: "Meta Cloud API",
    summary: "Best for tenants operating an official WhatsApp Business Cloud API setup.",
    dashboardUrl: "https://developers.facebook.com/apps",
    requiredFields: [
      "Phone Number ID",
      "WhatsApp Business Account ID",
      "Access token",
      "App secret",
      "Webhook verify token"
    ],
    steps: [
      "Open the Meta Developer app that owns the WhatsApp product.",
      "Copy the Phone Number ID.",
      "Copy the WhatsApp Business Account ID.",
      "Create or copy a valid access token.",
      "Copy the app secret and paste all values in Torrevie customer administration."
    ],
    webhookSteps: [
      "Generate or set a webhook verify token in Torrevie customer administration.",
      "Copy the Torrevie webhook URL below.",
      "Paste the callback URL and verify token into Meta Webhooks.",
      "Subscribe to message events."
    ],
    testSteps: [
      "Use Meta's test message tool or send an inbound message from a phone.",
      "Confirm Meta webhook verification succeeds.",
      "Open TEX WhatsApp review to confirm the message was received."
    ]
  },
  {
    key: "quickconnect",
    label: "Quick Connect Beta",
    summary:
      "Linked-device setup for trial and low-volume receipt intake. This stays inside TEX and does not open UltraMsg, Wappfly, or Meta setup.",
    dashboardUrl: null,
    requiredFields: ["WhatsApp phone online", "Linked Devices access", "QR scan"],
    steps: [
      "Keep the tenant WhatsApp phone online with WhatsApp installed.",
      "Open WhatsApp on the phone and go to Linked Devices.",
      "Request a secure pairing QR from this panel.",
      "Scan the QR from the phone to link the tenant session.",
      "Use this option for trial or low-volume operations until production reliability is confirmed."
    ],
    webhookSteps: [
      "No external webhook is required for Quick Connect.",
      "Torrevie receives inbound messages through the linked-device session.",
      "If the phone logs out, changes number, or loses connectivity, reconnect with a new QR."
    ],
    testSteps: [
      "Send a test receipt image from an approved driver number.",
      "Open TEX WhatsApp review and confirm the receipt appears.",
      "If no message arrives, reconnect the linked device or switch to Wappfly, UltraMsg, or Meta."
    ]
  }
];

export function TexIntegrationsClient({
  adminIntegrationsHref,
  initialWorkspace
}: TexIntegrationsClientProps) {
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<WhatsappProvider>("quickconnect");
  const [copiedValue, setCopiedValue] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  if (!workspace) {
    return null;
  }

  async function refresh() {
    setBusy(true);
    setError(null);

    try {
      setWorkspace(await texFetch<TexIntegrationWorkspace>("/integrations"));
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  const settings = workspace.settings;
  const defaultProfile = workspace.defaultProviderProfile;
  const quickConnect = workspace.quickConnect;
  const selectedGuide = providerGuides.find((guide) => guide.key === selectedProvider) ?? providerGuides[0]!;
  const webhookUrl = buildWebhookUrl(selectedProvider, origin);

  return (
    <section className="tex-integrations-workspace" aria-labelledby="tex-integrations-title">
      <header className="section-heading-row">
        <div>
          <p className="eyebrow">Integrations</p>
          <h2 id="tex-integrations-title">WhatsApp setup guide</h2>
          <p>
            Configure WhatsApp receipt intake through Quick Connect, Wappfly, UltraMsg, or Meta Cloud
            API with tenant-scoped webhook and storage details.
          </p>
        </div>
        <div className="tex-panel-actions">
          <button type="button" disabled={busy} onClick={refresh}>
            Refresh
          </button>
          <a className="tex-secondary-link" href={adminIntegrationsHref}>
            Configure managed providers
          </a>
        </div>
      </header>

      {error ? <p className="tex-error">{error}</p> : null}

      <div className="tex-integrations-grid">
        <article className="tex-form-panel tex-integrations-wide tex-whatsapp-guide">
          <div className="section-heading-row">
            <div>
              <p className="eyebrow">Guided setup</p>
              <h3>Choose the provider you want to connect</h3>
            </div>
          </div>
          <div className="tex-provider-tabs" role="tablist" aria-label="WhatsApp providers">
            {providerGuides.map((guide) => (
              <button
                aria-selected={guide.key === selectedProvider}
                key={guide.key}
                onClick={() => setSelectedProvider(guide.key)}
                role="tab"
                type="button"
              >
                {guide.label}
              </button>
            ))}
          </div>

          <div className="tex-provider-guide-grid">
            <section className="tex-provider-guide-main">
              <p>{selectedGuide.summary}</p>
              <div className="tex-guide-field-list" aria-label={`${selectedGuide.label} required fields`}>
                {selectedGuide.requiredFields.map((field) => (
                  <span key={field}>{field}</span>
                ))}
              </div>
              {selectedGuide.dashboardUrl ? (
                <a className="tex-secondary-link" href={selectedGuide.dashboardUrl} rel="noreferrer" target="_blank">
                  Open {selectedGuide.label} dashboard
                </a>
              ) : null}
            </section>

            {selectedGuide.key === "quickconnect" ? (
              <QuickConnectPanel
                busy={busy}
                quickConnect={quickConnect}
                onDisconnect={disconnectQuickConnect}
                onPairingRequest={requestQuickConnectPairing}
              />
            ) : (
              <section className="tex-webhook-copy-panel" aria-label="Webhook URL">
                <span>Torrevie webhook URL</span>
                <code dir="ltr">{webhookUrl}</code>
                <button type="button" className="tex-secondary-button" onClick={() => copyValue(webhookUrl, "webhook")}>
                  {copiedValue === "webhook" ? "Copied" : "Copy webhook URL"}
                </button>
              </section>
            )}
          </div>

          <div className="tex-guide-step-grid">
            <GuideStepList title="1. Collect credentials" steps={selectedGuide.steps} />
            <GuideStepList title="2. Add webhook" steps={selectedGuide.webhookSteps} />
            <GuideStepList title="3. Test and activate" steps={selectedGuide.testSteps} />
          </div>
        </article>

        <article className="tex-form-panel">
          <h3>Live WhatsApp route</h3>
          <dl className="tex-integration-details">
            <div>
              <dt>Provider</dt>
              <dd>{formatProvider(settings?.whatsappProvider)}</dd>
            </div>
            <div>
              <dt>Default profile</dt>
              <dd>{defaultProfile?.label ?? "Not selected"}</dd>
            </div>
            <div>
              <dt>API key</dt>
              <dd>
                {defaultProfile?.apiKeyConfigured
                  ? `Configured${defaultProfile.apiKeyLast4 ? ` ending ${defaultProfile.apiKeyLast4}` : ""}`
                  : "Not configured"}
              </dd>
            </div>
            <div>
              <dt>AI receipt OCR</dt>
              <dd>{settings?.aiReceiptExtractionEnabled ? "Enabled" : "Disabled"}</dd>
            </div>
            <div>
              <dt>Duplicate handling</dt>
              <dd>
                {settings?.duplicateDetectionEnabled
                  ? settings.duplicateAutoRejectEnabled
                    ? "Auto-reject likely duplicates"
                    : "Flag likely duplicates"
                  : "Disabled"}
              </dd>
            </div>
          </dl>
        </article>

        <article className="tex-form-panel">
          <h3>Provider profiles</h3>
          {workspace.providerProfiles.length ? (
            <div className="tex-provider-profile-list">
              {workspace.providerProfiles.map((profile) => (
                <section key={profile.id} className="tex-provider-profile-row">
                  <span>
                    <strong>{profile.label}</strong>
                    <small>
                      {formatProvider(profile.provider)} / {profile.status}
                    </small>
                  </span>
                  <b>{profile.isDefault ? "Default" : "Standby"}</b>
                </section>
              ))}
            </div>
          ) : (
            <p className="tex-empty-state">No WhatsApp provider profiles have been saved yet.</p>
          )}
        </article>

        <article className="tex-form-panel tex-integrations-wide">
          <h3>Receipt storage boundary</h3>
          <dl className="tex-integration-details tex-storage-details">
            <div>
              <dt>Bucket</dt>
              <dd>{workspace.receiptStorage.bucket}</dd>
            </div>
            <div>
              <dt>Path prefix</dt>
              <dd dir="ltr">{workspace.receiptStorage.pathPrefix}</dd>
            </div>
            <div>
              <dt>Convention</dt>
              <dd dir="ltr">{workspace.receiptStorage.convention}</dd>
            </div>
          </dl>
        </article>
      </div>
    </section>
  );

  async function copyValue(value: string, key: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedValue(key);
      window.setTimeout(() => setCopiedValue(null), 1800);
    } catch {
      setError("Unable to copy to clipboard from this browser.");
    }
  }

  async function requestQuickConnectPairing() {
    setBusy(true);
    setError(null);

    try {
      await texFetch("/integrations/quick-connect/pairing", {
        method: "POST",
        body: JSON.stringify({})
      });
      setWorkspace(await texFetch<TexIntegrationWorkspace>("/integrations"));
      setSelectedProvider("quickconnect");
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  async function disconnectQuickConnect() {
    setBusy(true);
    setError(null);

    try {
      await texFetch("/integrations/quick-connect/disconnect", {
        method: "POST",
        body: JSON.stringify({})
      });
      setWorkspace(await texFetch<TexIntegrationWorkspace>("/integrations"));
      setSelectedProvider("quickconnect");
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }
}

function QuickConnectPanel({
  busy,
  onDisconnect,
  onPairingRequest,
  quickConnect
}: {
  busy: boolean;
  onDisconnect: () => void;
  onPairingRequest: () => void;
  quickConnect: TexIntegrationWorkspace["quickConnect"];
}) {
  const session = quickConnect.session;
  const status = session?.status ?? "idle";
  const connectorActive = quickConnect.connectorActive;
  const displayStatus = connectorActive ? formatQuickConnectStatus(status) : "Connector offline";

  return (
    <section className="tex-quick-connect-panel" aria-label="Quick Connect status">
      <div className="tex-quick-connect-header">
        <span>Quick Connect</span>
        <b data-status={connectorActive ? status : "offline"}>{displayStatus}</b>
      </div>
      {quickConnect.available ? (
        <>
          <div className="tex-quick-connect-qr">
            {session?.qrCodeData ? (
              <img
                alt="WhatsApp pairing QR code"
                className="tex-quick-connect-qr-image"
                src={session.qrCodeData}
              />
            ) : !connectorActive ? (
              <p>
                Quick Connect connector is offline. A hosted linked-device connector must be active
                before TEX can generate and refresh a scannable WhatsApp QR.
              </p>
            ) : (
              <p>
                Pairing request is queued. The scannable WhatsApp QR is generated by the linked-device
                connector and will appear here as soon as that runtime is active.
              </p>
            )}
          </div>
          <div className="tex-quick-connect-actions">
            <button type="button" disabled={busy || !connectorActive} onClick={onPairingRequest}>
              {status === "qr_pending" ? "Request new pairing" : "Request pairing"}
            </button>
            <button type="button" className="tex-secondary-button" disabled={busy} onClick={onDisconnect}>
              Disconnect
            </button>
          </div>
          <dl className="tex-quick-connect-details">
            <div>
              <dt>Connected number</dt>
              <dd>{session?.connectedPhone ?? "Not linked"}</dd>
            </div>
            <div>
              <dt>QR expires</dt>
              <dd>{formatDateTime(session?.qrExpiresAt)}</dd>
            </div>
            <div>
              <dt>Last update</dt>
              <dd>{formatDateTime(session?.updatedAt)}</dd>
            </div>
          </dl>
          {session?.error ? <p className="tex-error">{session.error}</p> : null}
          <div className="tex-quick-connect-events">
            <span>Recent events</span>
            {quickConnect.events.length ? (
              quickConnect.events.map((event) => (
                <article key={event.id}>
                  <strong>{formatQuickConnectEvent(event.eventType)}</strong>
                  <small>{formatDateTime(event.occurredAt)}</small>
                  {event.message ? <p>{event.message}</p> : null}
                </article>
              ))
            ) : (
              <p>No Quick Connect activity yet.</p>
            )}
          </div>
        </>
      ) : (
        <p>
          Quick Connect database migration is pending. Apply the TEX Quick Connect migration before
          enabling tenant self-service pairing.
        </p>
      )}
    </section>
  );
}

function GuideStepList({ steps, title }: { steps: string[]; title: string }) {
  return (
    <section className="tex-guide-step-list">
      <h4>{title}</h4>
      <ol>
        {steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
    </section>
  );
}

function buildWebhookUrl(provider: WhatsappProvider, origin: string) {
  if (provider === "quickconnect") {
    return `${origin || "https://app.torrevie.com"}/en/tex/integrations`;
  }

  return `${origin || "https://app.torrevie.com"}/api/tex/webhooks/${provider}`;
}

function formatProvider(provider: string | null | undefined) {
  if (provider === "ultramsg") {
    return "UltraMsg";
  }
  if (provider === "wappfly") {
    return "Wappfly";
  }
  if (provider === "meta") {
    return "Meta WhatsApp Cloud API";
  }
  return "Not configured";
}

function formatQuickConnectStatus(status: string) {
  if (status === "qr_pending") {
    return "QR pending";
  }
  if (status === "connected") {
    return "Connected";
  }
  if (status === "disconnected") {
    return "Disconnected";
  }
  if (status === "failed") {
    return "Failed";
  }
  return "Idle";
}

function formatQuickConnectEvent(eventType: string) {
  return eventType
    .replace(/^quick_connect\./, "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "Not available";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(date);
}

async function texFetch<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/tex${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers
    }
  });
  const body = (await response.json()) as { error?: string };

  if (!response.ok) {
    throw new Error(typeof body.error === "string" ? body.error : "TEX request failed.");
  }

  return body as T;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "TEX request failed.";
}
