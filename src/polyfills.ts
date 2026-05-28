/**
 * polyfills.ts — Node shims required by WalletConnect / Reown internals.
 *
 * WalletConnect's SDK was written for Node and uses Buffer, global, and
 * process at runtime. Vite (unlike webpack/CRA) does NOT polyfill these.
 * Without this file, clicking WalletConnect triggers a ReferenceError that
 * crashes the app into a white screen.
 *
 * THIS FILE MUST BE THE VERY FIRST IMPORT in main.tsx.
 */
import { Buffer } from 'buffer';

// Polyfill Buffer globally (used by WalletConnect internally)
if (typeof window !== 'undefined') {
  (window as any).Buffer = (window as any).Buffer ?? Buffer;
  (window as any).global = (window as any).global ?? window;
  (window as any).process = (window as any).process ?? { env: {} };
}
