// Preserve the entered text: browsers may silently drop commas in number inputs,
// and parseFloat accepts a valid prefix of an otherwise invalid price.
export function parseTradePrice(raw) {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : NaN;
  if (typeof raw !== 'string' || !/^(?:\d+(?:\.\d{1,18})?|\.\d{1,18})$/.test(raw.trim())) return NaN;
  const value = Number(raw.trim());
  return Number.isFinite(value) ? value : NaN;
}

export const isEmptyTradePrice = raw => raw == null || (typeof raw === 'string' && raw.trim() === '');

export function validateProtectionPrices({ side, referencePrice, takeProfit, stopLoss, referenceLabel = 'execution price', allowZero = false }) {
  if (side !== 'LONG' && side !== 'SHORT') return 'Choose a valid position direction.';
  if (referencePrice !== undefined && !(Number.isFinite(referencePrice) && referencePrice > 0)) return 'A valid reference price is required.';
  for (const [label, raw, above] of [
    ['Take profit', takeProfit, side === 'LONG'],
    ['Stop loss', stopLoss, side === 'SHORT'],
  ]) {
    if (isEmptyTradePrice(raw)) continue;
    const value = parseTradePrice(raw);
    if (allowZero && raw === 0) continue; // Explicit transaction API removal.
    if (!Number.isFinite(value) || value < 1e-18 || value >= 2 ** 128 / 1e18)
      return `${label} must be a positive price. Use a period for decimals, without commas or separators.`;
    if (referencePrice !== undefined && (above ? value <= referencePrice : value >= referencePrice))
      return `${label} must be ${above ? 'above' : 'below'} the ${referenceLabel}.`;
  }
  return null;
}

export function validateTradeForm({ price, size, side, takeProfit, stopLoss }) {
  const executionPrice = parseTradePrice(price), positionSize = parseTradePrice(size);
  if (!Number.isFinite(executionPrice) || executionPrice <= 0) return 'A valid execution price is required. Use a period for decimals, without commas or separators.';
  if (!Number.isFinite(positionSize) || positionSize <= 0) return 'Enter a position size greater than zero.';
  return validateProtectionPrices({ side, referencePrice: executionPrice, takeProfit, stopLoss });
}
