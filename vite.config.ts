import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { handleMarketData } from './cloudflare/market-data.js';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react(), {
        name: 'velo-public-markets',
        configureServer(server) {
          const secret = loadEnv('cmc', '.', '').CMC_API_KEY;
          const entries = new Map<string, { response: Response; expires: number }>();
          const cache = {
            match: async (key: Request) => { const item = entries.get(key.url); return item && item.expires > Date.now() ? item.response.clone() : undefined; },
            put: async (key: Request, response: Response) => {
              const ttl = Number(response.headers.get('Cache-Control')?.match(/max-age=(\d+)/)?.[1] || 0);
              entries.set(key.url, { response: response.clone(), expires: Date.now() + ttl * 1000 });
            },
          };
          server.middlewares.use('/api/market-data', async (request, response) => {
            const result = await handleMarketData(new Request(`http://localhost/api/market-data${request.url?.includes('?') ? request.url.slice(request.url.indexOf('?')) : ''}`, { method: request.method }), { CMC_API_KEY: secret }, undefined, cache);
            response.writeHead(result.status, Object.fromEntries(result.headers));
            response.end(await result.text());
          });
        },
      }],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        // Required for WalletConnect / Reown AppKit internals in the browser
        global: 'globalThis',
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, './src'),
        },
      },
      optimizeDeps: {
        include: [
          'viem',
          'viem/chains',
          'wagmi',
          'wagmi/chains',
          '@reown/appkit',
          '@reown/appkit-adapter-wagmi',
        ],
      },
      build: {
        // Code-splitting strategy (batch 8). Single-bundle was 3.5MB unminified,
        // 1MB gzipped — slow first paint on mobile + every patch invalidates
        // the whole cache. Split into stable vendor chunks that change rarely:
        //
        //   appkit         — Reown AppKit (huge, very stable)
        //   walletconnect  — @walletconnect/* + @web3modal/* internals
        //   wagmi          — wagmi
        //   viem           — viem (shared across web3 libs)
        //   charts         — Recharts + lightweight-charts + d3
        //   supabase       — Supabase client
        //   icons          — lucide-react + phosphor-icons
        //
        // Anything not matched stays in the main index chunk. Patches to
        // App.tsx alone now invalidate ~600kB instead of 3.5MB, which is the
        // main win for repeat-visit cache hits and Vercel deploy speed.
        chunkSizeWarningLimit: 1000,
        rollupOptions: {
          output: {
            manualChunks(id) {
              if (!id.includes('node_modules')) return;
              // Order matters — more specific matches first.
              if (id.includes('@reown')) return 'appkit';
              if (id.includes('@walletconnect') || id.includes('@web3modal')) return 'walletconnect';
              if (id.includes('wagmi')) return 'wagmi';
              if (id.includes('viem')) return 'viem';
              if (id.includes('recharts') || id.includes('lightweight-charts') || id.includes('d3-')) return 'charts';
              if (id.includes('@supabase')) return 'supabase';
              if (id.includes('lucide-react') || id.includes('@phosphor-icons')) return 'icons';
            },
          },
        },
      },
    };
});
