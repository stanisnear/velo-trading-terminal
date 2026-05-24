// ═══════════════════════════════════════════════════════════════════════════════
// DEPOSIT / WITHDRAW MODAL — post-onboarding
// Lets an already-active Orderly user top up or withdraw USDC from the vault.
// Each action fires its own MetaMask prompt — deposits need an on-chain tx
// (approve + deposit if allowance is insufficient, else just deposit); withdraws
// need a gasless EIP-712 signature.
// ═══════════════════════════════════════════════════════════════════════════════

import React, { useEffect, useState } from 'react';
import {
  useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt,
  useBalance, useSignTypedData,
} from 'wagmi';
import { parseUnits, formatUnits } from 'viem';
import {
  ArrowDownCircle, ArrowUpCircle, CheckCircle, AlertCircle, Loader2, X, Zap,
  ExternalLink, ArrowRight, Wallet,
} from 'lucide-react';
import {
  USDC_BASE_SEPOLIA,
  ORDERLY_VAULT_ADDRESS,
  baseScanTxUrl,
  OrderlyKeypair,
  ORDERLY_VAULT_ABI,
  buildDepositData,
} from '../services/orderlyService';

const ERC20_ABI = [
  { name: 'approve',   type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] },
  { name: 'balanceOf', type: 'function', stateMutability: 'view',       inputs: [{ name: 'account', type: 'address' }],                                      outputs: [{ type: 'uint256' }] },
  { name: 'allowance', type: 'function', stateMutability: 'view',       inputs: [{ name: 'owner',   type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ type: 'uint256' }] },
] as const;

const VAULT_ABI = ORDERLY_VAULT_ABI;

export type DepositWithdrawMode = 'DEPOSIT' | 'WITHDRAW';

interface Props {
  isOpen:     boolean;
  mode:       DepositWithdrawMode;
  onClose:    () => void;
  keypair:    OrderlyKeypair | null;
  orderlyBalance: number;
  onWithdraw: (amount: number, sign: (p: any) => Promise<`0x${string}`>) => Promise<{ success: boolean; withdrawNonce?: number; error?: string }>;
  onDepositComplete?: (txHash: string, amountUSDC: number) => void;
  onWithdrawComplete?: (amountUSDC: number, withdrawNonce: number) => void;
}

