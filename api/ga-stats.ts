// api/ga-stats.ts
//
// OPTIONAL: surfaces live Google Analytics 4 numbers in the Admin dashboard
// (active users 1d/7d/28d, pageviews, sessions, top pages).
//
// Requires a GA4 service account with "Viewer" access to the property and
// three env vars:
//   GA_PROPERTY_ID   e.g. 123456789  (numeric GA4 property id, NOT the G-XXXX tag)
//   GA_CLIENT_EMAIL  service-account email
//   GA_PRIVATE_KEY   service-account private key (PEM; \n newlines are handled)
//
// If those aren't set, the endpoint returns { configured: false } and the UI
// shows a "connect Google Analytics" card with a link to the GA property.
//
// Dependency-free: mints the OAuth2 JWT with Node's crypto and calls the
// Data API over REST — no googleapis package needed.

import crypto from 'crypto';

const PROPERTY_ID = process.env.GA_PROPERTY_ID || '';
const CLIENT_EMAIL = process.env.GA_CLIENT_EMAIL || '';
const PRIVATE_KEY = (process.env.GA_PRIVATE_KEY || '').replace(/\\n/g, '\n');

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function getAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({
    iss: CLIENT_EMAIL,
    scope: SCOPE,
    aud: TOKEN_URL,
    exp: now + 3600,
    iat: now,
  }));
  const signingInput = `${header}.${claim}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signingInput);
  const signature = b64url(signer.sign(PRIVATE_KEY));
  const jwt = `${signingInput}.${signature}`;

  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: jwt,
  });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) throw new Error(`token exchange HTTP ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return json.access_token as string;
}

async function runReport(token: string, payload: any): Promise<any> {
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${PROPERTY_ID}:runReport`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );
  if (!res.ok) throw new Error(`runReport HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=300');

  if (!PROPERTY_ID || !CLIENT_EMAIL || !PRIVATE_KEY) {
    res.status(200).json({ ok: true, configured: false, property_id: PROPERTY_ID || null });
    return;
  }

  try {
    const token = await getAccessToken();

    // Totals across three windows (no dimensions, three date ranges).
    const totals = await runReport(token, {
      dateRanges: [
        { startDate: '1daysAgo', endDate: 'today', name: 'd1' },
        { startDate: '7daysAgo', endDate: 'today', name: 'd7' },
        { startDate: '28daysAgo', endDate: 'today', name: 'd28' },
      ],
      metrics: [
        { name: 'activeUsers' },
        { name: 'screenPageViews' },
        { name: 'sessions' },
      ],
    });

    // GA returns one row per dateRange with a 'dateRange' dimension value.
    const windows: Record<string, { activeUsers: number; pageViews: number; sessions: number }> = {
      d1: { activeUsers: 0, pageViews: 0, sessions: 0 },
      d7: { activeUsers: 0, pageViews: 0, sessions: 0 },
      d28: { activeUsers: 0, pageViews: 0, sessions: 0 },
    };
    const rangeNames = ['d1', 'd7', 'd28'];
    for (const row of totals.rows || []) {
      // dimensionValues[0].value is 'date_range_0' / '_1' / '_2'
      const idxRaw = row.dimensionValues?.[0]?.value || '';
      const idx = parseInt(idxRaw.replace(/[^0-9]/g, ''), 10);
      const key = rangeNames[idx] || rangeNames[0];
      const m = row.metricValues || [];
      windows[key] = {
        activeUsers: Number(m[0]?.value || 0),
        pageViews: Number(m[1]?.value || 0),
        sessions: Number(m[2]?.value || 0),
      };
    }

    // Top pages, last 7 days.
    let topPages: Array<{ path: string; views: number }> = [];
    try {
      const pages = await runReport(token, {
        dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
        dimensions: [{ name: 'pagePath' }],
        metrics: [{ name: 'screenPageViews' }],
        orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
        limit: 8,
      });
      topPages = (pages.rows || []).map((r: any) => ({
        path: r.dimensionValues?.[0]?.value || '/',
        views: Number(r.metricValues?.[0]?.value || 0),
      }));
    } catch { /* top pages optional */ }

    res.status(200).json({
      ok: true,
      configured: true,
      property_id: PROPERTY_ID,
      generated_at: new Date().toISOString(),
      active_users_1d: windows.d1.activeUsers,
      active_users_7d: windows.d7.activeUsers,
      active_users_28d: windows.d28.activeUsers,
      page_views_7d: windows.d7.pageViews,
      page_views_28d: windows.d28.pageViews,
      sessions_7d: windows.d7.sessions,
      top_pages: topPages,
    });
  } catch (e: any) {
    console.error('[ga-stats] error:', e);
    res.status(200).json({ ok: false, configured: true, error: e?.message || 'GA query failed' });
  }
}
