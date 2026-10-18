export function mergeLiveCandle(rows, candle) {
  if (!Number.isFinite(candle.time) || ![candle.open, candle.high, candle.low, candle.close].every(n => Number.isFinite(n) && n > 0)) return rows;
  const last = rows.at(-1);
  if (last && candle.time < last.time) return rows;
  return last?.time === candle.time ? [...rows.slice(0, -1), candle] : [...rows, candle];
}

export function oracleCandle(rows, price, publishTime, seconds) {
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(publishTime)) return null;
  const time = Math.floor(publishTime / seconds) * seconds;
  const last = rows.at(-1);
  if (last && time < last.time) return null;
  const existing = last?.time === time ? last : null;
  const open = existing?.open ?? price;
  return { time, open, high: Math.max(existing?.high ?? price, price), low: Math.min(existing?.low ?? price, price), close: price, source: 'pyth' };
}

export function localChartTime(time, options, locale = globalThis.navigator?.language, timeZone) {
  const date = typeof time === 'number' ? new Date(time * 1000) : typeof time === 'string'
    ? new Date(`${time}T00:00:00Z`) : new Date(Date.UTC(time.year, time.month - 1, time.day));
  if (!Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale, { ...options, ...(timeZone ? { timeZone } : {}) }).format(date);
}
