# Velo — On-Chain Perpetual Futures with a Social Layer

**Fully operational on Base Sepolia. Every trade is a real blockchain transaction. Every position is verifiable.**

**Marketing site:** [velotrading.live](https://velotrading.live)  ·  **Live terminal:** [app.velotrading.live](https://app.velotrading.live)

> Velo runs as two surfaces sharing one brand system: a marketing landing on the apex domain (`velotrading.live`) and the trading terminal on the `app.` subdomain (`app.velotrading.live`).

Velo is a decentralised perpetual futures exchange where every order, position, and settlement happens on-chain — no off-chain matching engine, no custody, no trust required. Underneath the trading terminal, a full social product lets traders post, follow, copy-trade, and compete on a transparent, on-chain-verified leaderboard.

---

## Table of Contents

- [Built by a Trader, for Traders](#built-by-a-trader-for-traders)
- [What Velo Is](#what-velo-is)
- [How It Works End-to-End](#how-it-works-end-to-end)
- [The Velo Trading Wallet](#the-velo-trading-wallet)
- [Order Types & Execution](#order-types--execution)
- [Trigger Price vs Fill Price](#trigger-price-vs-fill-price)
- [Keeper Infrastructure](#keeper-infrastructure)
- [Price Oracle & Execution Model](#price-oracle--execution-model)
- [Trading Interface Design](#trading-interface-design)
- [The Social Layer](#the-social-layer)
- [Leaderboard & Copy-Trading](#leaderboard--copy-trading)
- [Cross-Chain Deposits & Withdrawals](#cross-chain-deposits--withdrawals)
- [Protocol Fees](#protocol-fees)
- [Admin Panel](#admin-panel)
- [Progressive Web App (PWA)](#progressive-web-app-pwa)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Deployed Contracts](#deployed-contracts)
- [Repository Layout](#repository-layout)
- [Running Locally](#running-locally)
- [Environment Variables](#environment-variables)
- [Supabase Setup](#supabase-setup)
- [Mainnet Roadmap](#mainnet-roadmap)
- [Future Infrastructure](#future-infrastructure)
- [License](#license)

---

## Built by a Trader, for Traders

Velo was built by someone who has traded across the full arc — centralised exchanges, early DeFi, and everything in between. That experience is embedded in every product decision, down to which columns appear in a position table and what happens when a TP fires two dollars off your trigger.

The design philosophy is straightforward: get out of the way when a trader knows what they're doing, and surface exactly the right context when they don't. Every element in the interface exists for a reason. Every tooltip, every modal state, every colour threshold was a deliberate call.

**What this looks like in practice:**

Every column header in the positions table has a hover tooltip with a precise, unambiguous definition. "Buffer" shows the live percentage distance between the current mark price and your liquidation price — because that number matters more when a position is moving against you than the liquidation price itself. "Mark" is defined as the Pyth oracle price used for PnL and liquidation calculations. "Liq." tells you it's a force-close level. These aren't decorative — a trader who doesn't understand the difference between entry and mark will eventually be surprised by their PnL.

The order entry panel shows a live risk classification (LOW / MEDIUM / HIGH / EXTREME) derived from the estimated liquidation distance before you hit submit. Colour-coded, updated in real-time as you adjust leverage or size. A trader who has felt what a liquidation looks like built that.

The leverage change confirmation modal isn't a generic "are you sure?" dialog. It has three distinct states — blocked (insufficient balance), warning (increasing leverage moves your liq. price significantly closer), and informational (reducing, what the margin requirements are). It shows your current liquidation distance, your new liquidation distance, and what changes in plain language.

TP and SL validation runs against your actual fill price from the on-chain event — not the pre-trade mark. If the market moves in the second between clicking Buy and the transaction mining, and your pre-set TP ends up on the wrong side of your real entry, you get a specific message explaining what happened and where to fix it. No silent failures.

None of this comes from a product specification or a user research document. It comes from trading.

---

## What Velo Is

Velo is an oracle-priced perpetual futures protocol. There is no traditional order book matching buyers and sellers. Instead, every trade is priced against a live Pyth Network oracle feed, collateral is held in the VeloPerps smart contract, and PnL is settled against a liquidity pool on close.

This architecture means:
- **Zero slippage** on trade execution up to pool capacity — you get the oracle price, not a market-impact price
- **Instant settlement** — positions are opened and closed in a single transaction
- **Trustless liquidations** — anyone can liquidate an underwater position for a 1% bounty; Velo runs its own keeper as a safety net
- **Verifiable everything** — every position has a transaction hash, every closed trade has an on-chain proof

What makes Velo distinct is the social layer built alongside the exchange. Trading history is public, provable, and shareable. Leaderboard rankings are computed from on-chain events. Followers can mirror your trades automatically. The trading floor and the community are the same room.

---

## How It Works End-to-End

### Onboarding — One Signature, No Popups

New users go through a single unified modal:

1. Connect a wallet via Reown AppKit (MetaMask, WalletConnect, Coinbase Wallet, or social login via email/Google/Discord)
2. Choose a `@username` — validated off-chain for format, verified on-chain for uniqueness via VeloRegistry
3. Sign **one** `personal_sign` message — this derives the Velo Trading Wallet (a deterministic session key)
4. Everything else is automatic: the gas sponsor sends 0.01 ETH to the trading wallet, the trading wallet mints 1,000 mUSDC from the faucet, and the `@username` is registered on-chain in VeloRegistry — all with zero MetaMask popups

Returning users are recognised from the session cache and bypass onboarding entirely.

### Opening a Position

1. Select a pair (17 available: BTC, ETH, SOL, AVAX, LINK, DOGE, NEAR, INJ, APT, ARB, OP, SUI, TIA, SEI, RENDER, WLFI, POL)
2. Choose LONG or SHORT, set collateral and leverage (up to 25×)
3. Click Buy/Long or Sell/Short — the trading wallet signs the transaction locally, no MetaMask popup
4. The contract fetches the Pyth oracle price, pulls collateral via `safeTransferFrom`, charges a 0.10% open fee, and stores the Position struct keyed by a unique `tradeId`
5. The position appears in the UI within 5 seconds (one polling interval)

### Closing a Position

Close 100% or a partial fraction via the Close modal slider. The contract reads the current oracle price, computes PnL, deducts a 0.10% close fee, and returns the net payout to the trading wallet. Profitable trades pull from the pool; losing trades return residual collateral to the pool.

---

## The Velo Trading Wallet

The Velo Trading Wallet (also called the burner wallet or session key) is what makes Velo feel like a web2 app. It is a regular Ethereum EOA whose private key is derived deterministically from a MetaMask `personal_sign` signature.

**Derivation:**
```
Main Wallet (MetaMask)
  → signs VELO_DERIVATION_MESSAGE (fixed string, includes domain + chain ID)
  → produces a 65-byte hex signature (r || s || v)
  → keccak256(signatureBytes) → 32-byte hash
  → This hash is the trading wallet's private key
  → privateKeyToAccount(privateKey) → { address, signing functions }
```

Because `personal_sign` is deterministic, the same main wallet always derives the same trading wallet. **Recovery is automatic** — a user who clears their browser re-derives the same key by signing the same message on any device.

Key properties:
- Every trade signs locally in the browser — zero MetaMask popups after initial setup
- The trading wallet holds only the funds you explicitly move there
- The main wallet stays cold — it never signs a transaction during normal trading
- The private key can be exported from Settings and imported into any EVM wallet for manual access
- Stored in localStorage under `velo_burner_<ownerAddress>` and validated on every load

---

## Order Types & Execution

### Market Orders
Execute immediately at the current Pyth oracle price. The trading wallet signs `openPosition(pairIndex, isLong, collateral, leverage, pythUpdateData)` and the transaction confirms in one block.

### Limit Orders
Set a trigger price at which you want to enter. The order is stored fully on-chain via `placeConditionalOrder()` with collateral locked immediately. The limit/stop keeper scans all open orders every minute and executes when the mark price reaches the trigger. The contract re-validates the trigger on-chain — the keeper cannot fill an order at the wrong price.

### Stop Orders
Same mechanics as limit orders, but trigger in the opposite direction. Stored and executed identically via `placeConditionalOrder()` with `triggerKind = STOP`.

### Take Profit (TP)
Set via `setTriggers(tradeId, takeProfit_E18, stopLoss_E18)`. The TP must be above entry price for longs (below for shorts). The TP/SL keeper calls `closeIfTriggered(tradeId, pythUpdateData)` when the mark crosses the trigger. A 0.25% keeper bounty is paid from the close payout.

### Stop Loss (SL)
Symmetric to TP — set below entry for longs, above for shorts. Same keeper execution path.

### Partial Close
Close any fraction of a position (1–100%) via the "Close" button → portion slider. The contract resizes the position proportionally and returns the payout pro-rata.

---

## Trigger Price vs Fill Price

This is the most important thing to understand about oracle-priced perpetuals, and it is **identical behaviour** to GMX, Gains Network, and every other oracle perp.

When a keeper executes a limit order, TP, or SL, two things happen in the same transaction:
1. A fresh Pyth price update is pushed on-chain from Hermes
2. The contract uses that pushed price for **both** the trigger check and the PnL calculation

The price you set is the **trigger price** — the threshold the keeper watches for. The **fill price** is the live oracle price at the moment the keeper's transaction mines, which can differ by a few dollars depending on price movement in the window between the trigger being hit and the keeper's next cron tick (up to 60 seconds on Vercel).

**Example:** You set a limit buy on ETH at $2,000. The price dips to $1,998 when the keeper fires. You fill at $1,998 — price improvement. If ETH bounced back to $2,001 by the time the tx mines, the contract reverts `OrderNotTriggered` and the order stays open for the next tick.

**For TP/SL:** A TP set at $2,014 might fill at $2,011 if price moved between the trigger crossing and the keeper's transaction landing. This is not a bug — it is the inherent nature of keeper-executed oracle perps. On mainnet with a fast keeper running every few seconds, this spread narrows to near-zero. On Base Sepolia with Vercel's once-per-minute cron, you may see fills a few dollars from your trigger in volatile markets. This is a **testnet infrastructure characteristic**, not a protocol flaw.

---

## Keeper Infrastructure

Velo runs three automated keeper jobs, each executing every minute via Vercel Pro cron:

### Limit/Stop Keeper (`api/cron-conditional-orders.ts`)
1. Reads all open conditional orders from the contract
2. Fetches a fresh Pyth price for each pair (once per unique pair per run, cached)
3. For each order whose trigger condition is met, submits `executeConditionalOrder` with the exact on-chain Pyth fee
4. All triggered orders fire in parallel — multiple fills complete in roughly one block

### TP/SL Keeper (`api/cron-tp-sl.ts`)
1. Reads all open positions with full position structs
2. Fetches fresh Pyth prices per unique pair from Hermes (bypasses the on-chain cache staleness issue common on low-activity testnets)
3. Evaluates TP/SL conditions off-chain using the same arithmetic as the contract
4. Submits `closeIfTriggered` for triggered positions, all in parallel

### Liquidation Keeper (`api/cron-liquidate.ts`)
1. Reads all open positions
2. Computes unrealised PnL off-chain using fresh Hermes prices
3. Calls `liquidate(tradeId, pythUpdateData)` for positions where loss ≥ 90% of collateral
4. The 1% liquidation bounty is paid to the keeper wallet, making it partially self-funding

### Critical: Pyth Fee Exactness
The VeloPerps contract enforces `msg.value == PYTH.getUpdateFee(updateData)` with **strict equality** — any deviation reverts with `PythFeeMismatch`. All three keepers query the exact fee on-chain via `getUpdateFee(updateData)` before every submission. Hardcoding the Pyth fee (a common mistake that caused every keeper call to silently revert before this was fixed) will cause the `PythFeeMismatch` revert regardless of whether the trigger condition is met.

---

## Price Oracle & Execution Model

Velo uses **Pyth Network** as its primary price oracle with the pull-model architecture.

**How it works:**
1. Every transaction that needs a price fetches a fresh update from Pyth's Hermes HTTP gateway
2. The `updateData` bytes are passed into the transaction as calldata
3. The contract calls `PYTH.updatePriceFeeds(updateData)` and charges `PYTH.getUpdateFee(updateData)` in ETH
4. The contract reads `PYTH.getPriceNoOlderThan(feedId, 60)` — if the price is older than 60 seconds, it reverts
5. The price is normalised to E18 fixed-point: `price * 10^(18 + expo)`

**17 supported trading pairs:** BTC, ETH, SOL, AVAX, LINK, DOGE, NEAR, INJ, APT, ARB, OP, SUI, TIA, SEI, RENDER, WLFI, POL — each mapped to a verified Pyth feed ID.

**Staleness on testnet:** On Base Sepolia (low activity), the on-chain Pyth cache can go stale. The keepers solve this by always including a fresh Hermes update in the keeper transaction — the price is always fresh at execution time regardless of on-chain cache state.

### One Oracle, Everywhere

Velo reads **Pyth and only Pyth** across the entire interface, so every number agrees with the price you actually fill at:

- **Live mark price** streams from Pyth's Hermes SSE endpoint (`/v2/updates/price/stream`), the same feed the contract settles on
- **Chart candles** come from the TradingView widget pointed at Pyth symbols (`PYTH:SOLUSD`, etc.) and from the Pyth Benchmarks OHLC shim
- **The order book** is a reference depth ladder anchored to the live Pyth mark — Velo Perps is oracle-priced and has no native book
- **Fills, entry prices, and PnL** are the on-chain Pyth price, exactly as before

The only variance you'll ever see between your entry and the live mark is normal tick timing — entry is locked at fill, the mark keeps moving. That's identical to how every exchange behaves.

---

## Trading Interface Design

The interface is built to surface exactly what a trader needs to know, at the moment they need to know it.

### Pre-Trade Risk Display

Before submitting any order, the entry panel shows three numbers:

- **Est. Liq. Price** — your estimated liquidation price at the current size and leverage, shown in orange
- **Margin Risk** — a live classification (LOW / MEDIUM / HIGH / EXTREME) computed from the percentage distance between the current mark and the estimated liquidation price. Updates in real-time as you adjust leverage or size
- **Free Balance** — buying power remaining after this position

These aren't informational decorations. They're there because the trader who built this has had positions liquidated.

### Position Table Column Tooltips

Every column header in the positions table is a `cursor: help` element with a hover tooltip. The `ColTip` component anchors the tooltip to the trigger via `getBoundingClientRect` so it doesn't drift while the table scrolls, uses enter and leave delays to prevent accidental dismissals from cursor jitter, edge-clamps to stay visible near screen boundaries, and renders via a React portal so it always layers above everything else. The content:

- **Pair** — Trading pair: the asset you are long or short against USD
- **Side** — LONG profits when price rises, SHORT profits when price falls
- **Size** — Total notional value of your position (margin × leverage)
- **Entry** — Average price at which your position was opened
- **Mark** — Current fair-market price used for PnL and liquidation calculations
- **Liq.** — Liquidation price: your position is force-closed if the mark price reaches this level
- **Buffer** — Distance between current mark price and your liquidation price, as a percentage. Lower = closer to forced close
- **PnL (ROE)** — Unrealized profit/loss in USD · Return on equity (leverage-adjusted %)
- **TP/SL** — Take Profit / Stop Loss prices. Click the edit icon to set or change them

### The Buffer Column

Buffer is not a standard column on most platforms. You get a liquidation price and you do the math yourself. Buffer shows you the percentage distance from current mark to liquidation, updated live. Colour-coded in the row: EXTREME (< 2%), HIGH (< 5%), MED (< 10%), LOW (≥ 10%). At high leverage, a 2% buffer means a 2% adverse move ends the position.

### Leverage Change Confirmation

VeloPerps locks leverage at the time a position is opened — there is no post-open leverage adjustment at the contract level. If you change the leverage slider while an existing position is open on that pair, the interface intercepts before submitting anything. The confirmation modal has three distinct states:

- **Insufficient balance** — you don't have the free balance required. Explains what's blocked and why
- **Increasing leverage** — shows current liq. distance, new liq. distance (colour-coded: red below 5%, orange below 10%, green above), new liq. price, and a plain explanation of what moves and by how much. Confirm button turns orange
- **Reducing leverage** — shows current and new liq. distance, how much collateral is released back to free balance. Confirm button stays violet

### TP/SL Validation Against Actual Fill Price

When you enter a market order with a pre-set TP or SL, the targets are validated against your actual fill price from the `PositionOpened` event — not the mark price shown when you clicked. If the market moved between click and transaction confirmation and your pre-set TP ended up on the wrong side of the real entry, you receive a specific message:

> "TP must be above entry for LONG. Actual entry: $X. Your TP: $Y. Adjust from the position panel."

No silent failures, no triggers sitting at prices that will never execute correctly.

### Manage Position Modal

Four tabs, all signed silently by the trading wallet:

**TRIGGERS (TP/SL)** — Two sliders on the same axis: green for take profit (projected gain %), red for stop loss (projected loss %). Price input and slider are bidirectionally linked — type a price, the slider moves; drag the slider, the price field updates. Shows projected PnL and ROE at each trigger price. Submits `setTriggers` on confirmation.

**CLOSE** — Percentage slider from 1% to 100% with a live position size preview at the selected fraction. Shows the exact USD size being closed. Calls `partialClose(tradeId, fractionBps)`. The "Close 100%" button on the position card bypasses this modal entirely for speed.

**ADD** — Deposit additional collateral into the position. Reduces effective leverage, moves the liquidation price further away. Balance impact shown before confirmation.

**REDUCE** — Withdraw collateral from the position. Increases effective leverage. Requires a fresh Pyth price fetch for the contract's post-reduce leverage check.

### Order Details Modal

Clicking any entry in the History tab opens a full trade breakdown. For closed trades: entry price, exit price, price change %, position size, leverage, margin used, margin mode, liquidation price at time of trade, open and close timestamps, duration, and a deep link to the closing transaction on BaseScan. That link is persisted in localStorage against the `tradeId` so it survives page reloads. Esc closes the modal.

### Number Formatting

Every price, balance, and trade size uses `Geist Mono` with `font-feature-settings: "tnum" 1` and `font-variant-numeric: tabular-nums`. Numbers never shift horizontally as they update — which matters in a live position table where you're watching PnL move.

---

## The Social Layer

**The Feed** — A real-time Twitter-style post feed. Traders post text, analysis, and trade cards with `$BTC`-style ticker tags that route to the pair's market page. Every embedded trade card carries an on-chain transaction hash for independent verification on BaseScan.

**Profiles** — Every wallet is a public profile. Stats: realised PnL, win rate, average leverage, trade count. The trade history table lists every closed position with entry, exit, PnL, and a BaseScan link to the closing transaction.

**Notifications** — In-app notifications for position closes, follows, likes, reposts, and copy-trade subscriptions. Deep-links open the relevant position detail modal or post.

**Shareable Trade Cards** — Closed positions with PnL ≥ $0.50 prompt a share modal. The card renders on a 1200×675 canvas (Twitter/Instagram optimal) with three background styles (Obsidian, Gradient, Hologram). Download as PNG or share via the Web Share API.

**On-Chain Username Registry** — `@handles` are stored in VeloRegistry. The Send modal resolves `@username → wallet address` on-chain. Username registration is a real transaction, not a database row.

---

## Leaderboard & Copy-Trading

The leaderboard ranks every trader by realised PnL computed from on-chain trade history. Rankings cannot be faked — every row corresponds to real transactions at real prices.

**Copy-trading** lets any user subscribe to a trader's positions. When the leader opens a position, the copier's session key automatically mirrors it proportionally (same pair, same side, proportional collateral). Copy subscriptions are stored in Supabase; execution is client-side via the copier's Velo Trading Wallet.

---

## Cross-Chain Deposits & Withdrawals

Velo mUSDC is a LayerZero V2 OFT deployed on four Sepolia testnets. Users can deposit from any chain into their Base Sepolia trading wallet, and withdraw to any chain or address.

**Same-chain (Base Sepolia):** A standard ERC-20 transfer, signed by the trading wallet.

**Cross-chain:** `oft.send()` on the source chain triggers a LayerZero V2 message. mUSDC arrives on Base in 1–3 minutes. The LayerZero native fee is shown before submission.

**Send to @username or 0x address:** The Send modal resolves handles via VeloRegistry and sends mUSDC silently using the trading wallet.

---

## Protocol Fees

| Action | Rate |
|--------|------|
| Open fee | 0.10% of collateral |
| Close fee | 0.10% of gross payout |
| TP/SL keeper bounty | 0.25% of net payout |
| Liquidation bounty | 1.00% of collateral |

Fees accrue in `feeBalance` inside the contract. The protocol owner can withdraw accrued fees; no other address can. No spread, no withdrawal fee, no hidden markup.

---

## Admin Panel

Visible only to the contract owner wallet. Provides:
- **Pair registry** — view all 17 pairs, register pending pairs, pause/resume individual pairs
- **Fee balance** — current accrued fees in mUSDC, one-click withdraw to owner wallet
- **Pool reserves** — live contract mUSDC balance
- **Contract metadata** — all addresses with BaseScan links; the active-contract row and routing badge read the live on-chain `VERSION` (e.g. `v3.1`), so the panel never goes stale when a new contract is deployed
- **Keeper wallet balance** — monitors sponsor wallet ETH with low-balance warning

### Analytics & metrics

The admin dashboard surfaces a full metrics suite across three data sources, refreshed together by the Refresh button:

**Trading metrics** (`/api/protocol-stats`) — sourced from the app's own `trade_history` and `positions` records in Supabase, so they're version-agnostic (capture every trade regardless of which VeloPerps contract it routed to) and never depend on scanning chain events:
- Lifetime volume (sum of opened notional), lifetime fees (0.10% per side, charged on **collateral** to match the contract), opens/closes, liquidations, realized PnL
- Trailing 24h / 7d / 30d rollups for volume, trades, fees, and liquidations
- **Open positions & open interest** — counted directly on-chain by enumerating live `tradeId`s on the active contract (closed positions are `delete`d from the contract, so a non-zero collateral = an open position). This is authoritative for V3.x where positions live in the contract, not the database.
- Daily charts: volume, fees, opens vs closes, liquidations
- On-chain cross-reference block: live `VERSION`, `nextTradeId` (lifetime opens), and `feeBalance`

**User metrics** (`/api/user-stats`) — sourced from Supabase via the service-role key:
- Total users, wallet-authenticated users, new signups (today / 7d / 30d)
- DAU / WAU / MAU, computed from a `last_active_at` heartbeat (the client pings `touch_activity()` on load, on tab focus, and every 3 minutes); falls back to trade-history-derived activity if the migration hasn't run
- Daily charts: signups and daily-active-users

**Web analytics** (`/api/ga-stats`, optional) — live Google Analytics 4 numbers (active users 1d/7d/28d, pageviews, sessions, top pages) when a GA4 service account is configured; otherwise a connect-state card. GA event tracking itself is always on via `src/services/analytics.ts`.

All three endpoints are public JSON and can be scraped by Datadog, Grafana, or custom dashboards on a schedule.

### Required environment variables for metrics

| Variable | Purpose |
| --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | Lets `/api/protocol-stats` and `/api/user-stats` read the full `trade_history`, `positions`, and `profiles` tables past row-level security. Without it the trading/user cards are empty. |
| `VITE_VELO_PERPS_V3_ADDRESS` | The active V3.1 contract address. Drives the version label, routing badge, on-chain open-position count, and the contract the stats API cross-references. |
| `VITE_GA_MEASUREMENT_ID` | GA4 tag (`G-XXXX`). Optional — defaults to the built-in property; set to override. Enables visit/page-view tracking. |
| `GA_PROPERTY_ID`, `GA_CLIENT_EMAIL`, `GA_PRIVATE_KEY` | Optional GA4 service-account creds to show live GA numbers inside the dashboard. |

Run `SUPABASE_MIGRATION_BUILD91_ANALYTICS.sql` once to add the `last_active_at` column, the `user_activity_daily` table, and the `touch_activity()` heartbeat RPC that power DAU/WAU/MAU.

---

## Progressive Web App (PWA)

Velo ships as a fully installable Progressive Web App. On every platform, users can add it to their home screen or dock and open it like a native application — no app store, no install process, no browser chrome.

### How it works

A `manifest.json` declares the app's name, icons, theme colour, and display mode (`standalone`). A service worker handles installation eligibility and caches static assets so the shell loads instantly on repeat visits. The `beforeinstallprompt` event is captured and held until the user is prompted, giving full control over when and how the install nudge appears.

### Platform behaviour

**iOS (Safari) — Add to Home Screen**
Safari on iPhone and iPad does not expose the `beforeinstallprompt` API. Velo detects iOS and shows a step-by-step instruction sheet: tap Share → Add to Home Screen → Add. Once installed, Velo opens full-screen with `apple-mobile-web-app-status-bar-style: black-translucent`, so the status bar overlays the app background rather than pushing a white bar above it. The `apple-touch-icon` chain covers all retina sizes.

**Android (Chrome / Edge / Samsung Browser)**
The browser fires `beforeinstallprompt` after Velo passes the PWA installability checklist. A branded install banner appears — gradient V logo, app name, one-tap Install button — which calls `prompt()` on the deferred event. If the user accepts, the OS adds Velo to the home screen and the banner disappears permanently.

### Install banner

`PWAInstallBanner.tsx` handles both mobile platforms from a single component. It checks `display-mode: standalone` on load — if already installed, nothing renders. Desktop browsers are intentionally excluded; the install experience is optimised for mobile traders. Dismissals are stored in `sessionStorage` so the banner never re-appears within a session. A `velo:installable` custom event is dispatched when the browser prompt becomes available, letting any part of the React tree react to it.

### Icons

Nine icon sizes (72×72 → 512×512) plus a 180×180 Apple touch icon. All generated from the canonical Velo SVG: diagonal `#7B3CE8 → #3B5BFF → #A8C8FF` gradient background, glass highlight overlay, italic Fraunces *V* in `#F4F1E8`.

---

## Tech Stack

**Smart Contracts**
- Solidity 0.8.22 compiled with Foundry
- OpenZeppelin Contracts 5.x — Ownable, ReentrancyGuard, SafeERC20, ERC20
- Pyth Network EVM SDK — pull-model oracle integration
- LayerZero V2 OFT — cross-chain USDC across four Sepolia testnets
- PerpsMath.sol — pure-Solidity PnL, liquidation threshold, and fee arithmetic library

**Frontend**
- React 19 + Vite 6 + TypeScript 5.8
- wagmi v2 + viem v2 — Ethereum state and transaction signing
- Reown AppKit v1.7 — multi-wallet connection (MetaMask, WalletConnect, Coinbase, social login)
- Zustand v5 — global state management
- @tanstack/react-query v5 — server-state caching
- TradingView Widget — real candle charts (Pyth `PYTH:*` symbols) with full drawing tools and indicator library
- Recharts — portfolio PnL chart
- Lightweight Charts 5.1 — additional charting
- Lucide React — icon system
- Fraunces + Geist + Geist Mono — brand typography
- Design system — the "Obsidian glass" visual identity: OKLCH design tokens, frosted-glass surfaces, restrained violet→blue accents, and a faint ambient glow, all driven from `src/styles/tokens.css` + `brand.css` (light/dark theming cascades from the tokens). The same brand system powers the `velotrading.live` marketing site, so the terminal and the landing read as one product.

**Backend / Data**
- Supabase (PostgreSQL + Realtime) — social graph, profile metadata, trade history index, notifications
- Pyth Hermes — HTTP gateway for price update bytes, live SSE price stream, and (via Pyth Benchmarks) OHLC chart candles
- Vercel Serverless Functions — keeper crons, gas sponsor API, protocol stats endpoint

**Infrastructure**
- Vercel Pro — frontend hosting, edge CDN, per-minute cron jobs
- Base Sepolia (chain ID 84532) — primary execution chain
- PublicNode — reliable public RPC endpoints
- Reown Cloud — WalletConnect relay infrastructure

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  Browser — React 19 + Vite 6                                     │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Velo Trading Wallet (session key, in localStorage)      │   │
│  │  Derived from MetaMask signature. Signs every trade.     │   │
│  │  Zero MetaMask popups during trading.                    │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                   │
│  useVeloPerpsTrading() ── 5s polling loop                        │
│  Social (Feed, Leaderboard, Profiles) ←→ Supabase Realtime      │
│  Prices ←→ Pyth only: Hermes live stream + Benchmarks candles   │
└──────────────────────────────┬───────────────────────────────────┘
                               │  viem writeContract / readContract
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│  Base Sepolia (chain ID 84532)                                   │
│                                                                   │
│  ┌─────────────────┐  ┌─────────────────┐  ┌───────────────┐   │
│  │  VeloPerpsV3.1  │  │  VeloMockUSDC   │  │ VeloRegistry  │   │
│  │  Oracle perp    │◄─┤  ERC-20 + LZ    │  │ @username →   │   │
│  │  engine V3.1    │  │  V2 OFT, faucet │  │ 0x... mapping │   │
│  └────────┬────────┘  └────────┬────────┘  └───────────────┘   │
│           │                    │                                  │
│  ┌────────▼────────┐           │ LayerZero V2 OFT                │
│  │  Pyth Network   │           ├── Arbitrum Sepolia mUSDC        │
│  │  Pull Oracle    │           ├── Optimism Sepolia mUSDC        │
│  └─────────────────┘           └── Ethereum Sepolia mUSDC        │
└──────────────────────────────────────────────────────────────────┘
                    ▲
                    │  HTTP (Vercel crons, every 60s)
┌───────────────────┴──────────────────────────────────────────────┐
│  Vercel Serverless Functions                                      │
│  cron-conditional-orders.ts  — limit/stop fill keeper            │
│  cron-tp-sl.ts               — take profit / stop loss keeper    │
│  cron-liquidate.ts           — liquidation keeper                │
│  sponsor-eth.ts              — gas sponsor for new users         │
│  protocol-stats.ts           — on-chain analytics endpoint       │
└───────────────────────────────────────────────────────────────────┘
```

**Source of truth per data type:**
- Positions, balances, PnL → **VeloPerps contract** (polled every 5s)
- Usernames, wallet resolution → **VeloRegistry contract**
- Social posts, comments, follows, notifications → **Supabase** (social DB + cache)
- Trade history → **both**: Supabase for indexed queries, on-chain events for proof (every row carries a tx hash)

---

## Deployed Contracts

| Chain | Contract | Address |
|-------|----------|---------|
| Base Sepolia | **VeloPerpsV3.1** (active, VERSION=31) | [`0x41fDb544D7247a5ddc6B4C06F29D09f2b20de907`](https://sepolia.basescan.org/address/0x41fDb544D7247a5ddc6B4C06F29D09f2b20de907) |
| Base Sepolia | VeloPerpsV3 (previous) | [`0x3780e858B76027E6D6cB0c74E863f712a0F0E27E`](https://sepolia.basescan.org/address/0x3780e858B76027E6D6cB0c74E863f712a0F0E27E) |
| Base Sepolia | **VeloMockUSDC** | [`0x5EFaF3F69b09bC2abF3439bDC0C93bf611026699`](https://sepolia.basescan.org/address/0x5EFaF3F69b09bC2abF3439bDC0C93bf611026699) |
| Base Sepolia | **VeloRegistry** | [`0x7e510d615a8afDfaa324F790F3E54e520756ECe2`](https://sepolia.basescan.org/address/0x7e510d615a8afDfaa324F790F3E54e520756ECe2) |
| Arbitrum Sepolia | VeloMockUSDC | [`0xEC76fD9182ba15ff193FDBc122013FCa18900290`](https://sepolia.arbiscan.io/address/0xEC76fD9182ba15ff193FDBc122013FCa18900290) |
| Optimism Sepolia | VeloMockUSDC | [`0xEC76fD9182ba15ff193FDBc122013FCa18900290`](https://sepolia-optimism.etherscan.io/address/0xEC76fD9182ba15ff193FDBc122013FCa18900290) |
| Ethereum Sepolia | VeloMockUSDC | [`0x96d0CF69896FE6b5B031D21967f027d95Eb42e9A`](https://sepolia.etherscan.io/address/0x96d0CF69896FE6b5B031D21967f027d95Eb42e9A) |

**Protocol owner:** `0x8f8fF5A29760278C7B54D450dA57A13Cd3FD3A8b`
Owner privileges: register new trading pairs, withdraw accrued fees, set LayerZero peers. The owner cannot touch user collateral, modify positions, or freeze the protocol.

---

## Repository Layout

```
contracts/
├── src/
│   ├── VeloPerpsV3_1.sol           Active perp engine (VERSION=31)
│   ├── VeloPerpsV3.sol             Previous version (still deployed)
│   ├── VeloMockUSDC.sol            ERC-20 + LayerZero V2 OFT + faucet
│   ├── VeloRegistry.sol            On-chain @username → 0x resolver
│   ├── interfaces/
│   │   ├── IPyth.sol               Pyth interface (V1)
│   │   └── IPythV2.sol             Pyth interface (V2, active)
│   └── libraries/PerpsMath.sol     Pure PnL / liquidation / fee math
├── script/
│   ├── DeployBaseSepolia.s.sol     V3.1 deploy script
│   ├── DeployRemoteUSDC.s.sol      OFT deploy on remote chains
│   └── WirePeers.s.sol             LayerZero peer relationships
├── test/VeloPerpsV3.t.sol          Foundry test suite
└── deployments/base_sepolia.json   Deployed addresses

api/
├── cron-conditional-orders.ts     Limit/stop keeper (every 1 min)
├── cron-tp-sl.ts                  TP/SL keeper (every 1 min)
├── cron-liquidate.ts              Liquidation keeper (every 1 min)
├── sponsor-eth.ts                 Gas sponsor for new users
└── protocol-stats.ts              On-chain analytics endpoint

src/
├── App.tsx                         Top-level shell (~9,000 lines)
├── components/
│   ├── VeloOnboardingModal.tsx     First-run unified onboarding
│   ├── VeloManagePositionModal.tsx TP/SL, partial close, margin mgmt
│   ├── VeloAdminPanel.tsx          Protocol owner dashboard
│   ├── VeloBridgeModal.tsx         LayerZero bridge modal
│   ├── VeloCrossAccountModal.tsx   Cross-margin account manager
│   ├── VeloSendModal.tsx           Send mUSDC to @handle or 0x
│   ├── VeloShareCard.tsx           Trade card canvas renderer
│   ├── VeloShareTradeModal.tsx     Post-close share prompt
│   ├── TradingViewChart.tsx        TradingView widget wrapper (Pyth symbols)
│   ├── OrderBook.tsx               Pyth-anchored depth panel
│   ├── PortfolioChart.tsx          Dashboard PnL chart
│   ├── SettingsModal.tsx           Wallet, key export, network panel
│   └── ui/
│       ├── OrderDetailsModal.tsx   Position/trade detail breakdown
│       └── pages/
│           ├── Dashboard.tsx       Portfolio overview
│           ├── TradeView.tsx       Main trading screen
│           └── MarketsView.tsx     Pair price grid
├── services/
│   ├── veloPerpsService.ts         Full V3.1 ABI + contract wrappers
│   ├── useVeloPerpsTrading.ts      5s polling React hook
│   ├── pythService.ts              Pyth Hermes price fetch + staleness guard
│   ├── pythPriceService.ts         Unified UI pricing — Hermes SSE stream + Benchmarks candles
│   ├── veloBurnerWallet.ts         Deterministic session key derivation
│   ├── veloBurnerSetup.ts          First-run burner orchestration
│   ├── bridgeService.ts            LayerZero V2 cross-chain transfer
│   ├── supabaseStore.ts            Supabase queries + realtime
│   └── web3Config.ts               Wagmi 4-chain configuration
└── styles/
    ├── tokens.css                  CSS custom property system
    └── brand.css                   Typography + brand overrides

SUPABASE_SCHEMA.sql                 Base schema for all social tables
vercel.json                          Cron schedule + routing + security headers
```

---

## Running Locally

### Prerequisites
- Node.js 20+
- Foundry (contracts): `curl -L https://foundry.paradigm.xyz | bash && foundryup`

### Frontend
```bash
git clone https://github.com/stanisnear/velo-trading-terminal
cd velo-trading-terminal
npm install
# Copy .env.example to .env.local and fill in your keys
npm run dev
# Opens at http://localhost:5173
```

### Contracts
```bash
cd contracts
forge install
forge test -vvv
```

---

## Environment Variables

Set in **Vercel → Settings → Environment Variables** (or `.env.local` for local dev):

```bash
# Supabase
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>

# Reown AppKit (WalletConnect)
VITE_WALLETCONNECT_PROJECT_ID=<project-id>

# Contracts — Base Sepolia (active)
VITE_VELO_PERPS_V3_ADDRESS=0x41fDb544D7247a5ddc6B4C06F29D09f2b20de907
VITE_VELO_PERPS_ADDRESS=0x28fE36d4ae72ab0E05fa6edafE1D6e11E9DD6163
VITE_VELO_REGISTRY_ADDRESS=0x7e510d615a8afDfaa324F790F3E54e520756ECe2
VITE_VELO_USDC_BASE=0x5EFaF3F69b09bC2abF3439bDC0C93bf611026699

# Remote OFT addresses
VITE_VELO_USDC_ARB=0xEC76fD9182ba15ff193FDBc122013FCa18900290
VITE_VELO_USDC_OP=0xEC76fD9182ba15ff193FDBc122013FCa18900290
VITE_VELO_USDC_ETH=0x96d0CF69896FE6b5B031D21967f027d95Eb42e9A

# RPC endpoints
VITE_BASE_SEPOLIA_RPC_URL=https://base-sepolia-rpc.publicnode.com
VITE_ARB_SEPOLIA_RPC_URL=https://arbitrum-sepolia-rpc.publicnode.com
VITE_OP_SEPOLIA_RPC_URL=https://optimism-sepolia-rpc.publicnode.com
VITE_ETH_SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com

# Pyth
VITE_PYTH_HERMES_URL=https://hermes.pyth.network
VITE_PYTH_BENCHMARKS_URL=https://benchmarks.pyth.network

# Server-side only — never reaches the browser
VELO_SPONSOR_PRIVATE_KEY=0x<funded-ops-wallet-private-key>
VITE_KEEPER_ADDRESS=0x<public-address-of-ops-wallet>
```

---

## Supabase Setup

Run in order in the Supabase SQL editor:

1. `SUPABASE_SCHEMA.sql` — creates all tables, RLS policies, and indexes
2. `SUPABASE_MIGRATION_PUBLIC_READ_FIX.sql` — ensures the `authenticated` role can read public tables alongside `anon`

---

## Mainnet Roadmap

### Now — Testnet (Base Sepolia)
Fully operational. All order types work (market, limit, stop, TP/SL, partial close). Keeper infrastructure running every minute. Social layer live. Cross-chain bridging active. Provable on-chain trade history for every closed position.

### V2 — Mainnet Launch (Base Mainnet)
After a security audit:
- Real USDC replaces mUSDC
- Insurance fund seeded from protocol fees (target: 5% of TVL)
- Funding rate — hourly long/short payments to balance open interest
- Secondary oracle (Chainlink) as a Pyth sanity check
- Multisig ownership (Safe, 3-of-5)
- Dynamic fees scaled by trade size and protocol delta exposure

### V3 — Velo Vaults
On-chain copy-trading vaults. Vault leaders control trading; copiers deposit capital. Rules (performance fee, lockup, max drawdown) are coded in Solidity.

### V4 — Governance Token
Issued to early traders, profitable vault leaders, and keepers based on verifiable on-chain activity. Governs fees, pair listings, treasury. No presale, no IDO — issued only after proven product-market fit.

### V5 — Multi-Venue Routing
Velo Vaults route trades to any compatible execution venue for best execution. Protocol captures rebates from routed flow.

---

## Future Infrastructure

### Keeper Network — From Cron to Validator Set
Today's keepers run on Vercel's 60-second cron. For mainnet, a permissioned-then-permissionless keeper network where registered nodes compete to submit fills and earn the bounty. Initially Velo-operated on AWS EC2 in multiple regions, progressively opened to external operators who post a bond.

### Multiple Oracle Sources
Pyth remains primary. Chainlink added as a circuit-breaker — if the two oracles diverge beyond a configurable threshold, the protocol pauses fills until they reconverge.

### Dedicated Indexer
A Graph subgraph or custom Ponder indexer for mainnet scale. The metrics APIs currently aggregate from Supabase records plus O(1) on-chain reads (open positions/interest enumerated live from the contract); a subgraph would replace this with an event-sourced GraphQL API serving the Admin Panel, Leaderboard, and external integrations.

### AWS Infrastructure + Terraform
Mainnet infrastructure managed as code: EC2 keeper nodes (multi-region), RDS PostgreSQL, Elasticache Redis, CloudFront CDN, CloudWatch + PagerDuty alerting.

### Smart Contract Upgrades
A UUPS or Beacon proxy pattern with a 48-hour timelock on all upgrades governed by the multisig. Emergency pause function for circuit-breaker scenarios.

### Funding Rate Engine
A new contract module tracking long/short open interest per pair, computing the funding rate proportional to OI imbalance, accruing per block, and settling on position open/close/modify.

### Advanced Order Types
- Trailing stop — SL that moves with the market
- One-cancels-other (OCO) — linked TP/SL that cancel each other on fill
- TWAP orders for large positions
- Reduce-only orders

### Security and Audits
Full audit by at least two independent firms (Spearbit, Trail of Bits, Cyfrin, or equivalent) before mainnet. Bug bounty program on Immunefi. Formal verification of the PerpsMath library.

---

## License

MIT.
