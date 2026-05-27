# Velo — CEO Feature Explainer
*Plain English. No Solidity knowledge required.*

---

## What Velo is, in one sentence

Velo is a leveraged trading app where users bet on whether BTC, ETH, SOL (and 14 other assets) will go up or down — and it all settles on-chain, meaning a smart contract (not Velo) holds the money and enforces the rules.

---

## The money flow

**mUSDC** is the testnet currency. Think of it as play-money dollars. Every user needs it to trade. They get it from a faucet (free on testnet) or by bridging from another testnet network.

When a user opens a trade:
- Their mUSDC goes into the Velo contract (like a casino cage holding your chips)
- Their "position" (the bet) is recorded on-chain
- When they close, the contract sends back their mUSDC ± profit/loss

**The Pool** — you seeded the V3 contract with 100,000 mUSDC. This is the house bank. When a trader wins, the pool pays them. When a trader loses, their mUSDC joins the pool. Protocol fees (0.1% open, 0.1% close) also accumulate in the pool over time.

---

## Features that are REAL (on-chain, fully working)

### 1. Opening a Trade (Market Order)
User picks a pair (BTC/USD), a direction (Long = betting price goes up, Short = betting price goes down), a size in dollars, and leverage.

**Leverage** multiplies both gains and losses. 10x leverage means: if BTC goes up 1%, you make 10%. If BTC goes down 1%, you lose 10%.

The price used to open is fetched live from **Pyth** — a decentralized oracle that aggregates prices from many exchanges. This prevents anyone from manipulating the entry price.

**What happens on-chain:** Contract checks the Pyth price, takes your collateral (mUSDC), records your position. Done. Takes ~5-10 seconds.

### 2. Isolated Margin
Each position is a **sealed box**. The collateral you put in is all you can lose on that position. A liquidated BTC position cannot touch your ETH position or your wallet.

*Example: You open a 10x BTC Long with $100 collateral. If BTC drops 9%, your collateral is gone and the position is liquidated. Your other $900 in your wallet is safe.*

### 3. Cross Margin
All your cross-margin positions share one collateral pool. A winning position can offset a losing one. More capital efficient, but riskier.

*Example: You have $500 in the cross account. You open a BTC Long AND an ETH Short both in cross mode. If BTC pumps and ETH pumps (your short is losing), the BTC profits cushion the ETH loss. But if BOTH go against you, the entire $500 can drain.*

**As of Build 83:** Cross mode is now seamless. Users don't deposit to a "cross account" separately. They just pick CROSS, click trade, and the app handles the behind-the-scenes ledger automatically.

### 4. Limit Orders
Instead of trading at the current price, the user sets a target price. "I want to buy ETH only if it drops to $2,800."

A keeper bot (Vercel cron job running every minute) watches prices. When ETH hits $2,800, the keeper executes the order on-chain. The contract holds the user's collateral in escrow until this happens.

If the user changes their mind, they can cancel — the contract refunds their collateral.

### 5. Stop Orders
Same as Limit, but in the opposite direction. "If BTC breaks below $90,000, open a Short position." Used to enter trades when momentum breaks a key level.

### 6. Take Profit (TP)
A price level set on an open position. "Close my BTC Long if BTC reaches $120,000." The keeper bot sees this, executes `closeIfTriggered`, and the profit lands in the user's wallet. The keeper earns a 0.25% reward for doing this.

### 7. Stop Loss (SL)
"Close my BTC Long if BTC drops to $85,000." Same mechanism — keeper watches, fires the close, user is out before the position gets liquidated. Saves them from losing 100% of their collateral.

### 8. Liquidation
If a position loses 90% of its collateral, the contract allows anyone to liquidate it. The person who calls liquidate gets 1% of the collateral as a bounty. The keeper bot does this automatically.

*Why 90%? The contract's `LIQUIDATION_THRESHOLD_BPS = 9000` (90% of 10,000 basis points). This means you always keep at least 10% of your collateral even in the worst case — you can never go into negative debt.*

### 9. Pyth Oracle Pricing
Every trade — open, close, TP, SL, liquidation — uses a **fresh Pyth price** fetched at the moment of the transaction. This price is submitted along with the transaction and verified by the contract. This means:
- No stale prices
- No one can manipulate the price right before a big trade
- The small "Pyth fee" (~$0.001) is paid in ETH by the user as part of the transaction

---

## Features that are NOT real (disabled or cosmetic)

