// Display estimates only. Signed oracle data and contract settlement remain authoritative.
export function positionPnl(position, mark, now = Date.now()) {
  const p = position;
  if (!(p.entryPrice > 0) || !Number.isFinite(mark)) return 0;
  if (!p.v4) return (mark - p.entryPrice) * (p.side === 'LONG' ? 1 : -1) * p.size / p.entryPrice;
  return positionSettlement(position, mark, now).pnl;
}

export function positionSettlement(p, mark, now = Date.now(), keeper = false) {
  if (!p.v4) {
    const pnl = positionPnl(p, mark, now), collateral = p.size / p.leverage;
    return { pnl, collateral, payout: Math.max(0, collateral + pnl), openFee: 0, closeFee: 0, borrowFee: 0, keeperFee: 0 };
  }
  const execution = mark * (1 + (p.side === 'LONG' ? -p.v4.spreadRatio : p.v4.spreadRatio));
  const raw = (execution - p.entryPrice) * (p.side === 'LONG' ? 1 : -1) * p.size / p.entryPrice;
  const equity = p.v4.collateral + Math.min(p.size, Math.max(-p.v4.collateral, raw));
  const borrowFee = Math.min(equity, p.size * p.v4.borrowBpsPerHour / 10000 * Math.max(0, now - p.timestamp) / 3600000);
  const closeFee = Math.min(equity - borrowFee, p.size * .001);
  const keeperFee = keeper ? Math.min(equity - borrowFee - closeFee, p.size * .0005) : 0;
  const payout = Math.max(0, equity - borrowFee - closeFee - keeperFee);
  return { payout, pnl: payout - p.v4.collateral - p.v4.openFee,
    collateral: p.v4.collateral, openFee: p.v4.openFee, borrowFee, closeFee, keeperFee };
}

// Invert the same capped, fee-aware estimate used by the price-input preview.
export function triggerPriceForRoe(position, roe, now = Date.now()) {
  const margin = position.v4 ? position.v4.collateral + position.v4.openFee : position.size / position.leverage;
  const target = margin * roe / 100;
  let low = 0, high = position.entryPrice * 4;
  for (let i = 0; i < 60; i++) {
    const mid = (low + high) / 2, value = positionSettlement(position, mid, now, true).pnl;
    if ((value < target) === (position.side === 'LONG')) low = mid; else high = mid;
  }
  return (low + high) / 2;
}

export function liquidationEstimate(position, now = Date.now()) {
  const p = position;
  if (!p.v4 || !(p.size > 0)) return p.liquidationPrice || 0;
  const borrow = p.size * p.v4.borrowBpsPerHour / 10000 * Math.max(0, now - p.timestamp) / 3600000;
  const distance = (p.v4.collateral - borrow) / p.size - p.v4.maintenanceBps / 10000 - 0.001;
  return Math.max(0, p.entryPrice * (1 + (p.side === 'LONG' ? -distance : distance))
    / (1 + (p.side === 'LONG' ? -p.v4.spreadRatio : p.v4.spreadRatio)));
}
