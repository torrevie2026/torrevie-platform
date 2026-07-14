"use client";

import { useState } from "react";
import type { TexIntegrationWorkspace } from "../../../lib/tex";

type TexIntegrationsClientProps = {
  adminIntegrationsHref: string;
  initialWorkspace: TexIntegrationWorkspace | null;
};

export function TexIntegrationsClient({
  adminIntegrationsHref,
  initialWorkspace
}: TexIntegrationsClientProps) {
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <section className="tex-integrations-workspace" aria-labelledby="tex-integrations-title">
      <header className="section-heading-row">
        <div>
          <p className="eyebrow">Integrations</p>
          <h2 id="tex-integrations-title">WhatsApp and receipt storage</h2>
          <p>
            Monitor the live TEX webhook provider and tenant-scoped receipt storage. Configuration
            changes stay in the shared customer administration module.
          </p>
        </div>
        <div className="tex-panel-actions">
          <button type="button" disabled={busy} onClick={refresh}>
            Refresh
          </button>
          <a className="tex-secondary-link" href={adminIntegrationsHref}>
            Configure
          </a>
        </div>
      </header>

      {error ? <p className="tex-error">{error}</p> : null}

      <div className="tex-integrations-grid">
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
