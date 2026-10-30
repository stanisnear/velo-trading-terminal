/** Load complete account history instead of silently clipping it at 100 rows. */
export async function readHistoryPages(fetchPage, limit = Infinity) {
  const rows = [], seen = new Set();
  const maximum = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : Infinity;
  for (let offset = 0; rows.length < maximum;) {
    const size = Math.min(500, maximum - rows.length);
    const page = await fetchPage(offset, size);
    for (const row of page) if (!seen.has(row.id)) { seen.add(row.id); rows.push(row); }
    if (page.length < size) break;
    offset += page.length;
  }
  return rows;
}

export const performancePeriods = ['1D','1W','1M','ALL'];
const duration = {'1D':86400000,'1W':604800000,'1M':2592000000};

/** Settlement records are net realized results. Never deduct estimated fees again. */
export function settledHistory(history = []) {
  const seen = new Set();
  return history.filter(row => {
    const settled = ['CLOSE','LIQUIDATION'].includes(row.action) || (!row.action && Number(row.pnl) !== 0);
    if (row.pnl == null || row.timestamp == null || !settled ||
      !Number.isFinite(Number(row.pnl)) || !Number.isFinite(Number(row.timestamp)) ||
      (row.id && seen.has(row.id))) return false;
    if (row.id) seen.add(row.id);
    return true;
  }).map(row => ({...row,pnl:Number(row.pnl),timestamp:Number(row.timestamp)})).sort((a,b)=>a.timestamp-b.timestamp || String(a.id).localeCompare(String(b.id)));
}

export function accountPerformance(history = [], period = 'ALL', now = Date.now()) {
  const all = settledHistory(history).filter(row => row.timestamp <= now);
  const start = period === 'ALL' ? all[0]?.timestamp : now - (duration[period] ?? Infinity);
  const trades = all.filter(row => row.timestamp >= start && row.timestamp <= now);
  let realizedPnl=0, grossProfit=0, grossLoss=0, wins=0, losses=0, peak=0, drawdown=0;
  const points=[], markets=new Map();
  if(trades.length) points.push({timestamp:Math.min(start ?? trades[0].timestamp,trades[0].timestamp)-1000,value:0});
  for (const row of trades) {
    realizedPnl += row.pnl;
    if(row.pnl>0){wins++;grossProfit+=row.pnl;} else if(row.pnl<0){losses++;grossLoss-=row.pnl;}
    peak=Math.max(peak,realizedPnl);drawdown=Math.max(drawdown,peak-realizedPnl);
    // The chart uses UTC seconds; combine multiple settlements in the same second.
    const timestamp=Math.floor(row.timestamp/1000)*1000;
    if(points.at(-1)?.timestamp===timestamp)points[points.length-1].value=realizedPnl;
    else points.push({timestamp,value:realizedPnl});
    const market=markets.get(row.pair)??{pair:row.pair,pnl:0,count:0};
    market.pnl+=row.pnl;market.count++;markets.set(row.pair,market);
  }
  return {trades,points,totalTrades:trades.length,realizedPnl,wins,losses,breakeven:trades.length-wins-losses,
    winRate:trades.length?wins/trades.length*100:0,grossProfit,grossLoss,
    profitFactor:grossLoss?grossProfit/grossLoss:null,drawdown,
    average:trades.length?realizedPnl/trades.length:0,
    markets:[...markets.values()].sort((a,b)=>Math.abs(b.pnl)-Math.abs(a.pnl)),
    firstAt:all[0]?.timestamp,lastAt:all.at(-1)?.timestamp};
}
