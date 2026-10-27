import React from 'react';
import { ArrowUpRight, ArrowDownRight, ExternalLink } from 'lucide-react';
import { VeloAssetIcon, formatPrice } from './ui/shared';
import type { TradeShare } from '../utils/tradeShare';
import './TradeShareCard.css';

export function TradeShareCard({ data, hideAmounts = false, pending = false }: { data: TradeShare; hideAmounts?: boolean; pending?: boolean }) {
  const open = data.status === 'OPEN';
  return <article className="trade-share-card" aria-label={`${data.pair} ${data.side.toLowerCase()} ${open ? 'open position' : 'closed trade'}`}>
    <div className="trade-share-top"><span className="trade-share-wordmark">Velo</span><span className="trade-share-network">Base Sepolia · Testnet</span></div>
    <div className="trade-share-market"><VeloAssetIcon src={`/tokens/${data.pair.split('/')[0].toLowerCase()}.png`} symbol={data.pair.split('/')[0]} size={34} /><h3>{data.pair}</h3><span className={`trade-share-side ${data.side.toLowerCase()}`}>{data.side === 'LONG' ? <ArrowUpRight size={13}/> : <ArrowDownRight size={13}/>} {data.side} · {data.leverage}×</span></div>
    <div className="trade-share-result" data-positive={data.pnl >= 0}>
      <span className="trade-share-label">{open ? 'Estimated PnL' : 'Realized PnL'}</span>
      <strong>{hideAmounts ? `${data.pnlPct >= 0 ? '+' : ''}${data.pnlPct.toFixed(2)}%` : `${data.pnl >= 0 ? '+' : '−'}$${Math.abs(data.pnl).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</strong>
      {!hideAmounts && <span>{data.pnlPct >= 0 ? '+' : ''}{data.pnlPct.toFixed(2)}% return on margin</span>}
    </div>
    <dl className="trade-share-facts"><div><dt>Entry price</dt><dd>${formatPrice(data.entryPrice)}</dd></div><div><dt>{open ? 'Mark price' : 'Exit price'}</dt><dd>${formatPrice((open ? data.markPrice : data.closePrice) || data.entryPrice)}</dd></div>{!hideAmounts && <div><dt>Position size</dt><dd>${data.size.toLocaleString(undefined,{maximumFractionDigits:2})}</dd></div>}</dl>
    <footer><span className="trade-share-status"><i data-open={open && !pending}/>{pending ? 'Updating position…' : open ? 'Open position' : data.status === 'LIQUIDATED' ? 'Liquidated' : 'Position closed'}</span><span>{data.traderHandle}</span>{data.txHash && <a href={`https://sepolia.basescan.org/tx/${data.txHash}`} target="_blank" rel="noopener noreferrer" aria-label="View settlement transaction"><ExternalLink size={13}/></a>}</footer>
  </article>;
}
