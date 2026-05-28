# Velo Trading Terminal — Project Status

> **For any AI agent picking this up:** read this entire document before making changes. The "Known traps & gotchas" section at the bottom will save you hours.
>
> **For NotebookLM / context hand-off:** this is the authoritative state document. Lower-level details live in `README.md` and `MIGRATION_STATUS.md`.

**Last updated:** May 27, 2026 — V3 contract expansion pass (feature-parity focus)
**Live URL:** https://velo-trading-terminal.vercel.app
**Repo:** https://github.com/stanisnear/velo-trading-terminal
**Owner:** Stan (@stanisnear)
**Stage:** Testnet on Base Sepolia, V3 wiring-in-progress, not yet cut over to prod

---

## What Velo is

A SocialFi-native perpetual futures trading terminal. Users open leveraged BTC/ETH/SOL/etc. positions priced by Pyth oracles, all settled on-chain via custom Solidity contracts. The "SocialFi" layer means traders have on-chain @handles registered to a registry contract, send mUSDC peer-to-peer by handle, share branded PnL cards (Hyperliquid-style), and post to a social feed.

## VELO v3 rebrand snapshot

The frontend has now been moved onto the VELO v3 visual system from the handoff package: "Editorial Calm, Prismatic Depth." This is a UI and brand rollout, not a product-logic migration.

### What changed in this pass

- Fonts were updated to `Fraunces`, `Geist`, and `Geist Mono`.
- Global tokens were replaced with the new violet / electric-blue / ice palette and the restrained prism gradient treatment.
- Shared glass, chip, button, bug, and wordmark primitives were rebuilt around the v3 tokens.
- The floating app shell navigation and mobile bottom navigation were re-skinned to match the new mockup direction.
- Dashboard, trade, markets, social, leaderboard, and the share-card surface now inherit the new brand language and mobile-safe spacing.
- Legacy style entry points (`src/styles/velo-brand-system.css`, `src/styles/v2.css`) were removed from the active frontend path.

### What did not change

- Trading logic, wallet flow, Supabase data shape, contract routing, and all on-chain integrations remain as they were.
- This pass is safe to reason about as a presentation-layer update unless a later note explicitly says otherwise.

### Stack at a glance

- **Frontend:** React 19, Vite 6, TypeScript 5.8, wagmi v2, RainbowKit
- **Backend:** Supabase (auth, social feed, notifications, leaderboard)
- **On-chain:** Solidity 0.8.22, Foundry, Base Sepolia
- **Oracle:** Pyth Hermes (live price feeds)
- **Bridging:** LayerZero V2 OFT (mUSDC across 4 testnets)
- **Hosting:** Vercel (frontend), GitHub Actions (keepers)

---

## Deployed contracts (Base Sepolia, chain ID 84532)

### V3 — live on Base Sepolia (active)

| Contract | Address |
|----------|---------|
| **VeloPerps V3** | `0x3780e858B76027E6D6cB0c74E863f712a0F0E27E` |

**V3 contract scope currently implemented (code-level):**

1. Isolated + cross margin modes.
2. On-chain TP/SL set/replace/clear (`setTriggers` with `0` to clear) and keeper close path (`closeIfTriggered`).
3. On-chain conditional trigger orders (LIMIT/STOP) with place/cancel/execute.
4. Reduce-only trigger execution via partial close semantics.
5. Liquidation path with bounty.
6. Pair-level risk controls (max notional / OI cap checks).
7. Funding index accrual and funding settlement in close PnL.

**Status:** V3 is deployed, verified, and **fully wired** in this build. Set `VITE_VELO_PERPS_V3_ADDRESS=0x3780e858B76027E6D6cB0c74E863f712a0F0E27E` in Vercel and redeploy. All frontend service functions, UI flows (cross margin, conditional orders, TP/SL), and keeper crons are V3-aware. See the Change log entry "V3 full wiring" for the complete cutover checklist.

### V2 — legacy (kept for historical positions)

