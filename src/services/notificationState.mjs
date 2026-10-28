export function mergeNotifications(current, incoming, readIds = new Set(), snapshotAt, retractedIds = new Set()) {
  const rows = new Map(current.filter(row => !retractedIds.has(row.id) && (snapshotAt == null || row.timestamp >= snapshotAt)).map(row => [row.id, row]));
  for (const row of incoming) {
    if (row.suppressed || row.retracted_at || row.__event === 'DELETE') { retractedIds.add(row.id); rows.delete(row.id); continue; }
    if (retractedIds.has(row.id)) continue;
    rows.set(row.id, { ...rows.get(row.id), ...row, read: row.read || readIds.has(row.id) });
  }
  return [...rows.values()].sort((a, b) => b.timestamp - a.timestamp).slice(0, 100);
}
