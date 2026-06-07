// Vercel serverless function — server-side link-preview (OG) fetch.
// Replaces the public api.allorigins.win proxy, which fails CORS from the
// app origin. Runs same-origin (/api/og), so no CORS, and is edge-cached for
// fast X-style unfurls.
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const url = (req.query && req.query.url) || '';
  if (!url || !/^https?:\/\//i.test(url)) {
    res.status(400).json({ error: 'invalid url' });
    return;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; VeloBot/1.0; +https://velotrading.live)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
      signal: controller.signal,
    });
    clearTimeout(timer);
    const html = (await r.text()).slice(0, 400000); // cap to keep it fast

    const tag = (prop) => {
      const m =
        html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i')) ||
        html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`, 'i'));
      return m ? m[1] : undefined;
    };
    const decode = (s) =>
      s ? s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
           .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&#x27;/gi, "'") : s;

    const meta = {
      title: decode(tag('og:title') || tag('twitter:title') || (html.match(/<title[^>]*>([^<]+)<\/title>/i) || [])[1]),
      description: decode(tag('og:description') || tag('twitter:description') || tag('description')),
      image: tag('og:image') || tag('twitter:image'),
      siteName: decode(tag('og:site_name')),
    };

    // Cache hard at the edge so repeat unfurls are instant.
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
    res.status(200).json(meta);
  } catch (e) {
    res.status(502).json({ error: 'fetch failed' });
  }
}
