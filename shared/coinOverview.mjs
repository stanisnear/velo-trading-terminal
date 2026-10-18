// Quote snapshots belong in market data, not the asset overview.
export function coinOverview(description) {
  return String(description || '').split(/(?:[^.!?]* has a current supply of|The last known price|It is currently trading on|More information can be found at)/i)[0].trim();
}
