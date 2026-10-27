export const shareUpdates = snapshot => snapshot.updateMode !== 'snapshot';
export function resolveSharedTrade(snapshot, canonical) {
  if (!shareUpdates(snapshot)) return snapshot;
  if (snapshot.onClose === 'freeze' && snapshot.status === 'OPEN' && canonical.status !== 'OPEN') {
    return { ...snapshot, status: canonical.status, txHash: canonical.txHash, updateMode: 'snapshot', closedSnapshot: true };
  }
  // Cache entries are shared across posts; presentation belongs to each post.
  return { ...canonical, presentation: snapshot.presentation, updateMode: snapshot.updateMode,
    theme: snapshot.theme, design: snapshot.design, onClose: snapshot.onClose, hideAmounts: snapshot.hideAmounts };
}
