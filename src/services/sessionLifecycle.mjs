// Auth callbacks must return before requesting more Supabase data. Otherwise
// getSession/table reads can wait on the same auth lock that invokes them.
export function createDeferredAuthListener(handle, onError = (_error) => {}) {
  let active = true;
  const timers = new Set();
  return {
    callback(event, session) {
      const timer = setTimeout(() => {
        timers.delete(timer);
        if (active) Promise.resolve().then(() => handle(event, session)).catch(onError);
      }, 0);
      timers.add(timer);
    },
    cancel() { active = false; for (const timer of timers) clearTimeout(timer); timers.clear(); },
  };
}
export const IDLE_TIMEOUT_MS = 30 * 60_000;
export const SESSION_MAX_MS = 8 * 60 * 60_000;
export const SESSION_WARNING_MS = 60_000;
// A cached profile can paint the shell only for the persisted authenticated user.
// Never mistake a connector reconnect or a slow profile request for sign-out.
export function canRestoreCachedProfile(profile, auth, loggedOut, now = Date.now(), started = 0) {
  return !loggedOut && !/^wallet_[0-9a-f]{40}$/i.test(profile?.username || '') && !!profile?.id && auth?.user?.id === profile.id &&
    !!auth.refresh_token && now - (profile._cachedAt || 0) < 24 * 60 * 60_000 &&
    (!started || now - started < SESSION_MAX_MS);
}
export function sessionTimeLeft(now, lastActivity, startedAt) {
  return Math.max(0, Math.min(lastActivity + IDLE_TIMEOUT_MS, startedAt + SESSION_MAX_MS) - now);
}
export async function boundedFetch(input, init = {}, timeoutMs = 12_000) {
  const controller = new AbortController();
  const original = init.signal || (input instanceof Request ? input.signal : undefined);
  const abort = () => controller.abort(original?.reason);
  if (original?.aborted) abort(); else original?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => controller.abort(new DOMException('Request timed out. Please retry.', 'TimeoutError')), timeoutMs);
  try { return await fetch(input, { ...init, signal: controller.signal }); }
  finally { clearTimeout(timer); original?.removeEventListener('abort', abort); }
}

// A page/connector reload has no click timestamp. Wallet selection may take a
// little time, but a cancelled old connect must not arm a future reconnect.
export function hasWalletSignInIntent(startedAt, now = Date.now()) {
  return Number.isFinite(startedAt) && startedAt > 0 && now >= startedAt && now - startedAt < 5 * 60_000;
}
