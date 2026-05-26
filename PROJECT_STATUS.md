# Velo Trading Terminal — Project Status

> **For any AI agent picking this up:** read this entire document before making changes. The "Known traps & gotchas" section at the bottom will save you hours.
>
> **For NotebookLM / context hand-off:** this is the authoritative state document. Lower-level details live in `README.md` and `MIGRATION_STATUS.md`.

**Last updated:** End of Phase 8 + post-deploy fixes batch 4 (~build #80)
**Live URL:** https://velo-trading-terminal.vercel.app
**Repo:** https://github.com/stanisnear/velo-trading-terminal
**Owner:** Stan (@stanisnear)
**Stage:** Testnet on Base Sepolia, pre-funding

---

## What Velo is

A SocialFi-native perpetual futures trading terminal. Users open leveraged BTC/ETH/SOL/etc. positions priced by Pyth oracles, all settled on-chain via custom Solidity contracts. The "SocialFi" layer means traders have on-chain @handles registered to a registry contract, send mUSDC peer-to-peer by handle, share branded PnL cards (Hyperliquid-style), and post to a social feed.

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
5. `SUPABASE_MIGRATION_TX_COUNTERPARTY.sql` — **NEW (batch 3):** adds counterparty column for SEND/RECEIVE rows

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

- **Orders disappearing on refresh** — likely Supabase RLS or column mismatch. After deploying the latest batch, open browser devtools console and try a trade. The `console.warn` will show the real Supabase error. Most likely fix: verify the user is fully authenticated to Supabase (not just wallet-connected) and run the migrations listed above.
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

15. **The PROJECT_STATUS.md (this file) is THE source of truth.** Any AI agent picking up work should read this first.

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
