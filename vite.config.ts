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
        // Existing env passthrough
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        // Node global shims — required by WalletConnect/Reown internals at
        // build time. Without these, the production bundle throws
        // "global is not defined" or "Buffer is not defined" when the
        // WalletConnect QR modal is opened, causing a white screen crash.
        global: 'globalThis',
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, './src'),
          // Provide browser-compatible Buffer to any package that imports it
          // as a Node built-in (e.g. @walletconnect/* packages).
          buffer: 'buffer',
        },
      },
      // Force Vite to pre-bundle viem through esbuild (CJS transform) so its
      // internal ESM circular references are resolved before any app code runs.
      // Without this, Rollup/Terser can reorder const declarations and trigger
      // "Cannot access 'X' before initialization" TDZ ReferenceErrors.
      // Do NOT add manualChunks — splitting React or viem into separate chunks
      // causes load-order TDZ crashes in production.
      optimizeDeps: {
        include: [
          'buffer',
          'viem',
          'viem/chains',
          'wagmi',
          'wagmi/chains',
          '@rainbow-me/rainbowkit',
        ],
      },
    };
});
