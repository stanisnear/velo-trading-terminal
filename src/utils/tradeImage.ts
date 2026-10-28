import type { TradeShare } from './tradeShare';
import { isWalletPlaceholder } from './profileIdentity.mjs';
import { shareReturn } from './shareFormatting.mjs';

const icons = new Map<string, Promise<HTMLImageElement | null>>();
function loadIcon(symbol: string) {
  if (!icons.has(symbol)) icons.set(symbol, new Promise(resolve => {
    const image = new Image(); const timer = setTimeout(() => resolve(null), 700);
    image.onload = () => { clearTimeout(timer); resolve(image); };
    image.onerror = () => { clearTimeout(timer); resolve(null); };
    image.src = `/tokens/${symbol.toLowerCase()}.png`;
  }));
  return icons.get(symbol)!;
}
export async function renderTradePng(data: TradeShare, light: boolean, hideAmounts: boolean, pixelRatio = 2): Promise<Blob> {
  const symbol = /^[A-Z0-9]{2,12}\/USD$/.test(data.pair) ? data.pair.split('/')[0] : '';
  const css = getComputedStyle(document.documentElement);
  const display = css.getPropertyValue('--font-display').trim() || 'Georgia';
  const mono = css.getPropertyValue('--font-mono').trim() || 'monospace';
  const sans = css.getPropertyValue('--font-sans').trim() || 'sans-serif';
  const fonts = document.fonts ? Promise.all([
    document.fonts.load(`500 46px ${display}`), document.fonts.load(`italic 56px ${display}`),
    document.fonts.load(`25px ${mono}`), ...[400,500,600,700].map(weight=>document.fonts.load(`${weight} 19px ${sans}`)),
  ]).catch(()=>{}) : Promise.resolve();
  const [icon] = await Promise.all([symbol ? loadIcon(symbol) : null, Promise.race([fonts, new Promise(resolve => setTimeout(resolve, 1800))])]);
  const ratio = Math.min(2, Math.max(1, pixelRatio));
  const canvas = document.createElement('canvas'); canvas.width = 1200 * ratio; canvas.height = 800 * ratio;
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Image export is unavailable.');
  ctx.scale(ratio, ratio); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  const minimal = data.design === 'minimal', open = data.status === 'OPEN';
  const fg = light ? '#18221d' : '#eff2f0', muted = light ? '#657369' : '#98a59d';
  const hairline = light ? '#cbd6ce' : '#303934', accent = light ? '#557a64' : '#91b99f';
  const resultColor = data.pnl >= 0 ? (light ? '#39754e' : '#91c4a2') : (light ? '#b34f4c' : '#e39390');
  const text = (value: string, x: number, y: number, font: string, color = fg, maxWidth = 1080) => {
    ctx.fillStyle = color; ctx.font = font;
    const measured = ctx.measureText(value).width;
    if (measured > maxWidth) {
      ctx.font = font.replace(/([0-9.]+)px/, (_, size) => `${Math.max(12, Number(size) * maxWidth / measured)}px`);
    }
    ctx.fillText(value, x, y);
  };
  const line = (y: number) => { ctx.strokeStyle = hairline;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(64,y);ctx.lineTo(1136,y);ctx.stroke(); };
  const money = (value: number) => `$${value.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:value < 1 && value > 0 ? 6 : 2})}`;
  const result = hideAmounts ? shareReturn(data.pnlPct) : `${data.pnl >= 0 ? '+' : '−'}${money(Math.abs(data.pnl))}`;
  const label = data.closedSnapshot ? 'Captured return' : open ? 'Unrealized PnL' : 'Realized PnL';
  const handle = (isWalletPlaceholder(data.traderHandle) ? '@trader' : data.traderHandle || 'velotrading.live').slice(0,35);
  ctx.fillStyle=light?'#edf2ee':'#101413';ctx.fillRect(0,0,1200,800);
  if (!minimal) {
    const wash = ctx.createLinearGradient(0,0,1200,800);wash.addColorStop(0,light?'#f5f8f5':'#1c2420');wash.addColorStop(1,light?'#e5ede7':'#101413');ctx.fillStyle=wash;ctx.fillRect(0,0,1200,800);
    ctx.strokeStyle=hairline;ctx.lineWidth=1;ctx.beginPath();ctx.roundRect(24,24,1152,752,26);ctx.stroke();
    ctx.save();ctx.globalAlpha=.045;ctx.textAlign='right';text('V',1100,480,`italic 340px ${display}`,accent);ctx.restore();
  }
  text('Velo',64,108,`italic 56px ${display}`);
  ctx.textAlign='right';text('BASE SEPOLIA / TESTNET',1136,98,`17px ${mono}`,muted);ctx.textAlign='left';
  const marketY=minimal?232:238, marketX=minimal?600:64;
  if(minimal)ctx.textAlign='center';
  if(icon && !minimal){ctx.save();ctx.beginPath();ctx.arc(86,206,22,0,Math.PI*2);ctx.clip();ctx.drawImage(icon,64,184,44,44);ctx.restore();}
  text(data.pair,marketX+(icon&&!minimal?60:0),marketY,`500 ${minimal?45:46}px ${display}`);
  text(`${data.side}  ·  ${data.leverage}×  ·  ${open?'Open':data.status==='LIQUIDATED'?'Liquidated':'Closed'}`,marketX,marketY+47,`19px ${sans}`,muted);
  const heroX=minimal?600:64;
  text(hideAmounts ? (data.closedSnapshot?'Captured return':'Return on margin') : label,heroX,351,`18px ${sans}`,muted);
  text(result,heroX,464,`500 ${minimal?112:108}px ${display}`,resultColor,minimal?1030:990);
  if(!hideAmounts)text(`${shareReturn(data.pnlPct)} return on margin`,heroX,510,`23px ${sans}`,resultColor);
  ctx.textAlign='left';line(564);
  const price = (open?data.markPrice:data.closePrice)||data.entryPrice;
  const facts: [string,number][] = [...(!hideAmounts ? [['Margin invested',data.collateral] as [string,number]]:[]),['Entry price',data.entryPrice],[open?'Mark price':'Exit price',price]];
  const factWidth=1072/facts.length;
  facts.forEach(([name,value],i)=>{const x=64+i*factWidth;text(name,x,609,`18px ${sans}`,muted);text(money(value),x,653,`25px ${mono}`,fg,factWidth-30);});
  line(693);
  const status = data.closedSnapshot?'Closed · PnL snapshot':open?(data.updateMode==='live'?'Live position':'Position snapshot'):'Position settled';
  text(status,64,739,`17px ${sans}`,muted);
  ctx.textAlign='right';text(handle,1136,739,`19px ${sans}`,muted,450);
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Image export failed. Please retry.')),'image/png'));
}
