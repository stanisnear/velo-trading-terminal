import { useState, useEffect } from 'react';

/**
 * PWAInstallBanner
 * - On Android/Chrome/Edge: shows "Add to Home Screen" using the native beforeinstallprompt
 * - On iOS Safari: shows a manual instruction sheet (iOS doesn't support the prompt API)
 * - On macOS Safari/Chrome: shows a desktop install nudge
 * Dismisses permanently once installed or manually closed.
 */

type Platform = 'ios' | 'android' | 'desktop' | null;

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
  return 'desktop';
}

export function PWAInstallBanner() {
  const [platform, setPlatform] = useState<Platform>(null);
  const [installable, setInstallable] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [showIOSSheet, setShowIOSSheet] = useState(false);

  useEffect(() => {
    // Don't show if user already dismissed this session
    if (sessionStorage.getItem('velo-pwa-dismissed')) {
      setDismissed(true);
      return;
    }

    const p = detectPlatform();
    setPlatform(p);

    // For Android/Desktop: wait for browser install prompt
    if (p === 'android' || p === 'desktop') {
      if ((window as any).__veloInstallPrompt) {
        setInstallable(true);
      } else {
        const onInstallable = () => setInstallable(true);
        window.addEventListener('velo:installable', onInstallable);
        return () => window.removeEventListener('velo:installable', onInstallable);
      }
    }

    // For iOS: always show the guide (no prompt API)
    if (p === 'ios') {
      setInstallable(true);
    }
  }, []);

  // Hide after 8 seconds on desktop (non-blocking nudge)
  useEffect(() => {
    if (platform === 'desktop' && installable && !dismissed) {
      const t = setTimeout(() => dismiss(), 12000);
      return () => clearTimeout(t);
    }
  }, [platform, installable, dismissed]);

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
    if (outcome === 'accepted') {
      dismiss();
    }
  }

  if (dismissed || !installable || !platform) return null;

  // iOS manual instruction sheet
  if (showIOSSheet) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}>
        <div className="glass-panel rounded-t-2xl w-full max-w-sm mx-auto p-6 pb-8 animate-slide-up">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="velo-logo-bug w-8 h-8">
                <span className="font-display italic text-base font-light" style={{ color: '#F4F1E8' }}>V</span>
              </div>
              <span className="font-semibold text-sm" style={{ color: '#ECEDF1' }}>Add VELO to Home Screen</span>
            </div>
            <button onClick={dismiss} className="text-gray-400 hover:text-white transition-colors">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
          <ol className="space-y-3">
            {[
              { icon: '⬆️', text: 'Tap the Share button in Safari\'s toolbar' },
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
            Once added, VELO opens full-screen like a native app — no Safari chrome.
          </p>
        </div>
      </div>
    );
  }

  // Android / Desktop install banner
  return (
    <div
      className="fixed z-[9998] flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg"
      style={{
        bottom: platform === 'desktop' ? '24px' : undefined,
        top: platform === 'android' ? '12px' : undefined,
        left: '50%',
        transform: 'translateX(-50%)',
        maxWidth: '360px',
        width: 'calc(100% - 32px)',
        background: 'rgba(20,22,30,0.92)',
        border: '1px solid rgba(123,60,232,0.35)',
        backdropFilter: 'blur(20px)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05) inset',
        animation: 'bounceIn 0.35s ease-out',
      }}
    >
      <div className="velo-logo-bug flex-shrink-0 w-9 h-9 flex items-center justify-center">
        <span className="font-display italic text-lg font-light" style={{ color: '#F4F1E8' }}>V</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold truncate" style={{ color: '#ECEDF1' }}>Install VELO</p>
        <p className="text-xs truncate" style={{ color: '#8E919B' }}>
          {platform === 'desktop' ? 'Add to your dock for instant access' : 'Add to home screen'}
        </p>
      </div>
      <button
        onClick={handleInstallClick}
        className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:opacity-90 active:scale-95"
        style={{
          background: 'linear-gradient(135deg, #7B3CE8 0%, #3B5BFF 100%)',
          color: '#fff',
        }}
      >
        Install
      </button>
      <button
        onClick={dismiss}
        className="flex-shrink-0 p-1 rounded transition-colors"
        style={{ color: '#8E919B' }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </button>
    </div>
  );
}
