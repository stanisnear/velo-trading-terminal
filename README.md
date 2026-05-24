# Velo — SocialFi Perpetual Futures, Live On-Chain

> **Trade real perps. Build a verifiable track record. Copy traders you trust.**
> Velo pairs a polished trading terminal with a social layer where every PnL number is on-chain, every signal is provable, and every action is auditable on a public ledger.

---

## Why Velo Exists

Most "social trading" platforms ask you to trust screenshots. Most DEX terminals are built for power users who already know what TWAP and funding rate mean. Velo bridges both:

- **Verifiable PnL.** Every trade settles through Orderly Network's on-chain order book on Base. The leaderboard is not a marketing rank — it is a derivable function of public state.
- **A real onboarding ramp.** New users can explore the full terminal in demo mode, then graduate to live trading by connecting a wallet — without rebuilding muscle memory.
- **Non-custodial by construction.** A per-user "Velo Wallet" (burner key) is generated client-side and bound to the user's primary wallet via EIP-712 signature. The user holds the keys; Velo holds none.

This architecture matters because the trader-discovery problem in DeFi is unsolved: you can read a wallet's history, but you cannot follow it, message it, or copy from it without leaving the dApp. Velo collapses that loop into one surface.

---

## Two Environments, One Terminal

Velo enforces a strict split between **demo** and **live** modes. The split is determined entirely by registration method — no toggles, no ambiguity.

### Demo Mode (Email / Supabase signup)

- Full trading UI, all 15 pairs visible, simulated $10k starting balance.
- Browse Markets, Social, Leaderboard tabs as a spectator.
- Cannot post, comment, like, follow, repost, or copy-trade — every interactive action prompts wallet connection.
- Cannot appear on the leaderboard — wallet-backed PnL is the leaderboard's sole eligibility criterion.
- Useful for: product evaluation, judging UX, testing strategies before risking capital.

### Live Mode (Crypto wallet connect)

- Trades only the eight pairs supported by Orderly testnet (BTC, ETH, SOL, AVAX, LINK, DOGE, NEAR, INJ — all `/USDC`).
- All orders route through Orderly Network's matching engine. Fills, positions, balances, and PnL come from on-chain state.
- Full social privileges: post, comment, like, follow, repost, copy-trade, leaderboard eligibility.
- Deposit/withdraw flows interact with the Orderly vault on Base Sepolia. Each USDC movement emits an on-chain transaction with a verifiable BaseScan link.

The login screen makes the choice explicit. There is no path from demo to live other than connecting a wallet — and there is no path from live to demo either. This boundary keeps the leaderboard honest.

---

## Core Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                       Velo Frontend (React 19)                   │
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │  Demo path   │  │  Live path   │  │   Shared UI shell    │   │
│  │  Supabase    │  │  Wagmi +     │  │   Tailwind + custom  │   │
│  │  $10k sim    │  │  Burner key  │  │   brand system       │   │
│  └──────┬───────┘  └──────┬───────┘  └──────────────────────┘   │
│         │                 │                                       │
└─────────┼─────────────────┼───────────────────────────────────────┘
          │                 │
          ▼                 ▼
   ┌─────────────┐   ┌──────────────────┐
   │  Supabase   │   │  Orderly Network │
   │  Postgres   │   │  REST + WS       │  ──→  Base Sepolia (USDC vault)
   │  + Realtime │   │  ED25519 signed  │
   └─────────────┘   └──────────────────┘
```

### The "Velo Wallet" pattern

When a user connects their primary wallet (MetaMask, Rabby, etc.), Velo generates a deterministic ED25519 keypair derived from a one-time EIP-712 signature. This burner is the **trading key**:

1. **Owner key** (MetaMask / Rabby) — controls deposits, withdrawals, and key registration.
2. **Trading key** (Velo Wallet, ED25519) — signs every Orderly request: place order, cancel, query positions.

The trading key is stored in the user's localStorage, encrypted only by the browser's same-origin policy. It can place orders but cannot move funds out of the Orderly vault — only the owner key can authorize a withdrawal. If the trading key is ever compromised, the user re-derives a new one from their owner wallet and revokes the old one.

This pattern (popularized by dYdX v3) means users don't need to sign every order in MetaMask — trading feels native — while custody remains in the owner wallet.

### Orderly integration

- **REST API** — `https://testnet-api-evm.orderly.org` for order placement, cancellation, position/balance queries.
- **WebSocket** — `wss://testnet-ws-evm.orderly.org` for real-time order book updates per symbol.
- **Symbol mapping** — Velo pairs (`BTC/USD`, `ETH/USD`, …) map to Orderly's `PERP_BTC_USDC` format internally.
- **Vault contract** — USDC deposits go to Orderly's vault on Base Sepolia. Each deposit emits two transactions: `approve` (USDC) and `depositTo` (vault).

### Supabase layer

