// src/components/WalletConnectButton.tsx
//
// Connect button in the navbar.
// "Connect Wallet" opens Reown AppKit directly.
// After wallet connects, App.tsx checks Supabase:
//   - Existing account → silent login, no modal
//   - New account → VeloOnboardingModal opens at USERNAME step
import { useAccount, useSwitchChain } from 'wagmi';
import { useAppKit } from '@reown/appkit/react';

interface WalletConnectButtonProps {
  compact?: boolean;
  onOpenAuthModal?: () => void;
  /** Wallet can be connected while the Supabase session has expired. When
   *  false, we show a 'Sign in' affordance instead of the address chip, so a
   *  half-authenticated user is never stranded with a dead button. */
  isAuthed?: boolean;
  onOpenSettings?: () => void;
}

export function WalletConnectButton({ compact = false, onOpenAuthModal, onOpenSettings, isAuthed = true }: WalletConnectButtonProps) {
  const { address, isConnected, chain } = useAccount();
  const { switchChain, isPending: isSwitchingChain } = useSwitchChain();
  const { open: openAppKit } = useAppKit();

  if (!isConnected || !address) {
    return (
      <button
        onClick={() => openAppKit()}
        style={{
          background: 'linear-gradient(100deg, oklch(0.68 0.22 295), oklch(0.70 0.22 340), oklch(0.80 0.14 205))',
          backgroundSize: '220% 100%',
          animation: 'holoSlide 9s linear infinite',
          border: 'none',
          borderRadius: '8px',
          color: '#0B0B0E',
          cursor: 'pointer',
          fontFamily: 'var(--font-mono)',
          fontSize: compact ? '11px' : '12px',
          fontWeight: 700,
          padding: compact ? '5px 11px' : '7px 14px',
          whiteSpace: 'nowrap',
          letterSpacing: '0.04em',
        }}
      >
        {compact ? '⬡ Connect' : '⬡ Connect Wallet'}
      </button>
    );
  }

  const isCorrectChain = chain?.id === 84532;
  if (!isCorrectChain) {
    return (
      <button
        onClick={() => switchChain({ chainId: 84532 })}
        disabled={isSwitchingChain}
        style={{
          background: 'oklch(0.66 0.22 25 / 0.15)',
          border: '1px solid oklch(0.66 0.22 25 / 0.4)',
          borderRadius: '8px',
          color: 'var(--pnl-down)',
          cursor: isSwitchingChain ? 'wait' : 'pointer',
          fontFamily: 'var(--font-mono)',
          fontSize: '11px',
          fontWeight: 700,
          padding: '6px 12px',
          letterSpacing: '0.04em',
          opacity: isSwitchingChain ? 0.6 : 1,
        }}
      >
        {isSwitchingChain ? 'Switching…' : 'Switch to Base Sepolia'}
      </button>
    );
  }

  // Wallet connected, correct chain, but the app session is gone (expired JWT,
  // cleared storage, etc.). Clicking the address chip used to open Settings and
  // do nothing useful — the classic "logged in but not really" dead-end. Offer
  // an explicit re-auth instead; onOpenAuthModal runs the silent wallet sign-in.
  if (!isAuthed) {
    return (
      <button
        onClick={() => onOpenAuthModal?.()}
        style={{
          background: 'linear-gradient(100deg, oklch(0.68 0.22 295), oklch(0.70 0.22 340), oklch(0.80 0.14 205))',
          backgroundSize: '220% 100%', animation: 'holoSlide 9s linear infinite',
          border: 'none', borderRadius: '8px', color: '#0B0B0E', cursor: 'pointer',
          fontFamily: 'var(--font-mono)', fontSize: compact ? '11px' : '12px', fontWeight: 700,
          padding: compact ? '5px 11px' : '7px 14px', whiteSpace: 'nowrap', letterSpacing: '0.04em',
          display: 'flex', alignItems: 'center', gap: 6,
        }}
        title={`Wallet connected (${address.slice(0,6)}…${address.slice(-4)}) — sign in to continue`}
      >
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'oklch(0.80 0.16 85)', boxShadow: '0 0 6px oklch(0.80 0.16 85)', flexShrink: 0 }} />
        Sign in
      </button>
    );
  }

  return (
    <button
      onClick={() => onOpenSettings?.()}
      style={{
        background: 'var(--chip-bg, rgba(255,255,255,0.05))',
        border: '1px solid var(--hairline-strong, rgba(255,255,255,0.1))',
        borderRadius: '8px',
        color: 'var(--fg)',
        cursor: 'pointer',
        fontFamily: 'var(--font-mono)',
        fontSize: '11px',
        fontWeight: 600,
        padding: '5px 10px',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        letterSpacing: '0.02em',
        transition: 'border-color 0.15s',
      }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--iris-violet)')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--hairline-strong, rgba(255,255,255,0.1))')}
    >
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'oklch(0.78 0.18 150)', boxShadow: '0 0 6px oklch(0.78 0.18 150)', flexShrink: 0 }} />
      {address.slice(0, 6)}…{address.slice(-4)}
    </button>
  );
}

export function useWalletState() {
  const { address, isConnected, chain } = useAccount();
  return {
    walletAddress: address ?? null,
    isWalletConnected: isConnected,
    isCorrectChain: chain?.id === 84532,
    shortAddress: address ? `${address.slice(0, 6)}…${address.slice(-4)}` : null,
  };
}
