import { PAIRS } from '../types';

const GECKO_IDS = PAIRS.map((p: any) => p.geckoId).filter(Boolean).join(',');

export async function fetchRealPrices(): Promise<{ prices: Record<string, number>; changes: Record<string, number>; status: string }> {
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${GECKO_IDS}&vs_currencies=usd&include_24hr_change=true`
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    
    const prices: Record<string, number> = {};
    const changes: Record<string, number> = {};
    
    for (const pair of PAIRS) {
      const geckoId = (pair as any).geckoId;
      if (geckoId && data[geckoId]?.usd) {
        prices[pair.id] = data[geckoId].usd;
        if (data[geckoId].usd_24h_change != null) {
          changes[pair.id] = data[geckoId].usd_24h_change;
        }
      }
    }
    
    return { prices, changes, status: 'live' };
  } catch (e) {
    console.warn('CoinGecko fetch failed:', e);
    return { prices: {}, changes: {}, status: 'error' };
  }
}
