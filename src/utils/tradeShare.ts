export type TradeShare = {
  presentation?: 'position' | 'pnl';
  updateMode?: 'live' | 'snapshot';
  theme?: 'light' | 'dark';
  design?: 'signature' | 'minimal' | 'editorial' | 'ledger' | 'aurora';
  onClose?: 'settle' | 'freeze';
  hideAmounts?: boolean;
  closedSnapshot?: boolean;
  pair: string;
  side: 'LONG' | 'SHORT';
  leverage: number;
  entryPrice: number;
  closePrice?: number;
  markPrice?: number;
  size: number;
  collateral: number;
  pnl: number;
  pnlPct: number;
  traderHandle?: string;
  status: 'OPEN' | 'CLOSED' | 'LIQUIDATED';
  chainId?: number;
  contract?: string;
  tradeId?: string;
  trader?: string;
  txHash?: string;
  openTxHash?: string;
  openedAt?: number;
  closedAt?: number;
  updatedAt?: number;
  v4?: { collateral: number; openFee: number; spreadRatio: number; borrowBpsPerHour: number; maintenanceBps: number };
};

// Posts are public input, including legacy/imported rows. Malformed attachments
// must never crash a whole feed or introduce an arbitrary outbound URL.
export function parseTradeShare(value: unknown): TradeShare | undefined {
  if (!value || typeof value !== 'object') return;
  const v = value as Record<string, any>;
  if (!/^[A-Z0-9]{2,12}\/USD$/.test(v.pair) || !['LONG','SHORT'].includes(v.side) || !['OPEN','CLOSED','LIQUIDATED'].includes(v.status)) return;
  const numbers = ['entryPrice','size','collateral','leverage','pnl','pnlPct'];
  if (numbers.some(name => typeof v[name] !== 'number' || !Number.isFinite(v[name])) || v.entryPrice <= 0 || v.leverage <= 0 || v.collateral <= 0 || v.size <= 0) return;
  const result: TradeShare = { pair:v.pair,side:v.side,status:v.status,entryPrice:v.entryPrice,size:v.size,collateral:v.collateral,leverage:v.leverage,pnl:v.pnl,pnlPct:v.pnlPct };
  for (const [name, allowed] of Object.entries({presentation:['position','pnl'],updateMode:['live','snapshot'],theme:['light','dark'],design:['signature','minimal','editorial','ledger','aurora'],onClose:['settle','freeze']})) {
    if (allowed.includes(v[name])) (result as any)[name] = v[name];
  }
  for (const name of ['hideAmounts','closedSnapshot'] as const) if (typeof v[name] === 'boolean') result[name] = v[name];
  for (const name of ['closePrice','markPrice','openedAt','closedAt','updatedAt'] as const) if (typeof v[name] === 'number' && Number.isFinite(v[name]) && v[name] >= 0) result[name] = v[name];
  if (typeof v.traderHandle === 'string') result.traderHandle = v.traderHandle.slice(0,40);
  if (v.chainId === 84532) result.chainId = 84532;
  if (typeof v.tradeId === 'string' && /^[0-9]{1,20}$/.test(v.tradeId)) result.tradeId = v.tradeId;
  for (const name of ['contract','trader'] as const) if (typeof v[name] === 'string' && /^0x[0-9a-f]{40}$/i.test(v[name])) result[name] = v[name];
  for (const name of ['txHash','openTxHash'] as const) if (typeof v[name] === 'string' && /^0x[0-9a-f]{64}$/i.test(v[name])) result[name] = v[name];
  return result;
}
