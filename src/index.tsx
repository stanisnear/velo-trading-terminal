import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

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

const root = document.getElementById('root');
if (root) {
  ReactDOM.createRoot(root).render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
} else {
  document.body.innerHTML = '<p style="color:red;padding:40px">Root element not found</p>';
}
