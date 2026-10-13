export function normalisePrice(price, exponent) {
  const p = BigInt(price); const e = Number(exponent);
  if (p <= 0n || !Number.isInteger(e) || e > 0 || e < -255) throw Error('INVALID_PRICE');
  return e >= -18 ? p * 10n ** BigInt(18 + e) : p / 10n ** BigInt(-e - 18);
}

export function triggerFor(job, p, mark, threshold = 0n) {
  if (job === 'cron-conditional-orders') {
    const price = BigInt(p.triggerPrice_E18);
    const kind = Number(p.triggerKind);
    if (kind !== 0 && kind !== 1) throw Error('INVALID_TRIGGER_KIND');
    return (kind === 0 ? (p.isLong ? mark <= price : mark >= price) : (p.isLong ? mark >= price : mark <= price)) ? 'ORDER' : null;
  }
  if (job === 'cron-tp-sl') {
    const tp = BigInt(p.takeProfit_E18); const sl = BigInt(p.stopLoss_E18);
    if (tp !== 0n && (p.isLong ? mark >= tp : mark <= tp)) return 'TP';
    if (sl !== 0n && (p.isLong ? mark <= sl : mark >= sl)) return 'SL';
    return null;
  }
  const entry = BigInt(p.entryPrice_E18), collateral = BigInt(p.collateralUSDC_6);
  if (entry <= 0n || threshold <= 0n || threshold > 10000n) throw Error('INVALID_LIQUIDATION_INPUT');
  const delta = (mark - entry) * (p.isLong ? 1n : -1n);
  const pnl = collateral * BigInt(p.leverage) * delta / entry;
  return pnl <= -(collateral * threshold / 10000n) ? 'LIQUIDATION' : null;
}

export function scanIds(state, nextId) {
  if (!Number.isSafeInteger(nextId) || nextId < 1 || !Number.isSafeInteger(state.cursor) || state.cursor < 1 || state.cursor > nextId) {
    throw Error('INVALID_SCAN_STATE');
  }
  const discovery = Array.from({ length: Math.min(32, nextId - state.cursor) }, (_, i) => state.cursor + i);
  const tail = Array.from({ length: Math.min(8, nextId - 1) }, (_, i) => nextId - 1 - i);
  return { discovery, ids: [...new Set([...state.active.slice(0, 32), ...tail, ...discovery])].filter(id => Number.isSafeInteger(id) && id > 0 && id < nextId) };
}
