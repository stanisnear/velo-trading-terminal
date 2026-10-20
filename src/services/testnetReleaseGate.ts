import { VELO_PERPS_ADDRESS } from './veloPerpsService';
export const LEGACY_V31_RESTRICTED = VELO_PERPS_ADDRESS.toLowerCase() === '0x41fdb544d7247a5ddc6b4c06f29d09f2b20de907';
export function requireSafeTestnetAction(action: 'open' | 'order' | 'margin' | 'crossDeposit', marginMode?: string, reduceOnly?: boolean) {
  if (action === 'margin') throw new Error('Margin adjustments are no longer supported. Close the position or edit TP/SL.');
  if (action === 'crossDeposit' || marginMode === 'CROSS') throw new Error('New positions use isolated margin only.');
  if (action === 'order' && reduceOnly) throw new Error('Use full position close or TP/SL instead of reduce-only orders.');
}
