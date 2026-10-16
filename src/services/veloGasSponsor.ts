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
// The sponsor route is /api/sponsor-eth through Cloudflare/Supabase — it sends 0.005 ETH from
// the project's sponsor wallet to the burner. Rate-limited per address on the
// server side.

import type { Address, PublicClient } from 'viem';
import { waitForSuccessfulReceipt } from './tradeReceipts';

/** Minimum ETH the burner should hold before any tx. 0.003 ETH covers
 *  faucet mint + username claim + several trades at Base Sepolia gas prices. */
export const MIN_BURNER_GAS_WEI = 3_000_000_000_000_000n; // 0.003 ETH

/** What the sponsor server tops up to in a single call (matches api/sponsor-eth.ts). */
export const SPONSOR_TOP_UP_WEI = 10_000_000_000_000_000n; // 0.01 ETH

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
 * Returns a failure without signing anything if funding cannot be confirmed.
 * Already funded wallets never depend on the sponsor's availability.
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
    return { ok: false, reason: 'Unable to check Base Sepolia gas balance. Retry when the network is available.' };
  }
  if (currentBalance >= min) {
    return { ok: true, reason: 'already sufficient' };
  }

  try {
    const resp = await fetch('/api/sponsor-eth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ burnerAddress }),
      signal: AbortSignal.timeout(45000),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return { ok: false, reason: data?.error || `sponsor returned ${resp.status}` };
    }
    if (data?.txHash) {
      // Wait for the top-up to actually mine so the next tx sees the new balance
      await waitForSuccessfulReceipt(publicClient, data.txHash);
      return { ok: true, txHash: data.txHash };
    }
    if (data?.reason === 'Already funded') return { ok: true, reason: 'already sufficient' };
    return { ok: false, reason: 'Gas funding has not been confirmed. Retry in a moment.' };
  } catch (e: any) {
    return { ok: false, reason: e?.message || 'sponsor request failed' };
  }
}

export async function requireBurnerGas(publicClient: PublicClient, address: Address) {
  const result = await ensureBurnerGas(publicClient, address);
  if (!result.ok) throw new Error(result.reason || 'Testnet gas funding is unavailable. Please retry.');
  return result;
}
