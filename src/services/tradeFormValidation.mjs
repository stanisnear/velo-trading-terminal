export function validateTradeForm({ price, size, side, takeProfit, stopLoss }) {
  if (!Number.isFinite(price) || price <= 0) return 'A valid execution price is required.';
  if (!Number.isFinite(size) || size <= 0) return 'Enter a position size greater than zero.';
  for (const [label, raw, above] of [
    ['Take profit', takeProfit, side === 'LONG'],
    ['Stop loss', stopLoss, side === 'SHORT'],
  ]) {
    if (!raw) continue;
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) return `${label} must be a positive price.`;
    if (above ? value <= price : value >= price) return `${label} must be ${above ? 'above' : 'below'} the execution price.`;
  }
  return null;
}
