// api/user-stats.ts
//
// User-growth + engagement metrics for the Admin dashboard, sourced from
// Supabase (Postgres) via the PostgREST REST API:
//   - total_users, wallet_users (wallet-authenticated → grant-relevant)
//   - new_users: today / 7d / 30d
//   - dau / wau / mau   (distinct users active in trailing 1d / 7d / 30d)
//   - daily_signups[]   (last 30 days)
//   - daily_active[]     (last 30 days, distinct active users per day)
//
// Activity source of truth: profiles.last_active_at (set by a lightweight
// client heartbeat → see touch_activity() RPC) plus the user_activity_daily
// table for historical DAU. If those aren't present yet (pre-migration), we
// gracefully fall back to deriving activity from trade_history timestamps so
// the endpoint never hard-fails.
//
// Auth: prefers SUPABASE_SERVICE_ROLE_KEY (bypasses RLS for accurate counts).
// Falls back to the anon key, in which case counts are subject to RLS.

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  'https://btgfoekgvyvdflzjfehz.supabase.co';

const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  '';

const REST = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1`;

function headers(extra: Record<string, string> = {}) {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

// Returns the exact row count for a table + optional filter querystring,
// using PostgREST's content-range header (no rows transferred).
async function countRows(table: string, filter = ''): Promise<number> {
  const url = `${REST}/${table}?select=id${filter ? `&${filter}` : ''}`;
  const res = await fetch(url, { headers: headers({ Prefer: 'count=exact', Range: '0-0' }) });
  if (!res.ok) throw new Error(`count ${table} → HTTP ${res.status}`);
  const cr = res.headers.get('content-range') || '';
  const total = cr.split('/')[1];
  return total && total !== '*' ? parseInt(total, 10) : 0;
}

// Distinct active-user count over a trailing window, from profiles.last_active_at.
async function activeSince(iso: string): Promise<number> {
  return countRows('profiles', `last_active_at=gte.${iso}`);
}

const isoDaysAgo = (d: number) => new Date(Date.now() - d * 86400_000).toISOString();
const dayStr = (d: Date) => d.toISOString().slice(0, 10);

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');

  if (!SERVICE_KEY) {
    res.status(200).json({ ok: false, configured: false, error: 'Supabase key not configured' });
    return;
  }

  const out: any = {
    ok: true,
    configured: true,
    activity_source: 'last_active_at',
    generated_at: new Date().toISOString(),
  };

  try {
    // ── Totals & signups (always available) ────────────────────────────────
    const [total, wallet, new1, new7, new30] = await Promise.all([
      countRows('profiles'),
      countRows('profiles', 'wallet_address=not.is.null'),
      countRows('profiles', `created_at=gte.${isoDaysAgo(1)}`),
      countRows('profiles', `created_at=gte.${isoDaysAgo(7)}`),
      countRows('profiles', `created_at=gte.${isoDaysAgo(30)}`),
    ]);
    out.total_users = total;
    out.wallet_users = wallet;
    out.new_users_today = new1;
    out.new_users_7d = new7;
    out.new_users_30d = new30;

    // ── DAU / WAU / MAU from last_active_at ─────────────────────────────────
    try {
      const [dau, wau, mau] = await Promise.all([
        activeSince(isoDaysAgo(1)),
        activeSince(isoDaysAgo(7)),
        activeSince(isoDaysAgo(30)),
      ]);
      out.dau = dau; out.wau = wau; out.mau = mau;
    } catch {
      // Column missing (pre-migration) — fall back to trade_history activity.
      out.activity_source = 'trade_history';
      const [d, w, m] = await Promise.all([
        countDistinctTraders(isoDaysAgo(1)),
        countDistinctTraders(isoDaysAgo(7)),
        countDistinctTraders(isoDaysAgo(30)),
      ]);
      out.dau = d; out.wau = w; out.mau = m;
    }

    // ── Daily signups (last 30d), bucketed in JS ────────────────────────────
    out.daily_signups = await dailyBuckets('profiles', 'created_at', isoDaysAgo(30));

    // ── Daily active users (last 30d) ───────────────────────────────────────
    out.daily_active = await dailyActive(isoDaysAgo(30));

    res.status(200).json(out);
  } catch (e: any) {
    console.error('[user-stats] error:', e);
    res.status(500).json({ ok: false, configured: true, error: e?.message || 'user-stats failed' });
  }
}

// Distinct trader count since `iso` from trade_history (fallback path).
async function countDistinctTraders(iso: string): Promise<number> {
  const url = `${REST}/trade_history?select=user_id&created_at=gte.${iso}&limit=50000`;
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) return 0;
  const rows: Array<{ user_id: string }> = await res.json();
  return new Set(rows.map((r) => r.user_id)).size;
}

// Fetch rows in a window and bucket counts by calendar day.
async function dailyBuckets(table: string, column: string, sinceIso: string) {
  const url = `${REST}/${table}?select=${column}&${column}=gte.${sinceIso}&order=${column}.asc&limit=50000`;
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) return seedDays(30, []);
  const rows: any[] = await res.json();
  const map = new Map<string, number>();
  for (const r of rows) {
    const v = r[column];
    if (!v) continue;
    const k = dayStr(new Date(v));
    map.set(k, (map.get(k) || 0) + 1);
  }
  return seedDays(30, [...map.entries()].map(([date, count]) => ({ date, count })));
}

// Distinct active users per day. Primary: user_activity_daily(day, user_id).
// Fallback: distinct user_id per day from trade_history.
async function dailyActive(sinceIso: string) {
  const sinceDay = sinceIso.slice(0, 10);
  // Primary source
  const url = `${REST}/user_activity_daily?select=day,user_id&day=gte.${sinceDay}&limit=100000`;
  const res = await fetch(url, { headers: headers() });
  if (res.ok) {
    const rows: Array<{ day: string; user_id: string }> = await res.json();
    const map = new Map<string, Set<string>>();
    for (const r of rows) {
      const k = (r.day || '').slice(0, 10);
      if (!k) continue;
      if (!map.has(k)) map.set(k, new Set());
      map.get(k)!.add(r.user_id);
    }
    return seedDays(30, [...map.entries()].map(([date, set]) => ({ date, count: set.size })));
  }
  // Fallback: trade_history
  const fb = await fetch(`${REST}/trade_history?select=user_id,created_at&created_at=gte.${sinceIso}&limit=100000`, { headers: headers() });
  if (!fb.ok) return seedDays(30, []);
  const rows: Array<{ user_id: string; created_at: string }> = await fb.json();
  const map = new Map<string, Set<string>>();
  for (const r of rows) {
    const k = dayStr(new Date(r.created_at));
    if (!map.has(k)) map.set(k, new Set());
    map.get(k)!.add(r.user_id);
  }
  return seedDays(30, [...map.entries()].map(([date, set]) => ({ date, count: set.size })));
}

// Produce a dense, zero-filled series for the last `n` days so charts don't gap.
function seedDays(n: number, entries: Array<{ date: string; count: number }>) {
  const byDate = new Map(entries.map((e) => [e.date, e.count]));
  const out: Array<{ date: string; count: number }> = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = dayStr(new Date(Date.now() - i * 86400_000));
    out.push({ date: d, count: byDate.get(d) || 0 });
  }
  return out;
}
