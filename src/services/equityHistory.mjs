// Observations of confirmed account equity, never a curve inferred from closed trades.
export const EQUITY_RETENTION_MS = 90 * 86400000;
export function equityHistoryKey(owner, wallet, engine) {
  return owner && wallet && engine ? `velo_equity_v1_84532_${owner}_${wallet}_${engine}`.toLowerCase() : null;
}
export function normalizeEquityHistory(input, now = Date.now()) {
  const buckets = new Map();
  for (const point of Array.isArray(input) ? input : []) {
    if (!Number.isFinite(point?.timestamp) || !Number.isFinite(point?.value) || point.value < 0 || point.timestamp < now - EQUITY_RETENTION_MS || point.timestamp > now + 60000) continue;
    const step = point.timestamp < now - 86400000 ? 3600000 : 60000;
    const timestamp = Math.floor(point.timestamp / step) * step;
    const previous = buckets.get(timestamp);
    if (!previous || point.timestamp >= previous.observedAt) buckets.set(timestamp, { timestamp, value: point.value, observedAt: point.timestamp });
  }
  return [...buckets.values()].sort((a,b) => a.timestamp-b.timestamp).slice(-4000).map(({timestamp,value}) => ({timestamp,value}));
}
export function observeEquity(history, value, timestamp = Date.now()) {
  if (!Number.isFinite(value) || value < 0) return history;
  const next = normalizeEquityHistory([...history, {timestamp,value}], timestamp);
  return next.length === history.length && next.every((p,i) => p.timestamp===history[i].timestamp && p.value===history[i].value) ? history : next;
}
export function equityPeriod(history, period, now = Date.now()) {
  if (period === 'ALL') return history;
  const durations = {'1D':86400000,'1W':604800000,'1M':2592000000,'1Y':31536000000};
  return history.filter(point => point.timestamp >= now - (durations[period] ?? Infinity));
}
