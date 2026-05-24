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
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, './src'),
        }
      },
      // Force Vite to pre-bundle viem through esbuild (CJS transform) so its
      // internal ESM circular references are resolved before any app code runs.
      // Without this, Rollup/Terser can reorder const declarations and trigger
      // "Cannot access 'X' before initialization" TDZ ReferenceErrors.
      // Do NOT add manualChunks — splitting React or viem into separate chunks
      // causes load-order TDZ crashes in production.
      optimizeDeps: {
        include: [
          'viem',
          'viem/chains',
          'wagmi',
          'wagmi/chains',
          '@rainbow-me/rainbowkit',
        ],
      },
    };
});
