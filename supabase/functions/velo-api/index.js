import { createApi } from './bridge.js';
import { runtimeEnv } from './env.js';
import { gatewayTokenHash } from '../_shared/token-verifiers.js';

// Explicit imports let Supabase bundle all routes without eagerly initializing
// contract clients. Generated files come only from the checked-in api/ sources.
Deno.serve(createApi({
  getEnv: runtimeEnv,
  tokenHash: gatewayTokenHash,
  loaders: {
    'sponsor-eth': () => import('./sponsor.js'),
    'user-stats': () => import('./generated/user-stats.js'),
    'ga-stats': () => import('./generated/ga-stats.js'),
    'protocol-stats': () => import('./generated/protocol-stats.js'),
    'og': () => import('./generated/og.js'),
    'post-og': () => import('./generated/post-og.js'),
  },
}));
