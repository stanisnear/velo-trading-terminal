import { supabase } from './supabaseStore';

// Provider credentials stay in Cloudflare. Only the app session reaches our
// same-origin proxy; anonymous visitors retain the existing display fallback.
export async function fetchPyth(url: string, signal?: AbortSignal): Promise<Response> {
  if (!url.startsWith('/api/pyth/')) throw new Error('Invalid price-service route');
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Sign in to use live Pyth prices');
  const requestSignal = url.includes('/stream?') ? signal : AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(18000)]);
  return fetch(url, { headers: { Authorization: `Bearer ${session.access_token}` }, signal: requestSignal });
}

export class PythEventStream {
  readyState = 0;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  private controller = new AbortController();
  constructor(url: string) { void this.open(url); }
  close() { this.readyState = 2; this.controller.abort(); }
  private async open(url: string) {
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      const response = await fetchPyth(url, this.controller.signal);
      if (!response.ok || !response.headers.get('content-type')?.startsWith('text/event-stream') || !response.body) {
        await response.body?.cancel(); throw new Error('Price stream unavailable');
      }
      this.readyState = 1;
      reader = response.body.getReader();
      const decoder = new TextDecoder(); let pending = '';
      while (!this.controller.signal.aborted) {
        const { done, value } = await reader.read(); if (done) break;
        pending += decoder.decode(value, { stream: true });
        if (pending.length > 524288) throw new Error('Price frame too large');
        let match: RegExpExecArray | null;
        while ((match = /\r?\n\r?\n/.exec(pending))) {
          const frame = pending.slice(0, match.index); pending = pending.slice(match.index + match[0].length);
          const data = frame.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).replace(/^ /, '')).join('\n');
          if (data) this.onmessage?.(new MessageEvent('message', { data }));
        }
      }
    } catch { /* Report a fixed stream failure; never reflect credential-bearing requests. */ }
    finally {
      try { await reader?.cancel(); } catch { /* already aborted */ }
      reader?.releaseLock(); this.readyState = 2;
      if (!this.controller.signal.aborted) this.onerror?.();
    }
  }
}
