// Display estimates only. Signed oracle data and contract settlement remain authoritative.
export function positionPnl(position, mark, now = Date.now()) {
  const p = position;
  if (!(p.entryPrice > 0) || !Number.isFinite(mark)) return 0;
  if (!p.v4) return (mark - p.entryPrice) * (p.side === 'LONG' ? 1 : -1) * p.size / p.entryPrice;
  const execution = mark * (1 + (p.side === 'LONG' ? -p.v4.spreadRatio : p.v4.spreadRatio));
  const raw = (execution - p.entryPrice) * (p.side === 'LONG' ? 1 : -1) * p.size / p.entryPrice;
  const equity = p.v4.collateral + Math.min(p.size, Math.max(-p.v4.collateral, raw));
  const borrow = p.size * p.v4.borrowBpsPerHour / 10000 * Math.max(0, now - p.timestamp) / 3600000;
  return Math.max(0, equity - borrow - p.size * 0.001) - p.v4.collateral - p.v4.openFee;
}

export function liquidationEstimate(position, now = Date.now()) {
  const p = position;
  if (!p.v4 || !(p.size > 0)) return p.liquidationPrice || 0;
  const borrow = p.size * p.v4.borrowBpsPerHour / 10000 * Math.max(0, now - p.timestamp) / 3600000;
  const distance = (p.v4.collateral - borrow) / p.size - p.v4.maintenanceBps / 10000 - 0.001;
  return Math.max(0, p.entryPrice * (1 + (p.side === 'LONG' ? -distance : distance))
    / (1 + (p.side === 'LONG' ? -p.v4.spreadRatio : p.v4.spreadRatio)));
}