Demo users live entirely in Supabase. Their balance, trade history, posts, follows, and likes are managed via Postgres + Realtime subscriptions. Wallet users *also* use Supabase for the social layer (posts, comments, follows, profile data) but their **trading state** is sourced exclusively from Orderly.

Database schema is in `SUPABASE_SCHEMA.sql`. Key tables: `users`, `transactions`, `trade_history`, `positions`, `posts`, `comments`, `follows`, `notifications`. The `transactions` table includes `on_chain`, `tx_hash`, and `withdraw_nonce` columns to record proof-of-payment for live deposits/withdrawals.

---

## Feature Surface

### Trading

- Market and Limit orders with adjustable leverage (1×–50× depending on pair).
- Isolated and Cross margin modes. Cross-pool health indicator on the positions panel.
- Take-profit and stop-loss orders, attachable at order time or editable on an open position.
- Real-time liquidation price preview that updates as the user drags the leverage slider.
- Position details modal showing entry, mark, PnL, ROE, liquidation buffer, margin mode, opened-at, duration, position ID, and (for live trades) Orderly order ID + BaseScan link to the underlying transaction.

### Order book

- Live depth from Orderly's WebSocket stream — bucketing adjusts to price magnitude (1c grid for SOL, 10c for ETH, $1 for BTC, etc.).
- 7-row depth on desktop, 6 on mobile, with cumulative size bars and color-coded bid/ask.
- Synthetic fallback when the WebSocket disconnects, so the UI never goes blank.

### Chart

- TradingView lightweight charts with multiple timeframes (1m, 5m, 15m, 1h, 4h, 1d, 1w).
- Chart styles: candles, area, line, bars.
- Indicators: SMA, EMA, RSI, MACD, Bollinger Bands.
- Overlays: entry line, take-profit line, stop-loss line, liquidation line — toggle from the chart toolbar.
- Price feed currently sources from CoinGecko for klines; the live mark price for Orderly pairs comes from the Orderly WebSocket. Migration to a fully Orderly-sourced chart feed is a near-term roadmap item.

### Social

- Posts can include a trade signal (pair, side, leverage, target). The signal is renderable as a one-tap copy button on the post card.
- Comments, likes, reposts, follows. Realtime fan-out via Supabase channels.
- Profile pages with PnL stats, follower count, and trade history.
- Token pages: `$BTC`, `$ETH`, etc. — aggregate posts mentioning a ticker and surface live price.
- Mention notifications: typing `@handle` in a post or comment notifies the user.

### Leaderboard

- Sorted by realized PnL across selectable windows (24H, 7D, 30D, ALL).
- Wallet-only — demo users never appear, and the leaderboard never shows simulated PnL.
- One-tap follow / copy-trade buttons. Copying creates a mirrored position with proportional sizing.

### Dashboard

- Total equity = Velo Wallet (Orderly) balance + free Supabase balance + locked margin + unrealized PnL.
- Recent activity feed unifies deposits, withdrawals, opens, closes, pending deposits — every row is clickable for details.
- Pending deposit pill shows live status (Pending → Settling → Credited) and links directly to BaseScan.
- Win rate, realized PnL, copying status, and signal stats panels.

### Onboarding

- One modal flow that registers the trading key on Orderly (one signature), sponsors a small ETH dust for gas (server-side relayer), and claims 1,000 testnet USDC from the Orderly faucet.
- Resumable: closing the modal mid-flow doesn't burn the user's progress; reopening restores state without re-claiming the faucet.
- The faucet credit is recorded as a `DEPOSIT` transaction with an "Orderly Faucet" provenance link in the dashboard.

---

## Project Structure

```
velo-trading-terminal/
├── api/                              # Vercel serverless functions
│   ├── faucet.ts                     # Proxies Orderly testnet USDC faucet
│   ├── gas-sponsor.ts                # Server-paid gas for new burner wallets
│   ├── sponsor-status.ts             # Status check for the sponsor relayer
│   └── usdc-sponsor.ts               # Sponsored USDC top-up
├── src/
│   ├── App.tsx                       # Root — auth, routing, state coordination
│   ├── components/
│   │   ├── OrderBook.tsx             # Live + synthetic depth ladder
│   │   ├── OrderlyOnboardingModal.tsx
│   │   ├── DepositWithdrawModal.tsx  # Orderly vault deposit + withdraw
│   │   ├── TradingViewChart.tsx
│   │   ├── AuthModal.tsx
│   │   ├── SettingsModal.tsx
│   │   ├── VeloWalletPanel.tsx
│   │   └── ui/
│   │       ├── pages/
│   │       │   ├── Dashboard.tsx
│   │       │   ├── TradeView.tsx
│   │       │   └── MarketsView.tsx
│   │       └── OrderDetailsModal.tsx # Position / history / transaction details
│   ├── services/
│   │   ├── orderlyService.ts         # Orderly REST: keys, orders, balance, positions
│   │   ├── orderlyOrderbookStream.ts # Orderly WebSocket: order book stream
│   │   ├── useOrderlyTrading.ts      # React hook coordinating Orderly state
│   │   ├── burnerOrderly.ts          # Burner wallet ↔ Orderly bridge
│   │   ├── veloBurnerWallet.ts       # ED25519 burner derivation + storage
│   │   ├── pendingDeposits.ts        # Pending deposit lifecycle
│   │   ├── supabaseStore.ts          # Supabase data access layer
│   │   ├── orderEngine.ts            # Demo-mode trade simulation
│   │   ├── priceService.ts           # CoinGecko price feed (demo + chart klines)
│   │   ├── web3Auth.ts               # Wallet-based auth via Supabase
│   │   └── web3Config.ts             # Wagmi config (Base Sepolia)
│   ├── styles/
│   │   ├── velo-brand-system.css     # Brand tokens, typography, motion
│   │   ├── tokens.css                # Color + spacing scales
│   │   └── brand.css                 # Component-level brand utilities
│   └── utils/
│       └── types.ts                  # Shared TypeScript types + PAIRS / ORDERLY_PAIRS
├── SUPABASE_SCHEMA.sql               # Postgres schema, RLS policies, RPCs
├── VELO_WALLET_GUIDE.md              # User-facing onboarding doc
├── FAUCET_SETUP.md                   # Faucet relayer setup
└── package.json
```

