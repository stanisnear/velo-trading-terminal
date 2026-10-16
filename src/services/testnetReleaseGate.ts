import { VELO_PERPS_ADDRESS } from './veloPerpsService';
export const LEGACY_V31_RESTRICTED = VELO_PERPS_ADDRESS.toLowerCase() === '0x41fdb544d7247a5ddc6b4c06f29d09f2b20de907';
export function requireSafeTestnetAction(action: 'open' | 'order' | 'margin' | 'crossDeposit', marginMode?: string, reduceOnly?: boolean) {
  if (!LEGACY_V31_RESTRICTED) return;
  if (action === 'margin') throw new Error('Margin adjustments are paused while V3.1 accounting is replaced. Closing positions remains available.');
  if (action === 'crossDeposit' || marginMode === 'CROSS') throw new Error('New cross-margin exposure is paused after the V3.1 accounting review. Existing positions and withdrawals remain accessible.');
  if (action === 'order' && reduceOnly) throw new Error('Reduce-only entry orders are paused pending a contract correction. Use the position close or TP/SL controls.');
}
