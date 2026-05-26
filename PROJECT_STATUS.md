# Velo Trading Terminal — Project Status

> **For any AI agent picking this up:** read this entire document before making changes. The "Known traps & gotchas" section at the bottom will save you hours.
>
> **For NotebookLM / context hand-off:** this is the authoritative state document. Lower-level details live in `README.md` and `MIGRATION_STATUS.md`.

**Last updated:** May 26, 2026 — End of Phase 8 + VELO v3 rebrand pass
**Live URL:** https://velo-trading-terminal.vercel.app
**Repo:** https://github.com/stanisnear/velo-trading-terminal
**Owner:** Stan (@stanisnear)
**Stage:** Testnet on Base Sepolia, pre-funding

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

### V2 — currently live (primary trading venue)

| Contract | Address |
|----------|---------|
| **VeloPerps V2** | `0x8D4b792137252D79FB3Ae953AA619fA57101665f` |
| **VeloMockUSDC** | `0x5EFaF3F69b09bC2abF3439bDC0C93bf611026699` |
| **VeloRegistry** | `0x7e510d615a8afDfaa324F790F3E54e520756ECe2` |
| **Pyth oracle** | `0xA2aa501b19aff244D90cc15a4Cf739D2725B5729` (Pyth's, not ours) |
| **LayerZero Endpoint V2** | `0x6EDCE65403992e310A62460808c4b910D972f10f` (LZ's, not ours) |

**V2 contract status:** Live, all 17 pairs registered (BTC, ETH, SOL, AVAX, LINK, DOGE, NEAR, INJ, APT, ARB, OP, SUI, TIA, SEI, RENDER, WLFI, POL). `version()` returns 2. Verified via `cast code`. **Pool needs continuous seeding** as users open positions — use the admin panel.

**BaseScan source verification:** NOT YET DONE. The CLI verification fails because BaseScan deprecated Etherscan V1 API. Use the web UI at https://sepolia.basescan.org/verifyContract?a=0x8D4b792137252D79FB3Ae953AA619fA57101665f with Compiler Type "Solidity (Standard-Json-Input)" and upload `contracts/out/VeloPerpsV2.sol/VeloPerpsV2.json`. Constructor args (no 0x prefix):
```
0000000000000000000000005efaf3f69b09bc2abf3439bdc0c93bf611026699000000000000000000000000a2aa501b19aff244d90cc15a4cf739d2725b57290000000000000000000000008f8ff5a29760278c7b54d450da57a13cd3fd3a8b
```

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

### What V2 does NOT add (and why — not bolt-on changes)

- **Cross margin** — needs shared collateral pool, portfolio equity, multi-position liquidation cascade → V3
- **On-chain limit orders** — needs separate OrderBook contract + keeper → V3
- **Funding rate** — needs OI tracking + accrual per pair → v2.5
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
| `VITE_VELO_PERPS_V2_ADDRESS` | **YES** | `0x8D4b792137252D79FB3Ae953AA619fA57101665f` | Routes trades to V2 |
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

- [ ] **Cross margin V3 contract** — shared collateral pool, portfolio equity
- [ ] **OrderBook contract** for real on-chain limit/stop orders
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
