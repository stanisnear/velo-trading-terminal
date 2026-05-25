// veloGasSponsor.ts
//
// Centralised gas-sponsor pre-flight. Any tx that uses the burner trading wallet
// should call ensureBurnerGas() first so we top up if balance is low.
//
// Why centralise: previously only open-position pre-flighted. Username claim,
// send, close, manage-margin, etc. all used the burner without checking, so
// they'd surface the cryptic "exceeds the balance" revert from viem when the
// burner ran out.
//
// The sponsor route is /api/sponsor-eth on Vercel — it sends 0.005 ETH from
// the project's sponsor wallet to the burner. Rate-limited per address on the
// server side.

import type { Address, PublicClient } from 'viem';

/** Minimum ETH the burner should hold before any tx. 0.0015 ETH covers
 *  even multi-step trades (approve + open + pyth fee). */
export const MIN_BURNER_GAS_WEI = 1_500_000_000_000_000n; // 0.0015 ETH

/** What the sponsor server tops up to in a single call (matches api/sponsor-eth.ts). */
export const SPONSOR_TOP_UP_WEI = 5_000_000_000_000_000n; // 0.005 ETH

export interface SponsorResult {
  /** True if the wallet was topped up (or didn't need one). False if it failed. */
  ok: boolean;
  /** Sponsor tx hash if a top-up actually happened. */
  txHash?: `0x${string}`;
  /** Reason it didn't happen, if any. Useful for surfacing UI messages. */
  reason?: string;
}

/**
 * Pre-flight: ensure the burner has enough ETH for an upcoming tx. If not,
 * call the sponsor endpoint and wait for the top-up to mine before returning.
 *
 * Never throws — if the sponsor is down, returns { ok: false, reason }. The
 * caller proceeds anyway and viem will surface the gas error if there really
 * isn't enough. This is by design: we don't want a sponsor outage to block
 * legit trades when the burner already has enough gas from previous top-ups.
 */
export async function ensureBurnerGas(
  publicClient: PublicClient,
  burnerAddress: Address,
  options: { minWei?: bigint } = {},
): Promise<SponsorResult> {
  const min = options.minWei ?? MIN_BURNER_GAS_WEI;
  let currentBalance: bigint;
  try {
    currentBalance = await publicClient.getBalance({ address: burnerAddress });
  } catch (e: any) {
    return { ok: true, reason: 'balance read failed — proceeding' };
  }
  if (currentBalance >= min) {
    return { ok: true, reason: 'already sufficient' };
  }

  try {
    const resp = await fetch('/api/sponsor-eth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ burnerAddress }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return { ok: false, reason: data?.error || `sponsor returned ${resp.status}` };
    }
    if (data?.txHash) {
      // Wait for the top-up to actually mine so the next tx sees the new balance
      await publicClient.waitForTransactionReceipt({ hash: data.txHash });
      return { ok: true, txHash: data.txHash };
    }
    return { ok: true, reason: 'sponsor ok but no txHash returned' };
  } catch (e: any) {
    return { ok: false, reason: e?.message || 'sponsor request failed' };
  }
}
