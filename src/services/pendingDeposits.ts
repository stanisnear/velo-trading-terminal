// ═══════════════════════════════════════════════════════════════════════════════
// PENDING DEPOSIT STORE
//
// Tracks on-chain Orderly vault deposits across page reloads so a user can
// always see what's still settling — even if they close the onboarding modal.
//
// State machine:
//   PENDING_CONFIRM        → tx submitted, waiting for block inclusion
//   CONFIRMED_AWAITING_CREDIT → tx mined on-chain, waiting for Orderly to credit
//   CREDITED               → orderly trading balance increased — done
//   FAILED                 → tx reverted or timed out (>10 min uncredited)
//
// Stored in localStorage keyed by burner address so multi-account users don't
// see each other's deposits.
// ═══════════════════════════════════════════════════════════════════════════════

import { useEffect, useState, useCallback } from 'react';

export type PendingDepositStatus =
  | 'PENDING_CONFIRM'
  | 'CONFIRMED_AWAITING_CREDIT'
  | 'CREDITED'
  | 'FAILED';

export interface PendingDeposit {
  id:          string;          // unique — usually the depositTx hash
  burnerAddress: string;        // who's depositing (lowercased)
  amount:      number;          // USDC in human units
  approveTx?:  `0x${string}`;
  depositTx?:  `0x${string}`;
  submittedAt: number;          // ms epoch
  status:      PendingDepositStatus;
  errorMsg?:   string;
  /** Orderly balance at the moment the deposit was submitted — used to detect
   *  the credit (we wait until balance > balanceBefore + amount * 0.99). */
  balanceBefore: number;
}

const STORAGE_KEY = 'velo_pending_deposits';
const MAX_STALE_MS = 10 * 60 * 1000; // 10 minutes uncredited → mark FAILED

type Listener = (deposits: PendingDeposit[]) => void;
const listeners = new Set<Listener>();

function readAll(): PendingDeposit[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function writeAll(deposits: PendingDeposit[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(deposits));
    listeners.forEach(l => l(deposits));
  } catch { /* quota or disabled */ }
}

/** Insert or replace a pending deposit. */
export function upsertPendingDeposit(d: PendingDeposit): void {
  const all = readAll();
  const idx = all.findIndex(x => x.id === d.id);
  if (idx >= 0) all[idx] = d; else all.unshift(d);
  // Keep only the most recent 20 (across all addresses) to avoid unbounded storage
  writeAll(all.slice(0, 20));
}

export function updatePendingDeposit(id: string, patch: Partial<PendingDeposit>): void {
  const all = readAll();
  const idx = all.findIndex(x => x.id === id);
  if (idx < 0) return;
  all[idx] = { ...all[idx], ...patch };
  writeAll(all);
}

export function removePendingDeposit(id: string): void {
  writeAll(readAll().filter(d => d.id !== id));
}

export function getPendingDeposits(burnerAddress?: string): PendingDeposit[] {
  const all = readAll();
  if (!burnerAddress) return all;
  const lc = burnerAddress.toLowerCase();
  return all.filter(d => d.burnerAddress.toLowerCase() === lc);
}

/** React hook: subscribe to deposits for a given burner address. */
export function usePendingDeposits(burnerAddress?: string | null): PendingDeposit[] {
  const [deposits, setDeposits] = useState<PendingDeposit[]>(() =>
    burnerAddress ? getPendingDeposits(burnerAddress) : []);

  useEffect(() => {
    const handler: Listener = (all) => {
      if (!burnerAddress) { setDeposits([]); return; }
      const lc = burnerAddress.toLowerCase();
      setDeposits(all.filter(d => d.burnerAddress.toLowerCase() === lc));
    };
    listeners.add(handler);
    handler(readAll()); // initial sync
    return () => { listeners.delete(handler); };
  }, [burnerAddress]);

  return deposits;
}

/** Mark deposits older than MAX_STALE_MS that are still uncredited as FAILED. */
export function reapStaleDeposits(): void {
  const now = Date.now();
  const all = readAll();
  let changed = false;
  for (const d of all) {
    if ((d.status === 'PENDING_CONFIRM' || d.status === 'CONFIRMED_AWAITING_CREDIT')
        && now - d.submittedAt > MAX_STALE_MS) {
      d.status = 'FAILED';
      d.errorMsg = d.errorMsg || 'Timed out waiting for credit (>10 min). Funds may still arrive — check Orderly portfolio.';
      changed = true;
    }
  }
  if (changed) writeAll(all);
}

/** Has this user already had any credited deposit? Used to decide whether to
 *  show "Welcome" vs "Top up" framing. */
export function hasEverCreditedDeposit(burnerAddress: string): boolean {
  return getPendingDeposits(burnerAddress).some(d => d.status === 'CREDITED');
}

/** Hook: returns the count of in-flight (not yet credited or failed) deposits
 *  so a header pill can render conditionally. */
export function usePendingDepositCount(burnerAddress?: string | null): number {
  const deposits = usePendingDeposits(burnerAddress);
  return deposits.filter(d => d.status === 'PENDING_CONFIRM' || d.status === 'CONFIRMED_AWAITING_CREDIT').length;
}
