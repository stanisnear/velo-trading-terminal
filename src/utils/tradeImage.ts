import type { TradeShare } from './tradeShare';
import { isWalletPlaceholder } from './profileIdentity.mjs';

export async function renderTradePng(data: TradeShare, light: boolean, hideAmounts: boolean): Promise<Blob> {
  await Promise.race([document.fonts.ready, new Promise(resolve => setTimeout(resolve, 2000))]);
  const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 800;
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Image export is unavailable.');
  const design = data.design || 'editorial';
  const fg = light ? '#17231e' : '#edf1ee', muted = light ? '#66746c' : '#95a19a';
  const up = light ? '#357650' : '#94c5a5', down = light ? '#b34c4a' : '#e39390';
  ctx.fillStyle = light ? '#eaf0eb' : '#111514'; ctx.fillRect(0, 0, 1200, 800);
  const glow = ctx.createRadialGradient(1100, 0, 0, 1100, 0, 850);
  glow.addColorStop(0, light ? '#d5e1d8' : '#25372d'); glow.addColorStop(1, 'transparent');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, 1200, 800);
  if (design === 'aurora') {
    const halo = ctx.createRadialGradient(950,400,10,950,400,700);
    halo.addColorStop(0, light ? '#c3d2e8' : '#283956'); halo.addColorStop(1,'transparent');
    ctx.fillStyle=halo;ctx.fillRect(0,0,1200,800);
  }
  if (design === 'ledger') { ctx.fillStyle=fg;ctx.fillRect(64,128,1072,3); }
  const fonts = getComputedStyle(document.documentElement);
  const display = fonts.getPropertyValue('--font-display').trim() || 'Georgia';
  const mono = fonts.getPropertyValue('--font-mono').trim() || 'monospace';
  const sans = fonts.getPropertyValue('--font-sans').trim() || 'sans-serif';
  const text = (value: string, x: number, y: number, font: string, color = fg) => { ctx.fillStyle = color; ctx.font = font; ctx.fillText(value, x, y); };
  const signed = hideAmounts ? `${data.pnlPct >= 0 ? '+' : ''}${data.pnlPct.toFixed(2)}%` : `${data.pnl >= 0 ? '+' : '−'}$${Math.abs(data.pnl).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  const label = data.closedSnapshot ? 'PNL SNAPSHOT' : data.status === 'OPEN' ? 'ESTIMATED PNL' : 'REALIZED PNL';
  const handle = (isWalletPlaceholder(data.traderHandle) ? '@trader' : data.traderHandle || 'velotrading.live').slice(0,35);
  const captured = new Date(data.updatedAt || Date.now()).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'});
  if (design === 'ledger') {
    text('Velo',64,96,`italic 54px ${display}`);
    ctx.textAlign='right';text('TRADE RECEIPT / BASE SEPOLIA',1136,87,`17px ${mono}`,muted);ctx.textAlign='left';
    text(data.pair,64,224,`bold 56px ${sans}`);
    text(`${data.side} / ${data.leverage}×`,64,273,`22px ${mono}`,data.side === 'LONG' ? up : down);
    text(label,64,350,`17px ${mono}`,muted);text(signed,64,463,`bold 92px ${mono}`,data.pnl>=0?up:down);
    ctx.textAlign='right';text(`${data.pnlPct>=0?'+':''}${data.pnlPct.toFixed(2)}%`,1136,345,`32px ${mono}`,data.pnl>=0?up:down);text('RETURN ON MARGIN',1136,378,`15px ${mono}`,muted);ctx.textAlign='left';
    const facts=[['ENTRY',data.entryPrice],[data.status==='OPEN'?'MARK':'EXIT',(data.status==='OPEN'?data.markPrice:data.closePrice)||data.entryPrice],...(!hideAmounts?[['SIZE',data.size]]:[])];
    facts.forEach(([title,value],i)=>{const x=64+i*370;ctx.fillStyle=light?'#c6d3c9':'#344239';ctx.fillRect(x,535,330,1);text(String(title),x,575,`16px ${mono}`,muted);text(`$${Number(value).toLocaleString('en-US',{maximumFractionDigits:Number(value)<1?6:2})}`,x,617,`27px ${mono}`);});
    text(data.status==='OPEN'?(data.updateMode==='live'?'LIVE POSITION':'OPEN / SNAPSHOT'):data.closedSnapshot?'CLOSED / PNL SNAPSHOT':'POSITION CLOSED',64,713,`17px ${mono}`,muted);
    ctx.textAlign='right';text(handle,1136,713,`20px ${sans}`,muted);ctx.textAlign='left';text(`${data.updateMode==='live'?'Updated':'Captured'} ${captured}`,64,756,`14px ${mono}`,muted);
    return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Image export failed. Please retry.')),'image/png'));
  }
  text('Velo', 64, 96, `italic 54px ${display}`);
  ctx.textAlign = 'right'; text('BASE SEPOLIA · TESTNET', 1136, 87, `18px ${mono}`, muted); ctx.textAlign = 'left';
  text(data.pair, 64, 207, `48px ${display}`);
  text(`${data.side}  ·  ${data.leverage}×`, 64, 249, `20px ${mono}`, data.side === 'LONG' ? up : down);
  text(data.closedSnapshot ? 'PNL SNAPSHOT' : data.status === 'OPEN' ? 'ESTIMATED PNL' : 'REALIZED PNL', 64, 326, `17px ${mono}`, muted);
  text(hideAmounts ? `${data.pnlPct >= 0 ? '+' : ''}${data.pnlPct.toFixed(2)}%` : `${data.pnl >= 0 ? '+' : '−'}$${Math.abs(data.pnl).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`, 60, 441, `${design === 'aurora' ? 'bold 100' : '100'}px ${design === 'aurora' ? sans : display}`, data.pnl >= 0 ? up : down);
  if (!hideAmounts) text(`${data.pnlPct >= 0 ? '+' : ''}${data.pnlPct.toFixed(2)}% return on margin`, 64, 489, `23px ${sans}`, data.pnl >= 0 ? up : down);
  ctx.strokeStyle = light ? '#c6d3c9' : '#344239'; ctx.lineWidth = 1;
  for (const y of [536, 666]) { ctx.beginPath(); ctx.moveTo(64,y);ctx.lineTo(1136,y);ctx.stroke(); }
  const facts = [['ENTRY PRICE', data.entryPrice], [data.status === 'OPEN' ? 'MARK PRICE' : 'EXIT PRICE', (data.status === 'OPEN' ? data.markPrice : data.closePrice) || data.entryPrice], ...(!hideAmounts ? [['POSITION SIZE', data.size]] : [])];
  facts.forEach(([label, value], i) => { const x = 64 + i * 370; text(String(label), x, 580, `16px ${mono}`, muted); text(`$${Number(value).toLocaleString('en-US',{maximumFractionDigits:Number(value) < 1 ? 6 : 2})}`, x, 624, `27px ${mono}`); });
  text(data.closedSnapshot ? 'POSITION CLOSED · PNL SNAPSHOT' : data.status === 'OPEN' ? data.updateMode === 'live' ? 'LIVE POSITION' : 'OPEN POSITION · SNAPSHOT' : data.status === 'LIQUIDATED' ? 'LIQUIDATED' : 'POSITION CLOSED', 64, 723, `17px ${mono}`, muted);
  ctx.textAlign = 'right'; text((isWalletPlaceholder(data.traderHandle) ? '@trader' : data.traderHandle || 'velotrading.live').slice(0,35), 1136, 723, `20px ${sans}`, muted);
  ctx.textAlign='left';text(`${data.updateMode === 'live' ? 'Updated' : 'Captured'} ${captured}`,64,766,`14px ${mono}`,muted);
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Image export failed. Please retry.')), 'image/png'));
}

