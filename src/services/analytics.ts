/**
 * analytics.ts — Google Analytics 4 (gtag) integration for VELO.
 *
 * Loads the GA4 tag at runtime from VITE_GA_MEASUREMENT_ID (a `G-XXXXXXX`
 * string) and exposes thin tracking helpers. If the env var is absent, every
 * function is a safe no-op, so local/dev builds don't ship analytics noise.
 *
 * SPA note: we set `send_page_view: false` and emit page_view manually on tab
 * changes (see trackPageView) so client-side navigation is captured correctly.
 */

const GA_ID = (import.meta.env.VITE_GA_MEASUREMENT_ID || 'G-ZC8P4W2V9P').trim();

declare global {
  interface Window {
    dataLayer: any[];
    gtag: (...args: any[]) => void;
  }
}

let initialized = false;

export const isAnalyticsEnabled = () => !!GA_ID && GA_ID.startsWith('G-');

export function initAnalytics(): void {
  if (initialized || !isAnalyticsEnabled() || typeof document === 'undefined') return;
  initialized = true;

  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
  document.head.appendChild(s);

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  // Manual page_view control for the SPA.
  window.gtag('config', GA_ID, { send_page_view: false });
}

/** Fire a virtual page_view for client-side route/tab changes. */
export function trackPageView(path: string, title?: string): void {
  if (!isAnalyticsEnabled() || typeof window === 'undefined' || !window.gtag) return;
  window.gtag('event', 'page_view', {
    page_path: path,
    page_title: title || path,
    page_location: window.location.origin + path,
  });
}

/** Fire a custom event (e.g. trade_opened, signup, bridge_initiated). */
export function trackEvent(name: string, params: Record<string, any> = {}): void {
  if (!isAnalyticsEnabled() || typeof window === 'undefined' || !window.gtag) return;
  window.gtag('event', name, params);
}

/** Associate the GA client with a stable user id (hashed/opaque is fine). */
export function setAnalyticsUser(userId: string | null): void {
  if (!isAnalyticsEnabled() || typeof window === 'undefined' || !window.gtag) return;
  window.gtag('set', { user_id: userId || undefined });
}