| Feature | Status | Why |
|---------|--------|-----|
| **Funding Rate** | Disabled | The V3 contract stores a funding index but no keeper ever runs it. No money flows between longs and shorts. If you show it, you're lying to users. |
| **Insurance Fund** | Doesn't exist | The contract has no separate insurance pool. Losses are capped at collateral — traders can't go negative. Protocol fees accumulate in `feeBalance` (owned by you). |
| **Order Book** | Cosmetic only | The order book displayed in the UI is from TradingView's data feed (Coinbase/Binance). It has nothing to do with Velo trades. There is no Velo order book — trades execute against the pool at the Pyth price. |

---

## The Keeper System (what runs in the background)

Three Vercel cron jobs run every minute:

1. **TP/SL Keeper** — scans all open positions, checks if any TP or SL has been crossed, calls `closeIfTriggered`. Earns 0.25% reward per close.

2. **Liquidation Keeper** — checks if any position's collateral has dropped below 10%, calls `liquidate`. Earns 1% bounty.

3. **Conditional Order Keeper** — checks if any LIMIT or STOP order's trigger price has been hit, calls `executeConditionalOrder`.

**Important:** Keepers need ETH to pay gas. If the keeper wallet runs out of ETH, TP/SL/liquidations stop working. Check the keeper wallet balance periodically.

---

## The Supabase Layer (what's in the database, not on-chain)

Supabase is the traditional database that stores things the blockchain doesn't:

- **User profiles** — username (@handle), avatar, bio
- **Trade history** — for display in the History tab (the on-chain record is the source of truth; Supabase is just the UI cache)
- **Social feed** — posts, PnL cards, likes, comments
- **Notifications** — "your TP was hit" alerts
- **Leaderboard** — ranked by realized PnL

Nothing in Supabase affects what happens on-chain. It's purely for the social and historical UX layer.

---

## The Wallet Architecture

Users have **two wallets**:

1. **Main wallet** (MetaMask, Rabby, etc.) — their real wallet. They use it to sign transactions. Holds mUSDC.

2. **Trading wallet** (burner) — a throwaway wallet generated and stored in the browser. Used for gas-free small operations. Velo auto-tops this up with a tiny amount of Base Sepolia ETH so users don't need to worry about gas on most operations.

The main wallet pays for: opening positions, closing positions, approving tokens. The trading wallet assists with smaller UX operations. Users bridge mUSDC from their main wallet to the trading context.

---

## What Still Needs Building (Honest Gaps)

| Gap | Impact | Effort |
|-----|--------|--------|
| Partial TP/SL close | Minor — TP/SL always closes 100% of position | Contract upgrade + keeper update needed |
| Funding rate (real) | Medium — institutional traders expect it | Contract upgrade + keeper + UI |
| Funding rate display | Low — informational only | Just a keeper + Supabase column |
| On-chain order ID saved to Supabase | Medium — can't cancel LIMIT orders across sessions | Already migrated (Build 82), just needs wiring in App.tsx save path |
| Pool health dashboard | Low — admin visibility | Read `poolBalance` from contract, display in Admin panel |

---

## The Pool and Why It Matters

The 100,000 mUSDC you seeded is what pays out winning traders. If many traders go on a winning streak and the pool goes to zero:
- Profitable close calls will revert (contract can't pay out)
- You need to seed the pool again with: `cast send <V3_ADDRESS> "transfer(address,uint256)" <V3_ADDRESS> <amount>`

In production, the pool stays healthy because:
- Most retail traders lose over time (the house edge)
- Protocol fees (0.1% each side) flow back into the pool
- A larger pool allows larger position sizes

**Current pool seeded:** 100,000 mUSDC on testnet. This supports approximately $100,000 in open notional at 1x leverage, or $10,000 at 10x leverage (conservative estimate — actual capacity depends on position distribution).

---

## Key Numbers (V3 Contract Constants)

| Constant | Value | Meaning |
|----------|-------|---------|
| `MIN_COLLATERAL` | $1 USDC | Minimum bet size |
| `MAX_LEVERAGE` | 100x | Maximum multiplier |
| `OPEN_FEE_BPS` | 10 (0.1%) | Fee taken when opening |
| `CLOSE_FEE_BPS` | 10 (0.1%) | Fee taken when closing |
| `LIQUIDATION_THRESHOLD_BPS` | 9000 (90%) | Liquidated when 90% of collateral is lost |
| `KEEPER_REWARD_BPS` | 25 (0.25%) | Reward for executing TP/SL/conditional orders |
| `LIQUIDATOR_REWARD_BPS` | 100 (1%) | Reward for liquidating a position |

---

*Last updated: Build 83 — May 27, 2026*
