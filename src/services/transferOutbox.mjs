const key = sender => `velo:pending-transfer:84532:${sender.toLowerCase()}`;
export function readPendingTransfer(storage, sender) {
  try {
    const value = JSON.parse(storage.getItem(key(sender)) || 'null');
    if (!value || !/^0x[a-f0-9]{64}$/i.test(value.txHash) ||
        !/^0x[a-f0-9]{40}$/i.test(value.recipientAddress) ||
        !Number.isFinite(value.amount) || value.amount <= 0) return null;
    return value;
  } catch { return null; }
}
export function savePendingTransfer(storage, sender, transfer) {
  storage.setItem(key(sender), JSON.stringify(transfer));
}
export function clearPendingTransfer(storage, sender, hash) {
  if (readPendingTransfer(storage, sender)?.txHash === hash) storage.removeItem(key(sender));
}
