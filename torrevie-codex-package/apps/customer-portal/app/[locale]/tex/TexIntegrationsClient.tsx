"use client";

import { useEffect, useState } from "react";
import type { TexIntegrationWorkspace } from "../../../lib/tex";

type WhatsappProvider = "wappfly" | "ultramsg" | "meta" | "quickconnect";

type TexIntegrationsClientProps = {
  adminIntegrationsHref: string;
  initialWorkspace: TexIntegrationWorkspace | null;
  planKey: "trial" | "lite" | "growth" | "enterprise";
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
  initialWorkspace,
  planKey
}: TexIntegrationsClientProps) {
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pairingWait, setPairingWait] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<WhatsappProvider>("quickconnect");
  const [copiedValue, setCopiedValue] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const isStarterPlan = planKey === "trial" || planKey === "lite";

  useEffect(() => {
    if (isStarterPlan) {
      setSelectedProvider("quickconnect");
    }
  }, [isStarterPlan]);

  useEffect(() => {
    const session = workspace?.quickConnect.session;
    if (
      selectedProvider !== "quickconnect" ||
      !workspace?.quickConnect.connectorActive ||
      session?.status !== "qr_pending" ||
      session.qrCodeData
    ) {
      return;
    }

    let cancelled = false;

    async function pollPendingPairing() {
      setPairingWait(true);
      try {
        const nextWorkspace = await waitForQuickConnectQr(() =>
          texFetch<TexIntegrationWorkspace>("/integrations")
        );
        if (!cancelled) {
          setWorkspace(nextWorkspace);
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(errorMessage(requestError));
        }
      } finally {
        if (!cancelled) {
          setPairingWait(false);
        }
      }
    }

    void pollPendingPairing();

    return () => {
      cancelled = true;
    };
  }, [
    selectedProvider,
    workspace?.quickConnect.connectorActive,
    workspace?.quickConnect.session?.qrCodeData,
    workspace?.quickConnect.session?.status,
    workspace?.quickConnect.session?.updatedAt
  ]);

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

  const quickConnect = workspace.quickConnect;
  const visibleProviderGuides = isStarterPlan
    ? providerGuides.filter((guide) => guide.key === "quickconnect")
    : providerGuides;
  const selectedGuide =
    visibleProviderGuides.find((guide) => guide.key === selectedProvider) ?? visibleProviderGuides[0]!;
  const webhookUrl = buildWebhookUrl(selectedProvider, origin);
  const quickConnectIsConnected =
    selectedGuide.key === "quickconnect" &&
    quickConnect.connectorActive &&
    quickConnect.session?.status === "connected";
  const showProviderGuideMain = selectedGuide.key !== "quickconnect" || !quickConnectIsConnected;
  const showSetupGuideSteps = selectedGuide.key !== "quickconnect" || !quickConnectIsConnected;

  return (
    <section className="tex-integrations-workspace" aria-labelledby="tex-integrations-title">
      <header className="section-heading-row">
        <div>
          <p className="eyebrow">Integrations</p>
          <h2 id="tex-integrations-title">WhatsApp setup guide</h2>
          <p>
            {isStarterPlan
              ? "Connect WhatsApp with Quick Connect, scan the QR from Linked Devices, then send a receipt to test intake."
              : "Configure WhatsApp receipt intake through Quick Connect, Wappfly, UltraMsg, or Meta Cloud API with tenant-scoped webhook and storage details."}
          </p>
        </div>
        <div className="tex-panel-actions">
          <button type="button" disabled={busy} onClick={refresh}>
            Refresh
          </button>
          {!isStarterPlan ? (
            <a className="tex-secondary-link" href={adminIntegrationsHref}>
              Configure managed providers
            </a>
          ) : null}
        </div>
      </header>

      {error ? <p className="tex-error">{error}</p> : null}

      <div className="tex-integrations-grid">
        <article className="tex-form-panel tex-integrations-wide tex-whatsapp-guide">
          <div className="section-heading-row">
            <div>
              <p className="eyebrow">Guided setup</p>
              <h3>{isStarterPlan ? "Connect WhatsApp with Quick Connect" : "Choose the provider you want to connect"}</h3>
            </div>
          </div>
          {isStarterPlan ? (
            <div className="tex-provider-note">
              <strong>Starter trial setup</strong>
              <span>Only Quick Connect is shown during trial. Managed providers are available on Growth and Enterprise plans.</span>
            </div>
          ) : (
            <div className="tex-provider-tabs" role="tablist" aria-label="WhatsApp providers">
              {visibleProviderGuides.map((guide) => (
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
          )}

          <div className="tex-provider-guide-grid">
            {showProviderGuideMain ? (
              <section className="tex-provider-guide-main">
                <p>{selectedGuide.summary}</p>
                {selectedGuide.key === "quickconnect" ? (
                  <div className="tex-quick-connect-checklist" aria-label="Quick Connect requirements">
                    {selectedGuide.requiredFields.map((field) => (
                      <span key={field}>{field}</span>
                    ))}
                  </div>
                ) : (
                  <div className="tex-guide-field-list" aria-label={`${selectedGuide.label} required fields`}>
                    {selectedGuide.requiredFields.map((field) => (
                      <span key={field}>{field}</span>
                    ))}
                  </div>
                )}
                {selectedGuide.dashboardUrl ? (
                  <a className="tex-secondary-link" href={selectedGuide.dashboardUrl} rel="noreferrer" target="_blank">
                    Open {selectedGuide.label} dashboard
                  </a>
                ) : null}
              </section>
            ) : null}

            {selectedGuide.key === "quickconnect" ? (
              <QuickConnectPanel
                busy={busy}
                pairingWait={pairingWait}
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

          {showSetupGuideSteps ? (
            <div className="tex-guide-step-grid">
              <GuideStepList title="1. Collect credentials" steps={selectedGuide.steps} />
              <GuideStepList title="2. Add webhook" steps={selectedGuide.webhookSteps} />
              <GuideStepList title="3. Test and activate" steps={selectedGuide.testSteps} />
            </div>
          ) : null}
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
      setPairingWait(true);
      setWorkspace(
        await waitForQuickConnectQr(() => texFetch<TexIntegrationWorkspace>("/integrations"))
      );
      setSelectedProvider("quickconnect");
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setPairingWait(false);
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
  pairingWait,
  quickConnect
}: {
  busy: boolean;
  onDisconnect: () => void;
  onPairingRequest: () => void;
  pairingWait: boolean;
  quickConnect: TexIntegrationWorkspace["quickConnect"];
}) {
  const session = quickConnect.session;
  const status = session?.status ?? "idle";
  const connectorActive = quickConnect.connectorActive;
  const displayStatus = connectorActive ? formatQuickConnectStatus(status) : "Unavailable";
  const isConnected = connectorActive && status === "connected";

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
                Quick Connect is currently unavailable. Try again shortly or contact support if this
                does not recover.
              </p>
            ) : pairingWait ? (
              <p>
                Preparing a secure WhatsApp pairing QR. This panel will update automatically.
              </p>
            ) : isConnected ? (
              <p>WhatsApp is connected. Send a receipt to this number to test TEX receipt intake.</p>
            ) : (
              <p>
                Request a pairing QR, then scan it from WhatsApp Linked Devices on the tenant phone.
              </p>
            )}
          </div>
          <div className="tex-quick-connect-actions">
            <button type="button" disabled={busy || pairingWait || !connectorActive} onClick={onPairingRequest}>
              {pairingWait ? "Waiting for QR" : status === "qr_pending" ? "Request new pairing" : "Request pairing"}
            </button>
            <button type="button" className="tex-secondary-button" disabled={busy} onClick={onDisconnect}>
              Disconnect
            </button>
          </div>
          <dl className="tex-quick-connect-details">
            <div>
              <dt>Connection</dt>
              <dd>{isConnected ? "Connected" : "Not connected"}</dd>
            </div>
            <div>
              <dt>WhatsApp number</dt>
              <dd>{formatConnectedWhatsappNumber(session?.connectedPhone)}</dd>
            </div>
            <div>
              <dt>Service status</dt>
              <dd>{connectorActive ? "Available" : "Unavailable"}</dd>
            </div>
            <div>
              <dt>Last check</dt>
              <dd>{formatDateTime(session?.updatedAt)}</dd>
            </div>
          </dl>
          {session?.error ? <p className="tex-error">{session.error}</p> : null}
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

function formatConnectedWhatsappNumber(value: string | null | undefined) {
  if (!value) {
    return "Not linked";
  }

  const phonePart = value.split("@")[0]?.split(":")[0]?.trim();
  if (!phonePart) {
    return value;
  }

  return phonePart.startsWith("+") ? phonePart : `+${phonePart}`;
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

async function waitForQuickConnectQr(fetchWorkspace: () => Promise<TexIntegrationWorkspace>) {
  const attempts = 18;
  let latestWorkspace: TexIntegrationWorkspace | null = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    latestWorkspace = await fetchWorkspace();
    const session = latestWorkspace.quickConnect.session;

    if (session?.qrCodeData || session?.status === "connected" || session?.status === "failed") {
      return latestWorkspace;
    }

    await sleep(2000);
  }

  if (latestWorkspace) {
    return latestWorkspace;
  }

  throw new Error("Quick Connect did not return a pairing QR. Check that the connector is running.");
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}
