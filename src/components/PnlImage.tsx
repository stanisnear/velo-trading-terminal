import React, { useEffect, useState } from 'react';
import type { TradeShare } from '../utils/tradeShare';
import { renderTradePng } from '../utils/tradeImage';
import { useStoredShareImage } from '../utils/shareBehavior.mjs';
export function PnlImage({ data, imageUrl }: { data: TradeShare; imageUrl?: string }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (imageUrl && useStoredShareImage(data)) return;
    let active = true, objectUrl = '';
    // Coalesce quote bursts and avoid exporting off-screen cards on every tick.
    const timer = setTimeout(() => {
      void renderTradePng(data, data.theme === 'light', !!data.hideAmounts).then(blob => {
        if (active) { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); }
      }).catch(() => { if (active) setUrl(''); });
    }, 160);
    return () => { active = false; clearTimeout(timer); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [data.pnl, data.markPrice, data.closePrice, data.status, data.theme, data.design, data.hideAmounts, data.updateMode, data.closedSnapshot, data.tradeId, imageUrl]);
  const src = imageUrl && useStoredShareImage(data) ? imageUrl : url;
  return src ? <img className="pnl-image" src={src} width="1200" height="800" alt={`${data.pair} ${data.side.toLowerCase()} · ${data.status === 'OPEN' ? 'Open position' : 'Position closed'} · ${data.closedSnapshot ? 'PnL snapshot' : data.status === 'OPEN' ? 'Estimated PnL' : 'Realized PnL'} ${data.hideAmounts ? `${data.pnlPct.toFixed(2)}%` : `$${data.pnl.toFixed(2)}`}`} /> : <div className="pnl-image-placeholder" role="status">Preparing PnL image…</div>;
}
