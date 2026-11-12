export function assertAccountFresh({ online, confirmedAt, failed, now = Date.now() }) {
  if (!online) throw new Error('You are offline. Reconnect before submitting a transaction.');
  if (failed || !confirmedAt || now - confirmedAt > 30000 || confirmedAt > now)
    throw new Error('Refreshing account data. Try again when the connection is restored.');
}
