"use client";

import { Download, MoreVertical, Share2, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type InstallPlatform = "android-edge" | "android-chrome" | "ios" | "desktop" | "generic";

type TexInstallPromptProps = {
  className?: string;
  compact?: boolean;
};

export function TexInstallPrompt({ className, compact = false }: TexInstallPromptProps) {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [platform, setPlatform] = useState<InstallPlatform>("generic");

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone) {
      setInstalled(true);
      return;
    }

    setPlatform(detectInstallPlatform(window.navigator.userAgent));

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

  const help = installGuidance(platform);

  return (
    <>
      <button
        type="button"
        className={["tex-install-button", className].filter(Boolean).join(" ")}
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
        <span>{compact ? "Install" : "Install app"}</span>
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
                <h2 id="tex-install-dialog-title">Install Torrevie TEX</h2>
                <p className="tex-install-intro">
                  Your browser is not showing the one-tap prompt. You can still install TEX from
                  the browser menu.
                </p>
              </div>
              <button type="button" className="tex-secondary-button" onClick={() => setShowHelp(false)}>
                Close
              </button>
            </div>
            <div className="tex-install-guide">
              <article className="tex-install-guide-main">
                <span className="tex-install-step-icon" aria-hidden="true">
                  <help.icon />
                </span>
                <span>
                  <strong>{help.title}</strong>
                  <p>{help.description}</p>
                </span>
              </article>
              <ol className="tex-install-checklist" aria-label="Installation outcome">
                <li>Torrevie TEX will open like a standalone app.</li>
                <li>If it is already installed, open it from your home screen or app launcher.</li>
              </ol>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

function detectInstallPlatform(userAgent: string): InstallPlatform {
  const ua = userAgent.toLowerCase();

  if (/iphone|ipad|ipod/.test(ua)) {
    return "ios";
  }

  if (ua.includes("android") && ua.includes("edg")) {
    return "android-edge";
  }

  if (ua.includes("android") && ua.includes("chrome")) {
    return "android-chrome";
  }

  if (ua.includes("windows") || ua.includes("macintosh") || ua.includes("linux")) {
    return "desktop";
  }

  return "generic";
}

function installGuidance(platform: InstallPlatform): {
  description: string;
  icon: typeof MoreVertical;
  title: string;
} {
  if (platform === "android-edge") {
    return {
      description: "Tap the Edge menu button, then choose Add to phone or Install app.",
      icon: MoreVertical,
      title: "Microsoft Edge on Android"
    };
  }

  if (platform === "android-chrome") {
    return {
      description: "Tap the Chrome menu button, then choose Add to Home screen or Install app.",
      icon: MoreVertical,
      title: "Chrome on Android"
    };
  }

  if (platform === "ios") {
    return {
      description: "Open this page in Safari, tap Share, then choose Add to Home Screen.",
      icon: Share2,
      title: "iPhone or iPad"
    };
  }

  if (platform === "desktop") {
    return {
      description: "Open the browser menu or address-bar app icon, then choose Install app.",
      icon: Smartphone,
      title: "Desktop browser"
    };
  }

  return {
    description: "Open your browser menu, then choose Install app or Add to Home screen.",
    icon: MoreVertical,
    title: "Install from browser menu"
  };
}
