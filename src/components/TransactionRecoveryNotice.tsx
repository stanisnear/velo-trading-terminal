import React, { useState } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';

export function TransactionRecoveryNotice({ hash, onReset }: {
  hash: string; onReset: () => Promise<void>;
}) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <aside aria-label="Transaction recovery" style={{ padding: '12px 16px', background: 'var(--surface-2)', borderBottom: '1px solid var(--hairline)' }}>
    <p role="status">Transaction confirmation is unresolved. New submissions are paused.</p>
    <a href={`https://sepolia.basescan.org/tx/${hash}`} target="_blank" rel="noopener noreferrer">Check transaction <ExternalLink size={14} style={{ display: 'inline' }}/></a>
    <details style={{ marginTop: 8 }}>
      <summary>Transaction missing from the explorer?</summary>
      <p style={{ maxWidth: 720, margin: '12px 0' }}>Older versions sometimes saved a hash without preserving the signed transaction. Resetting tracking does not cancel a transaction. Check your wallet activity and positions before retrying any action.</p>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input type="checkbox" checked={acknowledged} onChange={e => setAcknowledged(e.target.checked)}/>
        I have checked my activity and understand this does not cancel a transaction.
      </label>
      <button className="velo-btn-secondary" style={{ marginTop: 12, padding: '10px 14px' }} disabled={!acknowledged || busy} onClick={async () => {
        setBusy(true); setError('');
        try { await onReset(); } catch (e) { setError(e instanceof Error ? e.message : 'Network checks failed. Tracking is unchanged.'); }
        finally { setBusy(false); }
      }}>{busy ? <><Loader2 size={14} className="animate-spin"/> Checking two RPC providers...</> : 'Check network and reset legacy tracking'}</button>
      {error && <p role="alert" style={{ color: 'var(--pnl-down)', marginTop: 8 }}>{error}</p>}
    </details>
  </aside>;
}
