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
const durations = {'1D':86400000,'1W':604800000,'1M':2592000000,'1Y':31536000000};
function validObservations(history, now) {
  return [...new Map((Array.isArray(history)?history:[])
    .filter(point=>Number.isFinite(point?.timestamp)&&point.timestamp<=now&&Number.isFinite(point?.value)&&point.value>=0)
    .map(point=>[point.timestamp,point])).values()].sort((a,b)=>a.timestamp-b.timestamp);
}
export function equityPeriod(history, period, now = Date.now()) {
  const points=validObservations(history,now);
  return period==='ALL' ? points : points.filter(point=>point.timestamp>=now-(durations[period]??0));
}

/** A range is useful only when history covers it and it changes the observations shown.
 * Never manufacture a boundary value or treat a partially recorded day as a full day.
 */
export function equityView(history, requested='ALL', now=Date.now()) {
  const all=validObservations(history,now),ranges=new Map([['ALL',all]]);
  let shorter=null;
  const options=['1D','1W','1M'].map(value=>{
    const points=all.filter(point=>point.timestamp>=now-durations[value]);
    ranges.set(value,points);
    const covered=all.length>=2&&all[0].timestamp<now-durations[value]&&points.length>=2;
    const duplicate=points.length===all.length || (shorter&&points.length===shorter.length&&points[0]?.timestamp===shorter[0]?.timestamp);
    const disabled=!covered||!!duplicate;
    if(!disabled)shorter=points;
    return {value,label:value,disabled,title:!covered?'Not enough recorded equity history for this range.':duplicate?'No additional observations for this range.':undefined};
  });
  options.push({value:'ALL',label:'All',disabled:all.length===0,title:all.length===0?'No recorded equity history yet.':undefined});
  const period=options.some(option=>option.value===requested&&!option.disabled)?requested:'ALL';
  const points=ranges.get(period)??all,first=points[0],last=points.at(-1);
  const change=points.length>=2?last.value-first.value:null;
  return {options,period,points,firstAt:first?.timestamp??null,lastAt:last?.timestamp??null,change,percent:change!==null&&first.value>0?change/first.value*100:null};
}
