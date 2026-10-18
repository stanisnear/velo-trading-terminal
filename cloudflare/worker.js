import { handleMarketData } from './market-data.js';
import { parsePostPath } from '../shared/socialLinks.mjs';
// A narrow Pages gateway. The API implementation must be deployed separately.
// Runtime secrets: VELO_BACKEND_URL and VELO_PROXY_TOKEN.
const routes = new Map([
  ['/api/record-transfer', ['POST']],
  ['/api/wallet-auth', ['POST']],
  ['/api/sponsor-eth', ['POST', 'OPTIONS']],
  ['/api/user-stats', ['GET', 'HEAD']],
  ['/api/ga-stats', ['GET', 'HEAD']],
  ['/api/protocol-stats', ['GET', 'HEAD']],
  ['/api/og', ['GET', 'HEAD']],
  ['/api/post-og', ['GET', 'HEAD']],
]);
const bot = /twitterbot|facebookexternalhit|slackbot|linkedinbot|whatsapp|discordbot|telegrambot|embedly|pinterest|googlebot|bingbot/i;
const security = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

function error(message, status, extra = {}) {
  return Response.json({ error: message }, { status, headers: { ...security, 'Cache-Control': 'no-store', ...extra } });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/api/market-data') return handleMarketData(request, env, ctx);
    if (url.pathname.startsWith('/api/pyth/')) {
      if (!env.VELO_PYTH) return error('Price service not configured', 503);
      try { return await env.VELO_PYTH.fetch(request); }
      catch { return error('Price service temporarily unavailable', 503); }
    }
    let route = url.pathname;
    const sharedPost = parsePostPath(route);
    if (sharedPost && bot.test(request.headers.get('user-agent') || '')) {
      route = '/api/post-og';
      // Match the existing bot rewrite, using the path ID rather than user input.
      url.searchParams.set('id', sharedPost.postId);
      url.searchParams.delete('comment');
      if (sharedPost.commentId) url.searchParams.set('comment', sharedPost.commentId);
    } else if (!route.startsWith('/api/') && route !== '/api') {
      const asset = await env.ASSETS.fetch(request);
      const response = new Response(asset.body, asset);
      // The same post URL has different HTML for crawlers and humans.
      if (sharedPost) {
        response.headers.set('Vary', 'User-Agent');
        response.headers.set('Cache-Control', 'no-store');
      }
      return response;
    }

    const methods = routes.get(route);
    // Keeper routes are scheduled directly at the backend, not publicly proxied.
    if (!methods) return error('Route not found', 404);
    if (!methods.includes(request.method)) return error('Method not allowed', 405, { Allow: methods.join(', ') });
    if (!env.VELO_BACKEND_URL || !env.VELO_PROXY_TOKEN) return error('Backend not configured', 503);

    let target;
    try {
      target = new URL(env.VELO_BACKEND_URL);
      if (target.protocol !== 'https:' || target.username || target.password || target.search || target.hash) throw new Error();
      target.pathname = target.pathname.replace(/\/$/, '') + route;
      target.search = url.search;
    } catch {
      return error('Backend configuration invalid', 503);
    }

    // Never forward visitor cookies or arbitrary headers to a different origin.
    const headers = new Headers();
    for (const name of ['content-type', 'accept', 'authorization', 'user-agent']) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }
    // The caller cannot override the gateway credential.
    headers.set('X-Velo-Proxy-Token', env.VELO_PROXY_TOKEN);
    headers.set('X-Velo-Client-IP', request.headers.get('CF-Connecting-IP') || 'unknown');
    try {
      const upstream = await fetch(target, {
        method: request.method,
        headers,
        body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
        redirect: 'manual',
        signal: AbortSignal.timeout(120_000),
      });
      // Do not follow redirects with the gateway credential attached.
      if (upstream.status >= 300 && upstream.status < 400) return error('Unexpected backend redirect', 502);
      const responseHeaders = new Headers();
      for (const name of ['content-type', 'cache-control', 'retry-after', 'allow']) {
        const value = upstream.headers.get(name);
        if (value) responseHeaders.set(name, value);
      }
      if (route === '/api/post-og' && upstream.status === 200 && upstream.headers.get('X-Velo-Response-Type') === 'post-og-html') {
        responseHeaders.set('Content-Type', 'text/html; charset=utf-8');
      }
      for (const [name, value] of Object.entries(security)) responseHeaders.set(name, value);
      if (sharedPost) {
        responseHeaders.set('Vary', 'User-Agent');
        responseHeaders.set('Cache-Control', 'no-store');
      }
      return new Response(request.method === 'HEAD' ? null : upstream.body, { status: upstream.status, headers: responseHeaders });
    } catch {
      return error('Backend temporarily unavailable', 502);
    }
  },
};