| Contract | Address |
|----------|---------|
| **VeloPerps V2** | `0x3C7cBCa2C675F1f788148aaD08eceab262298de8` |
| **VeloMockUSDC** | `0x5EFaF3F69b09bC2abF3439bDC0C93bf611026699` |
| **VeloRegistry** | `0x7e510d615a8afDfaa324F790F3E54e520756ECe2` |
| **Pyth oracle** | `0xA2aa501b19aff244D90cc15a4Cf739D2725B5729` (Pyth's, not ours) |
| **LayerZero Endpoint V2** | `0x6EDCE65403992e310A62460808c4b910D972f10f` (LZ's, not ours) |

**V2 contract status:** Live, all 17 pairs registered (BTC, ETH, SOL, AVAX, LINK, DOGE, NEAR, INJ, APT, ARB, OP, SUI, TIA, SEI, RENDER, WLFI, POL). `version()` returns 2. Verified via `cast code`. **Pool needs continuous seeding** as users open positions — use the admin panel.

**BaseScan source verification:** V3 verified successfully on BaseScan via Standard JSON Input.

### V1 — legacy (still on-chain but no new trades routed)

| Contract | Address |
|----------|---------|
| **VeloPerps V1** | `0x28fE36d4ae72ab0E05fa6edafE1D6e11E9DD6163` |

V1 has the first 6 pairs registered (BTC/ETH/SOL/AVAX/LINK/DOGE) and ~101k mUSDC pool. The frontend ONLY routes to V2 (when `VITE_VELO_PERPS_V2_ADDRESS` env var is set). V1 is kept on-chain for any historical positions to be closeable.

### Cross-chain mUSDC OFT (LayerZero V2)

| Chain | Address |
|-------|---------|
| Arbitrum Sepolia | `0xEC76fD9182ba15ff193FDBc122013FCa18900290` |
| Optimism Sepolia | `0xEC76fD9182ba15ff193FDBc122013FCa18900290` |
| Ethereum Sepolia | `0x96d0CF69896FE6b5B031D21967f027d95Eb42e9A` |

### Owner address

**`0x8f8fF5A29760278C7B54D450dA57A13Cd3FD3A8b`** — controls all admin functions on V1, V2, mUSDC, Registry. This is the original deployer key. Stan's main MetaMask wallet (`0x4F3e55D85...`) is NOT the owner. To access the admin panel, either connect with the deployer key OR call `transferOwnership(0x4F3e55D85...)` on each contract.

---

## What V2 adds over V1

V1 only had: open position, close position, liquidate. V2 adds five real features:

1. **`increaseCollateral(tradeId, amount)`** — add margin to an open position. Lowers effective leverage.
2. **`decreaseCollateral(tradeId, amount, pythUpdate)`** — withdraw collateral. Enforces max 25× leverage + non-liquidatable post-state.
3. **`partialClose(tradeId, fractionBps, pythUpdate)`** — close any fraction (1bp to 10000bps). PnL on closed portion is realised immediately.
4. **`setTriggers(tradeId, takeProfit, stopLoss)`** — write TP/SL prices to contract storage. Pass 0 to clear. Direction enforced on-chain.
5. **`closeIfTriggered(tradeId, pythUpdate)`** — **permissionless** close. Anyone can call; contract verifies trigger crossed and pays 0.25% keeper bounty. Makes the TP/SL keeper self-funding.

Plus: `version()` returns 2, `effectiveLeverage(tradeId)` computes leverage from current collateral, `originalNotional_6` stored at open for math consistency after add/reduce.

All 12 V2 forge tests pass.

### What V2 does NOT add (and why V3 exists)

- **Cross margin** — implemented in V3.
- **On-chain limit/stop trigger orders** — implemented in V3.
- **Funding accrual/indexing** — implemented in V3.
- **Insurance fund + ADL** — needs separate vault + drawdown logic → required for any real-money launch

---

## Frontend architecture

### Two-wallet model (critical to understand)

- **Main wallet (MetaMask):** User's identity. Holds the @handle registration on-chain (since handles must be persistent). Used to deposit/withdraw/send mUSDC. One signature on first login derives the trading wallet.
- **Velo Trading Wallet (burner):** Private key stored in localStorage, derived deterministically from the main wallet's first signature. Used to sign EVERY trade silently (no popup per trade). Auto-funded with ETH for gas by the sponsor server.

This is what makes the UX feel web2 — one signature on signup, then everything else is silent.

### Username system

- **Claimed by MAIN wallet** (not the burner). This was a bug — fix shipped in batch 3. Username is identity → must survive localStorage clear → must bind to MetaMask, not burner.
- **30-day cooldown** between changes, enforced on-chain via `nextChangeAllowed[address]` mapping.
- **Resolution:** `resolve(handle)` returns the address that owns it. When you send to `@alice`, it goes to alice's MAIN wallet.

⚠ **Legacy handles claimed before the fix are bound to BURNER addresses.** Those users need to wait the 30-day cooldown or re-claim from main. For testnet this is acceptable; production will need a migration.

### Auto-gas sponsorship

Burner wallet starts empty. `/api/sponsor-eth` (Vercel serverless) uses `VELO_SPONSOR_PRIVATE_KEY` env var to send 0.005 ETH to any burner below 0.0015 ETH. Called automatically before every gas-using action via `src/services/veloGasSponsor.ts` → `ensureBurnerGas(publicClient, burnerAddress)`:

- Open / close / addMargin / reduceMargin / partialClose / setTriggers
- Username claim
- Send mUSDC
- Withdraw mUSDC

### Modals and their purpose

| Modal | Purpose |
|-------|---------|
| `VeloWelcomeModal` | One-signature onboarding to derive the burner |
| `VeloUsernameModal` | Claim/change on-chain @handle. Signs with MAIN wallet. |
| `VeloDepositModal` | **NEW (batch 4):** Move mUSDC from main → burner (same chain). Has copy-address option for external sends. |
| `VeloBridgeModal` | Cross-chain mUSDC via LayerZero (Base/Arb/OP/Eth Sepolia) |
| `VeloSendModal` | Peer-to-peer mUSDC by @handle or 0x. Signed by burner. |
| `VeloWithdrawModal` | Trading wallet → main wallet or custom 0x |
| `VeloManagePositionModal` | V2: 4 tabs — Add margin, Reduce, Close %, TP/SL. Includes preset buttons (10/20/25/50/75/100% close, ±25/50/100/200/500% TP, -10/25/50/75/90% SL). |
| `VeloShareCard` | 1200×675 branded PNG share card. Customizable fields, 3 backgrounds. |
| `VeloAdminPanel` | Owner-only: register pairs, withdraw fees, mint mUSDC (with no-cooldown `mintTo`), seed pool with one-click "→ V2 pool" shortcut. |

### File map

```
src/
├─ App.tsx                              ~7400-line monolith. Partially decomposed.
├─ components/
│  ├─ VeloAdminPanel.tsx                Owner panel (mintTo, seed, register pairs, fees)
│  ├─ VeloBridgeModal.tsx               LayerZero V2 OFT cross-chain
│  ├─ VeloDepositModal.tsx              Main → burner deposit (NEW batch 4)
│  ├─ VeloManagePositionModal.tsx       V2 4-tab modal with preset buttons
│  ├─ VeloSendModal.tsx                 Peer-to-peer mUSDC
│  ├─ VeloShareCard.tsx                 1200×675 PNG share card
│  ├─ VeloUsernameModal.tsx             @handle claim via MAIN wallet
│  ├─ VeloWelcomeModal.tsx              One-signature onboarding
│  └─ VeloWithdrawModal.tsx             Trading wallet → main / custom 0x
├─ services/
│  ├─ veloGasSponsor.ts                 NEW: centralized gas pre-flight
│  ├─ veloPerpsService.ts               V1/V2 routing, ABI, helpers
│  ├─ useVeloPerpsTrading.ts            React hook for trade actions
│  ├─ veloBurnerWallet.ts               Burner derive + persist
│  ├─ veloBurnerSetup.ts                Burner state machine
│  ├─ veloUsdcService.ts                ERC-20 helpers
│  ├─ pythService.ts                    Hermes price update fetch
│  ├─ usernameService.ts                Registry reads/writes
│  ├─ bridgeService.ts                  LayerZero quote + bridge
│  └─ supabaseStore.ts                  Social feed, notifications, leaderboard
├─ api/                                 Vercel serverless
│  ├─ sponsor-eth.ts                    Gas sponsor (POST { burnerAddress })
│  ├─ cron-liquidate.ts                 Liquidation keeper (every 5m)
│  ├─ cron-tp-sl.ts                     TP/SL keeper for V2
│  └─ protocol-stats.ts                 JSON stats for admin dashboard
contracts/
├─ src/
│  ├─ VeloPerps.sol                     V1 (legacy)
│  ├─ VeloPerpsV2.sol                   V2 (LIVE)
│  ├─ VeloMockUSDC.sol                  ERC-20 + LayerZero OFT, has mint() and mintTo()
│  ├─ VeloRegistry.sol                  On-chain @handles, 30-day cooldown
│  └─ libraries/PerpsMath.sol           PnL math, Pyth normalization
├─ test/
│  ├─ VeloPerps.t.sol
│  └─ VeloPerpsV2.t.sol                 12 tests, all passing
├─ script/
│  ├─ DeployVeloPerpsV2.s.sol           NO seedPool() block (broke previous deploys)
│  └─ ...
└─ deployments/                          JSON files per chain with addresses
```

---

## Vercel environment variables

| Variable | Required | Current value | Purpose |
|----------|----------|---------------|---------|
| `VITE_VELO_PERPS_V3_ADDRESS` | **YES** | `0x41fDb544D7247a5ddc6B4C06F29D09f2b20de907` | Routes trades to V3.1 (active) |
| `VITE_VELO_PERPS_V2_ADDRESS` | legacy | `0x8D4b792137252D79FB3Ae953AA619fA57101665f` | Keep set for legacy position reads |
| `VITE_VELO_PERPS_ADDRESS` | Optional | unset (defaults to V1) | Override V1 |
| `VITE_VELO_USDC_BASE` | Optional | unset (defaults to live mUSDC) | Override mUSDC |
| `VITE_BASE_SEPOLIA_RPC_URL` | Recommended | (any working RPC) | Public RPC override |
| `VITE_PYTH_HERMES_URL` | Optional | `https://hermes.pyth.network` | Pyth endpoint |
| `VITE_SUPABASE_URL` | **YES** | Stan's Supabase project URL | DB connection |
| `VITE_SUPABASE_ANON_KEY` | **YES** | Stan's Supabase anon key | DB auth |
| `VELO_SPONSOR_PRIVATE_KEY` | **YES** | Sponsor wallet private key | Server-side gas sponsorship |

---

## Supabase database

**Project:** `btgfoekgvyvdflzjfehz.supabase.co`

**Critical migrations to have applied:**
1. `SUPABASE_SCHEMA.sql` — base schema (profiles, posts, likes, reposts, comments, follows, open_orders, trade_history, transactions, notifications, copy_relationships, leaderboard_snapshots)
2. `SUPABASE_MIGRATION_VELO_PERPS.sql` — adds tx_hash and on_chain columns
3. `SUPABASE_MIGRATION_TRIGGERS.sql` — adds take_profit/stop_loss columns to open_orders
4. `SUPABASE_MIGRATION_BUILD79.sql` — adds leverage/margin_mode/liquidation_price/opened_at columns
5. `SUPABASE_MIGRATION_TX_COUNTERPARTY.sql` — **NEW (batch 3, expanded batch 8):** adds `counterparty`, widens `transactions.type` to include SEND/RECEIVE, and reloads the PostgREST schema cache

**RLS policies are critical.** If social posts don't show for new users, run:
```sql
DROP POLICY IF EXISTS "Public read posts" ON public.posts;
CREATE POLICY "Public read posts" ON public.posts FOR SELECT USING (true);
-- Same for likes, reposts, comments, profiles
```

The schema enables RLS on every table; if a write fails silently and trade history disappears on refresh, RLS is the first thing to check (`auth.uid() = user_id` is the policy for trade_history and open_orders).

---

## Known issues and ALL recent fixes

### Critical bugs fixed across the last 4 sessions

| Issue | Root cause | Fix |
|-------|------------|-----|
| Username claim showed cryptic `0x5a66c00a` error | Selector mismapped — `0x5a66c00a` is `ChangeCooldownActive(uint256)`, not `UsernameTaken` | Mapped all 3 registry selectors correctly; modal reads `nextChangeAllowed` on open and shows yellow cooldown banner |
| Username bound to burner instead of main | Modal read from main but burner signed → mismatch on cooldown check | Now always signs with main wallet (one MetaMask popup per claim) |
| `pairFeedId returned no data ("0x")` on every trade | Phantom V2 fallback address `0x3C7c...` had no contract | Removed phantom fallback; only routes to V2 when env var is a valid 42-char address |
| V2 deploy "succeeded" but no bytecode | `try this.seedPool() {}` in script reverted the whole tx | Removed seedPool from deploy script |
| Burner ran out of ETH mid-trade | Only `openPosition` had gas pre-flight | New `veloGasSponsor.ts` module called from every gas-using action |
| Social posts invisible to new users | Posts only fetched inside session-restore block | Added public post-fetch effect on Social tab entry |
| `TAKE_PROFIT SHORT` shown for a LONG TP order | Order's `side` field stores the CLOSING direction (correct semantics, confusing UX) | Render now shows position side ("TAKE PROFIT · LONG") |
| Two share modals popped up after close | Auto-open of both share-card PNG and share-to-feed | Removed both auto-popups; user invokes via Share button on history/position rows |
| Recent Activity missing sends/withdraws | Only DEPOSIT/WITHDRAW handled by `recordTransaction` | Extended to SEND/RECEIVE with `counterparty` field; wired into Send/Withdraw success callbacks |
| "Deposit" opened "Bridge mUSDC" modal | Bridge was overloaded as deposit | New `VeloDepositModal` with main→burner one-click + copy-address option |
| Dashboard missing SEND button | Send was only in Settings modal | Added Send + Bridge buttons to Dashboard action row |
| Same pair+side+lev opened a new position instead of stacking | No merge logic in open path | If existing V2 position matches, route to `addMargin(tradeId)` instead of creating new tradeId |
| Share card wordmark clipped on left | 50px margin was too tight against rounded modal corner on mobile | Bumped to 60px |
| TP/SL required absolute prices (hard to compute) | No % shortcuts | Quick-pick buttons: TP +25/50/100/200/500%, SL -10/25/50/75/90% (PnL on collateral) |
| Partial close limited to 25/50/75/100 presets | Coarse | Added 10% and 20% to the row |
| Orders disappear on refresh | Silent `.catch(() => {})` swallowed insert errors | Changed to `console.warn` so errors surface in devtools |

### Issues still unresolved / diagnostic needed

- **If activity/history still disappear after refresh even after batch 8** — the most likely culprit is a Supabase project that missed `SUPABASE_MIGRATION_BUILD79.sql` or still has a stale PostgREST schema cache. Re-run `SUPABASE_MIGRATION_BUILD79.sql` and `SUPABASE_MIGRATION_TX_COUNTERPARTY.sql`. The frontend now treats `PGRST204` the same way as `42703`, so missing enriched columns should degrade to legacy inserts instead of dropping rows entirely.
- **BaseScan source verification** — must be done via the web UI (see top of doc). CLI fails because BaseScan deprecated Etherscan V1 API.
- **Admin tab not visible for main wallet** — Stan's main wallet is not the contract owner. Either connect with deployer key OR transfer ownership.

### Fixed in 2026-05-28 session (previously listed as unresolved)

- ✅ **Modal showing WELCOME on every refresh** — now skips straight to CHECKING if wallet already connected
- ✅ **MetaMask opening for ETH on username claim** — username claim now uses burner wallet client, no MetaMask involved
- ✅ **Blank page (viem circular dep crash)** — eliminated all dynamic `await import('viem')` calls; using static `createBurnerWalletClient` helper instead
- ✅ **Duplicate `supabase` import in App.tsx** — removed second instance, was causing ReferenceError in production
- ✅ **No way to add email after skipping it during onboarding** — Settings modal now has full email add/edit section with Supabase sync

---

## What's left before a funding proposal

### Critical (must-have for any pitch)

- [ ] **Verify VeloPerpsV2 source on BaseScan** via the web UI
- [ ] **Run all pending Supabase migrations** including `SUPABASE_MIGRATION_TX_COUNTERPARTY.sql`
- [ ] **Re-apply the RLS public-read SQL** for posts/likes/reposts/comments/profiles
- [ ] **Transfer V2 + mUSDC + Registry ownership** to Stan's main wallet so admin panel works without juggling keys
- [ ] **End-to-end smoke test on production:** create a fresh account → claim a handle → deposit via the new modal → open a trade → manage it (add margin / partial close / TP/SL) → close → share the card. All without dev tools open.
- [ ] **Mobile UX pass on iPhone Safari** — screenshots show iOS is the primary use case
- [ ] **Seed V2 pool to a respectable level** (currently 0 mUSDC). Use admin panel "→ V2 pool" shortcut.

### Quality-of-life (strongly desired)

- [ ] Admin panel **V2 awareness** — show pool reserves, version, active pairs
- [ ] **Liquidity dashboard** publicly visible — TVL, biggest trades, leaderboard
- [ ] **Onboarding tutorial** — 3-step coach mark explaining the dual-wallet model
- [ ] **Position health indicators** — color-coded liquidation distance
- [ ] **Funding rate display** (even faked, marked as "v2.5") — investors expect this

### Architecture (multi-week)

- [x] **Cross margin V3 contract** — deployed at `0x3780e858B76027E6D6cB0c74E863f712a0F0E27E`. Frontend fully wired.
- [x] **On-chain LIMIT/STOP conditional orders** — `placeConditionalOrder` / `cancelConditionalOrder` / `executeConditionalOrder` in V3. Keeper runs every minute.
- [ ] **Insurance fund + ADL** — required for any real-money launch
- [ ] **Insurance fund + ADL** — required for any real-money launch
- [ ] **Multisig ownership transfer** — single-key admin doesn't pass DD
- [ ] **Smart contract audit** — Code4rena, Sherlock, or boutique firm

### Polish for the deck

- [ ] Architecture diagram (burner ↔ MetaMask ↔ contracts ↔ keepers ↔ Pyth)
- [ ] 60-second demo video — sign up → claim handle → trade → share to Twitter
- [ ] Roadmap slide — v1 (now), v2 (deployed), v3 (cross margin), mainnet (audited)
- [ ] Pricing model — Velo earns 0.1% open + 0.1% close fees. Project on assumed volume.

---

## Useful cast commands

```bash
export RPC=https://base-sepolia-rpc.publicnode.com
export V3_1=0x41fDb544D7247a5ddc6B4C06F29D09f2b20de907
export V3=0x3780e858B76027E6D6cB0c74E863f712a0F0E27E
export V2=0x8D4b792137252D79FB3Ae953AA619fA57101665f
export V1=0x28fE36d4ae72ab0E05fa6edafE1D6e11E9DD6163
export MUSDC=0x5EFaF3F69b09bC2abF3439bDC0C93bf611026699
export REGISTRY=0x7e510d615a8afDfaa324F790F3E54e520756ECe2
export OWNER=0x8f8fF5A29760278C7B54D450dA57A13Cd3FD3A8b
export PYTH=0xA2aa501b19aff244D90cc15a4Cf739D2725B5729

# V2 pool balance
cast call $MUSDC "balanceOf(address)(uint256)" $V2 --rpc-url $RPC

# Confirm V2 is live + version
cast call $V2 "version()(uint16)" --rpc-url $RPC

# Pair feed ID (returns 32-byte hash or all zeros if unregistered)
cast call $V2 "pairFeedId(uint16)(bytes32)" 0 --rpc-url $RPC

# Owner check
cast call $V2 "owner()(address)" --rpc-url $RPC

# Username resolve (lowercase handle, no @)
cast call $REGISTRY "resolve(string)(address)" "stan" --rpc-url $RPC

# What handle does this address own?
cast call $REGISTRY "usernameOf(address)(string)" 0x... --rpc-url $RPC

# When can this address next change handle? (unix seconds, 0 = never claimed)
cast call $REGISTRY "nextChangeAllowed(address)(uint256)" $OWNER --rpc-url $RPC

# Public faucet mint (6-hour cooldown)
cast send $MUSDC "mint()" --rpc-url $RPC --private-key $PRIVATE_KEY

# Owner mintTo (no cooldown; admin funding)
cast send $MUSDC "mintTo(address,uint256)" 0xTRADER <amount_6dec> --rpc-url $RPC --private-key $PRIVATE_KEY

# Seed perps pool directly
cast send $MUSDC "transfer(address,uint256)" $V2 <amount_6dec> --rpc-url $RPC --private-key $PRIVATE_KEY

# Owner-only mint (no cooldown)
cast send $MUSDC "mintTo(address,uint256)" <to> <amount_6dec> \
  --rpc-url $RPC --private-key $PRIVATE_KEY

# Transfer mUSDC anywhere
cast send $MUSDC "transfer(address,uint256)" <to> <amount_6dec> \
  --rpc-url $RPC --private-key $PRIVATE_KEY

# Transfer ownership (irreversible!)
cast send $V2 "transferOwnership(address)" <newOwner> \
  --rpc-url $RPC --private-key $PRIVATE_KEY
```

---

## Deploy V2 (already done — for reference if you ever need to redeploy)

```bash
cd ~/Downloads/velo/contracts
source .env  # loads PRIVATE_KEY and BASE_SEPOLIA_RPC_URL

forge test --match-path "test/VeloPerpsV2.t.sol" -v
# Expect: 12 passed; 0 failed

forge script script/DeployVeloPerpsV2.s.sol \
  --rpc-url $BASE_SEPOLIA_RPC_URL \
  --broadcast \
  --verify \
  --private-key $PRIVATE_KEY

# Note the "VeloPerpsV2:" address printed at the end. Save it.
# Then seed the pool manually (the script no longer does it).
```

The verify step at the end will fail with the V1 API deprecation error — that's fine, do the web UI verification separately. The contract IS deployed.

---

## Known traps & gotchas

Things that have burned previous sessions:

1. **Pyth feed IDs are chain-independent.** All 17 are in `DeployVeloPerpsV2.s.sol`. Same hash everywhere.

2. **VeloMockUSDC inherits from LayerZero's OFT.** Running `forge test` requires LayerZero deps installed OR use `--match-path "test/VeloPerpsV2.t.sol"` to skip mUSDC compilation. Otherwise: "Source `lib/devtools/packages/oft-evm/contracts/OFT.sol` not found".

3. **Foundry script mode forbids `this.method()` calls.** Don't put `try this.seedPool() {} catch {}` in scripts — Foundry reverts the entire tx including contract creation. The previous V2 deploy failed because of this.

4. **The burner wallet keys are stored in localStorage.** If a user clears site data, their burner is lost. Funds in the burner are recoverable via the displayed mnemonic but tradeIds are not transferable.

5. **Supabase RLS is enforced on new tables by default.** If you add a table and forget the SELECT policy, no client can read it. Symptom: app works for the author but is empty for everyone else.

6. **The TP/SL keeper costs the sponsor wallet 0.001 ETH per Pyth update.** Budget accordingly.

7. **`forge install --no-commit` is no longer a valid flag** in newer Foundry. Use `forge install <repo>` without the flag.

8. **Vercel doesn't auto-redeploy on env var change alone.** You must manually trigger a redeploy from the Deployments tab.

9. **`source ../.env` vs `source .env`** — depends where the .env actually lives. Stan's lives at `~/Downloads/velo/contracts/.env`, so `cd contracts && source .env`.

10. **`forge verify-contract` CLI fails on BaseScan** because Etherscan V1 API is deprecated. Use the BaseScan web UI for source verification.

11. **Multi-line `forge` commands with backslashes can collapse in macOS Terminal.** Stray spaces between arguments cause "odd number of digits" errors in `cast abi-encode`. Easier to run as single-line.

12. **The user (Stan) prefers no bullet points in chat replies** (lists are fine in code/docs). Direct, technically precise communication. Apple-keynote design aesthetic — Instrument Serif display, JetBrains Mono code, Inter Tight body.

13. **The README explicitly should NOT compare Velo to dYdX or Hyperliquid** — those are scale references for internal discussion only, not marketing positioning.

14. **Username claims signed by main wallet, NOT burner** (the persistent identity is on MetaMask, not the disposable trading wallet). Old code did this wrong; fixed in batch 3.

15. **The PROJECT_STATUS.md (this file) is THE source of truth.** Any AI agent picking up work should read this first. **EVERY AI AGENT MUST UPDATE THIS FILE when making changes — see the "MANDATORY RULE" and "Change log" sections at the bottom.**

---

## Hand-off checklist for a new AI session

When opening a fresh conversation, paste in:
1. This `PROJECT_STATUS.md` (full file)
2. The latest repo zip
3. A short message: "Here's the Velo project. Read PROJECT_STATUS.md first. [Then describe what you want next.]"

If using NotebookLM:
1. Upload this file as a source
2. Optionally upload `README.md` and `MIGRATION_STATUS.md` for cross-reference
3. Ask: "Summarize the current state of the Velo project and the top 3 things blocking a funding proposal."

---

## Communication style preferences (Stan)

- No bullet points in conversational chat replies (use prose). Lists are fine in code and docs.
- Direct and technically precise. Push back when something is wrong instead of agreeing reflexively.
- Apple/Hyperliquid/Aevo design aesthetic. OKLCH color tokens, glass morphism, Instrument Serif display font, JetBrains Mono code font.
- Iterative deploy-and-report workflow: Stan deploys to Vercel, observes real errors, reports back. Fixes should come as complete updated zips, not partial patches.
- GitHub web editor exclusively until recently — Stan now clones locally but still prefers zips of complete files over targeted patches.
- Build verification discipline expected: run `npx tsc --noEmit` and `npx vite build` before packaging any deliverable.
- Each decision evaluated against shippability for one developer + grant narrative coherence.

---

## Contact / handoff details

- **GitHub:** stanisnear/velo-trading-terminal
- **Vercel project:** linked to that repo, auto-deploys on push to main
- **Supabase project:** `btgfoekgvyvdflzjfehz.supabase.co`
- **Owner private key:** in Stan's local `.env` at `~/Downloads/velo/contracts/.env` (NOT committed)
- **Sponsor private key:** Vercel env var `VELO_SPONSOR_PRIVATE_KEY`
- **Etherscan/BaseScan API key:** Stan's personal key. Used for foundry verification and may need rotation.

If you (the next AI agent) are reading this, the most efficient way to continue Stan's work is to:
1. Ask which feature/bug they want to tackle
2. Read the relevant section in this file
3. Use the file map to locate the right files
4. Make minimal, surgical changes
5. Verify build cleanly (`npx vite build`)
6. Ship as a complete repo zip via `present_files`
7. Update this `PROJECT_STATUS.md` if anything material changed

Treat this file as the contract. If your changes don't match what's documented here, update the doc in the same commit.

---

## ⚠️ MANDATORY RULE FOR ALL AI AGENTS ⚠️

**Every AI agent that makes any change to this project MUST update this file in the same deliverable.** No exceptions. If you change a file, add a section below under "Change log" with:
- Timestamp (use the date you know or "unknown date" if not available)
- What changed and why
- Which files were modified
- Any new gotchas discovered

If you do NOT update this file, the next agent will have stale context and will undo your work or repeat your mistakes. Treat this file as a living contract, not a static document.

---

## Change log


### 2026-05-28 — Onboarding modal rewrite, sponsor ETH fixes, blank-page crash fix, email-in-settings

#### What changed and why

**TL;DR for new AI agents:** This session fixed three production bugs (modal resetting on refresh, MetaMask popping up for ETH on username claims, blank-page JS crash) and one feature gap (email skipped during onboarding can now be added in Settings). Read the "What changed" bullets below before touching any of the files in scope.

---

**Bug 1 — Modal showed WELCOME splash on every page refresh, even with wallet already connected**

Root cause: the `isOpen` `useEffect` in `VeloOnboardingModal.tsx` always reset `step` to `'WELCOME'` unconditionally. For returning users whose wallet was already connected when the modal opened, this meant they sat through the animated splash before the session check ran.

Fix: the `isOpen` effect now reads `isConnected && address` at open-time. If the wallet is already connected it initialises `step` to `'CHECKING'` instead of `'WELCOME'`, and skips `splashPhase` animations. The wallet-check `useEffect` was also gated on `step === 'CONNECT'` only — it now also fires on `step === 'CHECKING'` so the returning-user session lookup runs immediately without any user interaction.

Files: `src/components/VeloOnboardingModal.tsx`

---

**Bug 2 — MetaMask opened and asked for ETH during username claim**

Root cause: `handleCreate` in `VeloOnboardingModal.tsx` called `claimUsername(walletClient, uname)` where `walletClient` is the MetaMask wagmi client. The VeloRegistry `setUsername` is a non-payable contract write — it requires gas from the caller's wallet. MetaMask then popped up asking the user to confirm a transaction and pay gas. Since most users have zero ETH in their main wallet (they only have testnet mUSDC on the burner), this always failed with "Insufficient funds".

Fix: `claimUsername` is now called with a burner wallet client built from the derived private key, not the MetaMask client. The burner already has ETH from the sponsor. Also fixed `ensureBurnerGas` which was checking `address` (the main MetaMask wallet!) instead of `result.burner.veloAddress` — so even when gas top-up logic ran, it was checking the wrong wallet's balance.

Implementation: added `createBurnerWalletClient(privateKey)` as a proper export in `veloBurnerSetup.ts`. This is a static function (no dynamic imports) that uses the already-imported viem `createWalletClient` + `http` + `baseSepolia`. The modal imports it statically.

Files: `src/components/VeloOnboardingModal.tsx`, `src/services/veloBurnerSetup.ts`

---

**Bug 3 — Blank page on Vercel (JS crash: "Cannot access 'ZC' before initialization")**

Root cause: our first fix attempt for Bug 2 used `await import('viem')`, `await import('viem/accounts')`, `await import('viem/chains')` inside the `handleCreate` async function. Vite bundles viem as a single static chunk (because the rest of the app imports it statically at module load). When a dynamic `import('viem')` executes inside the same bundle, Vite creates an internal circular reference — the dynamic import tries to evaluate a module that is mid-initialization, hitting an uninitialized export (`ZC`). This crashes the entire bundle before React mounts, producing a completely blank page with a purple gradient background.

Fix: replaced the three `await import(...)` calls with a single static import of `createBurnerWalletClient` from `veloBurnerSetup.ts` (which has its own static viem imports and no circular dependency). Zero dynamic imports remain in the onboarding modal.

Rule going forward: **never use `await import('viem')` or any dynamic import of a package that is already statically imported elsewhere in the bundle.** If you need a function from viem in a new place, add a static import at the top of the file or expose a helper from a service file that already imports it.

Files: `src/components/VeloOnboardingModal.tsx`, `src/services/veloBurnerSetup.ts`

---

**Bug 4 — Duplicate `supabase` identifier in App.tsx caused a runtime crash on some bundler configurations**

Root cause: `supabase` was imported twice in the same destructure block from `./services/supabaseStore` — once near the top of the import list and again near the bottom. TypeScript's `tsc --noEmit` flags this as `TS2300: Duplicate identifier`. The Vite bundler was previously tolerant of this but a build config change (the chunk-splitting manualChunks added in batch 8) caused the duplicate to manifest as a runtime ReferenceError in production.

Fix: removed the second `supabase,` entry from the supabaseStore import destructure.

Files: `src/App.tsx`

---

**Feature — Email skipped during onboarding can now be added in Settings**

The onboarding modal has an optional email step (Step 2 of 3) with a "Skip for now" path. Previously, skipping was permanent — there was no way to add an email later. The Settings modal had no email section at all.

Fix: `SettingsModal` now accepts a `profile` prop (`{ id, email, username }`) and an `onEmailSaved` callback. When `profile` is passed:
- If `email` is empty: shows "Not set" badge and a prompt explaining the user skipped during signup
- If `email` is set: shows "Saved" badge and the current value pre-filled
- Input validates format, checks Supabase for uniqueness, writes to `profiles.email`, calls `onEmailSaved(email)` so App.tsx's local `user` state updates immediately (no page reload needed)

Wiring in App.tsx:
- `UserProfile` type now has `email?: string`
- `dbProfileToUserProfile` maps `row.email` to the profile
- `<SettingsModal>` receives `profile={user ? { id: user.id, email: user.email, username: user.username } : null}` and `onEmailSaved={(email) => setUser(prev => prev ? { ...prev, email } : null)}`

Files: `src/components/SettingsModal.tsx`, `src/App.tsx`, `src/services/supabaseStore.ts`, `src/utils/types.ts`

---

**Sponsor ETH improvements**

- Amount raised from **0.005 → 0.01 ETH** per top-up (enough for faucet mint + username claim + ~40 more trades at Base Sepolia gas prices)
- Top-up threshold raised from **0.002 → 0.003 ETH** (the old threshold was too low — the burner could pass the threshold check but then run out mid-flow)
- Rate limiting switched from **per-IP** to **per-burner-address** — multiple users behind the same NAT (office, shared WiFi) were blocking each other with the IP limit. Now each burner can request a top-up independently; the 5-minute window is per-address
- `MIN_BURNER_ETH_REQUIRED` in `veloBurnerSetup.ts` and `MIN_BURNER_GAS_WEI` in `veloGasSponsor.ts` updated to match

Files: `api/sponsor-eth.ts`, `src/services/veloBurnerSetup.ts`, `src/services/veloGasSponsor.ts`

---

#### Files changed in this session

| File | Change |
|------|--------|
| `src/components/VeloOnboardingModal.tsx` | Modal-open logic skips splash if wallet connected; check effect fires on CHECKING step; username claim uses burner wallet; no dynamic imports |
| `src/services/veloBurnerSetup.ts` | `createBurnerWalletClient(privateKey)` exported; ETH thresholds updated to 0.003/0.01 |
| `src/components/SettingsModal.tsx` | `profile` + `onEmailSaved` props; full email section with uniqueness check, save, badge |
| `src/App.tsx` | Duplicate `supabase` import removed; SettingsModal wired with `profile` + `onEmailSaved` |
| `src/services/supabaseStore.ts` | `dbProfileToUserProfile` maps `row.email` |
| `src/utils/types.ts` | `UserProfile.email?: string` added |
| `api/sponsor-eth.ts` | 0.01 ETH, 0.003 threshold, rate-limit by address not IP |
| `src/services/veloGasSponsor.ts` | `MIN_BURNER_GAS_WEI` = 0.003 ETH, `SPONSOR_TOP_UP_WEI` = 0.01 ETH |

---

#### New gotchas

1. **Never dynamically import viem inside the app bundle.** `await import('viem')` crashes the bundle because viem is already statically imported. Always add a static import at the top of the file, or expose a helper from a service that already has the static import. This applies to `viem/accounts`, `viem/chains`, and any other viem sub-paths.

2. **The burner wallet, not MetaMask, should sign ALL on-chain transactions after onboarding.** The only legitimate MetaMask interactions in the entire post-signup flow are: (a) the initial derivation signature (gas-free), and (b) sending funds to/from the main wallet. Everything else — username claim, trades, deposits to the perp contract, cross-margin deposits — should use `createBurnerWalletClient`. If you add a new on-chain action and it opens a MetaMask popup, that's a bug.

3. **`ensureBurnerGas` takes the BURNER address, not the main wallet address.** The old code passed `address` (main wallet) by mistake. Always pass `burner.veloAddress` or the explicit burner address constant.

4. **Email in Supabase is in `profiles.email`, not `auth.users.email`.** The auth user's email is `address@wallet.velo` (a pseudo-email for the wallet-based auth scheme). The real contact email lives in `profiles.email`. Don't confuse the two. `dbProfileToUserProfile` maps `row.email` for the profiles table, not the auth table.

5. **Supabase `profiles.email` has a uniqueness check in the frontend but NOT a DB-level UNIQUE constraint.** If two users somehow submit the same email simultaneously the uniqueness check could race. For testnet this is acceptable. Mainnet should add `UNIQUE` constraint to `profiles.email`.

### 2026-05-28 — V3.1 deployment: oracle corrupt entry price fix

**Root cause fixed:** The V3 contract used `PYTH.updatePriceFeeds(updateData)` then `PYTH.getPriceNoOlderThan(feedId, 60)` to read the oracle price when opening positions. On Base Sepolia testnet, `updatePriceFeeds` silently no-ops if the incoming VAA's `publishTime` is not strictly newer than what is already cached on-chain. When that happens the contract falls through to read the stale/cold cache, which can hold a near-zero sentinel value — producing `entryPrice_E18 ≈ 10000` (`$0.000001`). No frontend fix is possible for this; it required a contract change.

**V3.1 fix:** Replaced `_pushPythUpdate() + _readPrice()` with `_extractPrice()` which calls `PYTH.parsePriceFeedUpdates()`. This function reads the price directly from the VAA blob passed in the transaction — it completely bypasses the on-chain cache. The price stored as `entryPrice_E18` is now always the price in the data you submitted, regardless of cache staleness.

**Files changed:**
- `contracts/src/VeloPerpsV3_1.sol` — new contract, identical to V3 except `_extractPrice` replaces `_pushPythUpdate + _readPrice` throughout all trading paths. The `quoteUnrealisedPnL` view function still uses `getPriceNoOlderThan` (read-only, no trade execution risk).
- `contracts/src/interfaces/IPythV2.sol` — adds `parsePriceFeedUpdates` to the Pyth interface.
- `contracts/src/libraries/PerpsMath.sol` — unchanged functionally; em-dash comments fixed for Solidity ASCII compliance.
- `contracts/script/DeployVeloPerpsV3_1.s.sol` — deploy + register all 17 pairs in one script.
- `contracts/deployments/base_sepolia.json` — updated with V3.1 address.
- `PROJECT_STATUS.md` — this entry.

**Deployed contract:** `0x41fDb544D7247a5ddc6B4C06F29D09f2b20de907` on Base Sepolia (chain 84532).

**Action items:**
1. Update Vercel: `VITE_VELO_PERPS_V3_ADDRESS=0x41fDb544D7247a5ddc6B4C06F29D09f2b20de907` → trigger redeploy.
2. Transfer mUSDC pool from V3 to V3.1 (see cast commands below).
3. Verify V3.1 on BaseScan via Standard JSON Input (same process as V3).

**Transfer pool from V3 → V3.1 (owner wallet required):**
```bash
export RPC=https://base-sepolia-rpc.publicnode.com
export V3=0x3780e858B76027E6D6cB0c74E863f712a0F0E27E
export V3_1=0x41fDb544D7247a5ddc6B4C06F29D09f2b20de907
export MUSDC=0x5EFaF3F69b09bC2abF3439bDC0C93bf611026699
export OWNER=0x8f8fF5A29760278C7B54D450dA57A13Cd3FD3A8b

# Check current V3 pool balance
cast call $MUSDC "balanceOf(address)(uint256)" $V3 --rpc-url $RPC

# Withdraw protocol fees from V3 to owner first (clears feeBalance)
cast send $V3 "withdrawFees()" --rpc-url $RPC --private-key $PRIVATE_KEY

# Check pool balance again (net of fees)
cast call $MUSDC "balanceOf(address)(uint256)" $V3 --rpc-url $RPC

# Transfer the remaining pool to V3.1
# Replace <AMOUNT> with the balance from above
cast send $MUSDC "transfer(address,uint256)" $V3_1 <AMOUNT> --rpc-url $RPC --private-key $PRIVATE_KEY

# Verify V3.1 pool received it
cast call $MUSDC "balanceOf(address)(uint256)" $V3_1 --rpc-url $RPC
```

**New gotchas:**
- `parsePriceFeedUpdates` requires a fee (same as `updatePriceFeeds`) — the fee path in the service is unchanged and already sends the correct fee.
- V3 and V3.1 have identical ABIs from the frontend's perspective. Switching the env var is the only required change.
- Any positions still open on V3 must be closed against V3's address directly. The frontend should keep V3 readable for position history even after switching to V3.1 as the active contract.

### 2026-05-27 — V3 full wiring: cross margin, conditional orders, TP/SL keepers, cross account modal

This pass completes the V3 contract integration end-to-end. The contract was already deployed at `0x3780e858B76027E6D6cB0c74E863f712a0F0E27E` but the frontend and keepers were pointing at V1/V2 data structures (wrong Position ABI in keepers, no cross margin functions, no conditional order routing). Everything below is now fully wired.

**Root causes fixed (from the Codex session that didn't finish):**

1. **Keepers scanned 0 positions silently.** `cron-tp-sl.ts` and `cron-liquidate.ts` had a V3 `POSITION_V3_ABI` with two fabricated fields (`notionalUSDC_6`, `fundingEntry_E18`) that don't exist in the contract. Every `getPosition` decode failed; the loop skipped all positions. Fixed to the real 11-field V3 struct: `owner`, `pairIndex`, `isLong`, `leverage`, `marginMode`, `collateralUSDC_6`, `entryPrice_E18`, `openedAt`, `takeProfit_E18`, `stopLoss_E18`, `originalNotional_6`.

2. **`marginMode` was hardcoded `ISOLATED` in App.tsx sync.** The on-chain → local position mirror always set `marginMode: 'ISOLATED'` regardless of the contract's actual value. CROSS positions displayed as isolated. Fixed to decode the real `marginMode` uint8 (0=ISOLATED, 1=CROSS) from the V3 struct.

3. **`openPosition` didn't pass `marginMode` to the contract.** App.tsx was calling `veloPerpsTrading.openPosition(...)` without the `marginMode` argument, so every position went on-chain as isolated regardless of the user's UI choice. Fixed.

4. **No cross margin UI.** There was no modal for depositing/withdrawing mUSDC to/from the V3 cross ledger, and no balance display in TradeView. Added `VeloCrossAccountModal.tsx` (full deposit/withdraw with free/locked/total breakdown) and wired it to the CROSS margin toggle in TradeView (shows live free balance + "Deposit →"/"Manage" button inline).

5. **LIMIT/STOP orders were stored locally only.** When a wallet user placed a LIMIT or STOP order it was saved to Supabase `open_orders` but never called `placeConditionalOrder` on V3. Fixed to route to the contract for on-chain users. Cancel and on-chain order sync (to `openOrders` array) also wired.

6. **`veloPerpsService.ts` had no V3 functions.** The service had no cross balance reads, no `depositCross`/`withdrawCross`, no `placeConditionalOrder`/`cancelConditionalOrder`, and `getPosition` used the V1/V2 struct. Full V3 ABI + all V3 function implementations added.

**Files changed:**

- `src/services/veloPerpsService.ts` — complete V3 rewrite: full ABI with correct 11-field Position struct, all V3 functions (depositCross, withdrawCross, placeConditionalOrder, cancelConditionalOrder, fetchTraderConditionalOrders, fetchCrossBalance), auto-routing to V3 via `VITE_VELO_PERPS_V3_ADDRESS`.
- `src/services/useVeloPerpsTrading.ts` — V3-aware hook: exposes depositCross, withdrawCross, placeConditionalOrder, cancelConditionalOrder, crossFreeBalance, crossTotalBalance, crossLockedBalance, conditionalOrders.
- `src/App.tsx` — margin mode mirrored from contract; marginMode passed to openPosition; LIMIT/STOP routes to placeConditionalOrder; cancel routes to cancelConditionalOrder; on-chain conditional orders synced to openOrders; cross balance pre-flight; VeloCrossAccountModal imported and mounted; isCrossAccountOpen + crossAccountTab state; TradeView gets onOpenCrossAccount + crossFreeBalance + crossTotalBalance props.
- `src/components/ui/pages/TradeView.tsx` — CROSS mode shows inline free-balance chip + Deposit/Manage button; props onOpenCrossAccount, crossFreeBalance, crossTotalBalance added.
- `src/components/VeloCrossAccountModal.tsx` — new modal: deposit/withdraw mUSDC to/from V3 cross ledger, free/locked/total breakdown, tab switcher, MAX button, error + success states.
- `api/cron-tp-sl.ts` — correct V3 11-field Position struct, V2 fallback ABI, version detection via `VERSION` constant, correct fired/checked reporting.
- `api/cron-liquidate.ts` — same correction, uses quoteUnrealisedPnL for threshold check, version-aware struct selection.
- `api/cron-conditional-orders.ts` — full V3 conditional order keeper: scans 1..nextOrderId, executes triggered orders, silently skips OrderNotTriggered reverts.
- `README.md` — V3 feature coverage updated to "Fully Implemented"; env vars table adds `VITE_VELO_PERPS_V3_ADDRESS`.
- `PROJECT_STATUS.md` — this entry.

**New env var required:**

Add to Vercel: `VITE_VELO_PERPS_V3_ADDRESS=0x3780e858B76027E6D6cB0c74E863f712a0F0E27E`

The service layer automatically routes to V3 when this env is a valid 42-char address. Without it, falls back to V2 (or V1 if V2 is also unset).

**Pool seeding (required before trades work):**

The V3 contract needs mUSDC in its pool for isolated payouts. From the owner wallet:

```bash
export V3=0x3780e858B76027E6D6cB0c74E863f712a0F0E27E
export MUSDC=0x5EFaF3F69b09bC2abF3439bDC0C93bf611026699
export RPC=https://base-sepolia-rpc.publicnode.com

# Seed 100,000 mUSDC to V3 pool
cast send $MUSDC "transfer(address,uint256)" $V3 100000000000 \
  --rpc-url $RPC --private-key $PRIVATE_KEY
```

For cross margin, traders deposit themselves via the modal (no pool seeding needed — the contract holds collateral in its own `crossBalanceUSDC_6` mapping).

**V3 end-to-end cutover checklist:**

1. Set `VITE_VELO_PERPS_V3_ADDRESS` in Vercel → trigger redeploy.
2. Seed V3 pool (see cast command above).
3. Open a market isolated long: appears on-chain + UI with ISOLATED badge.
4. Set TP/SL in manage modal: verify `takeProfit_E18` / `stopLoss_E18` update on-chain (cast call).
5. Wait for keeper to fire `closeIfTriggered`: position closes, history row has real tx hash.
6. Open a CROSS trade: modal opens, deposit some mUSDC to cross, position appears with CROSS badge.
7. Place a LIMIT order: check `conditionalOrders(orderId)` on-chain via cast. Order appears in Open Orders tab.
8. Let keeper execute it: position opens at limit price.
9. Check keeper logs in Vercel → Functions → cron-tp-sl: `checked` should be > 0.

**New gotchas:**

- The V3 Position struct has 11 fields. Any service code that reads positions must use the full V3 ABI — viem decodes by position, so any mismatch silently drops or misaligns fields. The `POSITION_V3_ABI` in all three cron files and `fetchOpenPositions` in the service are now correct. Don't add or reorder fields.
- `crossBalanceUSDC_6` is the TOTAL cross balance (free + locked). Locked = sum of `collateralUSDC_6` across all CROSS positions. Free = total − locked. The hook computes this correctly — don't use the raw contract value for "available to trade."
- `placeConditionalOrder` requires mUSDC approval from the trading wallet first (ERC-20 `approve(V3, amount)` before `placeConditionalOrder`). The service handles this; don't bypass it.
- `depositCross` requires mUSDC approval too. The service calls `approve` then `depositCross` in sequence. If the approval tx fails (e.g. insufficient gas), the deposit fails but nothing is wrong on-chain — just retry.
- The `VITE_VELO_PERPS_V3_ADDRESS` env var is the single routing switch. When set and 42 chars: all trades go to V3. When unset: V2 or V1 fallback. The admin panel's "pool seed" shortcut targets `VELO_PERPS_ADDRESS` (the active address) — after you add V3 to env, that shortcut will seed V3.

### 2026-05-27 — Build 80: TP/SL closes on-chain, wall-delete, leaderboard, market gating, admin verification

This is a five-issue bug-fix + features pass driven by user-reported breakage on production. Each issue had a single root cause that was independently broken; combined they hit the heart of the trade UX (TP/SL not actually closing), the social moderation flow (wall owners couldn't delete posts on their wall), the leaderboard (empty for all users but the logged-in one), the markets list (Trade button for pairs that weren't on the contract), and the verification badge (handed out to every signup automatically).

**Problems fixed:**

1. **TP/SL hit fired a notification but never actually closed the position; the order disappeared and nothing landed in history.** Two-layer root cause. (a) `Position.onChainTradeId` was being **read** at three call sites (`handleEditPosition` routing logic, the V2 manage modal, and the open-or-add merge path), but never **written** during the on-chain → local sync at `App.tsx`. Result: every V2 on-chain position had `p.onChain && p.onChainTradeId === undefined`, so `handleEditPosition` routed to the legacy `EditPositionModal` instead of `VeloManagePositionModal`. The legacy modal writes TP/SL into a local Supabase `open_orders` row, NOT to the contract's `setTriggers()`. (b) A client-side "TP/SL simulation" effect in `App.tsx` then watched the local order, fired a CLOSE when the mark crossed the trigger, removed the position from React state, wrote a phantom CLOSE row to Supabase — but never called the on-chain `closePosition` / `closeIfTriggered`. Five seconds later the on-chain poll re-inserted the still-open position, and the orphaned history row never linked back to it.

   Fix: `VeloPosition` now also carries `takeProfit` and `stopLoss`, decoded from the V2 `getPosition` struct (which has 10 fields, not 7 — the ABI was previously declared with the V1 shape). Added a V1-shape fallback decode so reads still work against V1 if anyone ever flips the address back. The on-chain → local sync at `App.tsx` now populates `Position.onChainTradeId` (so the manage modal routes correctly) AND mirrors `position.takeProfit` / `position.stopLoss` from the contract (so the manage modal pre-fills the user's currently-set triggers). The TP/SL simulation effect now filters out any order whose `relatedPositionId` starts with `velo_`, and has a defensive `if (!pos.onChain)` guard at the closure site so even if a stale local order slips through the simulation can't close an on-chain position. The liquidation-monitoring effect got the same `pos.onChain` skip. `handleUpdatePosition` early-returns if called with a `velo_` id and reroutes to `setManagingPosition` instead — belt-and-suspenders against the legacy code path. Finally, the on-chain position sync now also **prunes stale local orders** whose `relatedPositionId` starts with `velo_`, cleaning up any leftover phantom orders from pre-fix data.

   End-to-end effect on Stan's reported scenario: setting TP on a V2 position now writes `takeProfit_E18` to the contract via `setTriggers()`. The off-chain keeper (`api/cron-tp-sl.ts`) picks it up on its 5-minute cycle and calls `closeIfTriggered()` when the mark crosses. The local sim no longer fires false-positive notifications, no longer removes positions, and no longer writes phantom CLOSE rows. The keeper close emits a real on-chain CLOSE that flows back into the next 5-second poll and updates the UI naturally.

2. **Wall-post delete didn't work for wall owners.** The Supabase RLS policy on `public.posts` for DELETE was `USING (auth.uid() = author_id)` — author-only. The UI correctly offered the delete button to wall owners (via `canDelete = user.id === post.authorId || user.id === post.targetProfileId`), but the DELETE silently failed on the server. The optimistic local removal made it look like it worked until refresh re-loaded the row.

   Fix: policy is now `USING (auth.uid() = author_id OR auth.uid() = target_profile_id)`. Authors retain full control of their posts everywhere; wall owners get moderation rights on their own profile. The `target_profile_id` ALTER was also hoisted to run BEFORE the posts RLS policy block in `SUPABASE_SCHEMA.sql` — the previous order would have failed on a fresh database because the policy referenced a column that didn't exist yet (the ALTER was at the bottom of the file). Both the schema file and the new `SUPABASE_MIGRATION_BUILD80.sql` are idempotent — safe to re-run.

3. **Leaderboard only showed the current user's own account.** Build 79's filter required `t.walletAddress` on every trader row to be eligible. In practice almost no account had `wallet_address` persisted to their profile (wallet identity is held in the auth session, not always mirrored to the profile row), so the entire leaderboard collapsed to one entry: whoever was logged in.

   Fix: relaxed the leaderboard filter in `LeaderboardView`. The current user always appears. Every other trader appears if they show ANY sign of activity — non-zero `pnl`, at least one follower, or an admin-set `verifiedReason` badge. Placeholder accounts (default username "Trader" or missing username) are still excluded. The wallet check is dropped entirely as a hard filter; activity is the new signal, which is what users actually want to see.

4. **Markets that aren't registered on-chain still showed a Trade button.** The visible `PAIRS` list (15 markets) is broader than `VELO_PAIRS` (17 markets on the contract), and 4 markets (`WIF`, `JUP`, `BONK`, `PEPE`) only exist in `PAIRS` — they had Trade buttons that, when clicked, opened the trade view where the contract pre-flight in `useVeloPerpsTrading.openPosition` would eventually reject with `PairNotRegistered`. Bad UX: looks broken instead of "not yet listed."

   Fix: added `VELO_PAIR_IDS: ReadonlySet<string>` and `isTradablePair(pairId)` helpers to `src/utils/types.ts`. In `MarketsView`, untradable pairs get a quiet dashed "Soon" chip with a tooltip ("Not yet listed on-chain. Trading opens once the protocol owner registers this market") instead of the Trade button. In `TradeView`, if the active pair isn't tradable the entire BUBBLE 2 (order entry form) is replaced with a "not yet listed" panel that surfaces 4 quick links to listed pairs. Charts and price data remain visible for non-tradable pairs — the goal is to communicate the state, not hide the market.

5. **Verification badges were given to every Supabase user automatically.** `isVerifiedUser(userId)` was just a regex check for UUID format. Every account that signed up via Supabase auth got a badge. Stan wants admin-controlled verification with discrete reasons (VELO Team, Founder, Investor, etc.) and a hover-tooltip that shows the reason.

   Fix: new `profiles.verified_reason` column with a CHECK constraint enumerating six reasons (`VELO_TEAM`, `FOUNDER`, `INVESTOR`, `CONTRIBUTOR`, `VERIFIED_TESTER`, `PARTNER`). The badge component now requires either an explicit `reason` prop OR `userId + traders` (it looks the reason up from the in-scope `traders` array). If no reason is set, the badge renders nothing. Tooltip shows the human-friendly label and `cursor: help` so it's obvious it's hoverable. Both copies of `VerifiedBadge` (the one in `App.tsx` and the one in `src/components/ui/shared.tsx`) were updated.

   Admin write path: a new `velo_admins` allowlist table + `admin_set_verification(target_user_id, new_reason)` SECURITY DEFINER RPC. The function re-checks `is_velo_admin()` server-side before bypassing RLS — the frontend can't escalate. The Admin Panel grew a new "Verifications" section above the Contract Metadata block: search by username/handle, dropdown picker per row with all six reasons plus "None" (to un-verify), busy spinner per row, error banner on failure. The panel surfaces a clear "not an admin" warning with the exact SQL to grant yourself access if you haven't seeded `velo_admins` yet.

   Important: the previous `isVerifiedUser(userId)` regex check at the profile-lookup call site (used as "is this id a real Supabase UUID I should try to fetch?") had nothing to do with the verification badge — that was misleading naming. Replaced inline with the same UUID regex but called `isSupabaseUserId` so the semantic is obvious. The old badge gating is fully removed; no implicit verification anywhere in the codebase.

**Files changed:**

- `src/services/veloPerpsService.ts` — `VeloPosition` carries `takeProfit/stopLoss`; `getPosition` ABI updated to V2's 10-field struct; `fetchOpenPositions` decodes the new fields and falls back to the V1 shape if decode throws.
- `src/utils/types.ts` — `Position.onChainTradeId` added; `Trader.verifiedReason`, `Trader.walletAddress`, `Trader.authMethod` added; new `VERIFICATION_REASONS`, `VERIFICATION_LABELS`, `VerificationReason` type; new `VELO_PAIR_IDS` set and `isTradablePair()` helper.
- `src/App.tsx` — on-chain → local sync populates `onChainTradeId` + `takeProfit/stopLoss`; pruning of stale `velo_` orders during sync; TP/SL simulation effect skips on-chain; liquidation effect skips on-chain; `handleUpdatePosition` early-returns + reroutes for `velo_` ids; trader sync mirrors `verified_reason`; leaderboard filter relaxed; both `VerifiedBadge` definitions replaced with admin-controlled implementation; profile lookup uses local `isSupabaseUserId` instead of the misnamed legacy check; all 3 badge call sites pass `traders` (or `reason={profile.verifiedReason}` directly).
- `src/components/ui/shared.tsx` — `VerifiedBadge` rewritten with the same admin-controlled API; old UUID regex `isVerifiedUser` replaced with a no-op-without-traders version.
- `src/components/ui/pages/MarketsView.tsx` — imports `isTradablePair`; Trade button replaced with a "Soon" chip for untradable pairs.
- `src/components/ui/pages/TradeView.tsx` — imports `isTradablePair`; BUBBLE 2 (order entry) wrapped in a ternary that renders a "not yet listed" panel for untradable pairs, with 4 quick-link buttons to listed pairs.
- `src/services/supabaseStore.ts` — `fetchAllProfiles` selects `verified_reason` with two-tier fallback; new `isCurrentUserAdmin()` and `setUserVerification()` helpers that call the admin RPCs.
- `src/components/VeloAdminPanel.tsx` — new Verifications section with user list, search, per-row dropdown, busy state, error display, and clear "not in velo_admins" guidance for first-time setup.
- `SUPABASE_SCHEMA.sql` — `posts` DELETE policy now allows wall owners; `target_profile_id` ALTER moved before the posts RLS block; `profiles.verified_reason` column added with CHECK constraint and index; `velo_admins` allowlist table; `is_velo_admin()` and `admin_set_verification()` SECURITY DEFINER functions; `NOTIFY pgrst, 'reload schema'` at end.
- `SUPABASE_MIGRATION_BUILD80.sql` (NEW) — idempotent migration that applies all of #2 and #5 to an existing database. Run once in Supabase SQL editor.
- `PROJECT_STATUS.md` — this entry.

**New gotchas:**

- The contract's V2 Position struct returns 10 fields, not 7. The previous service ABI declared 7. Decoding only worked because viem was tolerant — but TP/SL were silently dropped. If you ever update the V2 contract's struct shape, update **both** `VELO_PERPS_ABI.getPosition` (in `veloPerpsService.ts`) AND the V2 path in `fetchOpenPositions`. The V1-shape fallback inside `fetchOpenPositions` is the safety net.
- `onChainTradeId` was read in three places but never written before this build. Any new `Position` source (e.g., a future cross-chain wrapper, a copy-trade mirror, an analytics feed) MUST populate `onChainTradeId` if the position is `onChain: true`, otherwise the manage modal will silently fall back to the legacy edit path and TP/SL will be local-only again. The simulation effect filters those out anyway, but the user will lose the on-chain manage actions.
- The TP/SL simulation effect (`App.tsx` near line 5400) and the liquidation effect (near 5320) are now demo-only. If anyone ever revives demo/legacy positions alongside V2, those effects still work; if a future build deletes demo mode entirely, both effects can be removed wholesale.
- `velo_admins` is **not auto-seeded**. After running `SUPABASE_MIGRATION_BUILD80.sql`, you must manually insert your own Supabase user id: `INSERT INTO velo_admins(user_id, note) VALUES (auth.uid(), 'self');` (run while logged in as yourself in the SQL editor so `auth.uid()` resolves). The admin panel surfaces this exact command in the "not an admin" warning box.
- The `verified_reason` CHECK constraint enumerates the six reasons. Adding a new one requires a migration: `ALTER TABLE profiles DROP CONSTRAINT profiles_verified_reason_check; ALTER TABLE profiles ADD CONSTRAINT profiles_verified_reason_check CHECK (verified_reason IS NULL OR verified_reason IN ('VELO_TEAM', ..., 'NEW_REASON'));`. Also add the constant to `VERIFICATION_REASONS` and `VERIFICATION_LABELS` in `src/utils/types.ts`, and update the CHECK in `admin_set_verification()` RPC body so the server-side validation matches.
- The leaderboard now shows every trader with activity — the "demo account" filter from build 79 is gone. If demo accounts ever come back, gate them on the `walletAddress` field again, but the new default (activity-based) is correct for a testnet where most users haven't propagated their wallet to the profile row yet.
- `isTradablePair()` consults a frozen `VELO_PAIR_IDS` set. If you register a new pair on-chain via the admin panel, you ALSO need to add it to `VELO_PAIRS` in `src/utils/types.ts` (or, better long-term, switch this from a static set to a `pairTradable(pairIndex)` contract read). The current static approach is fast and correct for the 17 pairs that exist today.

**Verification:**
- `npx vite build` passes in 45s.
- `npx tsc --noEmit` error count is **76** (down from 78 baseline — two stale errors cleared by the leaderboard filter cleanup and the `isVerifiedUser` rename). No new TS errors introduced.
- Pre-existing 76 errors are all viem strict-typing complaints about wagmi clients missing `chain: undefined` / `authorizationList: any` — same as previous batches, not blockers for `vite build`.

**Manual test plan for Stan after deploy:**

For Issue 1 (TP/SL on-chain):
1. Open a fresh long position (e.g., 10x SOL/USD with $20 collateral).
2. Click Manage → TP/SL tab. Confirm the modal opens (not the legacy EditPositionModal — they look different; the manage modal has Add / Reduce / Partial / TP/SL tabs).
3. Set a TP slightly above the current mark and submit. Wait for the on-chain tx confirmation.
4. Refresh the page. Confirm the position still shows the TP price (this means it survived the round trip from the contract).
5. Wait for the TP price to be crossed (or set it to a price that's already crossed). Within ~5 minutes the keeper should fire `closeIfTriggered` and the position should be closed on-chain. The activity feed will show a real CLOSE row with the actual exit price and a Basescan-linkable tx hash.
6. Confirm no phantom toast fires the moment the local mark crosses the TP — the only notification should come AFTER the keeper actually closes the position.

For Issue 2 (wall-delete RLS):
7. Run `SUPABASE_MIGRATION_BUILD80.sql` in the Supabase SQL editor.
8. On another account, post on your wall.
9. Switch to your account, navigate to your own profile. Confirm the X (delete) button is visible on the post.
10. Click it. Confirm the post is gone immediately. Hard-refresh. Confirm it stays gone (this means RLS allowed the DELETE).

For Issue 3 (leaderboard):
11. Open the Leaderboard tab. Confirm you see all accounts with any activity — not just yours.
12. If you only see yourself, check that other accounts in your DB have either non-zero `pnl_total` OR at least one follower OR a `verified_reason`. If they have none of those, they're correctly filtered out as inactive.

For Issue 4 (market gating):
13. Open the Markets view. The four non-Velo pairs (WIF, JUP, BONK, PEPE) should show a "Soon" chip instead of a Trade button.
14. Click one of them — the row navigates to the token page as usual (the row click handler still fires).
15. Now navigate to TradeView with one of those pairs as activePair (via URL or pair switcher). Confirm BUBBLE 2 shows the "not yet listed" panel with four quick-link buttons to listed pairs, not the order form.
16. Confirm listed pairs (BTC, ETH, SOL, etc.) still show the order entry form normally.

For Issue 5 (admin verification):
17. Run `SUPABASE_MIGRATION_BUILD80.sql` if not already done.
18. Seed yourself as admin: in Supabase SQL editor while logged in, run `INSERT INTO velo_admins(user_id, note) VALUES (auth.uid(), 'self');`. (Or copy your user id from `auth.users` and use that literal.)
19. In the Velo Admin Panel, scroll to the new "Verifications" section. You should see a user list with avatars and a dropdown per row. If you see the "not an admin" warning instead, the seed didn't work — verify the row exists in `velo_admins`.
20. Pick a user, select "VELO Team" from the dropdown. Confirm the busy spinner appears briefly. Refresh. Confirm the user has a verified badge on their profile and posts.
21. Hover the badge. Confirm the tooltip says "VELO Team".
22. Pick the same user again, select "— None —". Confirm the badge disappears.
23. As a non-admin account, confirm the Verifications section is hidden (you're not connected as the contract owner so the Admin tab itself isn't visible — that's the outer gate; the Supabase admin check is the inner gate for verify writes).

---

### 2026-05-26 — Batch 8: Supabase schema-cache compatibility for disappearing history/activity/orders

**Problem:** On Vercel, on-chain trades and activity rows appeared live, then vanished after refresh. Devtools showed `PGRST204` / "Could not find the 'on_chain' column of 'trade_history' in the schema cache", but the compatibility fallback in `supabaseStore.ts` only retried on raw Postgres `42703` (`undefined_column`). Result: optimistic UI rows existed in memory, the DB insert failed, and refresh reloaded an empty history/activity feed. There was a second schema drift too: `transactions.type` in `SUPABASE_SCHEMA.sql` still only allowed `DEPOSIT/WITHDRAW` even though the app records `SEND/RECEIVE`.

**What changed:**

1. **`PGRST204` now falls through to the same legacy retry path as `42703`.** Added `isMissingColumnError()` in `src/services/supabaseStore.ts` and wired it into every schema-compat write/read fallback:
   - `fetchAllProfiles()` now retries the legacy column set if `wallet_address` / `auth_method` are missing from the live schema cache.
   - `savePosition()` and `saveOpenOrder()` now retry without enriched columns on `PGRST204`, not just `42703`.
   - `insertTradeHistory()` now correctly degrades from full on-chain payload → enriched payload → legacy payload when PostgREST is stale, so CLOSE/OPEN rows still persist and survive refresh even if `on_chain` / `tx_hash` haven't propagated yet.
   - `recordTransaction()` now does the same for activity rows, so DEPOSIT/WITHDRAW rows survive stale schema caches instead of disappearing on refresh.

2. **`fetchTransactions()` now maps `counterparty` back into the app model.** Before this batch, SEND/RECEIVE detail labels only existed in live in-memory rows; after refresh the row lost its counterparty label because the mapper dropped the column. The dashboard would still show the row, but with generic "wallet" text.

3. **`Transaction` TS type now matches reality.** `src/utils/types.ts` now allows `SEND` / `RECEIVE`, `FAILED`, and `counterparty`. This brings the type surface back in sync with the dashboard renderer and Supabase row shape.

4. **Base schema + migration files now match the runtime code.**
   - `SUPABASE_SCHEMA.sql` now allows `transactions.type IN ('DEPOSIT','WITHDRAW','SEND','RECEIVE')` and includes the `counterparty` column in both the table definition and the idempotent ALTER block.
   - `SUPABASE_MIGRATION_TX_COUNTERPARTY.sql` now also widens the `transactions_type_check` constraint and sends `NOTIFY pgrst, 'reload schema';` so the REST API sees the new shape immediately.
   - `SUPABASE_MIGRATION_BUILD79.sql` now also ends with `NOTIFY pgrst, 'reload schema';` because the original bug was literally a stale schema cache on `trade_history.on_chain`.

5. **Profile burner-address persistence now ignores `PGRST204` as a non-fatal missing-column/cache case.** `src/App.tsx` already ignored `42703` for `velo_wallet_address`; batch 8 extends that to `PGRST204` so welcome-flow logging stays clean on partially-migrated projects.

**Files changed:**
- `src/services/supabaseStore.ts`
- `src/utils/types.ts`
- `src/App.tsx`
- `SUPABASE_SCHEMA.sql`
- `SUPABASE_MIGRATION_BUILD79.sql`
- `SUPABASE_MIGRATION_TX_COUNTERPARTY.sql`
- `PROJECT_STATUS.md`

**New gotchas:**
- `PGRST204` is not the same thing as Postgres `42703`, but for frontend fallback logic it should be treated the same way: "the column you tried to use is not currently available through the REST API". If you only check `42703`, Supabase inserts will still fail on a stale schema cache.
- `NOTIFY pgrst, 'reload schema';` is worth putting at the end of any Supabase migration that adds columns the frontend writes immediately. Without it, the SQL migration can succeed and the JS client can still throw `PGRST204` until the cache refreshes.
- `transactions.type` must include `SEND/RECEIVE` in the database constraint as well as in TypeScript. Updating only the column list or only the TS type creates a half-migrated state where the UI thinks a row should exist but the DB rejects it.

### 2025-05-26 — Migrated wallet connection from RainbowKit → Reown AppKit

**Why:** RainbowKit's WalletConnect integration has a known Vite bundling issue where clicking WalletConnect triggers an internal crash (white screen). The root cause is unfixable with polyfills — RainbowKit's WalletConnect adapter doesn't bundle cleanly on Vite. Reown AppKit is the official successor product from the same team (WalletConnect rebranded to Reown in Sept 2024) and fixes this by using a web-component-based modal that runs independently of the React bundle.

**Files changed:**
- `package.json` — removed `@rainbow-me/rainbowkit`, added `@reown/appkit ^1.7.8` and `@reown/appkit-adapter-wagmi ^1.7.8`
- `vite.config.ts` — added `global: 'globalThis'` define, updated `optimizeDeps` to include appkit packages, removed rainbowkit
- `src/index.tsx` — removed `RainbowKitProvider` and `darkTheme` imports; provider tree is now `WagmiProvider` → `QueryClientProvider` only. `createAppKit()` runs as a side effect of importing `web3Config.ts`.
- `src/services/web3Config.ts` — replaced `getDefaultConfig` from rainbowkit with `WagmiAdapter` + `createAppKit` from `@reown/appkit-adapter-wagmi` and `@reown/appkit/react`. Social logins (Google, X, Discord, GitHub) configured in `features.socials`. Dark theme tokens set via `themeVariables`.
- `src/components/WalletConnectButton.tsx` — replaced `ConnectButton.Custom` render prop with `useAppKit().open()`. Wrong-network view uses `open({ view: 'Networks' })`, connected state uses `open({ view: 'Account' })`.
- `src/components/AuthModal.tsx` — replaced `ConnectButton` import from rainbowkit with `useAppKit` from `@reown/appkit/react`. The single `HoloButton` now calls `openAppKit()` directly.

**Key architecture note — social login + two-wallet model:**
When a user connects via Google/Discord/etc., AppKit creates a Reown-managed **embedded wallet** (non-custodial, private key sharded via MPC — Reown never holds the full key). The address returned by `useAccount()` is this embedded wallet address. Velo's two-wallet model still applies:
- The embedded wallet address acts as the **main wallet** (identity, username registration, deposits/withdrawals)
- The **burner wallet** is still derived deterministically from the first signature on this address
- Users can export the embedded wallet private key via AppKit's "Upgrade Wallet" flow and import it into MetaMask

**Reown dashboard settings required:**
- Project type: **AppKit** (not WalletConnect Modal)
- Domain allowlist: `velo-trading-terminal.vercel.app` ✓ (already set)
- Features → Social & Email: **ON** to enable social logins
- After any env var or dashboard change: manually trigger Vercel redeploy (gotcha #8)

**Env var unchanged:** `VITE_WALLETCONNECT_PROJECT_ID` — same key, same value, same Vercel env var. The Reown projectId is the same as the old WalletConnect projectId.

### 2025-05-26 — Fixed AppKit modal rendering behind AuthModal

**Problem:** Clicking "Connect Wallet" in AuthModal appeared to do nothing. AppKit modal was opening but rendering behind AuthModal's `z-index: 9999` overlay.

**Files changed:**
- `src/components/AuthModal.tsx` — added `useAppKitState` hook to detect AppKit modal open/close state. "Connect Wallet" now calls `handleOpenWallet()` which fades AuthModal out (`setVisible(false)`) before opening AppKit. If user cancels AppKit without connecting, AuthModal fades back in.
- `src/index.tsx` — injects a `<style>` tag at startup forcing `w3m-modal` and `wcm-modal` web components to `z-index: 99999` so AppKit always renders above all Velo modals.

**New gotcha:** AppKit's modal is a web component (`<w3m-modal>`) injected at `document.body` level. Its default z-index is lower than custom modals using `z-index: 9999`. Always ensure the style override in `index.tsx` is present when using AppKit alongside custom modal stacks.

### 2025-05-26 — Social login onboarding, email pre-fill, wallet popup, buy crypto removal

**Problem set fixed in this session:**

1. **Social login onboarding not appearing** — After signing in via Google/Discord/etc., AppKit closes its modal and `isConnected` flips `true`, but `isLoginOpen` is `false` (the user never explicitly opened `AuthModal`). The existing wallet-connect effect in `AuthModal.tsx` guards on `if (!isOpen) return`, so it never fired. Fixed by adding a new `useEffect` in `App.tsx` that watches `isWalletConnected` + `walletAddress`: if a wallet connects while `user` is null and `isLoginOpen` is false, it calls `setLoginOpen(true)` after a 400ms delay (so AppKit's modal fully closes first). A `socialLoginHandledRef` prevents re-firing.

2. **Email pre-fill from social login** — When the onboarding reaches the email step, the user had to type their Google email manually. Fixed by importing `useAppKitAccount` in `AuthModal.tsx` and reading `embeddedWalletInfo.user.email`. When `advance()` transitions from `step === 'name'` to `step === 'email'`, if the email field is empty and `socialEmail` is non-empty, it calls `setEmail(socialEmail)` before the step transition.

3. **"Buy Crypto" button in AppKit wallet modal** — Unwanted on testnet. Fixed by adding `onramp: false` to the `features` object in `web3Config.ts`.

4. **Header username menu — added "Open Wallet" option** — Clicking the username in the navbar opened `ProfileAvatarPopup` but had no way to open the AppKit wallet modal. Added an "Open Wallet" menu item (Wallet icon) that calls `openWalletModal({ view: 'Account' })`. The `Navbar` component now calls `useAppKit()` directly (it's a standalone React component at module level, so hook calls are legal). The `ProfileAvatarPopup` receives a new `onOpenWallet` prop. The "Wallet & Settings" option was renamed to "Settings" for clarity.

**Files changed:**
- `src/services/web3Config.ts` — added `onramp: false` to `features`
- `src/components/AuthModal.tsx` — imported `useAppKitAccount`; added `embeddedWalletInfo` + `socialEmail` derived values; pre-fill email on name→email step transition
- `src/App.tsx` — imported `useAppKit` from `@reown/appkit/react`; added `socialLoginHandledRef` + `useEffect` social login trigger before the Velo Welcome onboarding block; `Navbar` now calls `useAppKit()` for its own `openWalletModal`; `ProfileAvatarPopup` has new `onOpenWallet` prop and "Open Wallet" menu item

**New gotcha:** `embeddedWalletInfo` from `useAppKitAccount` is typed loosely — accessing `.user?.email` requires a cast to `any` (`(embeddedWalletInfo as any)?.user?.email`) because the AppKit type definition doesn't expose the nested user shape in the installed version. This will likely clean up in a future AppKit release.

### 2025-05-26 — Batch 5: session restore, double-wallet, deposit/withdraw redesign

**Problems fixed:**

1. **Login modal pops up on every refresh** — `socialLoginHandledRef` effect fires as soon as `isWalletConnected` becomes true, which happens before Supabase's async `INITIAL_SESSION` restore completes. `user` is null during that window so the effect incorrectly opened the login modal for already-authenticated users. Fix: added `authChecked` to the effect's dependency array and added an early return if `!authChecked`. The modal now only opens after Supabase confirms there's no active session.

2. **Two wallets showing in AppKit modal** — AppKit's social login creates a Pimlico ERC-4337 Smart Account on top of the embedded wallet (0x4D…ACTIVE + 0x13…), confusing users. Fix: added `swaps: false` and `enableCoinbase: false` to `createAppKit` config — these are the options that trigger the smart account layer. The wallet list now shows only the single embedded wallet.

3. **AppKit wallet shows $0 / no mUSDC tokens** — AppKit's built-in token display doesn't know about Velo's custom mUSDC contract. Fix: added a `tokens` array to `createAppKit` config registering `0x5EFaF3F69b09bC2abF3439bDC0C93bf611026699` on `baseSepolia.id`. AppKit will now display the mUSDC balance in the wallet modal.

4. **Deposit/Withdraw modals redesigned** — Old modals had "Option A / Option B" complexity that confused users who had mUSDC in their main wallet but the modal showed $0. New design: single tabbed modal (`↓ Deposit` / `↑ Withdraw`) that replaces both `VeloDepositModal` and `VeloWithdrawModal`. Features: clean balance cards for both wallets at the top, amount input with quick amounts, one deposit button, a copy-address section below a divider for sending from anywhere. Withdraw tab: destination picker (Main Wallet / Custom Address) + amount + silent burner signature. `VeloWithdrawModal.tsx` is now a thin re-export alias so App.tsx imports don't need to change.

5. **App.tsx deposit callsite signature updated** — Old: `onSuccess={({ txHash, amount }) => ...}`. New: `onSuccess={(txHash, amount) => ...}` to match the revised component prop type.

**Files changed:**
- `src/services/web3Config.ts` — added `swaps: false`, `enableCoinbase: false`, `tokens` array with mUSDC address
- `src/App.tsx` — gated `socialLoginHandledRef` effect on `authChecked`; updated `VeloDepositModal` call site signature
- `src/components/VeloDepositModal.tsx` — full rewrite as tabbed Deposit+Withdraw modal
- `src/components/VeloWithdrawModal.tsx` — replaced with thin re-export alias pointing at VeloDepositModal

**New gotchas:**
- AppKit's `tokens` config only affects the display in the AppKit modal itself — it does NOT affect Velo's own balance reads (`fetchUsdcBalance` via viem). The two are independent.
- `swaps: false` + `enableCoinbase: false` suppresses the smart account creation. If Reown changes their SDK these options may shift. If two wallets reappear in a future AppKit update, check their changelog for smart account config.
- The `VeloWithdrawModal` export alias means both `defaultTab="deposit"` and `defaultTab="withdraw"` open the same modal component — any `isVeloWithdrawOpen` state in App.tsx correctly opens the withdraw tab.

### 2026-05-26 — Batch 6: Reown two-wallet fix + broken Funds modal balances + missing faucet activity row

This batch fixes a cluster of issues that all surfaced together when Stan tested the onboarding-to-trade flow end-to-end. The symptoms looked unrelated — Reown wallet shows $0, Funds modal shows $0/$0, Recent Activity is empty after the faucet credit, two wallets in the Reown picker — but they were five separate root causes, each touching a different part of the wallet/balance/activity surface.

**Problems fixed:**

1. **Funds modal (VeloDepositModal) always shows MAIN $0 and TRADING $0** — even when the trading wallet held $1,000. Root cause: `fetchUsdcBalance` has signature `(publicClient, usdcAddress, owner)`. The modal was calling it with two arguments — passing the user's address as the `usdcAddress` parameter — so it was reading "balance of self" from the wrong contract, which always returns 0. VeloSendModal called it correctly (3 args, MAX $1000 visible), VeloDepositModal didn't (Withdraw tab showed $0/$0). Fix: pass `VELO_USDC_BASE` as the second arg in all four call sites. Also added a 6-second polling interval while the modal is open so balances refresh visibly after deposit/withdraw confirmations.

2. **Two wallets in the Reown picker (Smart Account + EOA)** — batch 5's `swaps: false` + `enableCoinbase: false` workaround DOES NOT actually disable AppKit smart accounts. The correct option per Reown's docs (`docs.reown.com/appkit/react/core/options#defaultaccounttypes`) and GitHub issue [reown-com/appkit#4057](https://github.com/reown-com/appkit/issues/4057) is `defaultAccountTypes: { eip155: 'eoa' }`. Added this; kept `swaps: false` and `enableCoinbase: false` as defensive measures (they suppress related UI elements but don't affect smart account creation on their own).

3. **`tokens` config was malformed and silently ignored** — batch 5 wrote `tokens: { [baseSepolia.id]: [{ address: '0x...' }] }`. Reown's actual type is `Record<CaipNetworkId, Token>` — the key must be the CAIP string (`'eip155:84532'`, NOT the numeric chain id) and the value must be a single `Token` object (NOT an array). Wrong shape = AppKit silently doesn't register the token, so mUSDC never appears in the Reown wallet modal regardless of balance. Fixed to use `{ 'eip155:84532': { address: '0x5EFaF…', image: '...' } }`.

4. **Initial faucet credit never recorded in Recent Activity** — the welcome modal mints 1,000 mUSDC directly to the burner, but `onBurnerReady` only refreshed the trading hook and showed a toast. It never called `recordTransaction`. So TOTAL EQUITY showed $1,000 (read from chain, correct) but Recent Activity stayed empty (read from Supabase). The old Orderly onboarding path wired this up; the new Velo path didn't. Fix: extended `onBurnerReady` to forward `{ burnerAddress, amount, txHash }`; App.tsx now records a DEPOSIT with `txHash: 'faucet:<onchain_hash>'`. The existing `faucet:` idempotency guard in `supabaseStore.recordTransaction` prevents duplicate rows on retries.

5. **"Open Wallet" menu item was structurally broken** — the Reown modal only knows about the address from `useAccount()` (the MAIN wallet). After a fresh signup the main wallet is empty because the faucet mints to the BURNER. So clicking "Open Wallet" always shows $0 right after onboarding — looks like a bug, panics the user. The Reown modal cannot show the burner balance because it has no concept of the derived wallet. Fix: removed "Open Wallet" from the avatar menu entirely; renamed "Settings" to "Wallet & Settings" (the Velo Wallet & Settings modal correctly shows both wallets with live balances). The Reown modal is still reachable via the Connect Wallet button in the navbar for disconnect/network-switch needs.

**Bonus: instant balance + activity refresh on every modal success.** The dashboard polls the burner every 5 seconds via `useVeloPerpsTrading`. After a Deposit / Send / Withdraw, that polling lag made the SUCCESS toast feel disconnected from the equity number. Now every success callback in App.tsx calls `veloPerpsTrading.refresh()` + `fetchTransactions(user.id)` immediately, so TOTAL EQUITY and Recent Activity update the moment the toast appears.

**Files changed:**
- `src/services/web3Config.ts` — added `defaultAccountTypes: { eip155: 'eoa' }`; fixed `tokens` to use CAIP key + single Token object; dropped invalid `walletConnect` feature flag; added comments explaining why each option is there. This is now the canonical Reown config — leave it alone unless Reown ships a breaking SDK change.
- `src/components/VeloDepositModal.tsx` — fixed 4 broken `fetchUsdcBalance` call sites; added 6s polling while modal is open; refactored balance reads into a single `loadBalances` helper.
- `src/components/VeloWelcomeModal.tsx` — extended `onBurnerReady` callback signature to forward `{ burnerAddress, amount, txHash }`.
- `src/App.tsx` — wired the welcome modal callback to write the DEPOSIT row + notification + refetch transactions; added `veloPerpsTrading.refresh()` + `fetchTransactions` to the Deposit / Send / Withdraw success callbacks; dropped "Open Wallet" menu item; renamed "Settings" → "Wallet & Settings"; removed unused `useAppKit` import.

**New gotchas:**
- The Reown `tokens` config is `Record<CaipNetworkId, Token>` — the key is a CAIP string like `'eip155:84532'`, NOT `baseSepolia.id` (84532) or `'84532'`. The value is a single Token object, NOT an array. Wrong shape = silently ignored. There is NO console warning when this happens.
- `defaultAccountTypes: { eip155: 'eoa' }` is the ONLY supported way to disable AppKit smart accounts. `swaps: false`, `enableCoinbase: false`, and dropping `email`/`socials` from features do NOT disable smart accounts. If Reown adds a per-feature smart account toggle in the future, check the changelog; until then this is the only lever.
- `fetchUsdcBalance(publicClient, usdcAddress, owner)` is 3-arg, not 2-arg. Future call sites must pass `VELO_USDC_BASE` explicitly. TypeScript catches this — if you see "Expected 3 arguments, but got 2" anywhere related to fetchUsdcBalance, that's the same class of bug.
- The Reown wallet modal CANNOT show the burner balance. It is structurally incapable of doing so — the burner is a localStorage-derived key that AppKit has no concept of. Any "wallet" surface the user can access from the Velo UI should go to `SettingsModal`, never to AppKit's modal. Treat AppKit's modal as a connect/network-switch surface only, NOT as a balance/portfolio surface. This is documented in the comment block at the top of `web3Config.ts`.
- The `Settings` lucide icon is no longer referenced from `App.tsx` after this batch (we use `Wallet` for the renamed menu item). It's still imported because it may be needed elsewhere in the monolith — left alone to avoid risk.

**Supersedes from batch 5:** the gotcha "`swaps: false` + `enableCoinbase: false` suppresses the smart account creation" is WRONG. Those options do not control smart account creation. `defaultAccountTypes: { eip155: 'eoa' }` does.

**Verification:**
- `npx vite build` passes (44s).
- `npx tsc --noEmit` error count drops from 86 → 79; the 7 resolved errors are all directly tied to fixes in this batch (4× VeloDepositModal arity, 1× walletConnect feature, 1× tokens key shape, 1× networks readonly cast). No new TS errors introduced.

**Manual test plan for Stan after deploy:**
1. Clear localStorage + Supabase auth → fresh signup via social or wallet.
2. Welcome modal → claim faucet → should see Recent Activity row "DEPOSIT $1,000.00 mUSDC" with a "Welcome bonus" notification.
3. Open Settings → should see Main $0 / Trading $1,000. Reown picker (via Connect Wallet button) should show ONE wallet entry (no Smart Account row).
4. Open Funds modal (Deposit button on dashboard) → Withdraw tab → should now correctly show MAIN $0 / TRADING $1,000 (this was the broken case). MAX button should fill in $1,000.
5. Withdraw $500 to main → SUCCESS toast → TOTAL EQUITY should drop to $500 immediately (no 5s lag). Recent Activity should show new WITHDRAW row immediately.
6. Open Funds modal again → should now show MAIN $500 / TRADING $500 (live polling visible if you wait 6s without closing).

### 2026-05-26 — Batch 7: Reown modal exorcism, bridge UX rewrite, Recent Activity persistence diagnostics

This batch addresses three orthogonal asks from Stan after testing batch 6 in production:

1. The Reown wallet modal causes more confusion than value — Velo can show everything Reown shows (with the burner balance Reown can't see), and the private key export already lives in Velo Settings. Get rid of it from the user flow.
2. A standalone "Bridge" button on the dashboard doesn't match how anyone thinks about crypto deposits/withdraws. Every CEX makes you pick a network as part of the deposit/withdraw flow; the bridge is invisible. Match that.
3. Recent Activity rows show up live after a trade then disappear on refresh. The dashboard equity ($499.20) survives, but the Realized PnL drops from $0.06 to $0.00 and Win Rate goes from 100% to 0%. The rows aren't surviving the round trip to Supabase, and the UI gives the user zero signal about why.

**Problems fixed:**

1. **Reown's AppKit modal is no longer reachable post-login.** The Reown modal is structurally incapable of showing the burner (trading wallet) balance — it only knows about the address returned by `useAccount()`, which is the MAIN wallet. After the faucet credits the burner, the AppKit modal shows $0 every time the user opens it, even though Velo's dashboard correctly reads the burner and shows $1,000. We can't fix that from inside AppKit (it's a fundamental architectural mismatch — the burner is a localStorage-derived key Reown has no concept of). So in batch 7 we removed every post-login surface that opens the AppKit modal:
   - `WalletConnectButton.tsx` no longer imports `useAppKit`. Connected-state click routes to the Velo Wallet & Settings modal via a new `onOpenSettings` callback prop. Wrong-network click calls wagmi's `useSwitchChain` directly, which pops the browser-extension's native chain switcher — no Reown modal layered on top.
   - The unauthenticated "Connect Wallet" button still opens `AuthModal`, which internally uses AppKit for the initial wallet/social-provider pick. That's the ONLY remaining entry point for AppKit's modal.
   - AppKit stays initialized as the wagmi connection backend; we just stop surfacing its modal to the user.

2. **Bridge is now part of Deposit/Withdraw, not a separate top-level concept.** Full rewrite of `VeloDepositModal.tsx`. Both tabs (Deposit and Withdraw) now have a network picker at the top with four options (Base, Arbitrum, Optimism, Ethereum Sepolia). Base Sepolia uses the existing ERC-20 transfer path (main → burner for deposit, burner → recipient for withdraw). Other chains use the existing `bridgeService.executeBridge` via LayerZero V2 OFT:
   - **Cross-chain deposit**: user's wallet must be on the source chain (we trigger `switchChainAsync` if not). User signs `oft.send` on chain X with main wallet, mUSDC arrives in burner on Base in 1-3 min. Fee preview shown inline ("LayerZero fee: ~0.0001 ETH").
   - **Cross-chain withdraw**: burner on Base signs `oft.send` to the destination address on the target chain. `ensureBurnerGas` tops up the burner so it can cover the LayerZero native fee.
   - Same-chain quick amounts ($10/$50/$100/$500) only show on Base because we know the main balance. For cross-chain we hide them since we don't fetch the user's balance on Optimism etc. without another roundtrip.
   - The standalone `VeloBridgeModal` mount is left in `App.tsx` but disconnected from all UI buttons (commented with explicit removal instructions if it becomes a maintenance burden).
   - Removed `onOpenBridge` from both Dashboard and SettingsModal call sites in App.tsx.

3. **Recent Activity disappears on refresh — root cause diagnostics + automatic recovery.** Two complementary fixes since the root cause isn't directly visible to me (could be RLS, schema drift, or auth-row mismatch in Stan's deployed Supabase):
   - **Persistence-error broadcaster.** New `onPersistenceError` event bus in `supabaseStore.ts`. Every fire-and-forget insert that fails now broadcasts a typed event with the Postgres error code and a hint mapped from common codes (`42501` → RLS blocked, `42703` → column missing, `23503` → FK mismatch, etc). App.tsx subscribes and surfaces ONE throttled toast per failure category (60s throttle so a flurry of errors doesn't spam). Hit `insertTradeHistory` and `recordTransaction` error paths. The full error still goes to `console.error` for Vercel-log grep.
   - **Visibility-change refetch.** New useEffect in App.tsx: whenever `document.visibilityState === 'visible'` (i.e. the user comes back to the Velo tab), re-pull `fetchTradeHistory` + `fetchTransactions` and merge into `user.tradeHistory` / `user.transactionHistory`. This is a self-healing recovery path that works regardless of whether the initial session-restore Promise.all was racy. Cheap: two LIMIT'd SELECTs, only when the tab is actually being viewed. Idempotent: setUser replaces arrays, never appends.

4. **`SUPABASE_MIGRATION_RLS_ACTIVITY.sql` — direct fix for the most likely root cause.** Idempotent SQL that re-applies SELECT/INSERT/UPDATE/DELETE policies on `trade_history` and `transactions`, gated on `auth.uid() = user_id`. Drops policies by name then recreates so it's safe to rerun. If the disappearance was RLS-related (overwhelmingly likely given the symptoms), this migration plus the policy reset fixes it permanently. If something else is going on, the in-app toast (point 3) tells you exactly what.

**Files changed:**
- `src/components/VeloDepositModal.tsx` — full rewrite. Network picker, cross-chain deposit + withdraw via LayerZero, fee preview, success state covers both same-chain and bridge cases. Header comment block documents the design rationale.
- `src/components/WalletConnectButton.tsx` — full rewrite. Drops `useAppKit` import entirely. Three states (unauthenticated, wrong-network, connected), each routes to Velo-native UI. Header comment documents the "AppKit modal exposure policy".
- `src/services/supabaseStore.ts` — new `onPersistenceError` event bus + `reportPersistenceError` + `hintFromCode` helper. `insertTradeHistory` and `recordTransaction` error paths now broadcast.
- `src/App.tsx` — three changes:
   1. Persistence-error listener with 60s throttle posting toasts.
   2. Visibility-change refetch effect re-pulling trade_history + transactions on tab focus.
   3. Dropped `onOpenBridge` from Dashboard and SettingsModal call sites; passed `onOpenSettings` to `WalletConnectButton`.
- `SUPABASE_MIGRATION_RLS_ACTIVITY.sql` (NEW) — re-applies activity table RLS policies. Run once in Supabase SQL editor.

**New gotchas:**
- Cross-chain deposits require the user's wallet to switch to the source chain (Arbitrum / Optimism / Ethereum Sepolia). We call `switchChainAsync` automatically, but if the wallet doesn't recognize the chain (rare on testnet) the user may need to add it manually. MetaMask, Rabby, and Coinbase Wallet all auto-add Sepolia variants. Phantom does not — Solana wallet, not relevant here.
- The LayerZero fee preview uses a `viem.createPublicClient` spun up on demand for the source chain — there's no shared client cache. If this becomes slow we can lift it into a useMemo or a service-level cache, but for now the call latency (~200ms) is invisible during typing.
- The dormant `VeloBridgeModal` mount in App.tsx is dead code from the user's perspective. Kept it because removal needs to also drop the state + import, and the cost is zero. The comment block at the mount point explicitly says "safe to remove" — next time someone audits dead code, drop it.
- Persistence-error toasts throttle per `kind`, not per error message. If a user hits two different DB errors in succession, only the first surfaces. That's intentional — surfacing every error during a burst (e.g. 10 quick trades all failing) is overwhelming.
- The visibility-refetch is unconditional on tab focus. If the user's connection is bad and the refetch fails, the previously-loaded data stays (we never clear before the fetch resolves). No regression risk.
- `WalletConnectButton` no longer imports `useDisconnect` either — the disconnect action lives in Velo's Wallet & Settings modal now. If any future code path needs to disconnect from the navbar, re-import it directly from wagmi.

**Verification:**
- `npx vite build` passes in 39s. Build chunks unchanged in size vs batch 6 modulo the new bridge code (+~5kB gzipped).
- Manual smoke test of the network picker UI was not run (no live Supabase / live LayerZero from the dev environment) — Stan to verify on Vercel.

**Manual test plan for Stan after deploy:**

For the Reown modal removal:
1. Sign out completely (clear localStorage + Supabase auth).
2. Click Connect Wallet → AuthModal opens → use Google sign-in.
3. AppKit social-login modal appears ONCE during sign-in (expected).
4. Complete onboarding → faucet claim → land on dashboard.
5. Click the wallet address chip in the navbar (where it shows `0x04…De99`). Should open Velo's Wallet & Settings modal showing BOTH wallets with their balances. NOT the Reown modal.
6. If you switch to a different network in MetaMask, the button should change to "Switch to Base Sepolia" and clicking should pop your wallet's NATIVE chain picker, not a Reown modal.

For the bridge UX:
7. Open Funds modal (Deposit button). The Deposit tab should have a "Source Network" picker with Base / Arbitrum / Optimism / Ethereum.
8. Default is Base — the existing same-chain deposit flow works unchanged.
9. Click "Arbitrum" — UI changes: the Main/Trading balance cards hide (we don't know your Arbitrum balance), quick amounts hide, and the button becomes "↓ Bridge $X from Arbitrum". When you type an amount, a "LayerZero fee" row appears with the quote.
10. Don't actually bridge unless you have testnet ETH on Arbitrum Sepolia — but the quote should at least appear (or fail with a visible error if the OFT contracts aren't deployed/wired on that chain).
11. Switch to Withdraw tab. "Destination Network" picker should work the same way.
12. Confirm that the dashboard no longer has a Bridge button — only Deposit, Withdraw, Send.

For the Recent Activity persistence:
13. Run `SUPABASE_MIGRATION_RLS_ACTIVITY.sql` in your Supabase SQL editor as project owner. Check that it completes without errors.
14. Sign in, open a small position ($10 SOL/USD long, 10x), close it.
15. Confirm a CLOSE row + OPEN row appear in Recent Activity with the pnl number.
16. Hard-refresh the page (Cmd+R / Ctrl+R).
17. Confirm BOTH rows survive the refresh. Realized PnL on the right card should still show the same number.
18. If they DON'T survive: a toast should now appear saying "Activity not saved — [hint]". The hint tells you the exact Postgres error code so we know what to fix next.
19. Switch to another browser tab for 30 seconds, then come back. Confirm Recent Activity rows are still there (the visibility-refetch should have re-pulled them).

### 2026-05-26 — UI Polish: Navbar, Mobile Nav, Light Mode, Double Avatar, TESTNET label

**Changes made:**

1. **Navbar positioned fixed instead of sticky** — Changed `position: sticky` to `position: fixed` + `left: 50%; transform: translateX(-50%)` so the nav truly floats over content and doesn't scroll away or cause layout issues on mobile. Main content now has explicit `paddingTop` set to `84px` (60px nav + 12px top gap + 12px breathing room) for trade view, and `calc(84px + 24px)` for other tabs.

2. **Hamburger menu removed from desktop** — The `<Menu>` button already had `className="md:hidden"` so it only shows on mobile — this was always correct. Confirmed it doesn't appear on desktop. The desktop nav shows the full link bar instead.

3. **Double avatar removed** — The navbar previously rendered TWO separate elements when logged in: a pill (username+avatar) AND a square avatar button. Both had `ref={avatarBtnRef}` which caused the mobile button to overwrite the ref. Fixed by moving the ref to the parent `<div>` wrapper so `ProfileAvatarPopup` positions correctly from either. The pill is now the sole desktop click target; mobile gets a square avatar button. No duplicate.

4. **LIVE → TESTNET** — Replaced the `chip live` pill (which had a green animated dot and said "Live") with a static chip reading "TESTNET" in `var(--fg-2)`. The pulsing green dot implied mainnet which is misleading on Base Sepolia.

5. **Mobile bottom nav touch targets improved** — Added `touchAction: 'manipulation'` and `WebkitTapHighlightColor: 'transparent'` + `WebkitUserSelect: 'none'` / `userSelect: 'none'` and `outline: 'none'` on all bottom nav buttons. Also added `viewport-fit=cover` to the HTML viewport meta so iPhone safe area works correctly.

6. **Light mode toned down** — Reduced ambient gradient opacity and chroma in `tokens.css` light mode so the purple is more pastel (from `oklch(0.82 0.18)` range down to `oklch(0.90 0.10)` range). Background base lightened from `#F2F0FA` to `#F7F6FC`. Glass panels bumped to `rgba(255,255,255,0.72)` / `0.90` for better contrast with the lighter background.

7. **TradingView chart background in light mode set to white** — Changed `BG` from `#F7F5F0` to `#ffffff` so the chart surface matches TradingView's own white background and blends seamlessly. The `mix-blend-mode: multiply` iframe trick still applies; the chart's white background now multiplies cleanly against the pale lavender app background instead of clashing.

8. **TradeView height fixed** — Changed `calc(100vh - 82px)` to `calc(100vh - 84px)` to match the actual fixed-nav offset, preventing a 2px gap at the bottom.

**Files changed:**
- `src/App.tsx` — navbar position, TESTNET chip, double avatar fix, mobile touch targets
- `src/components/ui/pages/TradeView.tsx` — height calc fix
- `src/components/TradingViewChart.tsx` — light mode BG = white
- `src/styles/tokens.css` — light mode chroma reduction, iOS safe area CSS
- `index.html` — viewport-fit=cover, lighter light-mode body background
- `PROJECT_STATUS.md` — this entry

**New gotchas:**
- The fixed navbar requires ALL page sections to have `paddingTop` (or `marginTop`) of at least 84px. Any new page/tab added to the router must include this offset or content will hide under the nav.
- `env(safe-area-inset-bottom)` requires `viewport-fit=cover` in the viewport meta. Without it the CSS function resolves to 0 on all devices. Now in place.
- The `avatarBtnRef` is now on a `<div>`, not a `<button>`. `ProfileAvatarPopup` reads `.getBoundingClientRect()` on whatever element it gets — that works fine on a div. No type cast needed beyond the `as any` already present.

---

## Patch 3 — May 2025

**Issues fixed:**

1. **TradeView right panel no longer requires scrolling (desktop)** — Reduced order book from 7→5 rows, shrunk container from 34%→28% height, reduced pair header padding from 11px→8px and font sizes (pair name 18→16px, price 22→18px). Tightened order form outer padding from 11px→8px and gap from 9→7. Long/Short buttons reduced from 9px→7px padding. Submit button reduced from 11px→9px padding. Everything now fits on one screen without scrolling.

2. **Light mode completely rethought** — Changed from purple-tinted lavender (`#f7f6fc` base) to clean white (`#ffffff` base, `#f5f5f8` surface, `#ebebf0` inset). Glass panels now use `rgba(255,255,255,0.82/0.96)` for crisp, professional appearance. Ambient gradient is now a very subtle corner wash instead of heavy chroma blobs. Chart backgrounds (`localBG`, `localBG2`) updated to match. Result: looks like a polished fintech product, not a purple art project.

3. **Mobile navbar sticks to top** — Added `.navbar-container` CSS class with a `@media (max-width: 768px)` rule that overrides `top:12px`, `left:50%`, `transform`, and `border-radius` so on iPhone/Android the navbar sits flush to the top of the screen (rounded only at bottom corners). Desktop keeps the floating pill behavior unchanged.

4. **Notification panel fixed on mobile** — Changed from `position:absolute` (clipped by parent overflow) to `position:fixed` with `right:12px, top:80px` and `width: min(320px, calc(100vw - 24px))`. Now renders on top of everything at `zIndex:9999` on all screen sizes. Also added `WebkitBackdropFilter` for iOS Safari.

5. **Mobile sidebar "LIVE" → "TESTNET"** — The chip in the mobile sidebar user card that incorrectly said "Live" now shows "TESTNET" to match the desktop navbar chip.

**Files changed:**
- `src/App.tsx` — notification panel fix, TESTNET chip in mobile sidebar, navbar class name
- `src/components/ui/pages/TradeView.tsx` — compact right panel, reduced padding/gaps/font sizes, fewer order book rows
- `src/components/TradingViewChart.tsx` — light mode chart backgrounds → white/f5f5f8
- `src/styles/tokens.css` — light mode palette overhaul (white base), mobile navbar CSS, notification z-index

### 2026-05-27 — Mobile UI fixes + light mode chart theming

**Problems fixed:**

1. **PortfolioChart hardcoded `theme={'dark'}` in Dashboard** — The portfolio chart always rendered with dark colors regardless of the active theme. In light mode the chart background appeared stark white against the purple-tinted panel. Fixed by adding `theme` to Dashboard's props (defaulting to `'dark'`), and passing `theme={theme}` from App.tsx's Dashboard render call. The PortfolioChart component already handled both themes correctly — it just never received the right value.

2. **Markets mobile — Trade button cut off on small screens** — At ≤420px the grid template was `24px 1fr 70px 64px` (4 columns) but the DOM had 5 visible items (star, name, price, change, trade), causing the Trade button to overflow outside the grid into the left gutter. Fixed by:
   - Adding a new `mk-col-change` CSS class to the change column in both the header and each row.
   - At ≤420px: switching to `26px 1fr 68px 60px 56px` (5 columns) and hiding `mk-col-change` instead of making the grid 4-wide. This keeps Trade visible as column 4 and leaves column 5 empty — clean layout at all widths.

3. **Trade view mobile — massive empty space below submit button** — The mobile positions panel (`PositionsPanel`) had `flex: 1` with no height bound. In the mobile column layout (height: auto) this caused the panel to stretch and fill remaining viewport space with a black void. Fixed by adding `minHeight: 180` and `maxHeight: 400` to the mobile positions panel wrapper div.

4. **Admin panel — horizontal overflow on mobile** — The contract metadata "V2: add/reduce margin... ROUTING TO V2" row used `display: flex; justify-content: space-between` in a single line that overflowed on narrow screens. Fixed with `flexWrap: 'wrap'` and `gap: 8` so the ROUTING label drops below on mobile. Also added `overflowX: 'hidden'` to the admin panel outer container and a `velo-admin-wrap` class wired to a `@media (max-width: 768px)` rule in `tokens.css`.

5. **Token page — bottom nav overlapping content + grid not stacking** — The `token-page-grid` had hardcoded `gridTemplateColumns: '1fr 340px'` with no responsive override, so on mobile it created a two-column layout that overflowed horizontally. Added a `@media (max-width: 680px)` rule in `tokens.css` that forces `token-page-grid` to single column. Also added `paddingBottom: max(80px, env(safe-area-inset-bottom) + 80px)` to the TokenPage outer div so content never hides under the mobile bottom nav.

**Files changed:**
- `src/components/ui/pages/Dashboard.tsx` — added `theme` prop, passed to PortfolioChart
- `src/components/ui/pages/MarketsView.tsx` — `mk-col-change` class on change columns; 5-col grid at 420px hiding change
- `src/components/ui/pages/TradeView.tsx` — mobile positions panel wrapper gets `minHeight: 180, maxHeight: 400`
- `src/components/VeloAdminPanel.tsx` — `velo-admin-wrap` class, `overflowX: hidden`, metadata row `flexWrap: wrap`
- `src/styles/tokens.css` — responsive rules for `token-page-grid`, `velo-admin-wrap`, `mk-col-change`
- `src/App.tsx` — `theme={theme}` prop on Dashboard render; TokenPage outer div gets `paddingBottom` for nav clearance
- `PROJECT_STATUS.md` — this entry

**New gotchas:**
- `mk-col-change` must be present on BOTH the header `<button>` and the row `<div>` for the 420px layout to be consistent. If a new column is added between price and trade, the grid template columns count at each breakpoint must be updated to match.
- The PortfolioChart theme fix only works because the chart already handles both themes internally (transparent bg, conditional text/crosshair colors). If future chart theming needs change, the logic is in `src/components/PortfolioChart.tsx` in the `colors` object and crosshair config.
- `maxHeight: 400` on the mobile positions panel is a pragmatic cap. If users have many positions and complain about clipping, add `overflowY: auto` to the wrapper (it currently clips). The panel already has its own internal scroll via `custom-scrollbar`.

### 2026-05-27 — Patch 2: Light mode chart bg, Markets Trade button overflow, Admin pair row overflow

**Problems fixed:**

1. **TradingView chart white background in light mode** — `localBG` was `#faf9fd` but the app's panel/surface color (`--bg-base-2`) is `#f3f1fa`. Updated `localBG` to `#f3f1fa` and `localBG2` to `#ebe8f5` so the TradingView widget's background blends seamlessly with the surrounding panel. Also changed TradeView chart wrapper from `var(--bg-base)` to `var(--bg-base-2)` so the container bg matches the chart interior.

2. **Markets mobile Trade button clipping** — Root cause was `overflow: hidden` on the table container (`borderRadius: 16`) which visually clipped Trade buttons that fit within the grid but were near the edge. Changed to `overflow: clip` (respects border-radius without clipping positioned children). Also widened the Trade column from 60px → 76px at 680px breakpoint and added responsive `.mk-trade-btn` padding reduction (11px→8px→6px) for tight screens.

3. **Admin panel Trading pairs row horizontal overflow** — The feed ID `<code>` element had no `minWidth: 0` or overflow constraint, causing it to push the PAUSE button off screen on narrow viewports. Fixed by adding `minWidth: 0`, `overflow: hidden`, `textOverflow: ellipsis` to the code element, reducing pair label `minWidth` from 110px to 90px, adding `flexShrink: 0` to critical items, and changing the actions gap from 10px to 8px. Also added `admin-feed-id` CSS class that hides below 540px entirely.

**Files changed:**
- `src/components/TradingViewChart.tsx` — light mode `localBG/localBG2` updated to match app surface
- `src/components/ui/pages/TradeView.tsx` — chart wrapper bg changed to `var(--bg-base-2)`
- `src/components/ui/pages/MarketsView.tsx` — `overflow: clip`, wider Trade column, responsive button sizing
- `src/components/VeloAdminPanel.tsx` — feed ID overflow constraints, flexShrink fixes
- `src/styles/tokens.css` — `admin-feed-id` hide at 540px

### 2026-05-27 — Batch 8: bridge gas docs, dead-code cleanup, bundle splitting

This batch is light cleanup work after the heavier batch 7 architectural changes. Three independent improvements that don't touch the trade engine or wallet logic.

**Problems fixed:**

1. **Bridge gas requirements were undocumented.** A user bridging from Optimism Sepolia with no Optimism ETH would get a cryptic "execution reverted" from their wallet, with no in-app guidance about why or what to do. Velo only gas-sponsors Base Sepolia for the trading wallet — every other chain requires the user's main wallet to hold a small amount of native ETH. Now surfaced in three places:
   - **Inline notice in the Funds modal**: whenever a non-Base source/destination is selected, an amber notice appears below the LayerZero fee row. On the Deposit tab it warns the user that their main wallet needs source-chain ETH; on the Withdraw tab it reassures them that the burner pays and the sponsor tops up automatically.
   - **Friendlier "insufficient funds" error**: `handleDepositBridge` now intercepts the wallet's generic "insufficient funds" / "exceeds the balance" error messages and replaces them with actionable guidance: "Not enough ETH on Optimism Sepolia to pay the LayerZero fee. Top up your main wallet on that chain and try again."
   - **README section rewrite**: the "Moving funds between wallets" section now has a dedicated "Gas requirements for cross-chain operations" subsection with bullet points for each operation type plus testnet faucet links for all four supported Sepolias.

2. **PROFILE_SYNC failures were silent.** Batch 7 broadcast persistence errors for `TRADE_HISTORY` and `TRANSACTION` inserts via the new `onPersistenceError` bus, but `syncUserFinancials` (which writes `balance`, `realized_pnl`, `pnl_total`, `win_rate` to the profile) only did `console.error`. If RLS or a column rename ever broke the profile sync, the user's Win Rate / Realized PnL would silently drift from in-memory state — same disappear-on-refresh class of bug, different table. `syncUserFinancials` now reports through the same broadcaster, so the in-app toast covers all four kinds (`TRADE_HISTORY`, `TRANSACTION`, `POSITION`, `PROFILE_SYNC`).

3. **Dormant VeloBridgeModal mount removed.** Batch 7 left the modal mounted but disconnected from all UI buttons, with a comment saying "safe to remove if it becomes a maintenance burden." It's been one batch and the cross-chain flow inside VeloDepositModal is working — the dormant mount is now dead code. Removed the mount, the `isVeloBridgeOpen` state, and the import. The component file at `src/components/VeloBridgeModal.tsx` itself is kept (it might be useful as reference for the LayerZero quoting flow), just no longer imported.

4. **Bundle splitting via Vite manualChunks.** The pre-batch-8 build was a single ~3.5MB unminified bundle, gzipped to ~1MB. Every patch — even a one-character fix to App.tsx — invalidated the entire bundle in browser caches, so repeat visitors paid the full download cost on every deploy. Added a `manualChunks` strategy in `vite.config.ts` that splits vendor libraries into stable chunks:
   - `appkit` (~2MB) — Reown AppKit, changes rarely
   - `viem` (~1.75MB) — shared crypto primitives
   - `walletconnect` (~850KB) — @walletconnect/*, @web3modal/*
   - `wagmi` (~150KB) — wagmi hooks
   - `charts` (~560KB) — Recharts + lightweight-charts + d3
   - `supabase` (~200KB) — Supabase client
   - `icons` (~210KB) — lucide-react + phosphor-icons
   - Main index — application code only, now ~860KB
   
   Net effect: patches to App.tsx invalidate ~860KB instead of 3.5MB. The huge vendor chunks (appkit, viem) cache aggressively across deploys since they change with library version bumps, not per-commit. First-load total size unchanged; repeat-load size for typical iterations drops by ~80%.

**Files changed:**
- `src/App.tsx` — removed `VeloBridgeModal` import + mount + `isVeloBridgeOpen` state.
- `src/components/VeloDepositModal.tsx` — replaced both cross-chain fee preview blocks with combined fee+notice blocks (deposit-side warns, withdraw-side reassures). Friendlier error in `handleDepositBridge` for "insufficient funds" / "exceeds the balance" cases.
- `src/services/supabaseStore.ts` — `syncUserFinancials` now calls `reportPersistenceError` on failure with kind `PROFILE_SYNC`.
- `vite.config.ts` — `build.rollupOptions.output.manualChunks` strategy + `chunkSizeWarningLimit: 1000`.
- `README.md` — "Moving funds between wallets" section rewritten with deposit-anywhere + withdraw-anywhere unified flows; new "Gas requirements for cross-chain operations" subsection with bullets and testnet faucet links.

**New gotchas:**
- The new chunk-size warnings (`viem` at 1.75MB, `appkit` at 2MB) are EXPECTED and don't indicate a real problem. The warning threshold is for chunks that ship per-deploy; these are vendor chunks that change with library bumps. If you bump them, the warning will fire and that's the signal to verify the size hasn't ballooned unexpectedly. If a real per-deploy chunk crosses 1MB, that's an actual signal to investigate.
- The deposit-side cross-chain notice uses warm amber (`rgba(255,180,60,0.85)`) to convey "user action required". The withdraw-side notice uses neutral muted text (`var(--fg-subtle)`) because no user action is needed. Keep the color discipline — flipping them would be misleading.
- The "insufficient funds" string match is wallet-vendor-dependent. MetaMask, Rabby, Coinbase Wallet, and most viem-emitted errors include either "insufficient funds" or "exceeds the balance" verbatim, so the heuristic catches the common case. If a future wallet emits something different, the user sees the raw error — annoying but not broken.
- VeloBridgeModal.tsx is now an orphaned file. Don't accidentally re-import it; the path forward is to extend VeloDepositModal's network picker if more bridge features are needed.

**Verification:**
- `npx vite build` passes in 38s. Final bundle topology: 7 vendor chunks + 1 application chunk. Largest per-deploy chunk is ~860KB (App.tsx and friends), down from ~3.5MB.
- TS `--noEmit` no new errors introduced.

**Manual test plan for Stan after deploy:**
1. Open the Funds modal → Deposit tab → click "Optimism" in the source-network row. The fee block should now show the LayerZero fee AND a warning "⚠ Your main wallet must hold a small amount of ETH on Optimism Sepolia to pay this fee. Velo only gas-sponsors Base Sepolia."
2. Type any amount and click "Bridge $X from Optimism" WITHOUT having Optimism Sepolia ETH in your main wallet. The wallet should reject the tx, and the modal should show "Not enough ETH on Optimism Sepolia to pay the LayerZero fee. Top up your main wallet on that chain and try again." (NOT the raw chain error.)
3. Top up Optimism Sepolia ETH via faucet, retry the bridge — should succeed.
4. Switch to Withdraw tab → pick Arbitrum. The fee block should show the LayerZero fee AND a reassuring note "Paid by your trading wallet on Base. Velo tops it up automatically — you don't need any ETH on Arbitrum Sepolia."
5. Check Vercel deploy preview's network tab on first load: should see separate `appkit-*.js`, `viem-*.js`, `wagmi-*.js`, `walletconnect-*.js`, `supabase-*.js`, `charts-*.js`, `icons-*.js`, and `index-*.js` chunks instead of one monolithic bundle.
6. Push a one-character whitespace change to App.tsx, deploy, refresh. The `index-*.js` chunk hash should change; the `appkit-*.js` and `viem-*.js` chunk hashes should NOT change (browser cache hit).

### 2026-05-27 — Build 85: Keeper wallet monitor in Admin Panel, margin toggle removed, README updated

**What changed:**

1. **Keeper wallet section in Admin Panel.** The `VeloAdminPanel` now shows a live ETH balance for the keeper wallet (the address derived from `VELO_SPONSOR_PRIVATE_KEY`). Balance reads from chain on every refresh. Color coding: green ≥ 0.02 ETH, orange 0.005–0.02 ETH, red < 0.005 ETH with a "Critical — top up now or keepers stop" warning. Includes a direct link to the Alchemy Base Sepolia faucet and a BaseScan address link. If `VITE_KEEPER_ADDRESS` is not set in Vercel, the panel shows a setup instruction instead of erroring. **Action required: add `VITE_KEEPER_ADDRESS` to Vercel env vars** (run `cast wallet address --private-key $VELO_SPONSOR_PRIVATE_KEY` to derive it).

2. **Margin mode toggle removed from TradeView.** The ISOLATED/CROSS toggle and the static "ISOLATED" label are both gone. All trades are ISOLATED — no UI selection needed. The `marginMode` state variable remains in the component (used for reading existing position types) but has no user-facing control.

3. **README updated.** The V3 contract section now documents the testnet ISOLATED-only policy with a plain-English explanation of why CROSS is architecturally different from Binance/Hyperliquid. The env vars section includes `VITE_KEEPER_ADDRESS` with setup instructions.

**Files changed:**
- `src/components/VeloAdminPanel.tsx` — keeper wallet section added (ETH balance, faucet link, BaseScan link, low-balance warning).
- `src/components/ui/pages/TradeView.tsx` — ISOLATED/CROSS toggle removed entirely.
- `README.md` — V3 cross margin note added; `VITE_KEEPER_ADDRESS` env var documented.
- `PROJECT_STATUS.md` — this entry.

**Action items after deploy:**
1. Add `VITE_KEEPER_ADDRESS=<address>` to Vercel env vars. Derive with: `cast wallet address --private-key $VELO_SPONSOR_PRIVATE_KEY`
2. Redeploy. Check Admin Panel → Keeper wallet section shows a balance.
3. If balance is < 0.02 ETH, top up at https://www.alchemy.com/faucets/base-sepolia

---

### 2026-05-27 — Build 84: ISOLATED-only mode — CROSS disabled, approve fix, trading verified

**Why CROSS was disabled:**

The V3 contract's CROSS margin uses an internal ledger (`crossBalanceUSDC_6[trader]`). Unlike Binance/Hyperliquid where your account balance IS your margin, the Velo V3 contract cannot see your wallet. CROSS requires: approve → depositCross → openPosition (3 transactions to open), and profits return to the ledger not the wallet on close. ISOLATED is the correct UX: wallet → approve → openPosition → profits back to wallet. One confirmation per trade.

**Changes:**
- `veloPerpsService.ts` — `openPosition` now always approves mUSDC before calling the contract. This was the root cause of all trade reverts (`0xf860ca3b`): the contract calls `safeTransferFrom` which requires prior approval. Approves 10× collateral so one approval covers ~10 similar trades. CROSS path removed from `openPosition`.
- `App.tsx` — cross balance pre-flight gate removed. `marginMode` forced to `'ISOLATED'` in all live trading paths.
- `src/components/ui/pages/TradeView.tsx` — ISOLATED/CROSS toggle replaced with static "ISOLATED" label. Cross free balance chip and "Deposit/Manage" button removed.
- `PROJECT_STATUS.md` — this entry.

---

### 2026-05-27 — Build 83: Fix trading reverts — approve + auto cross-deposit, remove cross account UI

**Problems fixed:**

1. **ISOLATED trades always reverted** — The V3 contract calls `USDC.safeTransferFrom(msg.sender, address(this), collateral)` when opening an isolated position. The frontend never called `approve` before `openPosition`. The wallet had mUSDC but the contract had zero allowance → every trade reverted with `0xf860ca3b` (ERC20 insufficient allowance). Fix: `openPosition` in `veloPerpsService.ts` now calls `ensureApproval(collateral)` before the contract write for ISOLATED mode. Approves 10× the collateral so the user doesn't get approval prompts on every single trade.

2. **CROSS trades blocked by "Deposit to cross first" gate** — The frontend checked `crossFreeBalance >= collateral` and showed an error if it wasn't. This forced users to manually manage a separate cross ledger before trading. The V3 contract requires `crossBalanceUSDC_6[trader] >= collateral` when opening in CROSS mode — this is a contract constraint we can't change. Fix: the service now auto-handles this invisibly: checks cross free balance, calculates the shortfall, calls `approve` + `depositCross` to top up the cross ledger from the wallet, then calls `openPosition`. From the user's perspective: you have wallet mUSDC, you click LONG/SHORT, one or two wallet confirmations (approve if needed, deposit if needed, open position), done.

3. **"Cross account has $X free — need $Y. Deposit to cross first" toast** — Both in `executeTrade` and the conditional-order path in `App.tsx`, this gate is removed. Both modes now check only wallet mUSDC balance (`usdcBalance`). The service handles everything else.

4. **"Cross Free Balance" + Deposit/Manage button in the margin toggle panel** — Removed from TradeView. This panel told the user they needed a separate cross account and offered a button to deposit/withdraw. Since the service auto-manages the cross ledger, this UI is confusing and unnecessary.

5. **"Cross Pool Risk" / "Cross Pool" labels in summary rows** — Replaced with the same "Margin Risk" / "Free Balance" labels used for ISOLATED. Both show the same wallet-balance-based numbers. No more fake separate pool concept in the UI.

**How CROSS margin actually works now (from user's perspective):**
- Switch to CROSS mode in the margin toggle
- Set your size and leverage as normal
- Click LONG/SHORT
- Wallet prompts: (1) Approve mUSDC if allowance is too low, (2) DepositCross to top up the cross ledger if needed, (3) OpenPosition — the actual trade
- Done — position opens, cross ledger has collateral locked in it
- When you close, collateral + PnL returns to your wallet

**Why CROSS mode exists at all:**
- ISOLATED: each position is independent. If BTC position loses 90%, it gets liquidated. Your ETH position is unaffected.
- CROSS: all positions share one collateral pool. A winning ETH position offsets a losing BTC position. More capital efficient but one bad trade can drain all your cross collateral.
- For most users on testnet, ISOLATED is safer. CROSS is there for advanced traders.

**Files changed:**
- `src/services/veloPerpsService.ts` — `openPosition` now approves USDC before ISOLATED open; auto-deposits cross shortfall from wallet before CROSS open.
- `src/App.tsx` — CROSS balance gate removed from `executeTrade` and conditional-order path; both now check wallet `usdcBalance` only.
- `src/TradeView.tsx` — Cross Free Balance panel removed from margin toggle area; "Cross Pool Risk"/"Cross Pool" summary rows replaced with "Margin Risk"/"Free Balance".
- `PROJECT_STATUS.md` — this entry.

**New gotchas:**
- The auto-deposit for CROSS means up to 2 extra wallet confirmations before the actual trade (approve + deposit). This is unavoidable given the contract design. Showing a toast like "Approving mUSDC…" and "Funding cross account…" as intermediate steps would be a nice UX improvement in a future build.
- The `ensureApproval` helper approves `collateral × 10` — a large allowance so the user isn't prompted on every trade. This is safe on testnet. On mainnet, consider whether unlimited approval is acceptable to your risk posture; the safer alternative is approving the exact amount each time at the cost of one extra tx.
- The VeloCrossAccountModal and `onOpenCrossAccount` prop still exist in the codebase — they're just no longer surfaced from the main trade panel. Advanced users could still access the modal if a UI entry point is added back. The modal itself remains useful for manually withdrawing excess cross balance.
- Minted 100k mUSDC sent to V3 contract — this is the pool liquidity. Isolated position winners are paid from this pool. The pool shrinks when traders win and grows when traders lose (plus protocol fees). If it goes to zero, profitable close calls revert. Seed it again with another `cast send` call when it runs low.

### 2026-05-27 — Build 82: Remove fake on-chain features, real liquidation math, Supabase V3 migration

**Context:** After completing the V3 full-wiring pass (Build 80), a plain-English audit of which features are genuinely on-chain vs misleading UI was requested. This build removes or corrects every feature that was either using fake/derived data or referencing the old Orderly order-book model that is no longer connected.

**What was removed (fake / not real on-chain):**

1. **Funding Rate chart overlay** — The "Funding Rate" toggle in the chart overlay bar has been removed. The V3 contract has a `fundingIndex` mapping but no `accrueFunding` keeper function is deployed or called; no funding payment ever flows between longs and shorts in the current build. Showing a toggle for it implied something was happening that wasn't. The toggle is gone from the overlay bar and `funding` is removed from the default `overlays` state in TradeView.

2. **Fake CROSS "Buffer" column** — The positions table Buffer column previously showed a "shared pool health" percentage for CROSS positions. This was computed from the Orderly balance (if connected), the total cross notional, and some invented pool PnL math. None of this matched what the V3 contract actually tracks. The CROSS buffer now uses the same formula as ISOLATED: `|(markPrice − liqPrice)| / markPrice × 100`. This is the real on-chain metric — how far the current price is from forced liquidation.

3. **Fake CROSS liq price cell** — The liq price column for CROSS positions previously used a `crossPoolPerNotional` heuristic invented from the same fake pool-health model. Now uses the computed liq price: if `p.liquidationPrice > 0` (set from on-chain sync), that value is used directly; otherwise it's computed from the V3 formula `entry × (1 ± 0.9 / leverage)` (matching the 9000 BPS threshold in the contract). The "POOL" badge that appeared on CROSS buffer cells is also removed — it implied the buffer reflected something about the shared pool, which it didn't.

**What was added (Supabase V3 migration):**

`SUPABASE_MIGRATION_V3.sql` — run this once in the Supabase SQL editor:
- Adds `on_chain_order_id BIGINT` to `open_orders`. This is the contract's `orderId` returned by `placeConditionalOrder`. Without it, there's no way to match a Supabase row to its on-chain order for cancellation or status sync. Previously, the on-chain `orderId` was shown in a toast but never persisted.
- Adds `tx_hash TEXT` to `open_orders`. Stores the placement transaction hash so users can click through to BaseScan.
- Ensures `margin_mode` column exists with a CHECK constraint that accepts both `'ISOLATED'` and `'CROSS'`. Previous migration only set the column, not the constraint.
- Adds an index on `on_chain_order_id` for fast lookup during order-status sync.
- Issues `NOTIFY pgrst, 'reload schema'` so PostgREST picks up new columns immediately.

**Plain-English summary of what IS real on-chain in V3 right now:**

| Feature | On-chain? | Notes |
|---------|-----------|-------|
| Open position (isolated) | ✅ | Collateral sent to contract, position recorded on-chain |
| Open position (cross) | ✅ | Uses cross ledger inside contract |
| Deposit to cross ledger | ✅ | `depositCross` function |
| Withdraw from cross ledger | ✅ | `withdrawCross` function |
| TP / SL triggers | ✅ | Set on-chain, keeper calls `closeIfTriggered` |
| Liquidation | ✅ | Keeper (or anyone) calls `liquidate` when health < 10% |
| LIMIT / STOP conditional orders | ✅ | `placeConditionalOrder` + keeper `executeConditionalOrder` |
| Buffer / liq price display | ✅ | Now computed from real contract formula |
| Funding rate | ❌ | Not implemented in deployed V3. No keeper accrues it. No UI toggle. |
| Insurance fund | ❌ | No separate fund. Protocol fees accumulate in `feeBalance`. Losses capped at collateral. |
| Funding Rate chart overlay | ❌ removed | Was showing nothing; now hidden entirely |

**Files changed:**
- `src/TradeView.tsx` — Funding Rate overlay toggle removed; CROSS buffer + liq price now use real per-position math; fake pool-health variables deleted; "POOL" badge removed from buffer cell.
- `SUPABASE_MIGRATION_V3.sql` — new file (run in Supabase SQL editor).
- `PROJECT_STATUS.md` — this entry.

**What Stan needs to do after this deploy:**
1. Run `SUPABASE_MIGRATION_V3.sql` in the Supabase SQL editor (Project → SQL Editor → New query → paste → Run).
2. Verify Vercel has `VITE_VELO_PERPS_V3_ADDRESS=0x3780e858B76027E6D6cB0c74E863f712a0F0E27E` set (from Build 80 instructions).
3. Redeploy. No code changes to App.tsx needed for this build — only TradeView.tsx changed.
4. After deploy: open a CROSS position, check the Buffer column shows a real percentage (not "POOL" badge), and the liq price shows a real price (not "—").

**New gotchas:**
- The `on_chain_order_id` column is nullable. Old rows (off-chain orders, or orders placed before this migration) will have `NULL` there — that's correct and expected. Code that cancels on-chain orders should check `on_chain_order_id IS NOT NULL` before trying to call the V3 `cancelConditionalOrder` function.
- Funding rate display may be requested again by investors. The correct path is: (a) deploy a keeper that reads `fundingIndex` from V3, computes the annualised rate, and stores it in Supabase; (b) read from Supabase in the UI. Do NOT show a fake static number. It's better to not show it than to mislead.
- The computed liq price formula (`entry × (1 ± 0.9 / leverage)`) matches the V3 contract's `LIQUIDATION_THRESHOLD_BPS = 9000` constant. If this constant is ever changed in a future contract version, the formula must be updated too. Check `contracts/VeloPerpsV3.sol` if liq prices look wrong after a contract upgrade.
- If a CROSS position has `p.liquidationPrice > 0` from on-chain sync, that value takes precedence over the formula. The formula is only a fallback for positions synced from the old V2 path (which didn't populate `liquidationPrice` for cross). Over time, all positions will have the real value and the formula fallback becomes irrelevant.

### 2026-05-27 — Build 81: Close modal, TP/SL improvements, price source label

**Problems fixed (from user-reported issues on production):**

1. **Close button fired immediately without letting user choose how much to close.** For V2 on-chain positions, `handleClosePosition` now intercepts the click and opens `VeloManagePositionModal` at the "Close %" tab instead of immediately submitting a full close. The user sees the full slider (1–100%), preset buttons (10/20/25/50/75/100%), an estimated PnL preview on the portion being closed, and a clearly-labeled submit button ("Close 25% of position" vs "Close full position" in red). The old one-click-instant-close path is preserved for non-V2/non-on-chain positions.

2. **TP/SL values didn't reflect on the position row visually.** The TP/SL column in the positions table was rendering gray `–/–` even when triggers were set. Now renders TP price in green (`var(--pnl-up)`) and SL price in red (`var(--pnl-down)`) with `$` prefix. Both TradeView and Dashboard position tables updated.

3. **Clicking the TP/SL edit icon opened the manage modal at "Add" tab, not "TP/SL" tab.** All edit icon buttons in the positions table (TradeView desktop table, Dashboard active positions table) now call `onEditPosition(p, 'TRIGGERS')` which opens the modal directly on the TP/SL tab. `handleEditPosition` signature extended with optional `initialTab` param. Mobile "Edit TP/SL" button similarly updated.

4. **When re-opening TP/SL modal, previous values didn't pre-fill.** This was already working in the modal's `useEffect` (reads `position.takeProfit`/`position.stopLoss`). Added a new "ACTIVE ON-CHAIN TRIGGERS" summary panel above the save button so users can clearly see what's currently set on-chain before overwriting.

5. **TP/SL had no partial-close % option — triggers always closed 100% of the position.** The TRIGGERS tab now shows a partial-close selector (slider + 25/50/75/100% presets, with "remaining X% stays open" note) that appears when either a TP or SL price is set. This is UI-only for now — the `setTriggers` contract function only accepts two price params. Full on-chain support requires a new contract function `setTriggersWithFraction(tradeId, tp, sl, tpBps, slBps)` and keeper update to call `partialClose` instead of `closePosition` when the trigger fraction < 10000 bps.

6. **Price display said "Perp" but the displayed price is from Binance, not the Pyth oracle used for execution.** Added `· Binance` label with tooltip on both price displays in TradeView (mobile header and desktop right panel). Tooltip: "Display price from Binance spot feed. Trade executions use Pyth oracle price, which may differ slightly." This explains the ~$1–2 discrepancy users observe between the displayed price and their fill price.

7. **PARTIAL close tab: slider defaulted to 50%, range label was sparse.** Changed default `closePct` to 100% (matching the previous one-click-close expectation). Range ticks updated to show 1%/25%/50%/75%/100%. Added estimated PnL preview for the closed portion.

**Files changed:**
- `src/App.tsx` — `managingPositionTab` state added; `handleClosePosition` intercepts V2 positions and opens modal at PARTIAL tab; `handleEditPosition` extended with `initialTab` param; `VeloManagePositionModal` mount passes `initialTab={managingPositionTab}` and resets tab on close.
- `src/components/VeloManagePositionModal.tsx` — `initialTab` prop added; PARTIAL tab defaults to 100%, improved range ticks and PnL preview, "Close full position" label in red; TRIGGERS tab gains per-trigger partial-close % selectors with sliders and presets, active triggers summary panel, improved quick-pick button layout.
- `src/components/ui/pages/TradeView.tsx` — TP/SL column renders colored prices (green/red); edit icon opens at TRIGGERS tab; mobile Edit TP/SL button opens at TRIGGERS tab; price label updated from "Perp" to "Binance" with tooltip.
- `src/components/ui/pages/Dashboard.tsx` — TP/SL column renders colored prices; edit icon opens at TRIGGERS tab.
- `PROJECT_STATUS.md` — this entry.

**New gotchas:**
- The partial-close % on TP/SL triggers (Issue 5) is currently stored only in React state — it is NOT sent to the contract. `setTriggers(tradeId, tp, sl)` only takes two prices. The UI shows the option to set expectations and prepare for the contract upgrade, but the keeper will always call full `closeIfTriggered` (100% close) until the contract and keeper are updated. Don't ship this as "partial TP/SL works on-chain" — it doesn't yet.
- `handleClosePosition` only intercepts V2 on-chain positions (those with `p.onChainTradeId` set). Legacy/demo positions still close immediately with no modal. If a position is `onChain: true` but `onChainTradeId` is somehow undefined (the Build 80 gotcha), it falls through to the legacy path. The Build 80 fix (populating `onChainTradeId` during sync) is required for this to work correctly.
- The `managingPositionTab` state is reset to `'ADD'` when the modal closes. This means if a user opens the close modal, cancels, and then clicks the edit TP/SL icon, they correctly land on the TRIGGERS tab. No stale-tab bug.
- `Submit` component in `VeloManagePositionModal` now accepts an optional `color?: 'red'` prop. Only PARTIAL at 100% passes this. If you add more "destructive" actions, pass `color="red"` to make the intent clear.

**Verification:**
- `npx tsc --noEmit --skipLibCheck` passes with 0 new errors.
- Build environment blocked from running `vite build` due to `pkg.pr.new` network restriction (a transitive dependency fetch). Build integrity confirmed via TS check and manual diff review. Stan should run `npx vite build` locally or let Vercel build to confirm.
- Manual test plan: (1) Open any V2 LONG position. (2) Click "Close" — should open manage modal at "Close %" tab, NOT immediately close. (3) Drag slider to 50%, see PnL preview update. (4) Click "Close 50% of position". (5) Check position row still shows remaining 50%. (6) Click the edit (pencil) icon in TP/SL column — should open modal at TP/SL tab. (7) Set TP using +50% quick-pick, observe green partial-close selector appear at 100%. (8) Drag TP partial-close to 50%, note "remaining 50% stays open" label. (9) Save — verify TP price shows green on position row. (10) Click edit again — TP value pre-fills from on-chain. (11) Check price label in right panel says "Binance" not "Perp".
