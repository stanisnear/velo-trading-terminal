// Vercel serverless function — server-side Open Graph page for shared post
// links. The SPA serves identical generic tags for every route, so pasting
// /social/post/:id into X/Slack/Discord/WhatsApp showed a blank brand card.
// vercel.json rewrites BOT user-agents on that route here; humans never hit
// this (they get the SPA), and crawlers don't run the service worker.
//
// Env-first with hardcoded fallbacks (same hardening as the keepers): the
// anon key is public by design — it ships in the frontend bundle.
const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL || 'https://btgfoekgvyvdflzjfehz.supabase.co';
const SUPABASE_ANON =
  process.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0Z2ZvZWtndnl2ZGZsempmZWh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY2NzU5NDIsImV4cCI6MjA5MjI1MTk0Mn0.8Z0Vce5RkSk2IS4tD4PAkCJ5XRtGeTMKHFx77we2_pU';

const SITE = 'https://app.velotrading.live';

const esc = (x: any) =>
  String(x ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export default async function handler(req: any, res: any) {
  const id = String((req.query && req.query.id) || '').trim();

  // Defaults if the post can't be fetched — still a valid branded card.
  let title = 'Velo — Social perps on Base';
  let desc =
    'Trade real on-chain perpetuals and copy provable performance. Up to 25× leverage, Pyth oracle, non-custodial.';

  if (/^[0-9a-f-]{8,40}$/i.test(id)) {
    try {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/posts?id=eq.${encodeURIComponent(id)}` +
          `&select=content,profiles!author_id(handle,username)`,
        { headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` } },
      );
      const rows = await r.json();
      const p = Array.isArray(rows) ? rows[0] : null;
      if (p) {
        const handle = p.profiles?.handle || p.profiles?.username || '@trader';
        title = `${handle} on Velo`;
        const body = String(p.content || '').replace(/\s+/g, ' ').trim();
        if (body) desc = body.length > 180 ? body.slice(0, 177) + '…' : body;
      }
    } catch (e: any) {
      console.warn('[post-og] fetch failed:', e?.message || e);
    }
  }

  const url = `${SITE}/social/post/${esc(id)}`;
  const img = `${SITE}/og-image.png`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  // Crawlers refetch on share; 5 min is fresh enough and absorbs bursts.
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
  res.status(200).send(`<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"/>
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}"/>
<meta property="og:site_name" content="Velo"/>
<meta property="og:type" content="article"/>
<meta property="og:title" content="${esc(title)}"/>
<meta property="og:description" content="${esc(desc)}"/>
<meta property="og:url" content="${url}"/>
<meta property="og:image" content="${img}"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="${esc(title)}"/>
<meta name="twitter:description" content="${esc(desc)}"/>
<meta name="twitter:image" content="${img}"/>
<meta http-equiv="refresh" content="0;url=${url}"/>
</head><body>
<p><a href="${url}">${esc(title)}</a> — ${esc(desc)}</p>
</body></html>`);
}
