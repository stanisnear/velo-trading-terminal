import './styles/velo-brand-system.css';
import './styles/tokens.css';
import './styles/brand.css';
// AppKit styles (replaces @rainbow-me/rainbowkit/styles.css)
import '@reown/appkit/react';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { wagmiConfig } from './services/web3Config';
import App from './App';

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
