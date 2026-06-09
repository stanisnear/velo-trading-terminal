# Velo — On-Chain Perpetual Futures with a Social Layer

**Live on Base Sepolia. Every trade is a real blockchain transaction. Every position is verifiable.**

**Marketing site:** [velotrading.live](https://velotrading.live)  ·  **Live terminal:** [app.velotrading.live](https://app.velotrading.live)

> Velo runs as two surfaces sharing one brand system: a marketing landing on the apex domain (`velotrading.live`) and the trading terminal on the `app.` subdomain (`app.velotrading.live`).

Velo is a decentralised perpetual futures exchange where every order, position, and settlement happens on-chain — no off-chain matching engine, no custody, no trust required. Underneath the trading terminal, a full social product lets traders post, follow, comment, and compete on a transparent, on-chain-verified leaderboard.

This README reflects the **audited** state of the build. Where a feature is designed but not yet wired, it says so explicitly.

---

## Table of Contents

- [What Velo Is](#what-velo-is)
- [How It Works End-to-End](#how-it-works-end-to-end)
- [The Velo Trading Wallet](#the-velo-trading-wallet)
- [Order Types & Execution](#order-types--execution)
- [Trigger Price vs Fill Price](#trigger-price-vs-fill-price)
- [Keeper Infrastructure](#keeper-infrastructure)
- [Price Oracle & Execution Model](#price-oracle--execution-model)
- [Network Handling](#network-handling)
- [The Social Layer](#the-social-layer)
- [Leaderboard](#leaderboard)
- [Funds: Faucet, Deposit, Send, Withdraw, Bridge](#funds-faucet-deposit-send-withdraw-bridge)
- [Notifications & Realtime](#notifications--realtime)
- [Admin Panel](#admin-panel)
- [Progressive Web App (PWA)](#progressive-web-app-pwa)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Deployed Contracts](#deployed-contracts)
- [Repository Layout](#repository-layout)
- [Running Locally](#running-locally)
- [Environment Variables](#environment-variables)
- [Supabase Setup](#supabase-setup)
- [Known Gaps & Roadmap](#known-gaps--roadmap)
- [License](#license)

---

## What Velo Is

Velo is a self-custodial perpetual futures exchange on Base Sepolia with a native social product. The two halves reinforce each other:

- **Trading** is fully on-chain. Orders settle against the Pyth oracle through the VeloPerps contract. There is no off-chain order book and no custodian.
- **Social** is provable. Because settlement is on-chain, a trader's track record is reconstructed from blockchain history rather than self-reported — the leaderboard cannot be faked.

The product is built around a single insight: DeFi protocols usually fail at the interface, not the contract. Velo treats the terminal as a first-class product — precise tooltips, a live pre-trade risk classification, and an honest distinction between the price you see and the price you fill at.

---

## How It Works End-to-End

1. **Connect** a wallet via Reown AppKit — injected (MetaMask), WalletConnect, or social/email login. The app trades only on Base Sepolia and automatically requests a switch if the wallet is on another chain.
2. **Derive** the Velo Trading Wallet from one signature (see below). This burner signs trades locally, so there is no wallet popup per order.
3. **Fund** the trading wallet with testnet mUSDC (faucet, deposit, peer transfer, or bridge).
4. **Trade** — choose a market, side, leverage, and margin mode; optionally set TP/SL. Market orders fill at the live oracle price; the position is minted on-chain.
5. **Manage** — add/reduce margin, partial-close, edit TP/SL, or close at market. Keepers execute TP/SL and liquidations on-chain.
6. **Share & compete** — post trades, follow traders, and climb the leaderboard.

---

## The Velo Trading Wallet

Trading on Velo uses a **deterministically derived burner wallet**, not the user's main wallet, for a CEX-like experience without surrendering custody.

- On first connect, the user signs a fixed message (`VELO_DERIVATION_MESSAGE`, domain `name: 'Velo Trading'`, `version: '1'`, `chainId: 84532`). The signature is hashed with `keccak256` to derive a private key.
- The **private key lives only in the browser's localStorage.** It is never transmitted; the database stores only the derived public address.
- Because derivation is deterministic, the same wallet (and its funds) is recoverable on any device by re-signing the same message. On a new machine the app surfaces an explicit, persistent re-derivation prompt rather than silently firing a signature.
- Trades are signed locally by the burner — **no per-order wallet popup.**

---

## Order Types & Execution

- **Market** — fills immediately at the live Pyth price at execution time.
- **Limit** — rests until price crosses; margin is not deducted until fill.
- **Margin modes** — **Isolated** (each position independent, own entry/leverage/liquidation) and **Cross**.
- **Take-profit / Stop-loss** — stored on the position struct on-chain and executed by keepers.
- **Position management** — add margin, reduce margin, partial close, edit TP/SL (via the Manage modal), or one-click full market close.

Each open market position writes an OPEN row to trade history; closes write a CLOSE row with realized PnL. Both feed the dashboard's Recent Activity and the History tab, and persist across reloads and devices.

---

## Trigger Price vs Fill Price

A market order fills at the **live oracle price at execution**, which may differ from the price displayed when the button was clicked. This matters for TP/SL: a take-profit or stop-loss chosen before the fill can land on the wrong side of the *actual* entry.

Velo validates TP/SL against the **real fill price** after the position mints — not the pre-fill price. If a chosen trigger is invalid relative to the actual entry (e.g. a long's TP below entry), Velo skips that side, tells the user exactly what happened and the fill price, and invites them to set it from the position panel. This prevents the silent `InvalidTrigger` revert that would otherwise leave a keeper with nothing to act on.

---

## Keeper Infrastructure

Three Vercel cron jobs run every minute:

- `/api/cron-tp-sl` — executes take-profit / stop-loss triggers on-chain.
- `/api/cron-conditional-orders` — processes resting conditional orders.
- `/api/cron-liquidate` — liquidates positions past their maintenance threshold.

When a keeper closes a position, it disappears from the contract's open-positions set; the app detects this, writes the history row, and fires a notification + toast.

---

## Price Oracle & Execution Model

The contract settles against the **Pyth** oracle, and the entire UI reads the same feed so entry, mark, chart, and fill notifications all agree:

- **Live mark price** — Pyth Hermes SSE stream.
- **Initial snapshot** — Pyth Hermes latest REST.
- **Chart candles** — Pyth Benchmarks TradingView-compatible OHLC shim (with the TradingView widget as the primary chart).
- **Resilience fallback** — Binance/CoinGecko. Pyth stays primary (it's what the contract settles on), but Hermes can be rate-limited or blocked by a browser extension; the fallback keeps prices flowing so the app is never priceless.

VeloPerpsV3.1 reads prices via `parsePriceFeedUpdates` (a private `_extractPrice` helper). The older two-step `updatePriceFeeds` + `getPriceNoOlderThan` pattern silently returned stale/near-zero prices on testnet and is not used.

---

## Network Handling

Velo trades exclusively on **Base Sepolia (chain ID 84532)**. AppKit is configured with Base Sepolia as the default network. When a connected wallet is on any other chain:

- Velo **automatically requests a switch** to Base Sepolia via the wallet's native prompt (once per wrong-network state, so the user is never spammed if they decline).
- A top banner offers a one-tap **Switch Network** button and can be dismissed.

This replaces the older behavior where a wallet on an unsupported chain could land in a dead-end network-switch sheet.

---

## The Social Layer

The social product is native to the terminal:

- **Feed** — text, image, and trade-signal posts; like, repost, comment. All updates are live via Supabase Realtime (with auto-reconnect and a one-shot re-fetch on reconnect so nothing is missed).
- **Mentions** — `@handle` notifies the mentioned user (in posts and comments).
- **Cashtags** — `$TICKER` links to that market's token page.
- **Follows** — follower/following counts maintained server-side via RPC.
- **Profiles** — public profiles with bio, banner, posts, reposts, and on-chain trade history.
- **Token pages** — per-asset price + interactive chart + the social conversation for that ticker.
- **Single-post view** — permalinked posts (`/social/post/:id`), shareable like a tweet.
- **Peer transfers** — send mUSDC by `@handle` or address; the recipient gets a notification and an activity row.

**Designed but not yet wired:** threaded comment replies and comment-likes exist in the data model (`parentId`, `likes`, `likedBy` on the `Comment` type, a `CommentThread` component, and a `parent_id` column) but are not connected to the live UI — comments are currently flat. See [Known Gaps & Roadmap](#known-gaps--roadmap).

**Removed:** copy-trading was intentionally removed in favor of a cleaner social/leaderboard focus.

---

## Leaderboard

Traders are ranked by **verified on-chain performance**. Because PnL and win rate derive from blockchain history rather than self-reported numbers, the ranking is structurally resistant to fabrication. The leaderboard surfaces top traders with a podium for the leaders and links through to public profiles.

---

## Funds: Faucet, Deposit, Send, Withdraw, Bridge

- **Faucet** — claim testnet mUSDC into the trading wallet (first-run welcome flow and on demand).
- **Deposit** — move mUSDC from the connected wallet into the trading wallet.
- **Send** — peer-to-peer mUSDC transfer to another Velo user by `@handle` or `0x` address; recipient lookup is done with reliable sequential queries, and both a notification and a RECEIVE activity row are created for the recipient.
- **Withdraw** — move mUSDC from the trading wallet back out.
- **Bridge** — cross-chain mUSDC via LayerZero.

Pending deposits surface as a persistent pill and a Recent Activity row with live settling/credited/failed status.

---

## Notifications & Realtime

A real-time bell covers likes, follows, comments, mentions, transfers received, and trade events (position closed, TP/SL hit, liquidation).

Cross-user notifications (e.g. notifying the person you liked or paid) are written through **`SECURITY DEFINER` RPCs** (`create_notification_for_user`, `record_transaction_for_user`) because the recipient's `user_id` differs from the caller's `auth.uid()`, which RLS would otherwise block. Realtime channels for notifications, transactions, posts, likes, reposts, and comments each carry auto-reconnect with exponential backoff.

> If the bell appears empty when testing with a single account, that's expected: a user never receives like/follow/comment notifications from their own actions. Exercise it with a second account.

---

## Admin Panel

A gated panel (visible only to the contract owner / `velo_admins` allowlist) for operational tasks including on-chain pair registration and assigning verified badges. Verification is set through the `admin_set_verification` RPC, guarded by `is_velo_admin()`.

---

## Progressive Web App (PWA)

Velo is installable and works offline-first:

- Web manifest with full icon set.
- A service worker that caches only same-origin GET assets, never third-party/extension/RPC requests, and always returns a valid Response for navigations (network-first with a cached shell fallback).
- An install banner.

---

## Tech Stack

- **Frontend:** React 19, Vite 6, TypeScript 5.8
- **Wallet / chain:** wagmi v2, viem, Reown AppKit (`@reown/appkit`, `@reown/appkit-adapter-wagmi`)
- **Oracle / prices:** Pyth (Hermes + Benchmarks), Binance/CoinGecko fallback
- **Charts:** TradingView widget (primary); `lightweight-charts` for the portfolio equity chart
- **Backend / realtime / auth:** Supabase (Postgres, Realtime, Auth, RLS, SECURITY DEFINER RPCs)
- **Contracts:** Solidity, Foundry
- **Hosting:** Vercel (app + landing as separate projects); cron-based keepers
- **Fonts:** Fraunces (display/wordmark), Geist (sans), Geist Mono (mono)

---

## Architecture

- **`src/App.tsx`** — the application shell: routing, auth/session, wallet + network handling, the trade/close/manage flows, social handlers, notifications, and realtime wiring.
- **`src/components/`** — modals (deposit/withdraw/send/bridge, manage position, settings, onboarding, share), the portfolio chart, order book, and page-level views.
- **`src/components/ui/pages/`** — `Dashboard`, `TradeView`, `MarketsView`.
- **`src/services/`** — `supabaseStore` (all persistence, realtime, RPCs), `useVeloPerpsTrading` + `veloPerpsService` (contract reads/writes), `pythPriceService` (oracle + fallback), `web3Config` (AppKit/wagmi), burner-wallet derivation.
- **`src/styles/`** — `tokens.css` and `brand.css` drive the entire design system; token changes cascade across light/dark.
- **`contracts/`** — VeloPerpsV3.1, mock USDC, registry, libraries, deploy/wiring scripts, and tests.
- **`api/`** — Vercel serverless functions: keepers, stats endpoints, and a same-origin OG/proxy function.

Routing is path-based (`/dashboard`, `/trade/:pair`, `/markets`, `/markets/:ticker`, `/social`, `/social/post/:id`, `/leaderboard`, `/profile/:handle`). Tab→URL sync uses `pushState`; `popstate` drives back/forward; unknown routes redirect once and clean the URL.

---

## Deployed Contracts (Base Sepolia)

| Contract | Address |
| --- | --- |
| VeloPerpsV3.1 (active) | `0x41fDb544D7247a5ddc6B4C06F29D09f2b20de907` |
| VeloMockUSDC (mUSDC) | `0x5EFaF3F69b09bC2abF3439bDC0C93bf611026699` |
| VeloRegistry | `0x7e510d615a8afDfaa324F790F3E54e520756ECe2` |
| Pyth | `0xA2aa501b19aff244D90cc15a4Cf739D2725B5729` |
| LayerZero Endpoint | `0x6EDCE65403992e310A62460808c4b910D972f10f` |

The frontend hardcodes the V3.1 address as a fallback, so a missing `VITE_VELO_PERPS_V3_ADDRESS` can never silently route trades to a legacy contract.

---

## Repository Layout

```
src/
  App.tsx                 # application shell
  components/             # modals, charts, order book
    ui/pages/             # Dashboard, TradeView, MarketsView
  services/               # supabaseStore, veloPerps, pyth, web3Config, burner
  styles/                 # tokens.css, brand.css (design system)
  utils/                  # shared types, PAIRS / VELO_PAIRS
contracts/                # Solidity (VeloPerpsV3.1), Foundry scripts & tests
api/                      # Vercel functions: keepers, stats, og proxy
public/                   # PWA manifest, icons, service worker
SUPABASE_MIGRATION_consolidated.sql   # single source-of-truth DB migration
```

---

## Running Locally

```bash
npm install
npm run dev        # Vite dev server
npm run build      # production build (tsc is not part of the gate; see below)
npm run preview    # preview the production build
```

**Build gate:** the acceptance bar is `vite build` exiting 0. There is a known baseline of viem/wagmi TypeScript type mismatches surfaced by `tsc --noEmit`; these do not block the Vite build. Hold the baseline rather than chasing it during feature work.

---

## Environment Variables

| Variable | Purpose |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key |
| `VITE_WALLETCONNECT_PROJECT_ID` | Reown/WalletConnect project id (required for the wallet modal) |
| `VITE_VELO_PERPS_V3_ADDRESS` | Active V3.1 contract (defaults to the deployed address if unset) |
| `VITE_BASE_SEPOLIA_RPC_URL` | Base Sepolia RPC (PublicNode fallback if unset) |
| `VITE_ARB_SEPOLIA_RPC_URL` / `VITE_OP_SEPOLIA_RPC_URL` / `VITE_ETH_SEPOLIA_RPC_URL` | Bridge-source RPCs (fallbacks if unset) |
| `VITE_PYTH_HERMES_URL` / `VITE_PYTH_BENCHMARKS_URL` | Pyth endpoints (defaults provided) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side (keepers + user metrics) |

---

## Supabase Setup

Run **`SUPABASE_MIGRATION_consolidated.sql`** once in the Supabase SQL editor. It is fully idempotent and supersedes the older partial migrations. It:

- Adds `admin_set_verification` and fixes `is_velo_admin` / the `velo_admins` RLS infinite-recursion bug.
- Defines the cross-user RPCs (`create_notification_for_user`, `record_transaction_for_user`) and the balance/follow helpers — each dropped-then-recreated so a return-type change never trips `42P13`.
- Ensures enriched `trade_history` / `transactions` columns exist.
- Sets RLS (public reads where needed, own-row writes) and the realtime publication + `REPLICA IDENTITY FULL` (so DELETE events carry the old row).
- Reloads the PostgREST schema cache.

To grant yourself admin:

```sql
insert into public.velo_admins (user_id) values ('<your-auth-uid>') on conflict do nothing;
```

---

## Known Gaps & Roadmap

**Known gaps (audited):**
- **Threaded replies & comment-likes** are designed in the data model but not wired into the UI; comments are flat. This is the largest remaining social feature.
- The `tsc` baseline carries ~87 viem/wagmi type mismatches that don't block the build.

**Roadmap to mainnet:**
1. Security audit of the VeloPerps contracts.
2. Mainnet deployment on Base.
3. Liquidity & keeper hardening for production load.
4. Social expansion: threaded replies, comment-likes, richer profile analytics.

The realistic first funding ask is **$10–25K**, tied to the audit + mainnet milestone.

---

## License

Proprietary — all rights reserved. Contact the maintainer for usage terms.
