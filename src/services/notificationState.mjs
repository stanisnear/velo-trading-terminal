export function mergeNotifications(current, incoming, readIds = new Set(), snapshotAt) {
  const rows = new Map(current.filter(row => snapshotAt == null || row.timestamp >= snapshotAt).map(row => [row.id, row]));
  for (const row of incoming) {
    if (row.suppressed || row.__event === 'DELETE') { rows.delete(row.id); continue; }
    rows.set(row.id, { ...rows.get(row.id), ...row, read: row.read || readIds.has(row.id) });
  }
  return [...rows.values()].sort((a, b) => b.timestamp - a.timestamp).slice(0, 100);
}