const S = {
  mono:    { fontFamily: 'var(--font-mono)' } as React.CSSProperties,
  display: { fontFamily: 'var(--font-display)', fontStyle: 'italic' as const, letterSpacing: '-0.02em' } as React.CSSProperties,
  label:   { fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.12em', color: 'var(--fg-subtle)' } as React.CSSProperties,
  sans:    { fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--fg-muted)', lineHeight: 1.6 } as React.CSSProperties,
};

const btnPrimary = (disabled?: boolean): React.CSSProperties => ({
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  width: '100%', padding: '13px', borderRadius: 12, border: 'none',
  background: disabled ? 'var(--chip-bg)' : 'var(--iris-violet)',
  color: disabled ? 'var(--fg-subtle)' : '#fff',
  cursor: disabled ? 'not-allowed' : 'pointer',
  fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700,
  letterSpacing: '0.07em', textTransform: 'uppercase', opacity: disabled ? 0.6 : 1,
});

export const DepositWithdrawModal: React.FC<Props> = ({
  isOpen, mode, onClose, keypair, orderlyBalance, onWithdraw,
  onDepositComplete, onWithdrawComplete,
}) => {
  const { address }            = useAccount();
  const { signTypedDataAsync } = useSignTypedData();

  const [amount,    setAmount]    = useState('100');
  const [busy,      setBusy]      = useState(false);
  const [error,     setError]     = useState('');
  const [status,    setStatus]    = useState('');
  const [approveTxHash, setApproveTxHash] = useState<`0x${string}` | undefined>();
  const [depositTxHash, setDepositTxHash] = useState<`0x${string}` | undefined>();
  const [withdrawDone,  setWithdrawDone]  = useState(false);

  useEffect(() => {
    if (isOpen) {
      setAmount('100'); setError(''); setStatus(''); setBusy(false);
      setApproveTxHash(undefined); setDepositTxHash(undefined); setWithdrawDone(false);
    }
  }, [isOpen, mode]);

  // Wallet-side reads
  const { data: ethBal } = useBalance({
    address: address as `0x${string}` | undefined,
    query: { enabled: !!address && isOpen },
  });

  const { data: walletUsdc, refetch: refetchWalletUsdc } = useReadContract({
    address: USDC_BASE_SEPOLIA as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address as `0x${string}`] : undefined,
    query: { enabled: !!address && isOpen, refetchInterval: isOpen ? 5000 : false },
  });

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: USDC_BASE_SEPOLIA as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address as `0x${string}`, ORDERLY_VAULT_ADDRESS as `0x${string}`] : undefined,
    query: { enabled: !!address && isOpen, refetchInterval: isOpen ? 5000 : false },
  });

  const { writeContractAsync: approveAsync } = useWriteContract();
  const { writeContractAsync: depositAsync } = useWriteContract();

  const { isLoading: approveConfirming, isSuccess: approveConfirmed } = useWaitForTransactionReceipt({ hash: approveTxHash });
  const { isLoading: depositConfirming, isSuccess: depositConfirmed } = useWaitForTransactionReceipt({ hash: depositTxHash });

  useEffect(() => {
    if (approveConfirmed) { refetchAllowance(); setStatus('Allowance set. Ready to deposit.'); }
  }, [approveConfirmed]);

  useEffect(() => {
    if (depositConfirmed && depositTxHash) {
      const amt = parseFloat(amount || '0');
      setStatus(''); setBusy(false);
      onDepositComplete?.(depositTxHash, amt);
    }
  }, [depositConfirmed]);

  if (!isOpen || !address) return null;

  const walletUsdcNum = walletUsdc ? parseFloat(formatUnits(walletUsdc as bigint, 6)) : 0;
  const ethNum        = ethBal ? parseFloat(formatUnits(ethBal.value, 18)) : 0;
  const amountNum     = parseFloat(amount) || 0;
  const amountWei     = amountNum > 0 ? parseUnits(amount, 6) : 0n;
  const needsApproval = mode === 'DEPOSIT' && allowance !== undefined && amountWei > (allowance as bigint);

  const canSubmit = mode === 'DEPOSIT'
    ? amountNum > 0 && amountNum <= walletUsdcNum && ethNum > 0.00005 && !busy
    : amountNum > 0 && amountNum <= orderlyBalance && !busy;

  const handleApproveThenDeposit = async () => {
    setError(''); setBusy(true);
    try {
      if (needsApproval) {
        setStatus('Opening wallet — approve USDC spend…');
        const hash = await approveAsync({
          address: USDC_BASE_SEPOLIA as `0x${string}`,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [ORDERLY_VAULT_ADDRESS as `0x${string}`, amountWei],
        });
        setApproveTxHash(hash);
        setStatus('Approval submitted — waiting for confirmation…');
        // Wait for approval on-chain before firing deposit (use a polled check)
        for (let i = 0; i < 20; i++) {
          await new Promise(r => setTimeout(r, 2000));
          const { data: fresh } = await refetchAllowance();
          if (fresh && (fresh as bigint) >= amountWei) break;
        }
      }

      setStatus('Opening wallet — confirm deposit…');
      if (!address) throw new Error('No wallet connected');
      const depositData = buildDepositData(address, amountWei);
      let fee = BigInt(0);
      try {
        const { readContract } = await import('wagmi/actions');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { config } = await import('../services/web3Config') as any;
        fee = (await readContract(config, {
          address:      ORDERLY_VAULT_ADDRESS as `0x${string}`,
          abi:          VAULT_ABI,
          functionName: 'getDepositFee',
          args:         [address as `0x${string}`, depositData],
        })) as bigint ?? BigInt(0);
      } catch { /* fee stays 0 */ }

      const dhash = await depositAsync({
        address:      ORDERLY_VAULT_ADDRESS as `0x${string}`,
        abi:          VAULT_ABI,
        functionName: 'deposit',
        args:         [depositData],
        value:        fee,
      });
      setDepositTxHash(dhash);
      setStatus('Deposit submitted — waiting for on-chain confirmation…');
      refetchWalletUsdc();
    } catch (e: any) {
      setError(e.shortMessage || e.message || 'Transaction failed');
      setStatus(''); setBusy(false);
    }
  };

  const handleWithdraw = async () => {
    if (!keypair) { setError('Orderly key missing — please re-onboard'); return; }
    setError(''); setBusy(true); setStatus('Sign the withdraw request in your wallet…');
    try {
      const res = await onWithdraw(amountNum, signTypedDataAsync as any);
      if (res.success) {
        setStatus(''); setWithdrawDone(true); setBusy(false);
        onWithdrawComplete?.(amountNum, res.withdrawNonce ?? 0);
      } else {
        setError(res.error || 'Withdraw failed'); setStatus(''); setBusy(false);
      }
    } catch (e: any) {
      setError(e.message || 'Withdraw failed'); setStatus(''); setBusy(false);
    }
  };

  const isDeposit = mode === 'DEPOSIT';
  const max       = isDeposit ? walletUsdcNum : orderlyBalance;

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 210, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(7,7,10,0.88)', backdropFilter: 'blur(24px)' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 420, background: 'var(--glass-bg-strong)', border: '1px solid var(--hairline-strong)', borderRadius: 22, overflow: 'hidden', boxShadow: 'var(--glass-shadow)', backdropFilter: 'blur(40px)' }}>

        <div style={{ height: 3, background: 'var(--holo-linear)', backgroundSize: '220% 100%', animation: 'holoSlide 9s linear infinite' }} />

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 22px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {isDeposit ? <ArrowDownCircle size={20} style={{ color: 'var(--pnl-up)' }} /> : <ArrowUpCircle size={20} style={{ color: 'var(--iris-violet)' }} />}
            <h2 style={{ ...S.display, fontSize: 20, color: 'var(--fg)', margin: 0 }}>{isDeposit ? 'Deposit USDC' : 'Withdraw USDC'}</h2>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-subtle)', padding: 4 }}><X size={18} /></button>
        </div>

        <div style={{ padding: '0 22px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Balance chips */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div style={{ padding: '10px 12px', background: 'var(--chip-bg)', borderRadius: 10, border: '1px solid var(--hairline)' }}>
              <div style={{ ...S.label, fontSize: 9 }}>Wallet USDC</div>
              <div style={{ ...S.mono, fontSize: 14, fontWeight: 700, color: 'var(--fg)', marginTop: 2 }}>{walletUsdcNum.toFixed(2)}</div>
            </div>
            <div style={{ padding: '10px 12px', background: 'var(--chip-bg)', borderRadius: 10, border: '1px solid var(--hairline)' }}>
              <div style={{ ...S.label, fontSize: 9 }}>Vault USDC</div>
              <div style={{ ...S.mono, fontSize: 14, fontWeight: 700, color: 'var(--pnl-up)', marginTop: 2 }}>{orderlyBalance.toFixed(2)}</div>
            </div>
          </div>

          {/* Amount input */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={S.label}>Amount (USDC)</span>
              <button onClick={() => setAmount(max.toFixed(2))}
                style={{ ...S.mono, fontSize: 10, fontWeight: 700, color: 'var(--iris-violet)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                MAX ({max.toFixed(2)})
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', padding: '12px 14px', background: 'var(--chip-bg)', borderRadius: 12, border: '1px solid var(--hairline)' }}>
              <input
                type="number"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
                disabled={busy}
                style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--fg)', ...S.mono, fontSize: 20, fontWeight: 700, minWidth: 0 }}
              />
              <span style={{ ...S.mono, fontSize: 13, color: 'var(--fg-subtle)', fontWeight: 700 }}>USDC</span>
            </div>
            {/* Quick-pick chips */}
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              {[25, 100, 500, 1000].map(v => (
                <button key={v} onClick={() => setAmount(String(v))}
                  style={{ flex: 1, padding: '6px 0', background: 'var(--chip-bg)', border: '1px solid var(--hairline)', borderRadius: 8, color: 'var(--fg-muted)', cursor: 'pointer', ...S.mono, fontSize: 10, fontWeight: 700 }}>
                  {v}
                </button>
              ))}
            </div>
          </div>

          {/* Info line */}
          {isDeposit ? (
            <div style={{ padding: '10px 12px', background: 'var(--chip-bg)', borderRadius: 10, border: '1px solid var(--hairline)' }}>
              <p style={{ ...S.mono, fontSize: 11, color: 'var(--fg-muted)', margin: 0, lineHeight: 1.55 }}>
                {needsApproval
                  ? '2 wallet prompts: approve + deposit. Requires Base Sepolia ETH for gas.'
                  : 'Allowance already set. 1 wallet prompt for the deposit. Requires Base Sepolia ETH for gas.'}
              </p>
              {ethNum < 0.00005 && <p style={{ ...S.mono, fontSize: 10, color: 'var(--pnl-down)', margin: '6px 0 0' }}>⚠ Low ETH balance — top up before depositing.</p>}
            </div>
          ) : (
            <div style={{ padding: '10px 12px', background: 'var(--chip-bg)', borderRadius: 10, border: '1px solid var(--hairline)' }}>
              <p style={{ ...S.mono, fontSize: 11, color: 'var(--fg-muted)', margin: 0, lineHeight: 1.55 }}>
                Gasless EIP-712 signature. USDC settles on-chain to your wallet in 2–5 minutes.
              </p>
            </div>
          )}

          {/* Tx link trail */}
          {approveTxHash && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ ...S.label, fontSize: 9 }}>Approve:</span>
              <a href={baseScanTxUrl(approveTxHash)} target="_blank" rel="noopener noreferrer"
                style={{ ...S.mono, fontSize: 10, color: 'var(--iris-violet)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <ExternalLink size={9} /> {approveTxHash.slice(0, 10)}…{approveTxHash.slice(-6)}
              </a>
              {approveConfirming && <Loader2 size={11} style={{ color: 'var(--iris-violet)', animation: 'spin 1s linear infinite' }} />}
              {approveConfirmed  && <CheckCircle size={11} style={{ color: 'var(--pnl-up)' }} />}
            </div>
          )}
          {depositTxHash && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ ...S.label, fontSize: 9 }}>Deposit:</span>
              <a href={baseScanTxUrl(depositTxHash)} target="_blank" rel="noopener noreferrer"
                style={{ ...S.mono, fontSize: 10, color: 'var(--iris-violet)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <ExternalLink size={9} /> {depositTxHash.slice(0, 10)}…{depositTxHash.slice(-6)}
              </a>
              {depositConfirming && <Loader2 size={11} style={{ color: 'var(--iris-violet)', animation: 'spin 1s linear infinite' }} />}
              {depositConfirmed  && <CheckCircle size={11} style={{ color: 'var(--pnl-up)' }} />}
            </div>
          )}

          {/* Status / error */}
          {status && !error && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px', background: 'oklch(0.68 0.22 295/0.08)', border: '1px solid oklch(0.68 0.22 295/0.2)', borderRadius: 10 }}>
              <Loader2 size={14} style={{ color: 'var(--iris-violet)', flexShrink: 0, marginTop: 1, animation: 'spin 1s linear infinite' }} />
              <span style={{ ...S.sans, fontSize: 12 }}>{status}</span>
            </div>
          )}
          {error && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px', background: 'oklch(0.66 0.22 25/0.10)', border: '1px solid oklch(0.66 0.22 25/0.25)', borderRadius: 10 }}>
              <AlertCircle size={14} style={{ color: 'var(--pnl-down)', flexShrink: 0, marginTop: 1 }} />
              <span style={{ ...S.sans, fontSize: 12, color: 'var(--pnl-down)' }}>{error}</span>
            </div>
          )}

          {/* Withdraw success */}
          {!isDeposit && withdrawDone && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'oklch(0.78 0.18 150/0.08)', border: '1px solid oklch(0.78 0.18 150/0.25)', borderRadius: 10 }}>
              <CheckCircle size={14} style={{ color: 'var(--pnl-up)' }} />
              <span style={{ ...S.mono, fontSize: 11, color: 'var(--pnl-up)' }}>Withdraw queued — settles on-chain in 2–5 min</span>
            </div>
          )}

          {/* Action button */}
          {!depositConfirmed && !withdrawDone && (
            isDeposit ? (
              <button onClick={handleApproveThenDeposit} disabled={!canSubmit} style={btnPrimary(!canSubmit)}>
                {busy
                  ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Processing…</>
                  : <><Zap size={14} /> {needsApproval ? `Approve & Deposit ${amountNum || 0} USDC` : `Deposit ${amountNum || 0} USDC`}</>
                }
              </button>
            ) : (
              <button onClick={handleWithdraw} disabled={!canSubmit} style={btnPrimary(!canSubmit)}>
                {busy
                  ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Waiting for signature…</>
                  : <><Zap size={14} /> Withdraw {amountNum || 0} USDC</>
                }
              </button>
            )
          )}
          {(depositConfirmed || withdrawDone) && (
            <button onClick={onClose} style={btnPrimary()}>
              <CheckCircle size={14} /> Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
