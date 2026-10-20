import { useState } from 'react';
import { ArrowUpRight, Loader2 } from 'lucide-react';
import { Dialog } from './ui/Dialog';
import { baseScanTxUrl, type VeloPosition } from '@/services/veloPerpsService';
import type { UseVeloPerpsTradingActions, UseVeloPerpsTradingState } from '@/services/useVeloPerpsTrading';
import type { ConfirmedClose } from '@/services/tradeReceipts';

type Exit = { action: 'close' | 'cancel' | 'withdraw'; id?: bigint; position?: VeloPosition };
type Props = { trading: UseVeloPerpsTradingState & UseVeloPerpsTradingActions; onClosePosition: (position: VeloPosition, result: ConfirmedClose) => void };
const usd = (n: number) => n.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
export function VeloLegacyPositions({ trading: t, onClosePosition }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [exit, setExit] = useState<Exit | null>(null);
  const [error, setError] = useState('');
  const [hash, setHash] = useState<string | null>(null);
  if (!exit && !t.legacyPositions.length && !t.legacyOrders.length && !t.legacyFreeBalance && !t.legacyReadError) return null;
  const disabled = t.isPending || !!t.pendingTxHash;
  const choose = (next: Exit) => { setExit(next); setError(''); setHash(null); };
  const submit = async () => {
    if (!exit || disabled || hash) return;
    setError('');
    try {
      const result = await t.legacyExit(exit.action, exit.id, exit.position?.pair);
      setHash(result.txHash);
      if (result.close && exit.position) onClosePosition(exit.position, result.close);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'The transaction was not confirmed'); }
  };
  return <section style={{ borderBottom: '1px solid var(--hairline)', padding: '12px 16px', fontFamily: 'var(--font-sans)' }} aria-label="Legacy trading account">
    <button onClick={() => setExpanded(!expanded)} aria-expanded={expanded} style={{ color: 'var(--fg)', width: '100%', textAlign: 'left' }}>
      Legacy engine &middot; {t.legacyPositions.length} positions &middot; {t.legacyOrders.length} orders &middot; {usd(t.legacyFreeBalance)} available
    </button>
    {t.legacyReadError && <p role="alert">{t.legacyReadError}</p>}
    {expanded && <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
      {t.legacyPositions.map(p => <div key={`position-${p.tradeId}`} style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <span>{p.pair.replace('-', '/')} &middot; {p.isLong ? 'Long' : 'Short'} {p.leverage}x &middot; {usd(p.notionalUSDC)}</span>
        <button disabled={disabled} onClick={() => choose({ action: 'close', id: p.tradeId, position: p })}>Close position</button>
      </div>)}
      {t.legacyOrders.map(o => <div key={`order-${o.orderId}`} style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <span>{o.pair.replace('-', '/')} &middot; {o.triggerKind} &middot; {usd(o.triggerPrice)}</span>
        <button disabled={disabled} onClick={() => choose({ action: 'cancel', id: o.orderId })}>Cancel order</button>
      </div>)}
      {t.legacyFreeBalance > 0 && <button disabled={disabled} onClick={() => choose({ action: 'withdraw' })}>Withdraw {usd(t.legacyFreeBalance)} legacy collateral</button>}
    </div>}
    <Dialog open={!!exit} onClose={() => setExit(null)} busy={t.isPending} title={exit?.action === 'close' ? 'Close legacy position' : exit?.action === 'cancel' ? 'Cancel legacy order' : 'Withdraw legacy collateral'}>
      <div style={{ padding: 20, display: 'grid', gap: 16 }}>
        {exit?.position && <p>{exit.position.pair.replace('-', '/')} &middot; {exit.position.isLong ? 'Long' : 'Short'} &middot; {usd(exit.position.notionalUSDC)}</p>}
        {error && <p role="alert" style={{ color: 'var(--pnl-down)' }}>{error}</p>}
        {hash ? <><p role="status">Transaction confirmed</p><a href={baseScanTxUrl(hash)} target="_blank" rel="noreferrer">View transaction <ArrowUpRight size={14}/></a></> :
          <button disabled={disabled} onClick={() => void submit()} style={{ padding: 12, borderRadius: 8, border: '1px solid var(--hairline-strong)' }}>{t.isPending ? <Loader2 size={18} className="animate-spin"/> : 'Confirm'}</button>}
      </div>
    </Dialog>
  </section>;
}
