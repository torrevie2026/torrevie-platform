"use client";

import { Download } from "lucide-react";
import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function TexInstallPrompt() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone) {
      setInstalled(true);
      return;
    }

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        className="tex-install-button"
        onClick={async () => {
          if (!installPrompt) {
            setShowHelp(true);
            return;
          }

          await installPrompt.prompt();
          const choice = await installPrompt.userChoice;
          if (choice.outcome !== "dismissed") {
            setInstallPrompt(null);
          }
        }}
      >
        <Download aria-hidden="true" />
        <span>Install app</span>
      </button>

      {showHelp ? (
        <div
          className="tex-install-dialog-backdrop"
          role="presentation"
          onClick={() => setShowHelp(false)}
        >
          <section
            aria-labelledby="tex-install-dialog-title"
            aria-modal="true"
            className="tex-install-dialog"
            role="dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="section-heading-row">
              <div>
                <p className="eyebrow">Install app</p>
                <h2 id="tex-install-dialog-title">Add Torrevie TEX to your device</h2>
              </div>
              <button type="button" className="tex-secondary-button" onClick={() => setShowHelp(false)}>
                Close
              </button>
            </div>
            <div className="tex-install-steps">
              <article>
                <strong>Chrome or Edge on desktop</strong>
                <p>Open the browser menu, then choose Install app or Apps and install this site.</p>
              </article>
              <article>
                <strong>Android Chrome</strong>
                <p>Open the browser menu, then choose Add to Home screen or Install app.</p>
              </article>
              <article>
                <strong>iPhone or iPad Safari</strong>
                <p>Tap Share, then choose Add to Home Screen.</p>
              </article>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
