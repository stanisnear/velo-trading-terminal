# Velo

**On-chain perpetual futures with a social trading layer.**

A polished, full-stack perpetual futures exchange where every trade is a real on-chain transaction, every position is verifiable on a block explorer, and every trader's track record is provable. Underneath the chart, an integrated social graph lets traders post, follow, copy, comment, and climb a transparent leaderboard — making Velo the first product where the trading floor and the trading community are the same room.

Live at [velo-trading-terminal.vercel.app](https://velo-trading-terminal.vercel.app).

## VELO v3 brand system

This repo now carries the VELO v3 rebrand direction: editorial calm, prismatic depth, and a tighter terminal-first UI language across desktop and mobile. The current frontend uses:

- `Fraunces` for display moments, equity heroes, and the wordmark
- `Geist` for product UI copy and controls
- `Geist Mono` for every price, balance, timestamp, and dense data surface
- A restrained violet to electric-blue prism reserved for hero CTAs, the app bug, active states, and share-card surfaces
- Shared glass, chip, nav, and mobile-bottom-bar treatments aligned to the handoff mockups

The visual source of truth for this refresh is the VELO handoff brief and mockups that shipped with the rebrand package. Functionality, wallet flow, and on-chain integrations remain unchanged; the rollout is intentionally a brand and interface pass rather than a protocol refactor.

---

## Table of contents

- [What Velo is](#what-velo-is)
- [The product philosophy](#the-product-philosophy)
- [How trading works end-to-end](#how-trading-works-end-to-end)
- [Authentication and session management](#authentication-and-session-management)
- [Account derivation — the Velo Trading Wallet](#account-derivation--the-velo-trading-wallet)
- [The Velo Trading Wallet — silent session signing](#the-velo-trading-wallet--silent-session-signing)
- [Fees](#fees)
- [The social layer](#the-social-layer)
- [Leaderboard](#leaderboard)
- [Markets page](#markets-page)
- [Pro tips and quality-of-life features](#pro-tips-and-quality-of-life-features)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [Deployed contracts](#deployed-contracts)
- [Repository layout](#repository-layout)
- [Running locally](#running-locally)
- [Vercel environment variables](#vercel-environment-variables)
- [Supabase setup](#supabase-setup)
- [Risk model and limitations](#risk-model-and-limitations)
- [Roadmap](#roadmap)
- [License](#license)

---

## What Velo is

Velo is a perpetual futures trading platform — meaning a place to take leveraged long or short positions on crypto assets without ever taking delivery of the underlying. You can open a 10× long on Bitcoin, a 5× short on Ethereum, set take-profit and stop-loss levels, watch your PnL move in real time, and close at any point. The contract holds your collateral, settles your profits or losses on close, and charges a small fee per trade.

What makes Velo different is that it's built around a real social product, not around it. Most decentralised exchanges are silent — you trade alone, you log your wins in a private spreadsheet, you brag in Discord with screenshots that nobody can verify. Velo turns each closed position into a shareable, on-chain-provable artefact. You can post a trade card directly to your feed, your followers can comment, the leaderboard ranks traders by realised PnL drawn from on-chain history, and any visitor can click through to BaseScan and verify that the numbers on your profile match the numbers in the blockchain.

The trading wallet (the EOA that signs your perp positions) is also your social identity. The handle you pick — `@alice`, `@stan_trades` — is stored on-chain in a registry contract. Mentions, follows, post likes, and copy-trade subscriptions all key off your wallet address. There is no off-chain identity layer. There is no custody. Your account is your keypair.

## The product philosophy

Three commitments shape every decision:

**Provability.** Every position, every fill, every closed trade has a transaction hash that anyone can paste into a block explorer. We never show numbers we can't back with chain data. The leaderboard reads from on-chain events. Your profile's win rate is computed from your real trade history. Bragging requires receipts and we render those receipts inline.

**Composability.** Wallet, perp engine, USDC, username registry, and (soon) cross-chain bridging are all on-chain primitives. Anyone can integrate against the VeloPerps contract directly. Anyone can fork the frontend. Anyone can read the leaderboard from public RPC. Nothing about Velo is gatekept behind an API key or terms-of-service moat.

**Performance.** Crypto traders are demanding. The first time you trade on Velo, you sign four signatures to bootstrap your account. Every subsequent trade signs locally in your browser with zero MetaMask popups. Position polling refreshes positions, prices and balances every five seconds, with manual refresh on demand. The chart is real TradingView, with timeframes from one minute to one day, drawing tools, and a full set of indicators. The order book is rendered live with sub-second updates.

## How trading works end-to-end

A complete trade has four on-chain phases. The first one happens once per browser per wallet. The last two happen for every trade. Because of how we use a session key (the Velo Trading Wallet), almost no MetaMask popups ever appear.

**Phase 0 — wallet connection.** The user connects MetaMask (or any wagmi-compatible wallet) and switches to Base Sepolia. We auto-prompt the network switch if they're elsewhere.

**Phase 1 — one-shot onboarding.** The user clicks "Get started" in the unified . Behind the scenes:

```
1.  Wallet connect — MetaMask / WalletConnect / social (Google, Discord, etc
    via Reown AppKit). If the wallet is already connected the modal skips the
    welcome splash and goes straight to session verification.
2.  Returning user? → Welcome-back animation, auto-close. Done.
3.  New user — picks a @username (3–20 chars, validated off-chain and on-chain)
4.  Optional email (can be added or changed later in Settings)
5.  Review screen shows wallet, handle, email, network, starting balance
6.  They sign ONE gas-free MetaMask message to derive the Trading Wallet key
7.  Sponsor POSTs /api/sponsor-eth → sends 0.01 ETH to the trading wallet
8.  Trading wallet silently calls mint() on VeloMockUSDC
    → 1,000 mUSDC lands in the trading wallet
9.  Trading wallet silently calls VeloRegistry.setUsername()
    → @handle is registered on-chain using the BURNER key, no MetaMask popup
```

That's it. One MetaMask signature, zero MetaMask transaction popups. The trading wallet is funded, the username is on-chain, and 1,000 mUSDC is ready to trade.

**Gas sponsor (updated):**  now sends **0.01 ETH** (up from 0.005) and rate-limits by burner address rather than IP — multiple new users behind the same NAT no longer block each other. Threshold to trigger a top-up raised to 0.003 ETH so there's always enough headroom for both the faucet mint AND the username claim in the same session.

**The Velo Trading Wallet is now your trading account.** All your mUSDC lives there. All trades sign locally with its private key. Your main MetaMask wallet stays cold.

**Phase 2 — opening a position.** The user picks a pair, side, collateral, and leverage. Click Buy/Long:

```
1. Frontend reads pairTradable + pairFeedId from the contract
   → if not registered, surface a friendly error before submitting
2. Frontend fetches the latest price update from Pyth's Hermes endpoint
3. Trading wallet signs an approve() if no allowance exists yet (silent)
4. Trading wallet signs openPosition(pairIndex, isLong, collateral_6, leverage, pythUpdateData)
5. The contract:
   - Pushes the Pyth update on-chain, paying the update fee from the trader's tx
   - Reads the fresh mark price
   - Pulls collateral from the trader's wallet (contract is approved spender)
   - Charges 0.10% open fee, accruing to feeBalance
   - Stores the Position struct keyed by tradeId
   - Emits PositionOpened event
6. Five-second polling picks up the new position and renders it in the UI
```

No MetaMask popup. The trader sees the toast and the position appears under the chart within a few seconds with a clickable BaseScan link.

**Phase 3 — closing a position.** Same pattern in reverse. PnL is computed against the fresh oracle price, the 0.10% close fee is deducted from the gross payout, and the net amount returns to the trading wallet.

PnL is settled in mUSDC against the perp pool. Closing in profit pulls from the pool. Closing at a loss returns the remaining collateral to the trader and the loss accrues to the pool.

**Liquidations** happen when a position's unrealised loss exceeds 90% of its collateral. The contract has a public `liquidate(tradeId)` function that anyone can call for a 1% bounty. Velo runs an automated keeper (driven by a GitHub Action every 5 minutes, or any external HTTP scheduler) that scans every open position and triggers liquidations the moment they cross threshold — so the protocol never depends on third-party liquidator bots to stay solvent. The keeper code is in `api/cron-liquidate.ts`.

## Authentication and session management

Velo's auth combines wallet-based identity with Supabase session management. Understanding this is important if you're debugging a "not logged in" state or adding a new auth path.

**How a session is established:**

When a new user completes onboarding, `supabase.auth.signInAnonymously()` is called. Supabase creates a session keyed to a pseudo-email derived from the wallet address (`<address>@wallet.velo`). This session JWT is stored in Supabase's own localStorage key. On every subsequent page load, Supabase fires an `INITIAL_SESSION` event which triggers `restoreSession` — a function that re-hydrates the full user profile (positions, history, notifications, preferences, social data) from Supabase.

**The localStorage cache — why it exists:**

`restoreSession` fires 8–10 Supabase queries. On a cold start over a slow connection this takes 1–3 seconds. Without a cache, the app showed a "Connect to Trade / Log In" state for every returning user during that window, even though they were already authenticated. The `velo_session_v1` localStorage key caches the serialized user profile. On page load this is read synchronously — before any async work — so the UI renders immediately with the user logged in. Supabase still runs its full restore in the background and overwrites with fresh data when it completes.

**Cache rules:**

- Written whenever `user` state transitions to a non-null value
- Cleared on logout (`handleLogout`, Supabase `SIGNED_OUT` event)
- Cleared when `getSession()` returns null (Supabase confirms the session has expired)
- Expires after 24 hours as a safety net, regardless of Supabase state
- The Supabase `INITIAL_SESSION` flow always runs and overwrites the cached data with fresh data — the cache is the initial state, not the final state

**Page load sequence:**

```
1. Sync: read velo_session_v1 from localStorage
   → If valid: user = cached, authChecked = true, UI renders immediately
   → If missing/expired: user = null, authChecked = false, loading screen shown

2. Async: Supabase INITIAL_SESSION fires (0–3s after mount)
   → restoreSession(session) fetches fresh profile + all related data
   → setUser(freshProfile) overwrites the cached state

3. Fallback: if INITIAL_SESSION doesn't fire within 2.5s
   → getSession() is called directly
   → If session exists: restoreSession runs
   → If null: cache cleared, user = null (login screen shown)
```

**Wallet connection vs Supabase session — two separate things:**

A user is "fully authenticated" when both are true: a wagmi-connected wallet (`useAccount().isConnected`) AND a live Supabase session (`supabase.auth.getSession()` returns non-null). The wallet provides the primary identity (address). Supabase provides session tokens and stores profile metadata. Disconnecting the wallet does not end the Supabase session, and vice versa — Velo's logout flow calls both `supabase.auth.signOut()` and wagmi's disconnect to clean both states.

## Account derivation — the Velo Trading Wallet

The Velo Trading Wallet (also called the burner wallet) is a regular EVM EOA whose private key is derived deterministically from a single `personal_sign` signature of the main wallet. The derivation is defined in `src/services/veloBurnerWallet.ts`:

```
Main wallet signs VELO_DERIVATION_MESSAGE
  → 65-byte hex signature (r || s || v)
  → keccak256(signature bytes) → 32-byte hash
  → This hash is the burner's private key
  → privateKeyToAccount(privateKey) → { address, ... }
```

`VELO_DERIVATION_MESSAGE` is a fixed string that includes the app domain, version, and chain ID. It must never change — any modification invalidates every existing user's derived burner address. The message is displayed to the user in the MetaMask signing dialog so they know exactly what they're signing.

**Determinism and recovery:** Because `personal_sign` is deterministic (same message + same private key always produces the same signature), the derived burner private key is also deterministic. A user who clears their browser can re-derive the exact same trading wallet on any device by signing the same message with the same main wallet. Nothing needs to be backed up for wallet recovery — only for instant access without re-signing.

**Storage:** The derived private key is stored in localStorage under `velo_burner_<ownerAddress>` (lower-cased). The cached entry includes the owner address, burner address, private key, and a creation timestamp. On load, `loadStoredBurner(ownerAddress)` reads and validates this — it re-derives the viem account from the stored key and checks that the resulting address matches `veloAddress`; a mismatch clears the corrupt entry.

**Export:** The Settings modal includes a "Reveal Private Key" option. This calls `exportPrivateKey(ownerAddress)` which returns the hex key from localStorage. The user can import this into MetaMask, Rabby, or any EIP-1193 wallet for manual access to their trading account.

## Moving funds between wallets

The Velo Trading Wallet is where you trade. Your main wallet is where you keep external funds. Four flows let you shuffle between them — and one important rule about cross-chain gas at the bottom.

**Deposit** (anywhere → trading): one modal handles both same-chain and cross-chain. At the top of the Deposit tab you pick a Source Network (Base, Arbitrum, Optimism, or Ethereum Sepolia). Base Sepolia uses a normal ERC-20 transfer from your main wallet to the burner. Other chains use LayerZero V2 OFT — your main wallet on that chain signs `oft.send` and mUSDC lands in your trading wallet on Base in 1-3 minutes. The fee preview shows the LayerZero native fee in source-chain ETH before you sign.

**Withdraw** (trading → main or any 0x, any network): same modal, Withdraw tab. Pick a Destination Network, an address (main wallet or custom 0x), an amount. Base destination is a silent burner-signed transfer; other destinations bridge via LayerZero. If you try to withdraw more than your idle balance, the modal tells you to close positions to free up collateral. Open positions hold their collateral in the VeloPerps contract, not in the trading wallet, so they're not withdrawable until closed.

**Move funds** (same chain, main → trading, recovery flow): if mUSDC arrives in your main wallet from a third party (or after an interrupted setup), the Settings panel shows a "Move $X mUSDC" button that sweeps it main → trading in one transaction. The gas sponsor tops the burner up if needed.

**Send** (peer-to-peer): the Send modal transfers mUSDC to any `@username` (resolved on-chain via VeloRegistry) or any `0x...` address. Signed silently by your trading wallet — no popup. Useful for tipping a trader you follow or paying for off-chain services.

### Gas requirements for cross-chain operations

Velo's gas sponsor (`veloGasSponsor.ts`) **only sponsors Base Sepolia transactions for the trading wallet**. Cross-chain operations split as follows:

- **Cross-chain deposits**: your **main wallet** pays the LayerZero fee in source-chain ETH. A deposit from Optimism Sepolia requires a small amount of Optimism Sepolia ETH (typically 0.0001-0.0005 ETH) in your main wallet on that chain. The Funds modal shows an inline warning whenever a non-Base source is selected, and renders a clear error toast if the wallet rejects the tx for insufficient gas. Top up via the testnet faucet for the relevant chain before bridging.
- **Cross-chain withdraws**: the **trading wallet on Base** pays the LayerZero fee. The gas sponsor tops it up automatically before submit, so you don't need ETH anywhere — the user-facing experience is identical to a same-chain withdraw.
- **Same-chain operations on Base**: gas is fully sponsored for the trading wallet. Main-wallet deposits to the burner on Base require a tiny amount of Base Sepolia ETH (~0.00001 ETH), which the gas sponsor also tops up via the faucet path if needed.

Testnet faucet links for the supported chains: [Base Sepolia](https://www.coinbase.com/faucets/base-sepolia-faucet), [Arbitrum Sepolia](https://www.alchemy.com/faucets/arbitrum-sepolia), [Optimism Sepolia](https://www.alchemy.com/faucets/optimism-sepolia), [Ethereum Sepolia](https://www.alchemy.com/faucets/ethereum-sepolia).

## On-chain username registration

When you set your @handle through the Username modal, this is a **real on-chain transaction** to the VeloRegistry contract at `0x7e510d615a8afDfaa324F790F3E54e520756ECe2`. It's not a Supabase row, it's not a centralized lookup — your handle is bound to your wallet address in Solidity. Anyone can resolve `@yourname` → `0x...` by reading the contract directly, and the Send modal does exactly that when you type someone else's handle.

The on-chain handle equals the handle you signed up with in the auth modal. The Username modal pre-fills the input read-only with your Supabase handle, so you can't claim a different on-chain identity than your in-app identity. Stops the confusing dual-identity bug.

## Shareable trade cards

Every closed position with non-trivial PnL (≥ $0.50) automatically opens a branded share modal. The card is rendered on a 1200×675 canvas (Twitter optimal), with three background styles (obsidian, gradient, hologram), a configurable field-visibility panel (show/hide pair, side, leverage, entry, exit, mark, size, collateral, PnL, trader handle), and unmissable **TESTNET · BASE SEPOLIA** branding.

Two action buttons: **Download PNG** (saves the file locally) and **Share** (uses the Web Share API on mobile for direct posting to Twitter / Instagram / Telegram; falls back to clipboard on desktop). Open positions get a small share icon next to the Close button — clicking it opens the same card with mark price and unrealised PnL.

## The Velo Trading Wallet — silent session signing

This is the architectural choice that makes Velo feel like a regular app instead of a wallet-popup carnival.

A traditional on-chain perp interaction requires a MetaMask popup for every single transaction — approve the collateral, open the position, close the position, modify TP/SL. That's three to five popups per trade. It's exhausting and breaks the flow of trading.

Velo's solution is a per-browser session key derived from a signature. The architecture:

```
Main Wallet (MetaMask)          Velo Trading Wallet (session key)
────────────────────────        ────────────────────────────────
You sign with this once         Signs every trade locally
Holds your "deposit"            Holds active trading capital
Funds the trading wallet        Lives in browser localStorage
Survives clearing localStorage  Re-derives from main signature
```

The trading wallet is a regular EOA — it has an address, a balance, and a private key. The only difference is that its private key is derived from a signature of your main wallet, not chosen randomly. This means:

- You can recover the trading wallet on a new device by signing the same message
- You can export the trading wallet's private key to MetaMask, Rabby, or any other wallet
- Anyone with main-wallet signing access can derive the trading wallet — but the trading wallet's private key never appears in any transaction your main wallet signs
- The trading wallet only contains funds you explicitly transfer to it; even if it's compromised, your main wallet is safe

In the Settings panel (accessible from the user avatar), you can see both wallet addresses, both ETH and mUSDC balances, and reveal the trading wallet's private key for backup. The Velo Trading Wallet is your "trading account" — it's where you keep working capital. The main wallet is your "savings account" — where you keep the rest. Move funds between them via standard ERC-20 transfers as needed.

## Fees

Velo charges a flat **0.10% (10 basis points) per side**.

- 0.10% on open: deducted from the collateral at the moment the position opens
- 0.10% on close: deducted from the gross payout at the moment the position closes

That's effectively 0.20% round-trip on the collateral, or 0.02% on a 10× notional. Industry-typical for an oracle-priced perp.

Fees accrue inside the contract's `feeBalance` variable. The contract owner (the protocol's deployer wallet) can withdraw accrued fees. The owner **cannot** seize user collateral, close other people's positions, or modify any trader's position state — these privileges are coded out at the contract level.

There are no hidden fees. There is no spread (the contract uses the Pyth oracle price exactly). There is no withdrawal fee. There is no inactivity fee.

## The social layer

Velo's social product is not a side-feature — it's half the product.

**The Feed.** A real-time Twitter-style feed where traders post text, charts, and trade cards. Posts can include a `$BTC` or `$ETH` ticker tag that auto-links to the markets page. Posts can attach a closed trade — embedded inline as an artefact showing entry, exit, leverage, realised PnL, and a BaseScan link. Comments thread under each post. Likes and reposts work the way you'd expect. Posts are stored in Supabase for fast read access but every embedded trade carries an on-chain transaction hash for verifiability.

**Profiles.** Every wallet address is a profile. Profiles show a bio, an avatar, a banner, follower count, and a stats panel: realised PnL, win rate, average leverage, number of trades. The trade-history table on each profile lists every closed trade with explorer links. A "View on BaseScan" button on each row jumps directly to the closing transaction.

**Follow + Copy-Trade.** You can follow any trader to subscribe to their post feed. You can copy-trade any trader to automatically mirror their position openings — when they open a long with 10% of their account, you open a long with 10% of yours, at the same leverage. Copy-trading currently runs through the Velo frontend (the copier's session wallet executes mirrored trades when they're online). The Velo Vaults V2 design (see Roadmap) moves this entirely on-chain — copiers pool capital into a vault contract that the leader has signing rights over.

**Ticker-Tag Routing.** Mentioning `$BTC` in a post automatically links to that pair's Markets page and the Social tab pre-filters posts about that ticker. The same pattern as how `$GME` works on FinTwit — but the cashtag actually routes to a real, live trading interface.

## Leaderboard

A transparent, public ranking of every Velo trader, sorted by realised PnL. The leaderboard is computed from on-chain trade-history data. There is no way to fake your way onto it — every position counted was a real transaction signed by a real wallet that paid real fees and settled with real PnL.

Each leaderboard entry shows:

- Trader handle (linked to profile)
- Realised PnL (sortable)
- Win rate
- Number of trades
- Average leverage
- A "Copy" button for one-click subscription

The top of the leaderboard becomes a default audience. New traders who join Velo and don't yet follow anyone see top-leaderboard traders' posts in their default feed view. As they follow specific traders, their feed personalises. This solves the cold-start problem of any social product: there's always something interesting at the top of your feed because the platform is showing you the best-performing traders by default.

## Markets page

The Markets page is a list of every available trading pair with the data a serious trader wants at a glance:

- Live price (Pyth-driven, updates every few seconds)
- 24-hour percentage change with green/red colouring
- 24-hour volume (when available)
- A spark-line of the last 24h price
- A watchlist toggle (the star icon)
- A "Trade" button that jumps to the TradeView with that pair pre-selected
- A "Social" button that filters the Feed to posts tagged with that ticker

The Markets page is also where the platform's listed-pair coverage is most visible. As Velo lists more pairs on-chain (currently BTC and ETH, with SOL/AVAX/LINK queued), they appear here first.

A watchlist lets you save favourite pairs. Watchlisted pairs are easier to find when switching pairs from inside the TradeView dropdown.

## Pro tips and quality-of-life features

A list of the smaller features that make Velo feel finished:

**Real TradingView chart.** Not a custom chart library — the actual TradingView widget, with their full set of drawing tools, timeframes (1m, 5m, 15m, 1h, 4h, 1D, more), and the indicator library (RSI, MACD, Bollinger Bands, EMA, VWAP, and dozens more). Power users have years of muscle memory for TradingView; we let them use it.

**Order book.** Side-by-side bid/ask depth, rendered live, with mid-price spread visible. The depth panel updates in real time.

**Position card with live PnL.** Each open position shows entry price, mark price, liquidation price (with a red colour-coded margin-risk indicator), PnL in dollar and percentage terms, and a one-click Close button. PnL updates every five seconds with the latest oracle price.

**Position-detail modal.** Click any closed position from the History tab or trade-history table to see a full breakdown: entry, exit, price change percentage, position size, leverage, margin used, margin mode, liquidation price (what it was at), opened-at and closed-at timestamps, duration, and the on-chain trade ID. Plus direct links to BaseScan for the close transaction and the VeloPerps contract.

**Leverage modal with margin-risk preview.** When you change leverage on an existing position, a confirmation modal shows the exact margin delta (how much will be locked or returned), the new liquidation price, and the resulting margin risk colour. This prevents accidental over-leveraging.

**Notification system.** In-app notifications fire when one of your trades closes, when someone follows you, when someone likes your post, when a copy-trader signs up to your stream. Notifications carry deep links — clicking a "your position closed" notification opens the position-detail modal for that specific trade.

**Light and dark mode.** The whole app respects a single theme token system (`var(--bg-base)`, `var(--fg)`, etc.). Light mode is a soft paper palette (#F5F3EE), dark mode is obsidian (#07070A). Both modes share the same iridescent accent palette.

**Wrong-network banner.** If you're connected to the wrong chain, a top banner appears with a one-click switch button using `useSwitchChain` from wagmi.

**Sound effects.** Subtle click and order-open sounds on key actions. Mutable from Settings.

**Mobile responsive.** Trade, Markets, Social, Leaderboard, and Profile all work on mobile. The TradeView reflows to put the order entry panel below the chart on narrow screens.

**Recent activity timeline.** The Dashboard's activity feed shows every action your wallet has taken — opens, closes, deposits, faucet claims, copy-trade subscriptions. Each entry has a "View on BaseScan" link when the underlying action was on-chain.

## Tech stack

**Smart contracts**
- Solidity 0.8.22 — compiled with Foundry
- OpenZeppelin Contracts — Ownable, ReentrancyGuard, SafeERC20, ERC20
- LayerZero V2 OFT — for cross-chain mUSDC transfers across four Sepolia testnets
- Pyth Network EVM SDK — for the price oracle

**Frontend**
- React 19 + Vite 6 + TypeScript 5.8
- wagmi v2 + viem — Ethereum interaction
- RainbowKit — wallet connection UX
- TailwindCSS — utility-first styling
- Lucide icons
- TradingView widget — real candle chart
- Recharts — portfolio PnL chart
- Inter Tight, Instrument Serif, JetBrains Mono — font stack

**Backend / data**
- Supabase (Postgres + Realtime) — caches profiles, posts, comments, leaderboard, trade history index
- Pyth Hermes — HTTP gateway for fetching price updates

**Infrastructure**
- Vercel — frontend hosting, automatic git deploys
- Base Sepolia — primary chain where VeloPerps lives
- Arbitrum / Optimism / Ethereum Sepolia — bridge destinations for cross-chain mUSDC
- WalletConnect Cloud — multi-wallet support
- PublicNode RPC — reliable testnet RPC endpoints

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Velo frontend                                                          │
│  React 19 · Vite · wagmi · RainbowKit · TailwindCSS                     │
│                                                                          │
│   ┌──────────────────────────────────────────────────────────┐         │
│   │  Velo Trading Wallet (session key, in localStorage)      │         │
│   │  Signs all VeloPerps transactions locally — no popups    │         │
│   └──────────────────────────────────────────────────────────┘         │
│                                                                          │
│   useVeloPerpsTrading() ─── 5-second contract polling ─────┐            │
│                                                              │            │
│   Social layer (Feed, Profile, Leaderboard) ──── Supabase   │            │
│                                                              │            │
└──────────────────────────────────────────────────────────────┼────────────┘
                                                               │
                                                               ▼
   ┌─────────────────────────────────────────────────────────┐
   │  Base Sepolia (home chain — chain id 84532)             │
   │                                                          │
   │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
   │  │ VeloPerps    │  │ VeloMockUSDC │  │ VeloRegistry │  │
   │  │ Oracle-priced│◄─┤ ERC-20 + LZ  │  │ Username →   │  │
   │  │ perp engine, │  │ V2 OFT,      │  │ address      │  │
   │  │ Pyth, USDC   │  │ faucet       │  │ resolver     │  │
   │  └──────┬───────┘  └──────┬───────┘  └──────────────┘  │
   │         ▼                  │                            │
   │   ┌──────────────┐         │                            │
   │   │ Pyth Network │         │                            │
   │   │ BTC/USD ETH/USD        │                            │
   │   └──────────────┘         │                            │
   └─────────────────────────────┼───────────────────────────┘
                                 │ LayerZero V2 OFT
                                 │
              ┌──────────────────┼──────────────────┐
              ▼                  ▼                  ▼
       ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
       │ VeloMockUSDC│    │ VeloMockUSDC│    │ VeloMockUSDC│
       │ Arb Sepolia │    │ OP Sepolia  │    │ Eth Sepolia │
       └─────────────┘    └─────────────┘    └─────────────┘
```

**Where the source of truth lives:**

- Positions, PnL, balances → **the VeloPerps contract** (single authoritative source, polled every 5s)
- Username ↔ address mapping → **the VeloRegistry contract**
- Posts, comments, follows, profile metadata → **Supabase** (it's a cache + social database, not a source of truth for financial state)
- Trade history → **both**: Supabase for fast indexed queries, on-chain events for proof. Every Supabase row carries the transaction hash that produced it.

## Deployed contracts

All source code is verified on the respective block explorers. Click any address to see the source.

| Chain | Contract | Address |
|---|---|---|
| Base Sepolia | **VeloPerpsV3** (active) | [`0x3780e858B76027E6D6cB0c74E863f712a0F0E27E`](https://sepolia.basescan.org/address/0x3780e858B76027E6D6cB0c74E863f712a0F0E27E) |
| Base Sepolia | VeloPerpsV2 (legacy) | [`0x3C7cBCa2C675F1f788148aaD08eceab262298de8`](https://sepolia.basescan.org/address/0x3C7cBCa2C675F1f788148aaD08eceab262298de8) |
| Base Sepolia | VeloPerps V1 (legacy) | [`0x28fE36d4ae72ab0E05fa6edafE1D6e11E9DD6163`](https://sepolia.basescan.org/address/0x28fE36d4ae72ab0E05fa6edafE1D6e11E9DD6163) |
| Base Sepolia | **VeloMockUSDC** | [`0x5EFaF3F69b09bC2abF3439bDC0C93bf611026699`](https://sepolia.basescan.org/address/0x5EFaF3F69b09bC2abF3439bDC0C93bf611026699) |
| Base Sepolia | **VeloRegistry** | [`0x7e510d615a8afDfaa324F790F3E54e520756ECe2`](https://sepolia.basescan.org/address/0x7e510d615a8afDfaa324F790F3E54e520756ECe2) |
| Arbitrum Sepolia | VeloMockUSDC | [`0xEC76fD9182ba15ff193FDBc122013FCa18900290`](https://sepolia.arbiscan.io/address/0xEC76fD9182ba15ff193FDBc122013FCa18900290) |
| Optimism Sepolia | VeloMockUSDC | [`0xEC76fD9182ba15ff193FDBc122013FCa18900290`](https://sepolia-optimism.etherscan.io/address/0xEC76fD9182ba15ff193FDBc122013FCa18900290) |
| Ethereum Sepolia | VeloMockUSDC | [`0x96d0CF69896FE6b5B031D21967f027d95Eb42e9A`](https://sepolia.etherscan.io/address/0x96d0CF69896FE6b5B031D21967f027d95Eb42e9A) |

All four mUSDC OFT deployments are wired as LayerZero V2 peers — bridges work bidirectionally across every pair of chains.

## V3 Feature Coverage — Fully Implemented

`contracts/src/VeloPerpsV3.sol` is the active exchange engine. All features are implemented in the contract AND fully wired through the frontend and keepers in this build.

**Contract features:**

- Market positions with `ISOLATED` and `CROSS` margin modes in the contract. **Testnet UI exposes ISOLATED only** (see note below).
- On-chain TP/SL via `setTriggers(tradeId, tp, sl)`. Pass `0` to clear either side. Repeat calls overwrite.
- Keeper close: `closeIfTriggered(tradeId, pythUpdateData)` — permissionless, pays 0.25% bounty.
- Partial close: `partialClose(tradeId, fractionBps, pythUpdateData)` — close 1–10000 bps of the position.
- Conditional orders: `placeConditionalOrder`, `cancelConditionalOrder`, `executeConditionalOrder`. Supports LIMIT and STOP trigger kinds with optional `reduceOnly` flag.
- Cross margin ledger: `depositCross(amountUSDC_6)`, `withdrawCross(amountUSDC_6)`, `crossBalanceUSDC_6(trader)`.
- Public liquidation: `liquidate(tradeId, pythUpdateData)` — 1% bounty to caller.
- Pair risk controls: `setPairRisk`, `accrueFunding`, OI cap enforcement.

> **Cross margin — testnet status:** The V3 contract has full CROSS margin support, but the testnet frontend runs ISOLATED only. The architectural difference: Binance/Hyperliquid CROSS reads your wallet balance as margin directly. The Velo V3 contract uses an internal per-trader ledger (`crossBalanceUSDC_6`) — money must be pre-deposited there before a CROSS trade can open, and profits return to the ledger (not the wallet) on close. This creates a 3-transaction flow (approve → depositCross → openPosition) and a confusing post-close experience where funds land in the ledger rather than the wallet. For the testnet launch, CROSS is removed from the UI entirely. ISOLATED works exactly like any exchange: wallet → position → wallet, one confirmation per trade. CROSS will be re-introduced in a future version either via an EIP-2612 permit upgrade (bundles approval into one signature) or a router contract that makes the whole flow atomic. The contract functions remain deployed and can be exercised directly via BaseScan.

**Frontend wiring:**

- `veloPerpsService.ts` — full V3 ABI, auto-routes to V3 when `VITE_VELO_PERPS_V3_ADDRESS` is set. `openPosition` adds mUSDC approve before every trade so the contract's `safeTransferFrom` never reverts. All positions use ISOLATED mode.
- `useVeloPerpsTrading.ts` — React hook exposing trading state, balances, and position management.
- `App.tsx` — all trades force `marginMode: 'ISOLATED'`. Balance gating checks wallet mUSDC directly. LIMIT/STOP orders route to V3 `placeConditionalOrder`. Cancel routes to `cancelConditionalOrder`.
- `TradeView.tsx` — margin mode toggle removed. ISOLATED is the only mode. No cross account UI.

**Keeper jobs (all V3-aware, run every minute via Vercel Pro cron):**

- `api/cron-tp-sl.ts` — reads positions with the correct V3 11-field struct, calls `closeIfTriggered` when mark crosses TP or SL. V2 fallback if env points to V2.
- `api/cron-liquidate.ts` — same correct struct, calls `liquidate` when PnL exceeds threshold BPS. V2 fallback.
- `api/cron-conditional-orders.ts` — scans all active conditional orders, submits Pyth data to `executeConditionalOrder`. Contract enforces trigger; expected reverts (`OrderNotTriggered`) silently skipped.

What remains outside this perps contract by design:

- Username claiming and resolution are handled by `VeloRegistry` (unchanged).
- Social feed, comments, follows, leaderboard cache, and notifications are handled in Supabase (unchanged).
- mUSDC minting/bridging is handled by `VeloMockUSDC` + LayerZero OFT (unchanged).

**Owner of the Base Sepolia contracts:** `0x8f8fF5A29760278C7B54D450dA57A13Cd3FD3A8b`. This wallet has only three privileges: register new trading pairs, withdraw accrued protocol fees, set LayerZero peers. It explicitly cannot touch user collateral, modify positions, or freeze the protocol.

## Repository layout

```
contracts/                      Solidity contracts (deployed and verified)
├── src/
│   ├── VeloPerps.sol               Oracle-priced perp. BTC + ETH at v1.
│   ├── VeloMockUSDC.sol            ERC-20 + LayerZero V2 OFT + faucet.
│   ├── VeloRegistry.sol            On-chain username → address registry.
│   ├── interfaces/IPyth.sol        Minimal Pyth interface subset.
│   └── libraries/PerpsMath.sol     Pure math: PnL / liquidation / fees.
├── script/
│   ├── DeployBaseSepolia.s.sol     Deploy + register pairs.
│   ├── DeployRemoteUSDC.s.sol      Deploy mUSDC OFT on remote chains.
│   ├── WirePeers.s.sol             Set LayerZero V2 peer relationships.
│   └── RegisterPair.s.sol          Register a new trading pair post-deploy.
├── test/VeloPerps.t.sol            Foundry test suite — all passing.
├── deployments/                    JSON files with deployed addresses per chain.
└── foundry.toml

src/                            React frontend
├── App.tsx                         Top-level shell. Routes, modals, state.
├── components/
│   ├── AuthModal.tsx               Account onboarding (handle + email).
│   ├── VeloWelcomeModal.tsx        First-run trading-wallet setup.
│   ├── SettingsModal.tsx           Wallet + private-key + network panel.
│   ├── WalletConnectButton.tsx     Top-right wallet pill.
│   ├── TradingViewChart.tsx        Real TradingView widget wrapper.
│   ├── OrderBook.tsx               Live bid/ask depth panel.
│   ├── PortfolioChart.tsx          Dashboard PnL spark-line.
│   └── ui/
│       ├── OrderDetailsModal.tsx   Position / trade detail breakdown.
│       └── pages/
│           ├── Dashboard.tsx       Portfolio overview, recent activity.
│           ├── TradeView.tsx       The trading screen — chart + order form.
│           └── MarketsView.tsx     Pair list + price grid.
├── services/
│   ├── veloPerpsService.ts         VeloPerps contract wrapper.
│   ├── useVeloPerpsTrading.ts      5s polling hook, auto-burner-aware.
│   ├── pythService.ts              Pyth Hermes price update fetcher.
│   ├── veloUsdcService.ts          mUSDC ERC-20 + faucet wrapper.
│   ├── veloBurnerWallet.ts         Deterministic session-key derivation.
│   ├── veloBurnerSetup.ts          First-run burner setup orchestration.
│   ├── usernameService.ts          VeloRegistry resolver.
│   ├── bridgeService.ts            LayerZero V2 cross-chain transfer.
│   ├── web3Config.ts               Wagmi 4-chain config.
│   ├── priceService.ts             Coinbase / Binance feeds for chart candles.
│   └── supabaseStore.ts            Posts / profiles / cached history.
└── styles/                         brand.css, tokens.css

SUPABASE_SCHEMA.sql                  Base tables for posts, profiles, history.
SUPABASE_MIGRATION_VELO_PERPS.sql    Adds venue + tx_hash columns.
README.md                            This file.
```

## The Admin Panel

Velo ships with a protocol-owner dashboard at the `Admin` tab in the navigation. The tab is invisible to everyone except the wallet that owns the VeloPerps contract — we read `owner()` from the contract on app load and conditionally include the nav item only when the connected wallet matches.

The Admin Panel surfaces every owner-only state and action that would otherwise require manually running Foundry scripts. Specifically:

- **Pair registry.** Lists all 17 supported pairs (BTC, ETH, SOL, AVAX, LINK, DOGE, NEAR, INJ, APT, ARB, OP, SUI, TIA, SEI, RENDER, WLFI, POL) with their on-chain status. Pairs that aren't registered yet show a one-click **Register** button. Pairs that are registered show **Pause** / **Resume** buttons that flip the contract's `pairTradable` flag. Slots 0–5 are registered at deploy time; slots 6–16 are registered through the Admin Panel.
- **One-click "Register all pending pairs."** When a fresh contract is deployed, this button registers SOL/AVAX/LINK/DOGE in sequence with their correct Pyth feed IDs.
- **Fee balance + withdraw.** Shows the contract's accrued `feeBalance` in mUSDC. The **Withdraw to owner** button moves it to the owner wallet (anyone else calling withdrawFees reverts at the Solidity level).
- **Pool reserves.** Live readout of the contract's mUSDC balance — the pool that pays out winners and absorbs losers.
- **Contract metadata.** Owner address, mUSDC address, VeloPerps address, all linkable to BaseScan.

Non-owner wallets that try to visit `/admin` see a polite "Owner-only area" message with the owner address truncated for verification.

## The liquidation keeper

A pool-based perp protocol without an automated liquidation bot can go insolvent: underwater positions don't close themselves, losses keep growing, and eventually the trader walks away with more than the pool can pay back. Velo's contract has a public `liquidate(tradeId, pythUpdateData)` function — anyone who calls it on an underwater position (loss ≥ 90% of collateral) earns a 1% bounty on the collateral.

In production, liquidations need to happen within seconds of crossing threshold. We don't want to wait for a third party to notice. So Velo ships its own keeper as a serverless endpoint at `api/cron-liquidate.ts`:

```
1. Read the contract's nextTradeId counter
2. Walk every tradeId from 1 to nextTradeId-1
3. Skip closed/liquidated positions (owner == 0x0)
4. For each open position, call quoteUnrealisedPnL(tradeId) on the contract
5. If pnl_6 <= -(collateral * 9000 / 10000), the position is liquidatable
6. Fetch a fresh Pyth update for the pair's feed
7. Call liquidate(tradeId, updateData) with enough ETH for the Pyth fee
8. Bounty (1% of collateral) flows to the sponsor wallet
```

The keeper uses the same sponsor wallet that funds new users with starter ETH. The liquidation bounties make it self-funding over time: every liquidation tops the sponsor up by 1% of the liquidated collateral.

**Scheduling.** Vercel Hobby plan caps cron frequency at once per day — useless for liquidations — and including a more frequent schedule in `vercel.json` will cause `Deployment failed` (the cron config is validated server-side and blocks the deploy outright). So Velo doesn't ship a Vercel cron. Instead, the keeper is driven externally:

- **Default: GitHub Actions.** `.github/workflows/liquidate.yml` runs every 5 minutes, calling the keeper endpoint via curl. Free on private and public repos. Configure the target deployment URL by adding a repo variable `VELO_DEPLOYMENT_URL` (Settings → Secrets and variables → Actions → Variables).
- **Faster: cron-job.org or runhooks.app.** For sub-minute liquidation cadence, point a free external scheduler at `https://your-deployment.vercel.app/api/cron-liquidate`. GitHub Actions' 5-minute minimum is fine for testnet but real money would want every 30-60 seconds.
- **If you upgrade to Vercel Pro:** add the cron block back to `vercel.json` and disable the GitHub Action.

```yaml
# .github/workflows/liquidate.yml
on:
  schedule:
    - cron: '*/5 * * * *'
  workflow_dispatch:
```

The endpoint is GET-callable so any HTTP scheduler can drive it.

## The TP/SL keeper

A second keeper lives at `api/cron-tp-sl.ts`. It reads each open V2 position's trigger values directly from the `VeloPerpsV2` contract (`takeProfit_E18` and `stopLoss_E18` fields on the Position struct), checks each against the current Pyth mark, and calls `closeIfTriggered(tradeId, pythUpdateData)` on the contract for any position whose trigger has fired.

`closeIfTriggered` is permissionless — anyone can call it. The contract verifies on-chain that the mark has actually crossed the trigger, sends the bulk of the payout to the position owner, and pays a small bounty (`KEEPER_BOUNTY_BPS = 25` → 0.25% of the net payout) to whoever called it. This is what makes the keeper self-sustaining: every TP fired earns the keeper a small payment, and the user gets their trigger executed without trusting any off-chain Supabase row.

V1 positions don't have on-chain triggers, so the keeper skips them. Once V2 is deployed and `VITE_VELO_PERPS_V2_ADDRESS` is set, all new positions land on V2 and triggers work end-to-end.

## Protocol stats endpoint

Velo exposes `/api/protocol-stats` — a JSON endpoint that aggregates on-chain events into lifetime totals and daily buckets. This powers the charts in the Admin Panel and is intentionally documented as a stable URL so external monitoring (Datadog, Grafana, custom dashboards) can scrape it directly.

Sample response:

```json
{
  "ok": true,
  "contract": "0x28fE...6163",
  "generated_at": "2026-05-24T16:38:00.000Z",
  "lifetime": {
    "total_volume_usd": 18432.50,
    "total_open_fees_usd": 18.43,
    "total_close_fees_usd": 14.27,
    "total_fees_usd": 32.70,
    "total_opens": 47,
    "total_closes": 38,
    "total_liquidations": 5,
    "total_liquidation_bounty_usd": 0.83,
    "currently_open": 4,
    "total_fee_withdrawals": 1
  },
  "daily_buckets": [
    { "date": "2026-05-22", "volume_usd": 4200, "open_fees_usd": 4.2, "close_fees_usd": 3.1, "opens": 12, "closes": 9, "liquidations": 1 },
    ...
  ]
}
```

The endpoint walks `PositionOpened`, `PositionClosed`, `PositionLiquidated`, and `FeesWithdrawn` events from contract genesis on each call. CORS is open (`Access-Control-Allow-Origin: *`) so any frontend can consume it. Response is cached at the edge for 30 seconds with 60-second stale-while-revalidate.

For mainnet, this approach (full event scan on every request) won't scale — switch to a subgraph or an incremental indexer. For testnet, it's fine.

## Running locally

### Prerequisites

- Node.js 20+
- Git
- Foundry (for the contracts): `curl -L https://foundry.paradigm.xyz | bash && foundryup`

### Frontend

```bash
git clone https://github.com/stanisnear/velo-trading-terminal
cd velo-trading-terminal
npm install
cp .env.example .env.local   # then edit with Supabase + WalletConnect keys
npm run dev
```

Opens at http://localhost:3000.

### Contracts

```bash
cd contracts
forge install foundry-rs/forge-std
forge install OpenZeppelin/openzeppelin-contracts
forge install LayerZero-Labs/devtools
forge install LayerZero-Labs/layerzero-v2
forge install pyth-network/pyth-sdk-solidity
forge install GNSPS/solidity-bytes-utils

forge test -vvv     # full test suite should pass
```

See `contracts/README.md` for the full deployment walkthrough across all four testnets.

## Vercel environment variables

Set these in **Vercel → Settings → Environment Variables** for all three environments (Production, Preview, Development):

```bash
# Supabase (existing — don't change)
VITE_SUPABASE_URL=https://<your-project>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key>

# WalletConnect Cloud — free signup at cloud.walletconnect.com
VITE_WALLETCONNECT_PROJECT_ID=<your-id>

# Velo contracts on Base Sepolia
# V3 is the active perps engine — set this to route all new trades to V3.
# When VITE_VELO_PERPS_V3_ADDRESS is set the service layer automatically
# uses V3 for openPosition, setTriggers, conditional orders, cross margin,
# and keeper reads. Leave blank to fall back to V2 (legacy).
VITE_VELO_PERPS_V3_ADDRESS=0x3780e858B76027E6D6cB0c74E863f712a0F0E27E

# Legacy contracts (V2 fallback + supporting infra — unchanged)
VITE_VELO_PERPS_ADDRESS=0x28fE36d4ae72ab0E05fa6edafE1D6e11E9DD6163
VITE_VELO_REGISTRY_ADDRESS=0x7e510d615a8afDfaa324F790F3E54e520756ECe2
VITE_VELO_USDC_BASE=0x5EFaF3F69b09bC2abF3439bDC0C93bf611026699

# Server-side gas sponsor (NO VITE_ prefix — never reaches the browser).
# Used by /api/sponsor-eth and /api/cron-liquidate. Fund this wallet with
# ~0.5 Base Sepolia ETH and top it up periodically (liquidation bounties
# refill it organically over time).
VELO_SPONSOR_PRIVATE_KEY=<0x-prefixed private key of a funded ops wallet>

# Keeper wallet public address (derived from VELO_SPONSOR_PRIVATE_KEY).
# Run: cast wallet address --private-key $VELO_SPONSOR_PRIVATE_KEY
# Set this so the Admin Panel can show live ETH balance and warn before it runs dry.
# The keeper runs every minute — if it hits 0 ETH, TP/SL, liquidations, and
# conditional orders stop executing. Top up via https://www.alchemy.com/faucets/base-sepolia
VITE_KEEPER_ADDRESS=<0x-prefixed public address derived from VELO_SPONSOR_PRIVATE_KEY>

# Velo mUSDC OFT on remote Sepolias
VITE_VELO_USDC_ARB=0xEC76fD9182ba15ff193FDBc122013FCa18900290
VITE_VELO_USDC_OP=0xEC76fD9182ba15ff193FDBc122013FCa18900290
VITE_VELO_USDC_ETH=0x96d0CF69896FE6b5B031D21967f027d95Eb42e9A

# RPC endpoints (PublicNode — reliable, free, no signup)
VITE_BASE_SEPOLIA_RPC_URL=https://base-sepolia-rpc.publicnode.com
VITE_ARB_SEPOLIA_RPC_URL=https://arbitrum-sepolia-rpc.publicnode.com
VITE_OP_SEPOLIA_RPC_URL=https://optimism-sepolia-rpc.publicnode.com
VITE_ETH_SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com

# Pyth Hermes (price update feed)
VITE_PYTH_HERMES_URL=https://hermes.pyth.network
```

After saving, trigger a redeploy or push any commit. Vite requires the `VITE_` prefix for variables to reach the browser.

## Supabase setup

Velo's social-layer data lives in Supabase. The schema includes:

- `profiles` — user metadata (handle, bio, avatar, banner)
- `posts` — feed posts with optional ticker tags and trade-card attachments
- `comments` — threaded under posts
- `likes` and `reposts` — social interactions
- `follows` — many-to-many graph
- `notifications` — in-app notification queue
- `trade_history` — closed trade index (Supabase mirror of on-chain events)
- `positions` — open position cache (5s polling target)
- `copy_trade_subscriptions` — who's copying whom

The base schema is in `SUPABASE_SCHEMA.sql`. Run the migration:

1. Open Supabase dashboard → your project → **SQL Editor**
2. Paste `SUPABASE_SCHEMA.sql` → Run
3. Paste `SUPABASE_MIGRATION_VELO_PERPS.sql` → Run (adds `venue`, `velo_trade_id`, `open_tx_hash`, `close_tx_hash` columns for on-chain proof)

Migrations are idempotent — safe to run multiple times.

## Risk model and what's still missing

**This is still testnet-grade and not audited.**

Current V3 closes major feature gaps (cross margin, on-chain TP/SL, conditional orders, OI/funding controls), but production readiness still requires:

- End-to-end FE wiring audit to guarantee every visible action performs a matching chain write.
- Keeper redundancy and alerting (not one single scheduler).
- Economic stress testing for pool solvency and liquidation under high volatility.
- External audit before any mainnet value is at risk.
- Optional: insurance/ADL module if targeting adversarial mainnet conditions.

## Roadmap

**v1 — testnet, today.** Base Sepolia perps for 17 pairs (BTC, ETH, SOL, AVAX, LINK, DOGE shipped registered at deploy time; NEAR, INJ, APT, ARB, OP, SUI, TIA, SEI, RENDER, WLFI, POL ship as one-click registerable through the Admin Panel). LayerZero V2 cross-chain mUSDC (four chains). Social feed, leaderboard, profiles. One-MetaMask-signature onboarding via the Velo Trading Wallet + gas sponsor. Bridge UI, Send-to-@username UI, on-chain username registry (VeloRegistry), automated liquidation keeper, TP/SL keeper scaffolding (dry-run mode pending a contract update to permit keeper-triggered closes), protocol owner Admin Panel with on-chain stats and charts. Trade-history rows attach BaseScan tx hashes for every open and close. Grant submission build.

**v1.1 — V3 hardening.** Full FE-to-V3 routing, keeper redundancy for TP/SL + conditional orders, position/order reconciliation tooling, and final deployment runbook.

**v2 — mainnet.** Production launch on Base mainnet after a security audit. Real USDC replaces mUSDC. Insurance fund seeded from accrued fees, capped at 5% of TVL. Funding rate mechanism — hourly payments between longs and shorts proportional to open-interest imbalance. Secondary oracle (Chainlink) as a Pyth sanity check. Cross-margin mode for portfolio margining. Multisig ownership (Safe with at least three signers). Dynamic fees scaled by trade size and protocol delta. The Velo Trading Wallet, leaderboard, social product, and Admin Panel carry over unchanged.

**v3 — Velo Vaults.** Pool follower capital into smart-contract-managed vaults. The trader running the vault has signing rights but cannot withdraw — they can only direct trades on behalf of the pool. Vault terms (performance fee, lockup period, max drawdown) are set at deploy time and visible on-chain. Vault performance fees accrue to the trader; copiers pay only for results. This is the infrastructure that makes copy-trade actually accountable: there's no off-chain promise, the rules are in code.

**v4 — Token launch.** A Velo governance token issued to:
- Active early traders — based on cumulative trading volume during the testnet and post-mainnet bootstrap period
- Profitable traders whose trades have been copied — based on the realised PnL their copiers earned
- Successful Velo Vaults managers — based on AUM and net realised performance
- Bots and keepers — based on liquidations executed and orders matched

The token's primary utility is **governance** over protocol fees, pair listings, vault standards, treasury allocations, and insurance-fund deployment. Secondary utility is **fee discounts** for stakers. Tertiary utility is **revenue share** to long-term lockers.

The token is explicitly NOT planned for v1, v2, or v3. There is no token presale, no IDO, no airdrop tease. The token is the v4 milestone — issued only when the protocol has proven product-market fit and there's something substantive to govern.

**v5 — Multi-venue routing.** Velo Vaults can route trades to any compatible perp venue (Velo Perps, GMX, Uniswap V4 hooks, etc.) depending on best execution. The router earns a share of routed-flow rebates. This is the long-term protocol-as-infrastructure play — making Velo the trading layer for any DeFi product that wants to embed perps without building the engine.

## License

MIT. See `LICENSE` if present, or assume MIT.

---

## Logout sentinel — the `__veloLogoutLock` system (build 106+)

Before build 106, clicking "Sign Out" triggered the logout animation and a hard `window.location.replace('/')` navigation, but the page immediately re-authenticated the user. The root cause: wagmi auto-reconnects to MetaMask within ~100ms of any page load (the dapp permission lives in the browser extension, unreachable from app code). The `socialLoginEffect` then saw the wallet address, ran `signInWithPassword` with the wallet-derived credentials, and signed the user back in before they could react.

**The fix is a three-layer sentinel:**

**Layer 1 — URL parameter.** `handleLogout` navigates to `/?logout=1`. The navigation timer is scheduled at the very top of the function — before any `await` — so it always fires even if `wagmi.disconnect()` or `supabase.auth.signOut()` hang.

**Layer 2 — Module-level IIFE.** At the top of `App.tsx`, a synchronous IIFE runs at module import time (before React, before Supabase's `getSession`). If it sees `?logout=1`, it: (a) sets `window.__veloLogoutLock = true`, (b) wipes localStorage/sessionStorage keeping only theme, favourites, burner keys, and Orderly keypairs, (c) strips the URL param via `history.replaceState`.

**Layer 3 — Auth gates.** Both `restoreSession` and `socialLoginEffect` check `window.__veloLogoutLock` at their entry point and return immediately if set.

**Lock clearing.** The lock clears only on `wagmiStatus === 'connecting'` — the state that only fires when the user explicitly opens AppKit and picks a wallet. Auto-reconnect (`'reconnecting'` → `'connected'`) never hits `'connecting'`, so background reconnects can't clear it.

**Debugging.** After logout, check `window.__veloLogoutLock` in DevTools console: `true` = lock is active (something else is clearing it too early); `undefined` = IIFE didn't detect `?logout=1` (check `handleLogout` navigation URL).
