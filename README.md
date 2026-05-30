# Velo — On-Chain Perpetual Futures with a Social Layer

**Fully operational on Base Sepolia. Every trade is a real blockchain transaction. Every position is verifiable.**

Live at [velotrading.live](https://velotrading.live)

Velo is a decentralised perpetual futures exchange where every order, position, and settlement happens on-chain — no off-chain matching engine, no custody, no trust required. Underneath the trading terminal, a full social product lets traders post, follow, copy-trade, and compete on a transparent, on-chain-verified leaderboard.

---

## Table of Contents

- [What Velo Is](#what-velo-is)
- [How It Works End-to-End](#how-it-works-end-to-end)
- [The Velo Trading Wallet](#the-velo-trading-wallet)
- [Order Types & Execution](#order-types--execution)
- [Trigger Price vs Fill Price](#trigger-price-vs-fill-price)
- [Keeper Infrastructure](#keeper-infrastructure)
- [Price Oracle & Execution Model](#price-oracle--execution-model)
- [The Social Layer](#the-social-layer)
- [Leaderboard & Copy-Trading](#leaderboard--copy-trading)
- [Cross-Chain Deposits & Withdrawals](#cross-chain-deposits--withdrawals)
- [Protocol Fees](#protocol-fees)
- [Admin Panel](#admin-panel)
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

## What Velo Is

Velo is an oracle-priced perpetual futures protocol — the same execution model used by GMX and Gains Network. There is no traditional order book matching buyers and sellers. Instead, every trade is priced against a live Pyth Network oracle feed, collateral is held in the VeloPerps smart contract, and PnL is settled against a liquidity pool on close.

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
2. Choose LONG or SHORT, set collateral and leverage (up to 25×), choose ISOLATED margin mode
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

Because `personal_sign` is deterministic, the same main wallet always derives the same trading wallet. **Recovery is automatic** — a user who clears their browser simply re-derives the same key by signing the same message on any device.

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

**Example:** You set a limit buy on ETH at $2,000. The price dips to $1,998 when the keeper fires. You fill at $1,998 — this is *price improvement* (you got in cheaper than your limit). If ETH bounced back to $2,001 by the time the tx mines, the contract reverts `OrderNotTriggered` and the order stays open for the next tick.

**For TP/SL:** A TP set at $2,014 might fill at $2,011 if price moved between the trigger being crossed and the keeper's transaction landing. This is not a bug — it is the inherent nature of keeper-executed oracle perps. On mainnet with a fast keeper (every few seconds on a dedicated server), this spread narrows to near-zero. On Base Sepolia testnet with Vercel's once-per-minute cron cadence, you may see fills a few dollars from your trigger in volatile markets. This is a **testnet/infrastructure characteristic**, not a protocol flaw.

---

## Keeper Infrastructure

Velo runs three automated keeper jobs, each executing every minute via Vercel Pro cron:

### Limit/Stop Keeper (`api/cron-conditional-orders.ts`)
1. Reads all open conditional orders from the contract
2. Fetches a fresh Pyth price for each pair (once per unique pair per run, cached)
3. For each order whose trigger condition is met, submits `executeConditionalOrder` with the exact on-chain Pyth fee
4. All triggered orders fire in parallel — multiple fills complete in roughly one block

### TP/SL Keeper (`api/cron-tp-sl.ts`)
1. Reads all open positions from the contract
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

### One Oracle, Everywhere — Unified Pyth Pricing

Velo previously displayed Binance prices for the ticker and Coinbase prices on the chart while settling fills against Pyth — three venues, so a position could open at the Pyth price while the rest of the screen showed a number a few cents off. That was a permanent, confusing discrepancy, not timing noise.

Velo now reads **Pyth and only Pyth** across the entire interface, so every number agrees with the price you actually fill at:

- **Live mark price** streams from Pyth's Hermes SSE endpoint (`/v2/updates/price/stream`), the same feed the contract settles on
- **Chart candles** come from the TradingView widget pointed at Pyth symbols (`PYTH:SOLUSD`, etc.) and from the Pyth Benchmarks OHLC shim
- **The order book** is a reference depth ladder anchored to the live Pyth mark (Velo Perps is oracle-priced and has no native book; a third-party venue feed would show a different market)
- **Fills, entry prices, and PnL** are the on-chain Pyth price, exactly as before

The only difference you will ever see between your entry and the live mark is normal tick timing — your entry is locked at fill time while the mark keeps moving. That is identical to how every exchange behaves; what is gone is the cross-venue gap.

---

## The Social Layer

**The Feed** — A real-time Twitter-style post feed. Traders post text, analysis, and trade cards with `$BTC`-style ticker tags that route to the pair's market page. Every embedded trade card carries an on-chain transaction hash for independent verification on BaseScan.

**Profiles** — Every wallet is a public profile. Stats: realised PnL, win rate, average leverage, trade count. The trade history table lists every closed position with entry, exit, PnL, and a BaseScan link to the closing transaction.

**Notifications** — In-app notifications for position closes, follows, likes, reposts, and copy-trade subscriptions. Deep-links open the relevant position detail modal or post.

**Shareable Trade Cards** — Closed positions with PnL ≥ $0.50 prompt a share modal. The card renders on a 1200×675 canvas (Twitter/Instagram optimal) with three background styles (Obsidian, Gradient, Hologram). Download as PNG or share via the Web Share API.

**On-Chain Username Registry** — `@handles` are stored in VeloRegistry. The Send modal resolves `@username → wallet address` on-chain. Username registration is a real transaction, not a Supabase row.

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
- **Protocol stats** — open positions, lifetime volume, total fees, liquidation count
- **Contract metadata** — all addresses with BaseScan links
- **Keeper wallet balance** — monitors sponsor wallet ETH with low-balance warning

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
│   ├── pythPriceService.ts         Unified UI pricing — Hermes SSE live stream + Benchmarks candles
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
# Optional — Pyth Benchmarks OHLC shim for chart candles (defaults to this if unset)
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
Today's keepers run on Vercel's 60-second cron. For mainnet, a permissioned-then-permissionless keeper network where registered keeper nodes compete to submit fills and earn the bounty. Initially Velo-operated on AWS EC2 in multiple regions, progressively opened to external operators who post a bond.

### Multiple Oracle Sources
Pyth remains primary. Chainlink added as a circuit-breaker — if the two oracles diverge beyond a configurable threshold, the protocol pauses fills until they reconverge.

### Dedicated Indexer
A Graph subgraph or custom Ponder indexer replacing the current event-scan approach. Serves the Admin Panel, Leaderboard, and external integrations via a public GraphQL API.

### AWS Infrastructure + Terraform
Mainnet infrastructure managed as code:
- EC2 instances for keeper nodes (multi-region: US-East, EU-West, AP-Southeast)
- RDS PostgreSQL replacing Supabase for the production social database
- Elasticache Redis for real-time price and position caching
- CloudFront CDN for the frontend
- CloudWatch + PagerDuty for keeper monitoring and alerting

### Smart Contract Upgrades
A UUPS or Beacon proxy pattern with a 48-hour timelock on all upgrades governed by the multisig. Emergency pause function for circuit-breaker scenarios.

### Funding Rate Engine
A new contract module tracking long/short open interest per pair, computing the funding rate proportional to OI imbalance, accruing funding payments per block, and settling on position open/close/modify.

### Advanced Order Types
- Trailing stop — SL that moves with the market
- One-cancels-other (OCO) — linked TP/SL that cancel each other on fill
- Time-weighted average price (TWAP) orders for large positions
- Reduce-only orders

### Fee and Rewards Distribution
A fee distributor contract splitting protocol fees between insurance fund (30%), protocol treasury (40%), and stakers/keepers (30%), with per-epoch reward distribution.

### Security and Audits
Full audit by at least two independent firms (Spearbit, Trail of Bits, Cyfrin, or equivalent) before mainnet. Bug bounty program on Immunefi. Formal verification of the PerpsMath library.

---

## License

MIT.
