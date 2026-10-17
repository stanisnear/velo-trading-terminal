import { useQuery } from '@tanstack/react-query';
import { MARKETS } from '../../shared/markets.mjs';
import { CMC_IDS, resolveMarketAsset } from '../../shared/marketDiscovery.mjs';
import { boundedFetch } from './sessionLifecycle.mjs';
import { PAIRS, isTradablePair } from '../utils/types';
import { useMemo } from 'react';

export interface DiscoveryAsset {
  assetId: string; geckoId?: string | null; cmcId: number; cmcSlug?: string | null; symbol: string; name: string; logo: string; id: string; pairId: string;
  binance: string | null; rank?: number | null; price?: number | null; change?: number | null;
  volume?: number | null; marketCap?: number | null; high24h?: number | null; low24h?: number | null;
  supply?: number | null; ath?: number | null; athDate?: string; fdv?: number | null;
  updatedAt?: string; sparkline?: number[];
  change7d?: number | null; change30d?: number | null; tags?: string[];
}
export const referenceAssets: DiscoveryAsset[] = MARKETS.map(asset => ({ ...asset, assetId: asset.geckoId, cmcId: CMC_IDS[asset.symbol], pairId: asset.id }));
export function tradingPairForAsset(asset: DiscoveryAsset) {
  return PAIRS.find(pair => CMC_IDS[pair.symbol] === asset.cmcId && isTradablePair(pair.id));
}
export function marketWatchKey(asset: DiscoveryAsset) {
  return referenceAssets.some(reference => reference.cmcId === asset.cmcId) ? asset.pairId : `coin:${asset.assetId}`;
}
const EMPTY_ASSETS: DiscoveryAsset[] = [];
export async function fetchMarketData(kind = 'markets', id?: string, days?: number, signal?: AbortSignal) {
  const params = new URLSearchParams({ kind });
  if (id) params.set('id', id);
  if (days) params.set('days', String(days));
  const response = await boundedFetch(`/api/market-data?${params}`, { signal, credentials: 'omit' }, 20000);
  if (!response.ok) throw new Error('Market data could not refresh. Please retry.');
  return response.json();
}

export function useMarketDiscovery() {
  const query = useQuery<{ assets: DiscoveryAsset[]; fetchedAt: number }>({
    queryKey: ['public-markets', 'top50'], queryFn: ({ signal }) => fetchMarketData('markets', undefined, undefined, signal),
    staleTime: 600000, gcTime: 1800000, retry: 1, refetchInterval: 600000, refetchIntervalInBackground: false,
  });
  const assets = query.data?.assets || EMPTY_ASSETS;
  const socialAssets = useMemo(() => [...assets, ...referenceAssets.filter(reference => !assets.some(asset => asset.cmcId === reference.cmcId))], [assets]);
  return { ...query, assets, socialAssets, resolve: (id: string) => resolveMarketAsset(socialAssets, id) as DiscoveryAsset | undefined };
}
