import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

declare global {
  interface Window {
    __pwaInstallPrompt: BeforeInstallPromptEvent | null;
  }
}

// Capture PWA install prompt globally so it's not missed before login
window.__pwaInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e: Event) => {
  e.preventDefault();
  window.__pwaInstallPrompt = e as BeforeInstallPromptEvent;
});

// Register the kill-switch service worker so any previously-installed Workbox
// service worker on this origin is replaced and unregistered. Skip in
// Hosted preview/dev iframes.
if (
  'serviceWorker' in navigator &&
  import.meta.env.PROD &&
  window.top === window.self &&
  !/^(id-preview--|preview--)/.test(location.hostname) &&
  !/\.?lovableproject(-dev)?\.com$/.test(location.hostname) &&
  !/\.?beta\.lovable\.dev$/.test(location.hostname)
) {
  navigator.serviceWorker.register('/sw.js').catch(() => undefined);
}

createRoot(document.getElementById("root")!).render(<App />);
