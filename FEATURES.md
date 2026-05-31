# Velo — Complete Feature Reference

This document describes every feature Velo has built and deployed. It covers the full technical and product surface — from how a trading wallet is derived to how the social graph is stored, from the burner wallet's gas sponsor to the keeper's Pyth fee calculation, and the specific interface decisions that make the terminal feel different. Everything here corresponds to working, deployed code on Base Sepolia.

---

## Table of Contents

1. [Account System & Onboarding](#1-account-system--onboarding)
2. [Velo Trading Wallet (Burner Wallet / Session Key)](#2-velo-trading-wallet-burner-wallet--session-key)
3. [Gas Sponsor](#3-gas-sponsor)
4. [Market Orders](#4-market-orders)
5. [Isolated Margin Model](#5-isolated-margin-model)
6. [Limit & Stop Conditional Orders](#6-limit--stop-conditional-orders)
7. [Take Profit & Stop Loss](#7-take-profit--stop-loss)
8. [Partial Close](#8-partial-close)
9. [Liquidations](#9-liquidations)
10. [Margin Management (Add / Reduce)](#10-margin-management-add--reduce)
11. [Position Display & Monitoring](#11-position-display--monitoring)
12. [Pre-Trade Risk Display](#12-pre-trade-risk-display)
13. [Manage Position Modal](#13-manage-position-modal)
14. [Order Details Modal](#14-order-details-modal)
15. [Price Oracle Integration (Pyth Network)](#15-price-oracle-integration-pyth-network)
16. [Keeper Infrastructure](#16-keeper-infrastructure)
17. [Cross-Chain Bridging (LayerZero V2)](#17-cross-chain-bridging-layerzero-v2)
18. [Withdrawals & Peer-to-Peer Send](#18-withdrawals--peer-to-peer-send)
19. [On-Chain Username Registry (VeloRegistry)](#19-on-chain-username-registry-veloregistry)
20. [Social Feed](#20-social-feed)
21. [Profiles & Trade History](#21-profiles--trade-history)
22. [Follow System](#22-follow-system)
23. [Copy-Trading](#23-copy-trading)
24. [Leaderboard](#24-leaderboard)
25. [Notifications](#25-notifications)
26. [Shareable Trade Cards](#26-shareable-trade-cards)
27. [TradingView Chart](#27-tradingview-chart)
28. [Order Book (Pyth-Anchored)](#28-order-book-pyth-anchored)
29. [Markets View](#29-markets-view)
30. [Dashboard & Portfolio Overview](#30-dashboard--portfolio-overview)
31. [Admin Panel](#31-admin-panel)
32. [Metrics & Analytics APIs](#32-metrics--analytics-apis)
33. [Session Management & Auth](#33-session-management--auth)
34. [Settings Panel](#34-settings-panel)
35. [Liquidity Pool Model](#35-liquidity-pool-model)
36. [Mobile Experience](#36-mobile-experience)
37. [Theme System](#37-theme-system)
38. [Security Architecture](#38-security-architecture)

---

## 1. Account System & Onboarding

Velo uses a wallet-first identity model. There are no passwords. There is no email required. Your wallet address is your primary identity.

**New user flow — one signature, zero transaction popups:**
1. Connect a wallet via Reown AppKit — supports MetaMask, WalletConnect (200+ wallets), Coinbase Wallet, and social logins (Google, Discord, Apple, email) via embedded wallet
2. Choose a `@username` (3–20 alphanumeric characters plus underscores, validated client-side for format and verified on-chain for uniqueness)
3. Review screen confirms: wallet address, chosen handle, network, and starting balance
4. Sign **one** `personal_sign` message (gas-free, no transaction fee) to derive the Velo Trading Wallet
5. Everything else happens automatically with zero MetaMask popups: gas sponsor funds the trading wallet with 0.01 ETH, the trading wallet mints 1,000 mUSDC from the faucet, and the `@username` is registered on-chain in VeloRegistry

**Returning user flow:** A session cache (`velo_session_v1` in localStorage) stores the serialised user profile. On page load this is read synchronously so the UI renders immediately with the user logged in. Supabase's `INITIAL_SESSION` event runs in the background and overwrites with fresh data within 0–3 seconds.

**Logout sentinel system:** Wagmi auto-reconnects to MetaMask within ~100ms of any page load (the dapp permission lives in the browser extension). Without a sentinel, logging out would immediately re-authenticate. The fix uses three layers: a URL parameter (`?logout=1`), a module-level IIFE that runs before React and wipes localStorage while setting `window.__veloLogoutLock = true`, and auth guards that check the lock before running any sign-in logic. The lock clears only when the user explicitly opens AppKit and initiates a fresh wallet connection.

---

## 2. Velo Trading Wallet (Burner Wallet / Session Key)

The Velo Trading Wallet is the architectural feature that makes Velo feel like a web2 app. It is a regular Ethereum EOA whose private key is derived deterministically from a MetaMask `personal_sign` signature.

**Derivation (defined in `veloBurnerWallet.ts`):**
```
Main Wallet signs VELO_DERIVATION_MESSAGE
  (fixed string: includes app domain, version "VELO v1", chain ID 84532)
→ 65-byte signature (r || s || v)
→ keccak256(signatureBytes) → 32-byte hash
→ This 32-byte hash IS the trading wallet's private key
→ privateKeyToAccount(privateKey) → { address, signing functions }
```

**Why deterministic derivation matters:**
- The same main wallet always derives the same trading wallet — recovery requires only a single signature
- If a user clears their browser, they re-derive the exact same address on any device by signing the same message
- The derivation is one-way — knowing the trading wallet's address or private key does not reveal the main wallet's private key

**Storage:** Cached in localStorage under `velo_burner_<ownerAddress>`. On load, `loadStoredBurner()` re-derives the account from the stored key and confirms the address matches — a mismatch clears the corrupt entry and triggers re-derivation.

**Key export:** Settings → Reveal Private Key → shows the hex key for import into MetaMask, Rabby, or any EVM wallet.

**Why this matters for UX:** Every trade, USDC transfer, username registration, and keeper interaction is signed by the trading wallet's viem `WalletClient` locally in the browser — no MetaMask popup, no confirmation dialog, no delay. The main wallet is only used once (to derive the trading wallet) and never signs a transaction during normal trading.

---

## 3. Gas Sponsor

New trading wallets start with zero ETH and cannot pay gas for any transaction. The gas sponsor solves this automatically.

**How it works:**
- `POST /api/sponsor-eth` with `{ burnerAddress }` in the body
- Server-side: verifies the address is a valid EOA, checks it has < 0.003 ETH, sends 0.01 ETH from the `VELO_SPONSOR_PRIVATE_KEY` wallet
- Rate limited by burner address — multiple users behind the same NAT/IP do not block each other
- 0.01 ETH covers both the USDC faucet mint AND the on-chain username registration in the same session, plus headroom for several dozen trades

**Ongoing top-ups:** `veloGasSponsor.ts` is called before any trading-wallet transaction that might fail due to insufficient ETH. Used before: minting USDC, registering username, cross-chain bridge sends.

**Self-funding over time:** The keeper wallet receives liquidation bounties (1% of liquidated collateral) and TP/SL keeper bounties (0.25% of payout). These accumulate and partially offset the ETH spent sponsoring new users.

---

## 4. Market Orders

A market order opens a position immediately at the current Pyth oracle price.

**Full execution flow:**
1. User selects pair, side (LONG/SHORT), collateral amount, and leverage (1×–25×)
2. Frontend validates: `pairTradable(pairIndex)` on-chain, mUSDC balance ≥ collateral, leverage ≤ 25
3. `fetchPriceUpdate([feedId])` fetches a fresh price update from Pyth Hermes. Validated client-side for freshness (< 30s old) before submission
4. `getExactPythFee(publicClient, updateData)` reads the exact Pyth fee on-chain via `getUpdateFee(updateData)` — never estimated or hardcoded
5. If mUSDC allowance for the contract is insufficient: trading wallet signs `approve(veloPerpsAddress, collateral × 10)` silently (10× approval to avoid repeated approvals)
6. Trading wallet signs `openPosition(pairIndex, isLong, collateralUSDC_6, leverage, marginMode=ISOLATED, pythUpdateData)` with `value: pythFee`
7. **Contract execution:**
   - Pushes Pyth update on-chain: `PYTH.updatePriceFeeds(pythUpdateData)`
   - Reads mark price: `PYTH.getPriceNoOlderThan(feedId, 60).price × 10^(18+expo)`
   - Charges 0.10% open fee from collateral, accrues to `feeBalance`
   - Stores `Position { owner, pairIndex, isLong, leverage, marginMode=ISOLATED, collateralUSDC_6, entryPrice_E18, openedAt, takeProfit_E18=0, stopLoss_E18=0, originalNotional_6 }` keyed by `tradeId = nextTradeId++`
   - Emits `PositionOpened(tradeId, owner, pairIndex, isLong, leverage, collateralUSDC_6, entryPrice_E18, openedAt, originalNotional_6)`
8. Receipt is decoded for the `PositionOpened` event to extract `tradeId` and `entryPrice`
9. `tradeId → txHash` is persisted to localStorage so the position detail modal can link to the open transaction even after page reload
10. UI polling (5s interval) picks up the new position from `fetchOpenPositions`

**Duplicate-position lock:** A `isProcessing` ref prevents a second click firing a second order while the first transaction is in-flight. The lock is released only in terminal branches — success, failure, or validation reject. It is not released on a fixed timer. This was the root cause of a specific bug where rapid double-clicks opened two positions for the same intended trade.

**Minimum collateral:** $1.00 USD. The contract requires `collateralUSDC_6 >= 1e6`. If the derived collateral is below this threshold, a specific toast message is shown before submission.

---

## 5. Isolated Margin Model

Every position on Velo uses isolated margin. Each position has its own independent collateral pool. A loss on one position does not affect another.

**What this means:**
- Position A's liquidation is completely independent of Position B on the same wallet
- You can hold multiple positions on the same pair simultaneously — each is a separate `tradeId` with its own entry price, liquidation price, and collateral
- Opening a new position on a pair where you already have an open position creates a new, independent position — it does **not** merge into or add margin to the existing one
- Collateral is pulled from the trading wallet at open and returned at close (profit or remaining collateral after loss)

---

## 6. Limit & Stop Conditional Orders

Limit and stop orders are stored fully on-chain in the VeloPerps contract as `ConditionalOrder` structs. No off-chain order book exists.

**On-chain struct:**
```solidity
struct ConditionalOrder {
    address owner;
    uint16 pairIndex;
    bool isLong;
    uint8 triggerKind;         // 0=LIMIT, 1=STOP
    uint128 triggerPrice_E18;
    uint16 leverage;
    uint64 collateralUSDC_6;
    bool reduceOnly;
}
```

**Placing an order:** `placeConditionalOrder(pairIndex, isLong, triggerKind, triggerPrice_E18, leverage, collateralUSDC_6, reduceOnly)` — the trading wallet signs and submits. The contract pulls collateral immediately at placement. Collateral is locked in the contract from order placement, not from fill.

**Cancelling:** `cancelConditionalOrder(orderId)` returns the full collateral to the owner's wallet. Only the order owner can cancel.

**Trigger conditions:**
- LIMIT LONG: triggers when mark ≤ triggerPrice (buy the dip)
- LIMIT SHORT: triggers when mark ≥ triggerPrice (sell the rally)
- STOP LONG: triggers when mark ≥ triggerPrice (breakout buy)
- STOP SHORT: triggers when mark ≤ triggerPrice (breakdown sell)

**Execution:** The limit/stop keeper (`cron-conditional-orders.ts`) evaluates all open orders every minute and calls `executeConditionalOrder(orderId, pythUpdateData)` for triggered orders. The contract re-validates the trigger on-chain — the keeper cannot fill an order at the wrong price. `OrderNotTriggered` reverts are silently skipped.

**Fill price vs trigger price:** The fill is at the oracle price when the keeper's transaction mines, not the trigger price. For a long limit at $2,000 — if ETH is at $1,998 at execution, you fill at $1,998 (price improvement). If ETH has bounced to $2,001, the contract reverts and the order stays open. See the README for a full explanation.

---

## 7. Take Profit & Stop Loss

TP and SL are on-chain trigger values stored inside the `Position` struct as `takeProfit_E18` and `stopLoss_E18`. They are set after a position is opened via `setTriggers(tradeId, takeProfit_E18, stopLoss_E18)`.

**Validation rules (enforced by the contract):**
- Long: TP must be > entryPrice, SL must be < entryPrice
- Short: TP must be < entryPrice, SL must be > entryPrice
- Setting either to `0` clears that trigger
- Contract reverts `InvalidTrigger` for any violation

**Open-time TP/SL validation:** When a market order is submitted, the TP/SL is validated against the **actual fill price** from the confirmed `PositionOpened` event, not the displayed pre-trade mark price. If the market moves between clicking "Buy" and the transaction mining, a TP set against the pre-tx price can end up on the wrong side of the actual entry. Invalid triggers are skipped with a precise explanation — "TP must be above entry for LONG. Actual entry: $X. Your TP: $Y. Adjust from the position panel." — no silent failure.

**TP/SL keeper (`cron-tp-sl.ts`):** Runs every minute. For each position with non-zero TP or SL:
- Fetches fresh Pyth price from Hermes
- Checks: LONG TP hit when mark ≥ TP, LONG SL hit when mark ≤ SL (reversed for shorts)
- Calls `closeIfTriggered(tradeId, pythUpdateData)` on the contract
- Contract re-validates on-chain, then closes the position and pays 0.25% keeper bounty from the payout

**Fill price note:** The fill price for a TP/SL is the oracle price at the moment the keeper's transaction mines — not the trigger price. This is standard oracle-perp behaviour. On mainnet with a keeper running every few seconds, this spread is negligible.

**UI in the Manage Position modal:** The TRIGGERS tab has two brand-coloured sliders on the same axis — green for TP (projected gain %), red for SL (projected loss %). Dragging the slider updates the price field; typing a price updates the slider. Both are linked bidirectionally. The panel also shows: current liquidation distance, projected PnL and ROE at the TP price, projected PnL and ROE at the SL price.

---

## 8. Partial Close

Any open position can be partially closed at any time via the "Close" button → portion slider.

`partialClose(tradeId, fractionBps, pythUpdateData)` where `fractionBps` is 1–10000 (10000 = 100%, 5000 = 50%, etc.).

The contract:
- Computes PnL for the fraction being closed
- Reduces `collateralUSDC_6` and `originalNotional_6` proportionally
- Pays the partial payout (collateral fraction + PnL fraction − 0.10% close fee) to the owner
- Position remains open with reduced size

The UI exposes this through the per-position **"Close" button** (opens a slider modal to choose what fraction to close, with a live USD preview of the size being closed) distinct from **"Close 100%"** (which immediately closes the full position at market with no modal, for speed).

---

## 9. Liquidations

A position is liquidatable when its unrealised loss exceeds 90% of its collateral.

**Threshold:** `liquidatable when unrealised_loss >= collateral × 9000 / 10000`

**Permissionless:** `liquidate(tradeId, pythUpdateData)` can be called by any address. The caller receives 1% of the liquidated collateral as a bounty. The remainder accrues to the pool.

**Liquidation keeper (`cron-liquidate.ts`):** Runs every minute. Reads all open positions, fetches fresh Pyth prices per unique pair from Hermes, computes unrealised PnL off-chain using the same arithmetic as `PerpsMath.sol`, and submits `liquidate` for underwater positions with the exact Pyth fee.

**Liquidation price display:** Each position card shows the liquidation price. The Buffer column shows the percentage distance from current mark to liquidation, colour-coded by risk tier (EXTREME < 2%, HIGH < 5%, MED < 10%, LOW ≥ 10%).

---

## 10. Margin Management (Add / Reduce)

**Add Margin:** `increaseCollateral(tradeId, amountUSDC_6)` deposits additional collateral into an isolated position, lowering effective leverage and moving the liquidation price further away. Non-payable — no Pyth fee required.

**Reduce Margin:** `decreaseCollateral(tradeId, amountUSDC_6, pythUpdateData)` withdraws collateral from the position, raising effective leverage. Requires a Pyth price update to validate the new leverage doesn't exceed `MAX_LEVERAGE` (25×).

Both are accessible from the Manage Position modal → ADD / REDUCE tabs, signed silently by the trading wallet.

---

## 11. Position Display & Monitoring

**Position table (TradeView, desktop):** A sticky-header table with the following columns — all column headers are hoverable tooltips:

| Column | What it shows |
|--------|---------------|
| Pair | Trading pair with asset logo |
| Side | LONG / SHORT badge, colour-coded green/red |
| Size | Notional value (collateral × leverage) |
| Entry | Average fill price |
| Mark | Live Pyth oracle price, same feed the contract settles on |
| Liq. | Estimated liquidation price |
| Buffer | Live % distance from mark to liquidation, colour-coded by risk tier |
| PnL (ROE) | Unrealised PnL in USD · return on equity % |
| TP/SL | Current take profit and stop loss prices if set |
| Actions | Edit, share, close buttons |

**Tabs:** Positions / Open Orders / History. Each tab shows a paginated list (5 per page). History captures all trade events — opens, closes, liquidations — not just closed positions.

**Mobile layout:** Position cards are vertically stacked with all key metrics visible and tap-friendly action buttons.

**Polling:** `useVeloPerpsTrading.ts` polls `fetchOpenPositions` and `fetchConditionalOrders` every 5 seconds. Manual `refresh()` is called immediately after any write so the UI updates without waiting for the next tick.

**Position sync:** On-chain positions are the source of truth. After any write (open, close, TP/SL update), the local UI state is reconciled against the contract poll result on the next tick. Optimistic local updates are deliberately avoided — they would diverge from on-chain state and corrupt the equity display.

---

## 12. Pre-Trade Risk Display

Before submitting any order, the entry panel shows three numbers derived from the current size and leverage inputs:

**Est. Liq. Price** — the estimated liquidation price at the entered collateral and leverage, displayed in orange. For isolated margin: `entry ± (collateral × 0.9 / notional) × entry`. Updated in real-time as the user adjusts inputs.

**Margin Risk** — a live classification computed from the percentage distance between the current mark price and the estimated liquidation price:

| Risk level | Distance to liquidation | Colour |
|------------|-------------------------|--------|
| LOW | ≥ 10% | Green |
| MEDIUM | 5–10% | Orange |
| HIGH | 1–5% | Red |
| EXTREME | < 1% | Dark red |

**Free Balance** — buying power remaining after the proposed position is opened, so you can see at a glance whether you have margin left for further positions.

These three fields are live — they update as you type in the size or leverage fields, before you've clicked anything.

---

## 13. Manage Position Modal

Accessed via the edit icon on any open position card. Four tabs, all signed silently by the trading wallet.

**TRIGGERS (TP/SL)**

Two coloured sliders on the same axis — green above the current price for take profit, red below for stop loss (reversed for shorts). The slider position maps to the projected gain/loss percentage at that price. Price input field and slider are bidirectionally linked. The panel also shows:
- Current liquidation distance
- Projected PnL in USD at the TP price
- Projected ROE % at the TP price
- Projected PnL in USD at the SL price
- Projected ROE % at the SL price

Submits `setTriggers(tradeId, takeProfit_E18, stopLoss_E18)` on confirmation. Setting a slider to zero clears that trigger.

**CLOSE (Partial Close)**

A percentage slider from 1% to 100%. Below the slider, a live preview shows the exact USD size being closed at the selected fraction (e.g. "Closing $245.00 of $490.00"). Submit calls `partialClose(tradeId, fractionBps)`. The "Close 100%" button on the position card itself bypasses this modal for immediate full close.

**ADD**

Input for additional collateral to deposit. Shows the balance impact and the new estimated liquidation price before confirming. Calls `increaseCollateral(tradeId, amount)`.

**REDUCE**

Input for collateral to withdraw. Shows the new leverage and new liquidation price before confirming. Calls `decreaseCollateral(tradeId, amount, pythUpdateData)`.

**Leverage change confirmation:** If the leverage slider is changed while an existing position is already open on that pair, a separate confirmation modal intercepts before any submission. It has three distinct states:
- **Insufficient balance** — explains what's blocked and why
- **Increasing leverage** — shows current liq. distance, new liq. distance (colour-coded), new liq. price, and a plain explanation. Confirm button turns orange
- **Reducing leverage** — shows current and new liq. distance, how much free balance is released. Confirm button stays violet

This modal exists because VeloPerps locks leverage at open time — there is no post-open leverage adjustment at the contract level. The modal prevents the common mistake of adjusting the leverage slider while a position is already open.

---

## 14. Order Details Modal

Clicking any row in the History tab opens a full trade breakdown.

**For closed trades:**
- Pair, side, leverage, margin mode
- Entry price, exit price, price change %
- Position size, collateral used
- Liquidation price at time of the trade
- Opened timestamp, closed timestamp, duration
- Final PnL in USD and ROE %
- "View on BaseScan" — deep link to the closing transaction. Persisted in localStorage against the `tradeId` so the link survives page reloads and is available even after the position is gone from the active list

**For open positions (accessed from Dashboard):**
- All the above minus exit price and close timestamp
- Current unrealised PnL

**Keyboard:** Esc closes the modal.

**BaseScan links:** Both the open transaction hash (persisted at open time) and the close transaction hash are linked if available. For faucet credits, the link points to BaseScan's address page rather than a transaction (the faucet is server-side with no on-chain tx hash).

---

## 15. Price Oracle Integration (Pyth Network)

Velo uses **Pyth Network** with the pull-model architecture — prices are pushed into transactions rather than read from a continuously-updated on-chain state.

**`pythService.ts` — the price fetch layer:**
```typescript
fetchPriceUpdate(feedIds) → { updateData: `0x${string}`[], parsedPrice: number }
```
- Hits `https://hermes.pyth.network/v2/updates/price/latest?ids[]=...&encoding=hex&parsed=true`
- Returns binary price update bytes ready to pass as calldata
- Validates freshness: if `publishTime` > 30s ago, waits 1s and retries once
- Guards against corrupt prices: if `parsedPrice` < $0.001, throws to prevent phantom PnL
- `fetchLatestPrice(feedId)` — lightweight version for UI display that doesn't need on-chain bytes

**On-chain price normalisation:**
```solidity
function normalisePythPrice(PythStructs.Price memory p) internal pure returns (uint256) {
    return uint256(p.price) * (10 ** (18 + uint256(int256(p.expo))));
}
```

**Unified UI pricing — Pyth everywhere (`pythPriceService.ts`):** Every price shown anywhere in the app comes from Pyth, the same oracle the contract settles trades against.
- **Live mark price** streams from Pyth's Hermes SSE endpoint (`/v2/updates/price/stream?ids[]=...&parsed=true`). One EventSource subscribes to all pairs at once and pushes ticks into `marketPrices`, which drives the ticker, the positions table mark column, the order book mid, and the chart's live price line
- **Chart candles** come from the Pyth Benchmarks TradingView shim (`/v1/shims/tradingview/history`) — real Pyth OHLC in TradingView's native format
- **Initial snapshot + 30s fallback** uses Hermes latest REST for all feeds in a single request

The 24h change % shown in Markets is cosmetic and sourced from a public REST ticker; it is never compared against a fill price.

**Why this matters:** entry price, mark price, order book, chart, and the fill notification all read the same feed. The only variance between your entry and the live mark is normal tick timing.

**17 supported pairs:** BTC, ETH, SOL, AVAX, LINK, DOGE, NEAR, INJ, APT, ARB, OP, SUI, TIA, SEI, RENDER, WLFI, POL — each mapped to a verified chain-independent Pyth feed ID.

---

## 16. Keeper Infrastructure

Three automated keeper jobs run every minute via Vercel Pro cron:

**Parallel execution pattern (all three keepers):** First pass evaluates all positions/orders against fresh prices off-chain. Second pass fires all triggered transactions simultaneously via `Promise.all`. Ten simultaneous fills complete in approximately one block rather than ten sequential blocks.

**Critical — Pyth fee exactness:** The contract enforces `msg.value == PYTH.getUpdateFee(updateData)` with strict equality — any deviation reverts `PythFeeMismatch`. All three keepers query the exact fee on-chain before every submission. Hardcoding the Pyth fee (even as a "safe" overestimate) causes every keeper execution to silently revert.

**`cron-conditional-orders.ts` — Limit/Stop Keeper:**
1. Reads all open conditional orders from the contract
2. Fetches fresh Pyth prices per unique pair (once per pair per run, cached)
3. Pre-filters off-chain using the same trigger logic as the contract
4. Submits `executeConditionalOrder` for all triggered orders in parallel

**`cron-tp-sl.ts` — TP/SL Keeper:**
1. Reads all open positions (full 11-field V3 struct)
2. Fetches fresh Pyth prices from Hermes per unique pair
3. Evaluates TP/SL conditions off-chain (avoids stale on-chain cache)
4. Submits `closeIfTriggered` for triggered positions in parallel, earning 0.25% keeper bounty

**`cron-liquidate.ts` — Liquidation Keeper:**
1. Reads all open positions
2. Computes unrealised PnL off-chain using fresh Hermes prices
3. Submits `liquidate` for underwater positions in parallel, earning 1% liquidation bounty

**`sponsor-eth.ts` — Gas Sponsor:** Sends 0.01 ETH to new trading wallets during onboarding. Rate-limited by burner address.

**`protocol-stats.ts` — Analytics Endpoint:** Aggregates on-chain events into lifetime totals and daily buckets. CORS-open. Used by the Admin Panel.

---

## 17. Cross-Chain Bridging (LayerZero V2)

Velo mUSDC (VeloMockUSDC) is a LayerZero V2 OFT deployed on four Sepolia testnets.

**Deposit (cross-chain):**
1. User selects source chain (Arbitrum / Optimism / Ethereum Sepolia)
2. `bridgeService.ts` gets a LayerZero fee quote: `oft.quoteSend({ dstEid, to, amountLD, minAmountLD, extraOptions })`
3. Fee shown in source-chain ETH before submission
4. User's main wallet signs `oft.send(...)` on the source chain
5. LayerZero relays the message; mUSDC arrives in the trading wallet on Base in 1–3 minutes

**Deposit (same-chain, Base Sepolia):** Standard `IERC20.transfer(burnerAddress, amount)` signed by the main wallet.

**Withdraw:** Mirror of deposit. The trading wallet signs for Base → anywhere. Gas is sponsored by `veloGasSponsor.ts` before cross-chain withdraw submissions.

**Supported chains:** Base Sepolia, Arbitrum Sepolia, Optimism Sepolia, Ethereum Sepolia — all wired as LayerZero V2 peers, all working bidirectionally.

---

## 18. Withdrawals & Peer-to-Peer Send

**Withdraw:** Move mUSDC from the trading wallet to any address on any supported chain. Only the free balance (not locked in open positions) is withdrawable. The modal shows "Available to withdraw" as total balance minus locked collateral.

**Send:** The Send modal transfers mUSDC peer-to-peer. Accepts:
- `@username` — resolved on-chain via VeloRegistry to a wallet address
- Any `0x...` address directly

Signed silently by the trading wallet. Used for tipping traders, peer payments, or moving funds between accounts.

---

## 19. On-Chain Username Registry (VeloRegistry)

VeloRegistry is a standalone Solidity contract mapping `@username → address` and `address → @username`.

**Registration:** `VeloRegistry.setUsername(username)` — called during onboarding via the trading wallet. Validated on-chain: 3–20 characters, alphanumeric plus underscores, unique. Contract reverts `UsernameTaken` for duplicates.

**Resolution:** `VeloRegistry.getAddress(username)` → wallet address. Used by the Send modal.

`VeloRegistry.getUsername(address)` → handle. Used by the social layer for profile display.

**On-chain permanence:** A registered username is stored in Solidity — not in Supabase. Anyone can resolve `@yourname → 0x...` by reading the contract directly, independently of Velo's infrastructure.

---

## 20. Social Feed

A real-time, Twitter-style post feed stored in Supabase with Realtime subscriptions for live updates.

**Post creation:**
- Text posts with `$TICKER` tags that auto-link to the pair's market page and filter the feed
- Attached trade cards — embedded closed position artefacts with entry, exit, PnL, and BaseScan link
- Stored in the `posts` Supabase table with Realtime push to all connected clients

**Interactions:**
- **Like** — `likes` table, toggleable
- **Repost** — `reposts` table, shows on the reposter's profile
- **Comment** — `comments` table, threaded under each post
- All interactions fire in-app notifications to the relevant user

**Feed modes:** Default shows all traders. "Following" toggle filters to only traders you follow. `$TICKER` search filters to posts tagged with that cashtag.

---

## 21. Profiles & Trade History

Every wallet address has a public profile page visible to all visitors (logged in or not).

**Profile data (Supabase):** `@handle`, display name, bio, avatar URL, banner URL, created-at timestamp.

**Computed stats (from trade history):**
- Realised PnL (sum of all closed trade PnL)
- Win rate (profitable closes / total closes)
- Average leverage
- Total number of trades

**Trade history table:** Lists every closed trade: pair, side, entry price, exit price, PnL, leverage, duration, and "View on BaseScan" link to the closing transaction. Every row corresponds to a real on-chain event — the numbers cannot be manually edited.

**RLS enforcement:** Profiles and trade_history are world-readable. Write access is scoped to own rows only (`auth.uid() = user_id`).

---

## 22. Follow System

`follows` table in Supabase — a many-to-many graph mapping `follower_id → followed_id`.

Click "Follow" on any profile. The followed trader receives a notification. Toggle "Following" in the Feed to see only posts from traders you follow. Follower/following counts are shown on every profile and updated in real-time via Supabase triggers.

---

## 23. Copy-Trading

Subscribe to any trader to automatically mirror their position openings.

**Current implementation (client-side):**
- Subscribe via "Copy" button on leaderboard or profile
- Subscription stored in `copy_trade_subscriptions` Supabase table
- When the copier's browser is open and the leader opens a position, the copier's Velo Trading Wallet automatically mirrors it proportionally
- Proportionality: if the leader opens using 10% of their balance, the copier opens using 10% of theirs
- Pair, side, and leverage are mirrored exactly

**Known limitation:** Requires the copier's browser to be open. Trades are missed if the copier is offline.

**Planned V3 upgrade:** On-chain Velo Vaults where copiers deposit into a smart contract vault. The vault leader has signing rights but cannot withdraw capital — they can only direct trades. Performance fees, lockup periods, and max drawdown limits are enforced in Solidity.

---

## 24. Leaderboard

A public ranking of all Velo traders sorted by realised PnL, computed from on-chain trade history. Rankings cannot be faked — every entry corresponds to real transactions at real prices.

**Per-row display:** Rank, trader handle, realised PnL, win rate, trade count, average leverage, "Copy" button for one-click subscription.

**Filter:** Only traders with at least one closed trade appear.

**Default feed:** New users who don't follow anyone see top-leaderboard traders' posts. This solves the cold-start problem — there's always content from the best traders at the top of your feed.

---

## 25. Notifications

In-app notification system stored in Supabase's `notifications` table with Realtime push.

**Triggers:** Position closed (TP hit, SL hit, manual close, liquidation), filled limit/stop order, new follower, post liked, post reposted, copy-trade subscriber, mention in a post.

**Delivery:** Supabase Realtime pushes notifications to the browser in real-time. The navbar bell icon shows an unread count badge. Clicking a notification opens the relevant modal (position detail, post, profile). Toast notifications fire for real-time events.

---

## 26. Shareable Trade Cards

Every closed position with |PnL| ≥ $0.50 triggers the share modal automatically.

**Card rendering:** HTML5 Canvas, 1200×675 pixels (Twitter/Instagram optimal ratio). Three background styles:
- **Obsidian** — very dark base with a faint grid and subtle ambient light
- **Gradient** — purple-to-blue prism with layered radial gradients
- **Hologram** — iridescent dual-bloom with contrasting highlight gradients

Configurable field visibility: pair, side, leverage, entry, exit, mark, size, collateral, PnL, trader handle. A "TESTNET · BASE SEPOLIA" watermark is rendered on every card to prevent confusion about real money.

**Export:**
- **Download PNG** — saves the canvas as a `.png` file locally
- **Share** — Web Share API on mobile (posts directly to Twitter, Instagram, Telegram); falls back to clipboard on desktop

**Open position share:** The share icon next to each position card opens the card with current mark price and unrealised PnL — before the position is closed.

---

## 27. TradingView Chart

Velo uses the official TradingView Charting Library widget — not a custom chart implementation.

**Features available:**
- Full OHLCV candle chart for all 17 pairs
- Timeframes: 1m, 5m, 15m, 1h, 4h, 1D (and more via TradingView's built-in list)
- Full drawing tools: trend lines, Fibonacci retracement, horizontal rays, rectangles, text annotations
- Full indicator library: RSI, MACD, Bollinger Bands, EMA (any period), VWAP, Volume, OBV, ATR, Stochastic, and the complete TradingView catalogue
- Price data sourced from **Pyth** via TradingView's `PYTH:*` symbols (e.g. `PYTH:SOLUSD`) — the same oracle the contract settles on, so the chart, the ticker, and your fills all agree
- Chart state persists across tab switches — the component stays mounted and hidden, not destroyed and re-mounted, so drawing tools and indicator configuration are preserved

---

## 28. Order Book (Pyth-Anchored)

Bid/ask depth panel rendered next to the chart in TradeView.

**Data source:** Velo Perps is an oracle-priced engine — trades settle against the Pyth price, not a central-limit order book. Rather than stream depth from a third-party venue (which is a different market than the one users trade against), the book is a reference depth ladder anchored to the live Pyth mark price. It re-centers as the oracle ticks, so the mid price always equals the price you fill at. A small "Pyth" tag and a live pulse dot indicate the source.

**Display:**
- Asks (offers to sell) above the mid-price in red
- Bids (offers to buy) below the mid-price in green
- Pyth mark price and spread shown at centre
- Selectable price grouping (tick size) adapting to the pair's price magnitude
- Depth visualised as proportional bars within each row

---

## 29. Markets View

A grid of all 17 supported trading pairs with live price data.

**Per-pair display:** Live price (updates every few seconds), 24-hour price change % (green/red), 24-hour volume, 24-hour sparkline chart, watchlist star (saves to localStorage favourites), "Trade" button (jumps to TradeView with that pair pre-selected), "Social" button (filters the Feed to posts tagged with that ticker).

**Pair search:** Filter the pair grid by name in real-time.

**Token detail panel:** Clicking a pair opens an information panel with the asset's description, category, market cap rank, website, and whitepaper links where available.

---

## 30. Dashboard & Portfolio Overview

The landing tab for logged-in users.

**Summary:** Total equity (wallet mUSDC + unrealised PnL), realised PnL (lifetime), buying power (free mUSDC), open positions count and total size.

**PnL chart:** Recharts area chart of equity over time, computed from the `trade_history` table.

**Recent activity feed:** Chronological list of all account actions — position opens, closes, deposits, withdrawals, faucet claims, copy-trade subscriptions. Each on-chain action has a "View on BaseScan" link.

**Open positions list:** Compact view of all current positions with live PnL, matching the TradeView position cards.

**Pending deposits:** In-flight cross-chain bridge deposits shown with their LayerZero status until they arrive.

---

## 31. Admin Panel

Visible only to the VeloPerps contract owner wallet (`owner()` is read on app load; the tab only appears if the connected wallet matches).

**Pair registry:** All 17 supported pairs with on-chain status. "Register" button for unregistered pairs calls the owner-only `registerPair(pairIndex, feedId)`. "Pause" / "Resume" buttons toggle `pairTradable`. "Register all pending" batch-registers all 17 pairs in one click.

**Fee management:** Live `feeBalance` readout in mUSDC. "Withdraw to owner" calls `withdrawFees(amount)`.

**Pool reserves:** Live contract mUSDC balance — the pool that pays out winners.

**Version-aware metadata:** The contract-metadata block reads the live on-chain `VERSION` constant and renders the active-contract row, header subtitle, and routing badge accordingly (e.g. `VeloPerps v3.1`, `ROUTING TO V3.1`). Deploying a new contract version updates the panel automatically — nothing is hardcoded.

**Trading metrics:** Lifetime volume, lifetime fees, opens/closes, liquidations, realized PnL, plus trailing 24h / 7d / 30d rollups (volume, trades, fees, liquidations) and daily charts (volume, fees, opens-vs-closes, liquidations). **Open positions and open interest** are counted live on-chain (see §32).

**User metrics:** Total users, wallet-authenticated users, new signups (today/7d/30d), and DAU / WAU / MAU, with daily signup and daily-active-user charts (see §32).

**Web analytics:** Live Google Analytics 4 numbers (active users, pageviews, sessions, top pages) when a GA4 service account is configured, else a connect-state card.

**Keeper wallet balance:** Live ETH readout with low-balance warning (below 0.005 ETH). If the keeper wallet runs dry, TP/SL, liquidations, and conditional orders stop executing.

---

## 32. Metrics & Analytics APIs

Three public, CORS-open JSON endpoints power the admin dashboard and are equally usable for external monitoring, Datadog/Grafana scraping, and grant reporting.

**`GET /api/protocol-stats` — trading metrics.** Source of truth is the app's own `trade_history` + `positions` records in Supabase (read with the service-role key), so metrics are version-agnostic across V1/V2/V3/V3.1 and don't rely on scanning chain events (Base Sepolia is ~20M blocks deep; full event scans time out and the contracts keep no cumulative-volume counter on-chain). Returns lifetime totals, 24h/7d/30d rollups, realized PnL, and daily buckets.
- **Volume** = sum of opened notional (`size` = collateral × leverage). Notional is the standard perps volume definition and is intentionally a large multiple of collateral.
- **Fees** = 0.10% per side charged on **collateral** (`size ÷ leverage`), matching the contract's `applyBpsFee(OPEN_FEE_BPS)` — not 0.10% of notional. A volume-weighted average leverage backfills close rows that don't store leverage.
- **Open positions / open interest** are read directly on-chain: it reads `nextTradeId`, enumerates every `tradeId`, calls `getPosition`, and counts those still live (closed positions are `delete`d → zeroed). Open interest sums collateral × leverage across them.
- **On-chain cross-reference block:** live `VERSION`, `nextTradeId` (lifetime opens), `feeBalance`.
- Edge cache 30s, stale-while-revalidate 60s.

**`GET /api/user-stats` — growth & engagement.** Reads `profiles`, `trade_history` via the service-role key. Returns total users, wallet users, new signups (today/7d/30d), DAU/WAU/MAU, and daily signup + daily-active series. DAU/WAU/MAU come from a `last_active_at` heartbeat (client calls the `touch_activity()` RPC on load, on tab focus, and every 3 min, upserting `user_activity_daily`); if the migration hasn't run it falls back to trade-history-derived activity. Edge cache 60s.

**`GET /api/ga-stats` — Google Analytics 4 (optional).** Mints a service-account JWT (dependency-free, Node `crypto`), exchanges it for an access token, and calls the GA4 Data API `runReport` for active users (1d/7d/28d), pageviews, sessions, and top pages. Returns `{ configured: false }` when GA env vars are absent. Edge cache 120s.

**Client tracking** (`src/services/analytics.ts`): loads gtag from `VITE_GA_MEASUREMENT_ID`, fires a virtual `page_view` on every tab change (SPA-correct), and exposes `trackEvent` / `setAnalyticsUser`. No-op when the measurement ID is absent.

**Environment variables:** `SUPABASE_SERVICE_ROLE_KEY` (required for trading + user metrics), `VITE_VELO_PERPS_V3_ADDRESS` (active contract for version label + on-chain counts), `VITE_GA_MEASUREMENT_ID` (tracking), and `GA_PROPERTY_ID` / `GA_CLIENT_EMAIL` / `GA_PRIVATE_KEY` (optional, for in-dashboard GA numbers). Run `SUPABASE_MIGRATION_BUILD91_ANALYTICS.sql` once to enable the activity heartbeat.

---

## 33. Session Management & Auth

Velo's auth combines wallet-based identity with Supabase session management.

**Session establishment:** After onboarding, `supabase.auth.signInAnonymously()` creates a session. The Supabase JWT is stored and auto-refreshed.

**Page load sequence:**
1. Sync: read `velo_session_v1` from localStorage → valid: user renders immediately; invalid: loading screen
2. Async: Supabase `INITIAL_SESSION` event (0–3s) → `restoreSession()` fetches fresh profile + social data
3. Fallback: if `INITIAL_SESSION` doesn't fire within 2.5s, `getSession()` is called directly

**Social data race condition (and fix):** On mount, the social data fetch fires immediately. If the user is logged in from a cached session, the JWT might not yet be active — Supabase treats the request as `anon` role and RLS may block reads. Fix: a retry helper (3 attempts with backoff), and a second `useEffect` that re-triggers the social fetch when `authChecked` flips to true and data is still empty. Tab navigation to Social/Leaderboard also triggers a re-fetch if data is empty.

---

## 34. Settings Panel

**Wallet section:** Main wallet address (linked to BaseScan), Velo Trading Wallet address (linked to BaseScan), ETH balance, mUSDC balance, "Reveal Private Key" (shows hex key for export), "Move $X mUSDC" (sweeps from main wallet to trading wallet if found there).

**Profile section:** Edit display name, bio, avatar URL, banner URL, email.

**Preferences:** Dark/light mode toggle, sound effects toggle.

**Network:** Current chain display, wrong-network warning with one-click switch button via wagmi `useSwitchChain`.

---

## 35. Liquidity Pool Model

VeloPerps uses a single-sided liquidity pool model. The pool is the protocol's mUSDC balance held in the contract address.

**How it works:**
- Open position: collateral transferred to the contract
- Close at profit: profit paid from the pool + collateral returned to trader
- Close at loss: remaining collateral returned to trader, loss accrues to pool
- Liquidation: liquidated collateral goes to the pool minus the 1% bounty

**The pool is always the counterparty to every trade.** There are no other traders on the other side. The protocol takes the opposite side of every trade. The pool profits when traders lose in aggregate, and loses when traders profit in aggregate.

**Pool solvency:** No insurance fund exists on testnet. For mainnet, an insurance fund seeded from protocol fees (target: 5% of TVL) will be added.

---

## 36. Mobile Experience & PWA

The full Velo interface is responsive and tested on iOS and Android. Velo is also a fully installable Progressive Web App — users on any platform can add it to their home screen or dock and open it like a native application, with no app store and no browser chrome.

**Mobile-specific layout:** TradeView reflows to put the order entry panel below the chart. Position cards are vertically stacked with swipe-friendly tap targets. Feed posts are full-width with tap-to-expand comments. Bottom navigation bar: Trade, Markets, Social, Leaderboard — icons 22px, touch targets 62px tall, above the iOS safe-area inset.

**Mobile wallet support:** Reown AppKit supports WalletConnect V2 for in-app browser wallets (MetaMask Mobile, Coinbase Wallet) and social logins (Google, Discord) that work natively on mobile without MetaMask.

**Performance:** The trading wallet signs locally — no wallet app round-trips for each trade. Position polling every 5s. The chart loads asynchronously and doesn't block the order form.

**Progressive Web App (PWA):**

Velo ships a `manifest.json`, a service worker (`sw.js`), and a platform-aware install prompt component (`PWAInstallBanner.tsx`).

- **iOS Safari:** detects the platform and shows a step-by-step sheet (Share → Add to Home Screen → Add). Once installed, opens full-screen with `black-translucent` status bar so VELO's dark background extends edge-to-edge. All required `apple-touch-icon` sizes are provided.
- **Android Chrome/Edge:** captures `beforeinstallprompt` and shows a branded banner — gradient V logo, one-tap Install button — that calls the native OS install flow. Banner dismisses permanently on install.
- **Service worker caching strategy:** stale-while-revalidate for static assets; network-first for navigations; bypass for all WebSocket, Supabase, Orderly, Pyth, and `/api/` traffic so live market data is never served stale.
- **Icons:** nine sizes (72×72 → 512×512) plus 180×180 Apple touch icon. All rendered from the canonical Velo SVG: `#7B3CE8 → #3B5BFF → #A8C8FF` gradient, glass highlight, italic Fraunces *V*.

---

## 37. Theme System

A single CSS custom property system drives both light and dark modes.

**Token structure (`tokens.css`):**
```css
:root {
  --bg-base:    #07070A;            /* Dark: near-black */
  --bg-surface: rgba(255,255,255,0.03);
  --fg:         #F5F3EE;            /* Light text */
  --fg-2:       rgba(245,243,238,0.7);
  --accent:     #7C3AED;            /* Violet primary */
  --accent-2:   #2563EB;            /* Blue secondary */
}
[data-theme="light"] {
  --bg-base: #F5F3EE;
  --fg:      #07070A;
}
```

**Brand typography:**
- `Fraunces` — display moments, PnL heroes, wordmark
- `Geist` — all UI copy and controls
- `Geist Mono` — every price, balance, timestamp, trade ID. Used with `font-feature-settings: "tnum" 1` and `font-variant-numeric: tabular-nums` so numbers never shift horizontally as they update in live position tables

---

## 38. Security Architecture

**Smart contract security:**
- `ReentrancyGuard` on all write functions
- `SafeERC20` for all token transfers
- `Ownable` with restricted owner privileges (pair management, fee withdrawal only — cannot touch user funds)
- `nonReentrant` modifier on `openPosition`, `closePosition`, `liquidate`, `closeIfTriggered`, `executeConditionalOrder`
- `PYTH_MAX_AGE_SECONDS = 60` — stale oracle prices revert before execution
- Owner explicitly **cannot** seize user collateral, close other people's positions, or freeze the protocol

**Frontend security:**
- Trading wallet private key never transmitted over the network — only used for local signing
- HTTP security headers on all routes via `vercel.json`: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `X-XSS-Protection: 1; mode=block`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- Static assets: `Cache-Control: public, max-age=31536000, immutable`
- `VELO_SPONSOR_PRIVATE_KEY` is a server-side environment variable (no `VITE_` prefix) — never reaches the browser bundle

**Supabase RLS:**
- `profiles`, `posts`, `comments`, `likes`, `reposts`, `follows`, `trade_history` — world-readable (`FOR SELECT USING (true)` for both `anon` and `authenticated`)
- All write operations — scoped to own rows only (`FOR INSERT/UPDATE/DELETE USING (auth.uid() = user_id)`)

**Logout security:** Three-layer sentinel system ensures logout actually logs out even when wagmi auto-reconnects within 100ms.

---

*This document reflects the state of Velo as of the current testnet build on Base Sepolia (VeloPerpsV3.1, VERSION=31). All features described are implemented in the deployed codebase. Live at [velotrading.live](https://velotrading.live).*
