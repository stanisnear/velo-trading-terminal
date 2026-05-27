/**
 * pythService — fetch price updates from Pyth's Hermes endpoint.
 *
 * Every VeloPerps open/close transaction needs a fresh Pyth price update
 * passed as `bytes[]` calldata. The contract calls updatePriceFeeds() with
 * this data and charges a small ETH fee (typically < 0.0001 ETH).
 *
 * Hermes is Pyth's HTTP gateway. We hit /v2/updates/price/latest with the
 * feed ids we want, and it returns hex-encoded update bytes ready to forward.
 *
 * See: https://docs.pyth.network/price-feeds/fetch-price-updates
 */

// Verified Pyth feed IDs from https://www.pyth.network/price-feeds (Stable channel).
// These are CHAIN-INDEPENDENT — the same ids work everywhere Pyth is deployed.
export const PYTH_FEED_IDS = {
  'BTC-USD':    '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
  'ETH-USD':    '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
  'SOL-USD':    '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d',
  'AVAX-USD':   '0x93da3352f9f1d105fdfe4971cfa80e9dd777bfc5d0f683ebb6e1294b92137bb7',
  'LINK-USD':   '0x8ac0c70fff57e9aefdf5edf44b51d62c2d433653cbb2cf5cc06bb115af04d221',
  'DOGE-USD':   '0xdcef50dd0a4cd2dcc17e45df1676dcb336a11a61c69df7a0299b0150c672d25c',
  'NEAR-USD':   '0xc415de8d2eba7db216527dff4b60e8f3a5311c740dadb233e13e12547e226750',
  'INJ-USD':    '0x7a5bc1d2b56ad029048cd63964b3ad2776eadf812edc1a43a31406cb54bff592',
  'APT-USD':    '0x03ae4db29ed4ae33d323568895aa00337e658e348b37509f5372ae51f0af00d5',
  'ARB-USD':    '0x3fa4252848f9f0a1480be62745a4629d9eb1322aebab8a791e344b3b9c1adcf5',
  'OP-USD':     '0x385f64d993f7b77d8182ed5003d97c60aa3361f3cecfe711544d2d59165e9bdf',
  'SUI-USD':    '0x23d7315113f5b1d3ba7a83604c44b94d79f4fd69af77f804fc7f920a6dc65744',
  'TIA-USD':    '0x09f7c1d7dfbb7df2b8fe3d3d87ee94a2259d212da4f30c1f0540d066dfa44723',
  'SEI-USD':    '0x53614f1cb0c031d4af66c04cb9c756234adad0e1cee85303795091499a4084eb',
  'RENDER-USD': '0x3d4a2bd9535be6ce8059d75eadeba507b043257321aa544717c56fa19b49e35d',
  'WLFI-USD':   '0xd41369178d64f41d51ca95465c144a2c74d2fff30be69164835911943fa64c3e',
  'POL-USD':    '0xffd11c5a1cfd42f80afb2df4d9f264c15f956d68153335374ec10722edd70472',
} as const;

const HERMES_URL = import.meta.env.VITE_PYTH_HERMES_URL || 'https://hermes.pyth.network';

/**
 * Maximum age (seconds) we accept from Hermes before retrying.
 * The contract enforces 60s via getPriceNoOlderThan. We enforce 30s
 * client-side so we never submit data that's borderline stale.
 */
const MAX_DATA_AGE_SECONDS = 30;

/**
 * Minimum sane price for any asset we trade ($0.001).
 * If Hermes returns a price below this, the data is corrupt and we refuse
 * to submit it — this prevents the phantom entry-price bug where a
 * near-zero price gets stored on-chain.
 */
const MIN_SANE_PRICE_USD = 0.001;

async function fetchOnce(feedIds: readonly string[]): Promise<{
  updateData: `0x${string}`[];
  parsedPrice: number;
  publishTime: number;
}> {
  const params = new URLSearchParams();
  for (const id of feedIds) {
    params.append('ids[]', id.startsWith('0x') ? id.slice(2) : id);
  }
  params.set('encoding', 'hex');
  params.set('parsed', 'true');

  const res = await fetch(`${HERMES_URL}/v2/updates/price/latest?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`Hermes returned ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  const hexBlobs: string[] = data?.binary?.data ?? [];
  if (hexBlobs.length === 0) {
    throw new Error('Hermes returned no price updates');
  }

  const updateData = hexBlobs.map((s): `0x${string}` =>
    s.startsWith('0x') ? (s as `0x${string}`) : (`0x${s}` as `0x${string}`),
  );

  // Validate freshness and sanity from the parsed field.
  const parsed = data?.parsed?.[0];
  const publishTime: number = parsed?.price?.publish_time ?? 0;
  const rawPrice: number = parsed?.price?.price ?? 0;
  const expo: number = parsed?.price?.expo ?? -8;
  const parsedPrice = rawPrice * Math.pow(10, expo);

  return { updateData, parsedPrice, publishTime };
}

/**
 * Fetch a fresh price update for the given feed ids.
 *
 * Returns:
 *   updateData  — bytes[] to pass to VeloPerps.openPosition / closePosition
 *   parsedPrice — human-readable price for UI display / sanity check
 *
 * Throws if:
 *   - Hermes is unreachable
 *   - The price data is stale (>30s old) after one retry
 *   - The price is suspiciously low (<$0.001) — corrupt oracle data guard
 *
 * The VeloPerps contract enforces msg.value == getUpdateFee(updateData) exactly.
 * Fee is computed on-chain in veloPerpsService via getExactPythFee().
 */
export async function fetchPriceUpdate(
  feedIds: readonly string[],
): Promise<{ updateData: `0x${string}`[]; parsedPrice: number }> {
  if (feedIds.length === 0) {
    throw new Error('fetchPriceUpdate: no feed ids');
  }

  const nowSec = Math.floor(Date.now() / 1000);
  let result = await fetchOnce(feedIds);

  // If data is stale, wait 1s and retry once — Hermes may have cached old data.
  if (result.publishTime > 0 && nowSec - result.publishTime > MAX_DATA_AGE_SECONDS) {
    await new Promise(r => setTimeout(r, 1000));
    result = await fetchOnce(feedIds);
    if (nowSec - result.publishTime > MAX_DATA_AGE_SECONDS) {
      throw new Error(
        `Pyth price data is stale (${nowSec - result.publishTime}s old). ` +
        `Try again in a few seconds.`
      );
    }
  }

  // Guard against corrupt/near-zero prices — these cause phantom trillion-dollar PnL.
  if (result.parsedPrice > 0 && result.parsedPrice < MIN_SANE_PRICE_USD) {
    throw new Error(
      `Pyth returned a suspiciously low price ($${result.parsedPrice.toFixed(8)}). ` +
      `This looks like corrupt oracle data. Refusing to open position.`
    );
  }

  return { updateData: result.updateData, parsedPrice: result.parsedPrice };
}

/**
 * Convenience: fetch the most recent parsed price (number) for a single feed.
 * Used for previews / UI displays where we don't need the on-chain update.
 */
export async function fetchLatestPrice(feedId: string): Promise<number | null> {
  try {
    const params = new URLSearchParams();
    params.append('ids[]', feedId.startsWith('0x') ? feedId.slice(2) : feedId);
    const res = await fetch(`${HERMES_URL}/v2/updates/price/latest?${params.toString()}`);
    if (!res.ok) return null;
    const data = await res.json();
    const parsed = data?.parsed?.[0]?.price;
    if (!parsed) return null;
    return Number(parsed.price) * 10 ** Number(parsed.expo);
  } catch {
    return null;
  }
}