---

## Local Development

```bash
git clone <repo>
cd velo-trading-terminal
npm install
cp .env.example .env.local            # fill in keys, see below
npm run dev                           # Vite dev server on :5173
```

### Environment variables

```
# Supabase (required)
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>

# WalletConnect (required for live mode)
VITE_WALLETCONNECT_PROJECT_ID=<project id>

# Orderly (testnet defaults are baked in; override only if pointing elsewhere)
VITE_ORDERLY_API=https://testnet-api-evm.orderly.org
VITE_ORDERLY_WS=wss://testnet-ws-evm.orderly.org
VITE_ORDERLY_BROKER_ID=woofi_dex

# Server-side relayer (Vercel functions)
ORDERLY_SPONSOR_PRIVATE_KEY=<hex>     # funds new burner wallets with dust ETH
SUPABASE_SERVICE_ROLE_KEY=<key>       # used by the faucet endpoint to log credits
```

### Database setup

Apply `SUPABASE_SCHEMA.sql` to your Supabase Postgres instance. It creates the tables, row-level-security policies, and the `adjust_balance` RPC used for atomic balance writes.

---

## Roadmap

### Trading

- ✅ Orderly testnet integration — orders, positions, balance, order book.
- ✅ Burner-key onboarding with one-signature registration.
- ✅ Strict demo / live environment split.
- ⏳ Mainnet migration (Arbitrum or Base mainnet, pending Orderly broker registration).
- ⏳ Conditional orders (TWAP, trailing stop, scaled entry).
- ⏳ Funding rate display + historical chart.
- ⏳ Native chart price feed sourced from Orderly (replacing CoinGecko klines for live pairs).

### Capital movement

- ⏳ LayerZero / CCTP bridge for cross-chain USDC deposits.
- ⏳ Velo ↔ Velo internal transfers (zero-fee, instant — useful for copy-trade settlement).
- ⏳ Withdraw flow polish: gas estimation, ETA preview, status toasts.

### Social

- ✅ Posts, comments, likes, follows, reposts, copy-trade.
- ✅ Trade-signal posts with one-tap copy.
- ✅ Mentions and notifications.
- ⏳ Group chats / DMs.
- ⏳ Verified-PnL badges (cryptographic proof tied to a wallet).
- ⏳ Trader profile widgets embeddable on Twitter / Lens / Farcaster.

### Infrastructure

- ⏳ Server-sent events fallback for environments where WebSocket is blocked.
- ⏳ Sentry / OpenTelemetry tracing on order placement and deposit flows.
- ⏳ E2E tests (Playwright) covering both environments.

---

## Tech Stack

- **Frontend:** React 19, Vite 6, TypeScript 5.8, Tailwind, lightweight-charts.
- **Wallet:** wagmi v2 + viem, RainbowKit/WalletConnect.
- **Trading backend:** Orderly Network (testnet) — REST + WebSocket.
- **Custody:** ED25519 burner key, EIP-712 signature derivation, localStorage persistence.
- **Data layer:** Supabase (Postgres + Realtime + Auth).
- **Hosting:** Vercel (frontend + serverless functions).
- **Chain:** Base Sepolia for testnet vault interactions.

---

## License

Proprietary. All rights reserved. Contact the team for licensing inquiries.

---

## Acknowledgments

Velo is built on the work of several teams whose tooling makes this possible:

- **Orderly Network** — for the on-chain order book and the perp matching engine.
- **Base** — for the L2 settlement layer.
- **Supabase** — for instant Postgres + auth + realtime.
- **TradingView** — for the lightweight-charts library.

---

*Velo — where every position is a public commitment, and every leaderboard rank is mathematically derivable.*
