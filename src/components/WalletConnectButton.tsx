// src/components/WalletConnectButton.tsx
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount } from 'wagmi';

interface WalletConnectButtonProps {
  compact?: boolean;
  onOpenAuthModal?: () => void; // called when user clicks Connect before wallet is connected
}

export function WalletConnectButton({ compact = false, onOpenAuthModal }: WalletConnectButtonProps) {
  return (
    <ConnectButton.Custom>
      {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
        const ready = mounted;
        const connected = ready && account && chain;

        return (
          <div
            {...(!ready && {
              'aria-hidden': true,
              style: { opacity: 0, pointerEvents: 'none', userSelect: 'none' },
            })}
          >
            {(() => {
              if (!connected) {
                return (
                  <button
                    onClick={() => {
                      // Open the Velo auth modal (which has the RainbowKit button inside)
                      // so users see the full onboarding flow
                      if (onOpenAuthModal) {
                        onOpenAuthModal();
                      } else {
                        openConnectModal();
                      }
                    }}
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

              if (chain.unsupported) {
                return (
                  <button
                    onClick={openChainModal}
                    style={{
                      background: 'oklch(0.66 0.22 25 / 0.15)',
                      border: '1px solid oklch(0.66 0.22 25 / 0.4)',
                      borderRadius: '8px',
                      color: 'var(--pnl-down)',
                      cursor: 'pointer',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '11px',
                      fontWeight: 700,
                      padding: '6px 12px',
                      letterSpacing: '0.04em',
                    }}
                  >
                    Wrong network
                  </button>
                );
              }

              return (
                <button
                  onClick={openAccountModal}
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
                  {account.displayName}
                </button>
              );
            })()}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}

// Hook for reading wallet state anywhere in the app
export function useWalletState() {
  const { address, isConnected, chain } = useAccount();
  return {
    walletAddress: address ?? null,
    isWalletConnected: isConnected,
    isCorrectChain: chain?.id === 84532, // Base Sepolia
    shortAddress: address
      ? `${address.slice(0, 6)}…${address.slice(-4)}`
      : null,
  };
}
