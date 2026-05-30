import { useState, useEffect } from 'react';

/**
 * PWAInstallBanner — mobile only (iOS + Android)
 * - iOS Safari: step-by-step share-sheet instructions
 * - Android Chrome/Edge: native beforeinstallprompt banner
 * Desktop install intentionally excluded.
 */

type Platform = 'ios' | 'android' | null;

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  const isIOS = /iphone|ipad|ipod/i.test(ua);
  const isAndroid = /android/i.test(ua);
  const isStandalone =
    ('standalone' in navigator && (navigator as any).standalone) ||
    window.matchMedia('(display-mode: standalone)').matches;
  if (isStandalone) return null; // Already installed
  if (isIOS) return 'ios';
  if (isAndroid) return 'android';
  return null; // Desktop — no prompt
}

export function PWAInstallBanner() {
  const [platform, setPlatform] = useState<Platform>(null);
  const [installable, setInstallable] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [showIOSSheet, setShowIOSSheet] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem('velo-pwa-dismissed')) {
      setDismissed(true);
      return;
    }

    const p = detectPlatform();
    setPlatform(p);

    if (p === 'android') {
      if ((window as any).__veloInstallPrompt) {
        setInstallable(true);
      } else {
        const onInstallable = () => setInstallable(true);
        window.addEventListener('velo:installable', onInstallable);
        return () => window.removeEventListener('velo:installable', onInstallable);
      }
    }

    if (p === 'ios') {
      setInstallable(true);
    }
  }, []);

  function dismiss() {
    setDismissed(true);
    sessionStorage.setItem('velo-pwa-dismissed', '1');
  }

  async function handleInstallClick() {
    if (platform === 'ios') {
      setShowIOSSheet(true);
      return;
    }
    const prompt = (window as any).__veloInstallPrompt;
    if (!prompt) return;
    prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === 'accepted') dismiss();
  }

  if (dismissed || !installable || !platform) return null;

  // iOS manual instruction sheet
  if (showIOSSheet) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}>
        <div className="glass-panel rounded-t-2xl w-full max-w-sm mx-auto p-6 pb-8 animate-slide-up">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="velo-logo-bug w-8 h-8 flex items-center justify-center">
                <span className="font-display italic text-base font-light" style={{ color: '#F4F1E8' }}>V</span>
              </div>
              <span className="font-semibold text-sm" style={{ color: '#ECEDF1' }}>Add VELO to Home Screen</span>
            </div>
            <button onClick={dismiss} style={{ color: '#8E919B', background: 'none', border: 'none', cursor: 'pointer', padding: 4, touchAction: 'manipulation' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
          <ol className="space-y-3">
            {[
              { icon: '⬆️', text: "Tap the Share button in Safari's toolbar" },
              { icon: '➕', text: 'Scroll down and tap "Add to Home Screen"' },
              { icon: '✅', text: 'Tap "Add" to confirm' },
            ].map((step, i) => (
              <li key={i} className="flex items-start gap-3 text-sm" style={{ color: '#ECEDF1' }}>
                <span className="text-lg leading-none mt-0.5">{step.icon}</span>
                <span>{step.text}</span>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-xs" style={{ color: '#8E919B' }}>
            Once added, VELO opens full-screen — no Safari chrome.
          </p>
        </div>
      </div>
    );
  }

  // Android install banner
  return (
    <div
      style={{
        position: 'fixed',
        top: 'max(80px, calc(env(safe-area-inset-top, 0px) + 76px))',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9998,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 12px 10px 10px',
        borderRadius: 16,
        maxWidth: '360px',
        width: 'calc(100% - 32px)',
        background: 'rgba(20,22,30,0.95)',
        border: '1px solid rgba(123,60,232,0.35)',
        backdropFilter: 'blur(20px)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        animation: 'bounceIn 0.35s ease-out',
      }}
    >
      <div className="velo-logo-bug flex-shrink-0 w-9 h-9 flex items-center justify-center">
        <span className="font-display italic text-lg font-light" style={{ color: '#F4F1E8' }}>V</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 600, color: '#ECEDF1', margin: 0 }}>Install VELO</p>
        <p style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: '#8E919B', margin: 0 }}>Add to home screen</p>
      </div>
      <button
        onClick={handleInstallClick}
        style={{
          flexShrink: 0,
          padding: '8px 14px',
          borderRadius: 10,
          fontSize: 13,
          fontWeight: 700,
          background: 'linear-gradient(135deg, #7B3CE8 0%, #3B5BFF 100%)',
          color: '#fff',
          border: 'none',
          cursor: 'pointer',
          touchAction: 'manipulation',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        Install
      </button>
      <button
        onClick={dismiss}
        style={{ flexShrink: 0, padding: 4, background: 'none', border: 'none', cursor: 'pointer', color: '#8E919B', touchAction: 'manipulation' }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </button>
    </div>
  );
}
