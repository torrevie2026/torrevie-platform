import React, { useEffect, useState } from 'react';
import { Download, Share, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

const DISMISSED_KEY = 'tex_install_dismissed';

const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (window.navigator as any).standalone === true;

const InstallBanner: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [show, setShow] = useState(false);
  const [iosMode, setIosMode] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;
    if (localStorage.getItem(DISMISSED_KEY) === 'true') return;

    if (isIOS()) {
      setIosMode(true);
      setShow(true);
      return;
    }

    if ((window as any).__pwaInstallPrompt) {
      setDeferredPrompt((window as any).__pwaInstallPrompt);
      setShow(true);
      return;
    }

    const handler = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event);
      setShow(true);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') setShow(false);
    setDeferredPrompt(null);
  };

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, 'true');
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="md:hidden bg-primary text-primary-foreground rounded-lg p-3 mb-4 flex items-center gap-3">
      {iosMode ? <Share className="h-5 w-5 shrink-0" /> : <Download className="h-5 w-5 shrink-0" />}
      <div className="flex-1 min-w-0">
        {iosMode ? (
          <p className="text-sm font-medium">
            Tap <Share className="inline h-4 w-4 -mt-0.5" /> then <strong>"Add to Home Screen"</strong> to install Torrevie TEX
          </p>
        ) : (
          <>
            <p className="text-sm font-medium">Add Torrevie TEX to your home screen</p>
            <Button size="sm" variant="secondary" onClick={handleInstall} className="mt-2 shrink-0">
              Install
            </Button>
          </>
        )}
      </div>
      <button onClick={dismiss} className="shrink-0 opacity-70 hover:opacity-100">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
};

export default InstallBanner;
