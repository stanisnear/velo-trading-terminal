import { Attribution } from 'ox/erc8021';

export const BUILDER_CODE = import.meta.env?.VITE_BASE_BUILDER_CODE?.trim() || 'bc_s0k82w2v';

export function builderAttribution(chainId, code = BUILDER_CODE) {
  if (chainId !== 8453 && chainId !== 84532) return {};
  if (!code) return {};
  if (!/^[a-zA-Z0-9_-]{1,255}$/.test(code)) throw new Error('Invalid Base Builder Code');
  return { dataSuffix: Attribution.toDataSuffix({ codes: [code] }) };
}
