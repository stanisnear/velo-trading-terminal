import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
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
