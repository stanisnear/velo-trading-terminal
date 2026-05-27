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
 * Fetch a fresh price update for the given feed ids.
 *
 * Returns:
 *   updateData — bytes[] to pass to VeloPerps.openPosition / closePosition
 *   feeWei     — what to send as msg.value. Estimated at 1 wei per update + buffer
 *                (Pyth's getUpdateFee returns a few thousand wei in practice; we
 *                pad with 0.0001 ETH ceiling since the contract refunds excess).
 *
 * Throws if Hermes is unreachable or returns malformed data — callers should
 * surface this to UI ("price feed unavailable, try again").
 */
export async function fetchPriceUpdate(
  feedIds: readonly string[],
): Promise<{ updateData: `0x${string}`[] }> {
  if (feedIds.length === 0) {
    throw new Error('fetchPriceUpdate: no feed ids');
  }

  const params = new URLSearchParams();
  for (const id of feedIds) {
    // Hermes accepts ids with or without 0x prefix; we send without for safety.
    params.append('ids[]', id.startsWith('0x') ? id.slice(2) : id);
  }
  params.set('encoding', 'hex');

  const res = await fetch(`${HERMES_URL}/v2/updates/price/latest?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`Hermes returned ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  // Response shape: { binary: { encoding: "hex", data: [ "<hex>", ... ] }, parsed: [...] }
  // We only need the binary blobs to forward to the contract.
  const hexBlobs: string[] = data?.binary?.data ?? [];
  if (hexBlobs.length === 0) {
    throw new Error('Hermes returned no price updates');
  }

  const updateData = hexBlobs.map((s): `0x${string}` =>
    s.startsWith('0x') ? (s as `0x${string}`) : (`0x${s}` as `0x${string}`),
  );

  // Pyth update fee on Base Sepolia is typically a few wei per update.
  // We pad to 0.001 ETH per update — the VeloPerps contract refunds the excess
  // automatically. This generous buffer eliminates "Internal JSON-RPC error"
  // reverts caused by fee underestimation during gas-price volatility.
  // DO NOT estimate the fee here.
  // The VeloPerps contract enforces msg.value == getUpdateFee(updateData) exactly.
  // Any difference (even 1 wei) reverts with PythFeeMismatch.
  // Fee is computed on-chain in veloPerpsService via getExactPythFee().

  return { updateData };
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
