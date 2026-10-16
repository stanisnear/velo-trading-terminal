// Return the first usable history page without waiting for a stalled provider.
// Display fallbacks remain explicitly labelled; they never price transactions.
export function firstChartPage(primary, fallback, delayMs = 2000, timeoutMs = 11000) {
  return new Promise(resolve => {
    let settled = false, fallbackStarted = false, finished = 0;
    const done = rows => {
      finished++;
      if (settled) return;
      if (rows?.length || finished === 2) { settled = true; clearTimeout(timer); clearTimeout(deadline); resolve(rows?.length ? rows : []); }
    };
    const startFallback = () => {
      if (fallbackStarted || settled) return;
      fallbackStarted = true;
      Promise.resolve().then(fallback).then(done, () => done([]));
    };
    const timer = setTimeout(startFallback, delayMs);
    const deadline = setTimeout(() => { if (!settled) { settled = true; clearTimeout(timer); resolve([]); } }, timeoutMs);
    Promise.resolve().then(primary).then(rows => { done(rows); if (!rows?.length) startFallback(); }, () => { done([]); startFallback(); });
  });
}
