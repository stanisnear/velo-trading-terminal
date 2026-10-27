export function shareReturn(value) {
  if (!Number.isFinite(value)) return '—';
  const sign = value < 0 ? '−' : '+';
  return `${sign}${value !== 0 && Math.abs(value) < .005 ? '<0.01' : Math.abs(value).toFixed(2)}%`;
}
export function shareDate(value) {
  if (!(typeof value === 'number' && value > 0 && value <= 8640000000000000)) return 'Not available';
  return new Intl.DateTimeFormat(undefined,{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',timeZoneName:'short'}).format(new Date(value));
}
