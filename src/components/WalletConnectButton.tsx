// src/components/WalletConnectButton.tsx
//
// Connect button used in the navbar.
//
// ──────────────────────────────────────────────────────────────────────────
// AppKit modal exposure policy (batch 7):
//
// Reown AppKit's modal is structurally incapable of showing the burner
// (trading wallet) balance — it only knows about the address returned by
// useAccount(), which is the MAIN wallet. Right after onboarding the main
// wallet is empty because the faucet mints to the BURNER, so opening the
// AppKit modal shows $0 and panics the user every time.
//
// In batch 7 we removed every post-login surface that opens the AppKit
// modal. The ONLY remaining entry point is the unauthenticated "Connect
// Wallet" flow handled by AuthModal, which uses AppKit's modal for the
// initial wallet/social-provider pick. After that, every wallet-related
// affordance routes to Velo-native UI:
//   - Connected: button opens the Velo Wallet & Settings modal (shows
//     both wallets, both balances, private key export — strictly more
//     useful than AppKit's account view).
//   - Wrong network: button calls wagmi's switchChain directly, which
//     pops the wallet's NATIVE chain switcher (browser-extension popup
//     users already know). No AppKit Networks view layered on top.
//
// AppKit stays initialized as the wagmi connection backend. We just stop
// surfacing its modal to the user.
// ──────────────────────────────────────────────────────────────────────────
import { useAccount, useSwitchChain } from 'wagmi';

interface WalletConnectButtonProps {
  compact?: boolean;
  /** Opens the Velo AuthModal (which itself triggers AppKit for sign-in). */
  onOpenAuthModal?: () => void;
  /** Opens the Velo Wallet & Settings modal — replaces AppKit's account view post-login. */
  onOpenSettings?: () => void;
}

export function WalletConnectButton({ compact = false, onOpenAuthModal, onOpenSettings }: WalletConnectButtonProps) {
  const { address, isConnected, chain } = useAccount();
  const { switchChain, isPending: isSwitchingChain } = useSwitchChain();

  if (!isConnected || !address) {
    return (
      <button
        onClick={() => onOpenAuthModal?.()}
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

  // Wrong network — wagmi's native chain switcher, NOT AppKit's Networks view.
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

  // Connected → Velo settings, NOT AppKit.
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

// Hook unchanged — used throughout App.tsx
export function useWalletState() {
  const { address, isConnected, chain } = useAccount();
  return {
    walletAddress: address ?? null,
    isWalletConnected: isConnected,
    isCorrectChain: chain?.id === 84532,
    shortAddress: address ? `${address.slice(0, 6)}…${address.slice(-4)}` : null,
  };
}
