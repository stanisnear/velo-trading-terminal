import './styles/tokens.css';
import './styles/brand.css';
// AppKit styles (replaces @rainbow-me/rainbowkit/styles.css)
import '@reown/appkit/react';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { wagmiConfig } from './services/web3Config';
import { initAnalytics } from './services/analytics';
import { initSessionManager } from './services/supabaseStore';
import App from './App';

// ── Build stamp ──────────────────────────────────────────────────────────
// Lets anyone verify WHICH build is actually live: open the browser console
// on the deployed site and type  __VELO_BUILD__  (or just read the banner).
// Bump the tag whenever a delta batch ships, so "did my deploy go out?" is a
// two-second check instead of a guessing game.
export const VELO_BUILD = 'audit-v22';
(window as any).__VELO_BUILD__ = VELO_BUILD;
document.documentElement.setAttribute('data-velo-build', VELO_BUILD); // visible in DevTools → Elements on <html>
console.info(`%c VELO %c build ${VELO_BUILD} `, 'background:#7c5aff;color:#fff;border-radius:3px 0 0 3px;padding:2px 4px;font-weight:700', 'background:#16161d;color:#9ca3af;border-radius:0 3px 3px 0;padding:2px 6px');

// Initialize Google Analytics (no-op unless VITE_GA_MEASUREMENT_ID is set).
initAnalytics();

// Start the session manager: keeps the Supabase token proactively fresh so app
// data never blanks out from an expired JWT (covers every RLS-protected read).
initSessionManager();

// Force AppKit modal web component above all Velo modals (which sit at z-index 9999).
// AppKit renders <w3m-modal> as a top-level web component; without this it can
// render behind custom modals on some browsers.
const appKitStyle = document.createElement('style');
appKitStyle.textContent = `
  w3m-modal, wcm-modal {
    z-index: 99999 !important;
  }
`;
document.head.appendChild(appKitStyle);

// web3Config must be imported before App so createAppKit() runs at module
// evaluation time — before any React tree mounts.
// (The import above already triggers it via the side-effect.)

class ErrorBoundary extends React.Component<{children: React.ReactNode}, {error: Error | null}> {
  constructor(props: any) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, textAlign: 'center', color: '#ef4444', fontFamily: '-apple-system, sans-serif' }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 16 }}>Something went wrong</h1>
          <p style={{ color: '#888', marginBottom: 16 }}>The application encountered a critical error.</p>
          <pre style={{ background: '#1a1a1a', padding: 16, borderRadius: 8, textAlign: 'left', overflow: 'auto', fontSize: 12, color: '#e5e5e5', maxWidth: 600, margin: '0 auto' }}>
            {this.state.error.message}
            {'\n\n'}
            {this.state.error.stack}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{ marginTop: 20, padding: '10px 24px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
          >
            Reload Application
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const queryClient = new QueryClient();

const root = document.getElementById('root');
if (root) {
  ReactDOM.createRoot(root).render(
    // RainbowKitProvider is gone — AppKit registers itself as a web component.
    // WagmiProvider + QueryClientProvider are still required.
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </QueryClientProvider>
    </WagmiProvider>
  );
} else {
  document.body.innerHTML = '<p style="color:red;padding:40px">Root element not found</p>';
}
