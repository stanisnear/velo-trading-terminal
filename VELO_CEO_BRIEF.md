# Velo — Executive Brief

**Prepared for grant submission and investor review.**

---

## What Velo Is

Velo is a fully on-chain perpetual futures exchange with an integrated social trading layer. Every trade, every position, every settlement, and every leaderboard entry is backed by a verifiable blockchain transaction. There is no custody, no off-chain matching engine, and no way to fabricate a track record.

Velo is live today on Base Sepolia. Every feature described in this document is working, deployed, and testable at [velotrading.live](https://velotrading.live).

---

## Built by a Trader, for Traders

Velo was built by someone who has traded across the full cycle — centralised exchanges, early DeFi perps, and everything in between. That experience is not in the pitch deck. It's in the product.

Most DeFi trading terminals are built by engineers who researched what traders want. Velo was built by someone who knows what a liquidation feels like, what it means when your TP fills two dollars off, and why a 2% buffer on a 25× position is a different category of risk than a 15% buffer. The interface reflects that directly: every column in the position table has a hover tooltip with a precise definition, the order panel shows a live risk classification (LOW / MEDIUM / HIGH / EXTREME) before you submit, and the leverage change modal has three distinct states with actual explanations — not a generic confirmation prompt.

This matters for a specific reason: DeFi trading products consistently fail at the terminal layer. The protocol mechanics are sound; the interface treats users like they've read the whitepaper. Velo is built on the premise that the interface is part of the product, not a skin on top of it.

---

## The Problem Velo Solves

Crypto trading has a trust problem. On centralised exchanges, you trust the platform with your funds, you trust their reported prices, and you trust their reported PnL. Their internal ledgers are hidden. Their matching engines are opaque. When they fail — the losses are catastrophic and the warnings were invisible.

Decentralised perpetual exchanges solve the custody problem. They do not solve the social problem: there is no way to verify another trader's claimed performance, no way to copy a provably profitable strategy with trustless enforcement, and no way to build a trading community where the numbers are real.

Velo solves both simultaneously. The exchange is trustless by construction — on-chain settlement means the protocol cannot misappropriate funds. The social layer is trustless by construction — leaderboard rankings are computed from on-chain events, trade cards carry transaction hashes, and any claimed performance can be independently verified on a block explorer.

---

## What Makes Velo Different from Existing Protocols

**vs GMX / Gains Network:**
These protocols pioneered the oracle-priced perpetual model that Velo uses. They are excellent execution engines but have no social product. Traders share screenshots on Twitter and Discord — unverifiable, easily faked, utterly unaccountable. Velo takes the same execution architecture and builds a provable social layer on top of it. Your profile is not a screenshot. It is a query against a blockchain.

**vs dYdX / Hyperliquid:**
These are centralised order book matching engines that happen to use a blockchain for settlement. Their prices are set by their own matching engines, not by a global oracle. Velo uses Pyth Network — the same price feed used by hundreds of billions in DeFi value — as the sole execution reference. No one controls the price.

**vs Copy-trading platforms (eToro, ZuluTrade):**
These are centralised services with no on-chain enforcement. Performance claims are not independently verifiable. Velo's planned V3 Vaults encode the copy-trade relationship in Solidity — the leader can only direct trades, not withdraw capital. The rules are in code, not in a terms-of-service document.

---

## Current Status — Fully Operational

All of the following are working on Base Sepolia today:

**Trading infrastructure:**
- Market orders (open/close positions with Pyth oracle pricing)
- Limit orders (stored on-chain, executed by automated keeper)
- Stop orders (identical mechanics, opposite trigger direction)
- Take Profit and Stop Loss (on-chain trigger values, keeper-executed)
- Partial close (close any fraction of a position, 1–100%)
- Automated liquidations (keeper-run, 1% bounty for the liquidator)
- Margin management (add or reduce collateral on open positions)
- 17 trading pairs: BTC, ETH, SOL, AVAX, LINK, DOGE, NEAR, INJ, APT, ARB, OP, SUI, TIA, SEI, RENDER, WLFI, POL
- Leverage 1×–25× on every pair

**Account infrastructure:**
- One-signature onboarding — a single MetaMask `personal_sign` derives a session key that signs every subsequent trade with zero popups
- Deterministic session key recovery — lose your browser, re-sign the same message, get the same trading wallet
- Gas sponsor — new users receive 0.01 ETH automatically, no faucet visit required
- 1,000 mUSDC starting balance — minted automatically on signup

**Cross-chain infrastructure:**
- LayerZero V2 OFT deployed on four testnets (Base, Arbitrum, Optimism, Ethereum Sepolia)
- Deposit or withdraw from any chain to any address in one modal
- Peer-to-peer mUSDC send via `@username` or `0x address`

**Social infrastructure:**
- Real-time post feed with `$TICKER` cashtag routing
- Follow system — personalised feed based on who you follow
- Comment, like, and repost interactions
- Copy-trading — subscribe to any trader, your session key mirrors their positions proportionally
- On-chain username registry — `@handles` are stored in a Solidity contract, not a database
- Shareable trade cards — 1200×675 canvas with BaseScan proof link, Web Share API
- In-app notifications — real-time push for position closes, follows, likes

**Leaderboard:**
- Rankings by realised PnL, computed from on-chain trade history
- Win rate, average leverage, trade count per trader
- One-click copy-trade subscription from the leaderboard
- Fully public and verifiable — every row corresponds to real transactions

**Infrastructure:**
- Three automated keepers running every minute (limit/stop fills, TP/SL closes, liquidations)
- Protocol stats API at `/api/protocol-stats` — public JSON endpoint for external monitoring
- Admin Panel — pair registration, fee withdrawal, pool reserves, keeper wallet monitoring
- Vercel Pro deployment with HTTP security headers and edge caching
- **Progressive Web App** — installable on iOS, Android, and macOS with a single tap. No app store required. Opens full-screen with native status bar treatment on every platform

---

## The Interface as a Product Decision

Most DeFi protocols treat the interface as a wrapper around the contract. Velo treats it as part of the protocol. A few specific examples:

**Velo installs like a native app.** On iOS, a single share-sheet tap adds it to the home screen — full-screen, black-translucent status bar, branded icon. On Android and desktop Chrome, a one-tap install prompt appears at the right moment and triggers the OS install flow. There is no app store submission, no review process, and no version lag. Users who install Velo open a trading terminal that looks and behaves like a native application. For a DeFi product targeting traders who live on their phones, this matters.

The positions table has a **Buffer** column — the live percentage distance from the current mark price to your liquidation price. Most platforms show the liquidation price and let you compute the distance yourself. Buffer shows you directly, colour-coded (EXTREME below 2%, HIGH below 5%, MED below 10%, LOW above), updated as the price moves. At high leverage that number is more actionable than the liquidation price itself.

The **pre-trade risk display** shows an estimated liquidation price and a risk tier before you submit. Not after — before. The logic is simple: a trader who knows their liquidation distance before entering is a trader who makes deliberate decisions. A trader who finds out after is a trader who gets surprised.

The **leverage change confirmation modal** doesn't ask "are you sure?". It shows you your current liquidation distance, your new liquidation distance, what the liq. price moves to, and a plain-language explanation of what's happening. If you don't have the balance, it tells you that's why it's blocked, not just that it's blocked.

**TP/SL validation runs against actual fill price**, not the pre-trade mark. If the market moves between your click and the transaction confirming, and your pre-set target ends up on the wrong side of your real entry, you get a specific error with the actual entry price and exactly what to adjust. No silent failures, no triggers sitting at prices that will never fire correctly.

These aren't features. They're what a trading interface looks like when the person building it has been on the wrong end of each of these problems.

---

## The Trigger Price vs Fill Price Behaviour on Testnet

One behaviour worth explaining clearly for reviewers who test Velo:

When a keeper executes a limit order, TP, or SL, the fill price may differ slightly from the trigger price. You might set a TP at $2,014 and see the position close at $2,011.

**This is standard behaviour for all oracle-priced perpetual exchanges — GMX, Gains Network, and Velo all work the same way.** It is not a bug.

The reason: the keeper runs on Vercel's per-minute cron. When the trigger price is crossed, the keeper fires on the next minute tick. By the time the keeper's transaction mines, the oracle price may have moved slightly from the trigger level. The fill is always at the real oracle price at execution time.

**This is a testnet infrastructure characteristic, not a protocol flaw.** On mainnet with a dedicated keeper running every few seconds, this window narrows to near-zero. The protocol mechanism is correct — the testnet runner is intentionally lean.

**One oracle, everywhere.** Velo reads Pyth — and only Pyth — across the entire interface: the live ticker, the chart (TradingView's `PYTH:*` symbols), the order book, and the on-chain fill all come from the same feed. When a reviewer opens a position, the price they filled at is the price shown everywhere on screen. The only movement is normal time passing between the locked entry and the live mark.

---

## Technology Stack

**Smart contracts (Foundry + Solidity 0.8.22):**
- `VeloPerpsV3.1` — the active perp engine (VERSION=31). Pyth pull-oracle, isolated margin, on-chain conditional orders, TP/SL triggers, partial close, liquidations
- `VeloMockUSDC` — ERC-20 + LayerZero V2 OFT + faucet
- `VeloRegistry` — on-chain `@username → 0x address` resolver
- `PerpsMath.sol` — pure-Solidity PnL, liquidation threshold, and fee arithmetic library
- OpenZeppelin 5.x (Ownable, ReentrancyGuard, SafeERC20, ERC20)
- LayerZero V2 OFT for cross-chain USDC

**Frontend (React 19 + Vite 6 + TypeScript 5.8):**
- wagmi v2 + viem v2 — Ethereum state and transaction signing
- Reown AppKit v1.7 — multi-wallet connection (MetaMask, WalletConnect, Coinbase, Google, Discord, Apple)
- Zustand v5 — global state management
- @tanstack/react-query v5 — server-state caching
- TradingView widget — full charting library with indicators and drawing tools
- Recharts + Lightweight Charts — portfolio and data visualisations
- Fraunces + Geist + Geist Mono — brand typography system

**Backend and data:**
- Supabase (PostgreSQL + Realtime) — social graph, profiles, trade history index, notifications
- Pyth Hermes — oracle price update bytes for on-chain settlement, plus the live SSE price stream and Benchmarks OHLC candles that power every price shown in the UI
- Vercel Serverless Functions + Pro Crons — keeper automation and gas sponsorship

**Infrastructure:**
- Vercel Pro — frontend hosting with edge CDN and per-minute cron jobs
- Base Sepolia (chain ID 84532) — primary execution chain
- PublicNode — reliable public RPC endpoints (no API key required)
- Reown Cloud — WalletConnect relay infrastructure

---

## Deployed Contracts (All Verified on BaseScan)

| Chain | Contract | Address |
|-------|----------|---------|
| Base Sepolia | VeloPerpsV3.1 (**active**) | `0x41fDb544D7247a5ddc6B4C06F29D09f2b20de907` |
| Base Sepolia | VeloMockUSDC | `0x5EFaF3F69b09bC2abF3439bDC0C93bf611026699` |
| Base Sepolia | VeloRegistry | `0x7e510d615a8afDfaa324F790F3E54e520756ECe2` |
| Arbitrum Sepolia | VeloMockUSDC OFT | `0xEC76fD9182ba15ff193FDBc122013FCa18900290` |
| Optimism Sepolia | VeloMockUSDC OFT | `0xEC76fD9182ba15ff193FDBc122013FCa18900290` |
| Ethereum Sepolia | VeloMockUSDC OFT | `0x96d0CF69896FE6b5B031D21967f027d95Eb42e9A` |

All source code is publicly verifiable on the respective block explorers.

---

## Protocol Economics

| Fee | Rate |
|-----|------|
| Open fee | 0.10% of collateral (10 bps) |
| Close fee | 0.10% of gross payout (10 bps) |
| TP/SL keeper bounty | 0.25% of net payout |
| Liquidation bounty | 1.00% of collateral |

Fees accrue in the contract's `feeBalance`. The protocol owner can withdraw accrued fees via the Admin Panel. The owner cannot touch user collateral, modify positions, or freeze the protocol — these restrictions are hardcoded at the contract level.

On mainnet, fee distribution will be split between an insurance fund (30%), protocol treasury (40%), and stakers/keepers (30%) via a dedicated fee distributor contract.

---

## Security Model

**What the protocol owns:** The ability to register new trading pairs, withdraw accrued protocol fees, and set LayerZero peer addresses. Nothing else.

**What the protocol cannot do:** Seize user collateral, close any trader's position, modify leverage or TP/SL values, prevent a trader from closing a position, or freeze the contract. These capabilities are coded out.

**Smart contract safeguards:** ReentrancyGuard on all write functions. SafeERC20 for all token transfers. 60-second Pyth price freshness requirement on all oracle reads. Strict Pyth fee equality check to prevent oracle manipulation.

**Frontend safeguards:** Trading wallet private key never transmitted over the network. Server-side keeper private key with no `VITE_` prefix, ensuring it never reaches the browser bundle. Full HTTP security header suite on all Vercel routes.

**Pre-mainnet requirements:** A full security audit by at least two independent firms (Spearbit, Trail of Bits, Cyfrin, or equivalent). Bug bounty programme on Immunefi. Formal verification of the PerpsMath library. Multisig ownership (Safe, 3-of-5).

---

## Roadmap

### Now — Testnet (Current Build)
Fully operational on Base Sepolia. All order types work. All three keepers run. Social layer is live. Cross-chain bridging works. Provable on-chain trade history for every closed position. Ready for grant evaluation and user testing.

### V2 — Mainnet Launch (Base Mainnet, Post-Audit)
- Real USDC replaces mUSDC
- Insurance fund seeded from protocol fees
- Funding rate mechanism — hourly long/short payments to balance open interest
- Chainlink as a secondary oracle circuit-breaker alongside Pyth
- Multisig ownership (Safe, 3-of-5)
- Dynamic fees scaled by trade size and protocol delta exposure
- Dedicated keeper infrastructure on AWS (not Vercel crons)

### V3 — Velo Vaults
On-chain copy-trading vaults. Vault leaders control trading; copiers deposit capital. Rules (performance fee, lockup, max drawdown) are enforced in Solidity — not off-chain promises. Vault performance fees accrue to the leader; copiers pay only for results.

### V4 — Governance Token
Issued to early traders, profitable vault leaders, and keepers based on verifiable on-chain activity. Governs fees, pair listings, treasury, and insurance fund. No presale, no IDO — issued only after proven product-market fit.

### V5 — Multi-Venue Routing
Velo Vaults route trades to any compatible execution venue for best execution. Protocol captures rebates from routed flow. This is the long-term protocol-as-infrastructure play — making Velo the trading layer for any DeFi product that wants to embed perps without building the engine.

---

## Future Infrastructure Investment

The current testnet stack is lean by design. Mainnet requires a substantial infrastructure upgrade:

**Keeper network:** From Vercel crons to a permissioned-then-permissionless validator set. Registered keeper nodes compete to submit fills first and earn the bounty. Initially Velo-operated on AWS EC2 in multiple regions (US-East, EU-West, AP-Southeast). Progressively opened to external operators who post a bond.

**Multiple oracles:** Pyth as primary (pull-model efficiency). Chainlink as secondary circuit-breaker. If the two diverge beyond a configurable threshold, the protocol pauses fills until they reconverge.

**Dedicated indexer:** A Graph subgraph or Ponder indexer replacing the current event-scan approach. Serves the Admin Panel, Leaderboard, and external integrations via a public GraphQL API.

**AWS + Terraform:** EC2 keeper nodes, RDS PostgreSQL, Elasticache Redis, CloudFront CDN, CloudWatch + PagerDuty alerting. All infrastructure-as-code.

**Funding rate engine:** New contract module tracking long/short OI per pair, computing the standard imbalance-proportional funding rate, accruing per-block, and settling on position open/close.

---

## Why Velo is Ready for a Grant

Velo is not a whitepaper. It is not a demo. It is a working product:

1. **Every on-chain claim is verifiable.** Every contract is deployed and source-verified. Every transaction is on BaseScan. The grant committee can independently confirm that orders execute, positions settle, and keepers fire.

2. **The hardest engineering problems are solved.** Oracle price integration with strict fee validation, deterministic session key derivation, parallel keeper execution, cross-chain OFT bridging, and real-time social infrastructure are all implemented and running.

3. **The product is differentiated.** Oracle-priced perps exist. Social trading platforms exist. A protocol where your social trading claims are on-chain provable and every leaderboard entry has a transaction hash does not exist anywhere else today.

4. **The interface matches the protocol quality.** The terminal was built by a trader who has lived the problems it solves — liquidations, off-by-two fills, interfaces that hide critical information until it's too late. That background is not decorative. It's why the Buffer column exists, why pre-trade risk tiers exist, and why TP/SL validation runs against the actual fill price.

5. **The roadmap is credible.** V2 (mainnet) requires an audit and infrastructure investment, not new protocol design. V3 (Vaults) is an extension of the existing contract architecture. The technology decisions made in V1 — oracle pricing, pull-model execution, isolated margin — are production-grade choices, the same ones made by the most successful DeFi perp protocols.

6. **The team ships.** This build represents multiple smart contracts (including a V3.1 iteration), a 9,000-line React frontend, three keeper services, a cross-chain bridge integration, a real-time social layer, and a fully automated onboarding system — all integrated and operational.

---

## How to Test Velo

1. Visit [velotrading.live](https://velotrading.live)
2. Connect a wallet (MetaMask, or sign up with Google/Discord via social login)
3. Your account is created automatically — 1,000 mUSDC funded, zero popups
4. Open a limit order slightly below the current BTC/ETH price and wait ~60 seconds
5. The order fills automatically — no manual execution — and appears as a position with a BaseScan tx hash
6. Set a TP 1% above entry, wait for price to move there
7. The position closes automatically — the keeper fires on the next minute tick
8. Check `/api/protocol-stats` for live protocol metrics
9. View the Leaderboard and click any trader's profile to see their verifiable trade history
10. Post a trade card to the Feed from a closed position

Every number you see on Velo can be independently verified on [sepolia.basescan.org](https://sepolia.basescan.org) by looking up the contract address `0x41fDb544D7247a5ddc6B4C06F29D09f2b20de907`.

---

*Document version: current testnet build, VeloPerpsV3.1 (VERSION=31), Base Sepolia.*
