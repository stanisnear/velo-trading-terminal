# Velo Trading Terminal — Project Status

> Single source of truth for the project's current state, deployed contracts, known issues, recent fixes, and what's left before a funding proposal.
>
> **Last updated:** Phase 8 + post-deploy fixes (build #78)
> **Live URL:** https://velo-trading-terminal.vercel.app
> **Repo:** https://github.com/stanisnear/velo-trading-terminal
> **Owner:** Stan (@stanisnear)

If you're an AI agent picking this up, read this entire document before changing anything. The "Known traps" section in particular will save you hours.

---

## TL;DR

Velo is a SocialFi-native perpetual futures trading terminal on Base Sepolia testnet. Users open leveraged BTC/ETH/SOL/etc. positions priced by Pyth oracles, with all trades settled on-chain. The "SocialFi" part means traders have on-chain @handles, can send mUSDC peer-to-peer, share branded trade cards, and post to a social feed.

### Stack at a glance

- **Frontend:** React 19, Vite 6, TypeScript 5.8, wagmi v2, RainbowKit
- **Backend:** Supabase (auth, social feed, notifications)
- **On-chain:** Solidity 0.8.22, Foundry, deployed to Base Sepolia
- **Oracle:** Pyth Hermes (live price feeds)
- **Bridging:** LayerZero V2 OFT (mUSDC across 4 testnets)
- **Hosting:** Vercel (frontend) + GitHub Actions (keepers)

---

## Deployed contracts (Base Sepolia, chain ID 84532)

### V1 — currently live and serving traffic

| Contract | Address | Status |
|----------|---------|--------|
| **VeloPerps V1** | `0x28fE36d4ae72ab0E05fa6edafE1D6e11E9DD6163` | Live, 6 pairs registered, ~101k mUSDC pool |
| **VeloMockUSDC** | `0x5EFaF3F69b09bC2abF3439bDC0C93bf611026699` | Live, ERC-20 + LayerZero OFT |
| **VeloRegistry** | `0x7e510d615a8afDfaa324F790F3E54e520756ECe2` | Live, on-chain @handles |
| **Pyth oracle** | `0xA2aa501b19aff244D90cc15a4Cf739D2725B5729` | Pyth's, not ours |
| **LayerZero Endpoint V2** | `0x6EDCE65403992e310A62460808c4b910D972f10f` | LayerZero's, not ours |

**Owner address (controls all admin functions on V1, mUSDC, Registry):**
`0x8f8fF5A29760278C7B54D450dA57A13Cd3FD3A8b`

This is the deployer key. Your main MetaMask wallet (`0x4F3e55D85...`) is **not the owner**. To use the admin panel you either need to connect with the deployer key, or call `transferOwnership(0x4F3e55D85...)` on each contract.

**Pairs registered on V1:** 0=BTC, 1=ETH, 2=SOL, 3=AVAX, 4=LINK, 5=DOGE (the first 6 — pairs 6-16 are NOT registered on V1).

### Cross-chain mUSDC OFT (LayerZero V2)

| Chain | Address |
|-------|---------|
| Arbitrum Sepolia | `0xEC76fD9182ba15ff193FDBc122013FCa18900290` |
| Optimism Sepolia | `0xEC76fD9182ba15ff193FDBc122013FCa18900290` |
| Ethereum Sepolia | `0x96d0CF69896FE6b5B031D21967f027d95Eb42e9A` |

### V2 — written, tested, NOT YET DEPLOYED

`contracts/src/VeloPerpsV2.sol` exists in the repo and passes all 12 forge tests, but **has not been deployed to Base Sepolia**. A previous deploy attempt printed an address (`0x3C7cBCa2C675F1f788148aaD08eceab262298de8`) but the transaction reverted due to a broken `try this.seedPool()` block at the end of the script — that revert rolled back the entire transaction including contract creation. The script has now been fixed (seedPool removed). To actually deploy V2, see the **"Deploy V2 (when ready)"** section below.

---

## What V2 adds over V1

V1 only has: open position, close position, liquidate. That's it.

V2 adds five real on-chain features V1 lacks:

1. **`increaseCollateral(tradeId, amount)`** — add margin to an open position. Reduces liquidation risk, lowers effective leverage. Position size stays the same.
2. **`decreaseCollateral(tradeId, amount, pythUpdate)`** — withdraw collateral. Contract enforces that effective leverage stays ≤ 25× AND that the position isn't liquidatable at current mark price.
3. **`partialClose(tradeId, fractionBps, pythUpdate)`** — close any fraction (1bp to 10000bps) of a position. PnL on the closed portion is realised immediately; the rest keeps its entry price.
4. **`setTriggers(tradeId, takeProfit, stopLoss)`** — write TP/SL prices to the contract storage. Pass 0 to clear either. Direction is enforced on-chain (TP > entry for longs, opposite for shorts).
5. **`closeIfTriggered(tradeId, pythUpdate)`** — **permissionless** close. Anyone can call it; the contract verifies the trigger has actually been crossed and pays a 0.25% keeper bounty (KEEPER_BOUNTY_BPS) to whoever called it. This is what makes the TP/SL keeper self-funding.

Plus a few quality-of-life additions: `version()` returns 2 (frontend uses this for routing), `effectiveLeverage(tradeId)` returns the current leverage given the live collateral, and `originalNotional_6` is stored at open so leverage math stays consistent after add/reduce margin.

### What V2 does NOT add (and the honest reasons)

- **Cross margin** — different architectural design (shared collateral pool, portfolio equity calc, multi-position liquidation cascade). Will require V3.
- **On-chain limit orders** — needs a separate OrderBook contract with its own keeper. Currently we have demo-only client-side limit orders that don't persist.
- **Funding rate** — needs OI tracking + accrual mechanism per pair. v2.5 mainnet feature.
- **Insurance fund** — needs a separate vault + drawdown logic for ADL events. v2.5.

These are NOT bolt-on changes — pretending otherwise just creates broken code.

---

## Frontend architecture

### Two-wallet model

- **Main wallet** (MetaMask) — what the user signs in with. Holds the user's identity, used once to derive the trading wallet, and used to send mUSDC out via the Send modal.
- **Velo Trading Wallet** (a.k.a. "burner") — derived deterministically from the user's first signature on first login. Private key stored in localStorage. Used to sign every trade silently (no popup per trade). Auto-funded with ETH for gas by the sponsor server.

The two-wallet model is what makes the UX feel like web2 — once the user does the one-time signature, they trade like Hyperliquid: tap → confirm → done, no popups.

### Auto-gas sponsorship

The burner wallet starts with no ETH. The `/api/sponsor-eth` Vercel route uses the `VELO_SPONSOR_PRIVATE_KEY` env var to send 0.005 ETH to any burner that's below 0.0015 ETH. This is called automatically before every gas-using action:

- Open position
- Close position
- Add margin / reduce margin / partial close / set triggers (V2-only)
- Username claim
- Send mUSDC
- Withdraw mUSDC

All gas pre-flights now route through `src/services/veloGasSponsor.ts` for consistency. The function `ensureBurnerGas(publicClient, burnerAddress)` is the single entry point.

### File map

```
src/
├─ App.tsx                              ~7350-line monolith, being incrementally decomposed
├─ components/
│  ├─ VeloAdminPanel.tsx                Owner-only panel: register pairs, withdraw fees, mint mUSDC
│  ├─ VeloBridgeModal.tsx               LayerZero V2 OFT bridge across 4 testnets
│  ├─ VeloManagePositionModal.tsx       V2: add/reduce margin, partial close, set TP/SL
│  ├─ VeloSendModal.tsx                 Peer-to-peer mUSDC by @handle or 0x
│  ├─ VeloShareCard.tsx                 Branded PNG share card (1200×675) for closed/open positions
│  ├─ VeloUsernameModal.tsx             @handle claim with on-chain cooldown awareness
│  ├─ VeloWelcomeModal.tsx              One-signature onboarding
│  └─ VeloWithdrawModal.tsx             Trading wallet → main wallet / custom 0x
├─ services/
│  ├─ veloGasSponsor.ts                 Centralized gas pre-flight
│  ├─ veloPerpsService.ts               V1/V2 dual address routing, ABI, openPosition, closePosition, etc.
│  ├─ useVeloPerpsTrading.ts            React hook wrapping all on-chain actions
│  ├─ veloBurnerWallet.ts               Burner derive + persist
│  ├─ veloBurnerSetup.ts                Burner state machine for onboarding
│  ├─ veloUsdcService.ts                ERC-20 helpers (transfer, approve, mint)
│  ├─ pythService.ts                    Hermes price update fetching
│  ├─ usernameService.ts                Registry reads/writes
│  ├─ bridgeService.ts                  LayerZero quote + bridge
│  └─ supabaseStore.ts                  Social feed, notifications, leaderboard, profiles
├─ api/                                 Vercel serverless functions
│  ├─ sponsor-eth.ts                    Gas sponsor (POST { burnerAddress })
│  ├─ cron-liquidate.ts                 Liquidation keeper (every 5m via GitHub Actions)
│  ├─ cron-tp-sl.ts                     TP/SL keeper for V2 (waits for V2 deploy)
│  └─ protocol-stats.ts                 JSON stats for admin dashboard
contracts/
├─ src/
│  ├─ VeloPerps.sol                     V1 (deployed)
│  ├─ VeloPerpsV2.sol                   V2 (tested, NOT deployed)
│  ├─ VeloMockUSDC.sol                  Testnet ERC-20 + LayerZero OFT
│  ├─ VeloRegistry.sol                  On-chain @handles, 30-day change cooldown
│  └─ libraries/PerpsMath.sol           PnL math, Pyth normalisation
├─ test/                                Foundry tests (V1 + V2)
└─ script/                              Deploy scripts for all 4 chains
```

---

## Vercel environment variables

These need to be set in **Vercel project → Settings → Environment Variables** for production:

| Variable | Required? | Current value | Purpose |
|----------|-----------|---------------|---------|
| `VITE_VELO_PERPS_ADDRESS` | Optional | unset (defaults to V1) | Override the V1 contract address |
| `VITE_VELO_PERPS_V2_ADDRESS` | Optional | **MUST be UNSET or empty** until V2 is actually deployed | Routes trades to V2 when set to a valid 42-char address |
| `VITE_VELO_USDC_BASE` | Optional | unset (defaults to live mUSDC) | Override mUSDC address |
| `VITE_BASE_SEPOLIA_RPC_URL` | Recommended | (any working RPC) | Override the public RPC |
| `VITE_PYTH_HERMES_URL` | Optional | defaults to `https://hermes.pyth.network` | Pyth Hermes endpoint |
| `VITE_SUPABASE_URL` | **Required** | your Supabase project URL | Database connection |
| `VITE_SUPABASE_ANON_KEY` | **Required** | your Supabase anon key | Database auth |
| `VELO_SPONSOR_PRIVATE_KEY` | **Required** | the sponsor wallet private key | Server-side, used by `/api/sponsor-eth` to top up burners |

### ⚠️ CRITICAL: about `VITE_VELO_PERPS_V2_ADDRESS`

A previous Claude conversation set this to `0x3C7cBCa2C675F1f788148aaD08eceab262298de8` thinking V2 was deployed. **That address has no contract on Base Sepolia** (verified via `cast code` returning `0x`). With that env var set, the frontend routes every trade to a non-existent contract → `pairFeedId returned no data ("0x")` error.

**Make sure this env var is unset or empty in Vercel until V2 is actually deployed.** Without it, the frontend correctly falls back to V1 which is fully functional.

---

## Known issues and recent fixes

### Issue: Username claim showed cryptic `0x5a66c00a` hex error

**Root cause:** A previous code change incorrectly mapped selector `0x5a66c00a` to `UsernameTaken()`. The real selector for UsernameTaken is `0x6bc324ad`. `0x5a66c00a` is actually `ChangeCooldownActive(uint256)` — meaning the user already claimed a handle and there's a 30-day cooldown.

**Fix shipped:** All three registry error selectors now correctly mapped. The modal also reads `nextChangeAllowed(address)` from the registry on open, shows a yellow banner "You claimed @xyz recently. Try again in ~N days", and disables the claim button while on cooldown.

### Issue: Order failed with `pairFeedId returned no data ("0x")`

**Root cause:** Frontend was routing to the phantom V2 address (see CRITICAL note above).

**Fix shipped:** Removed the hardcoded V2 fallback in `veloPerpsService.ts`. The frontend now only routes to V2 if `VITE_VELO_PERPS_V2_ADDRESS` is explicitly set to a valid 42-character address. Default fallback is V1.

**User action required:** Remove `VITE_VELO_PERPS_V2_ADDRESS` from Vercel env vars OR set it to empty string, then redeploy.

### Issue: Admin tab not appearing despite being "logged in as admin"

**Root cause:** The user's main MetaMask wallet (`0x4F3e55D85...`) is NOT the contract owner. The contract owner is `0x8f8fF5A29760278C7B54D450dA57A13Cd3FD3A8b` (the original deployer key). The admin tab correctly hides for non-owners.

**Fix path (pick one):**
- Connect MetaMask with the deployer private key (testnet, so acceptable)
- OR run `cast send <contract> "transferOwnership(address)" 0x4F3e55D85... --rpc-url ... --private-key <deployer>` on V1, mUSDC, and Registry to move admin rights to the main wallet

### Issue: Trading wallet runs out of ETH for gas

**Root cause:** Only `openPosition` had pre-flight gas top-up. Every other tx (username claim, send, close, V2 actions) hit "exceeds the balance" cryptic reverts when the burner ran out.

**Fix shipped:** New module `src/services/veloGasSponsor.ts` with `ensureBurnerGas()` helper. Now called by:
- `useVeloPerpsTrading.openPosition`
- `useVeloPerpsTrading.closePosition`
- `useVeloPerpsTrading.addMargin / reduceMargin / partialClose / setTriggers` (V2-only)
- `VeloUsernameModal.handleClaim`
- `VeloSendModal.handleSend`
- `VeloWithdrawModal.handleWithdraw`

### Issue: Social posts not visible to new users

**Root cause:** Posts were only fetched inside the logged-in session restore block, so anonymous browsers and brand-new accounts saw an empty feed.

**Fix shipped:** Added a public post-fetch effect that runs when the Social tab opens, regardless of auth state, if posts haven't been loaded yet.

**Possible second cause:** Supabase RLS policies on the `posts` table. The schema in `SUPABASE_SCHEMA.sql` says `FOR SELECT USING (true)` which is public read. If your live Supabase has stricter policies, re-run lines 90-96 of `SUPABASE_SCHEMA.sql` in the Supabase SQL editor. Symptom: a brand-new user logs in, sees nothing, but the same posts appear when an existing author logs in (RLS scoped to author).

### Issue: Send/receive notifications missing

**Root cause:** `VeloSendModal` had no callback path to write notification rows.

**Fix shipped:** Modal now exposes an `onSuccess({txHash, recipientAddress, recipientHandle, amount})` callback. `App.tsx` wires it to (1) toast the sender, (2) write a `TRANSFER_SENT` row to the sender's `notifications` table, (3) if the recipient is a Velo @user, look up their profile.id and write a `TRANSFER_RECEIVED` row. Realtime subscription on the notifications table makes both appear instantly.

---

## Deploy V2 (when ready)

The V2 contract is written, tested, and the deploy script is now fixed. To actually deploy:

```bash
cd ~/Downloads/velo/contracts
source .env  # loads PRIVATE_KEY and BASE_SEPOLIA_RPC_URL

# Run all 12 V2 tests first to confirm nothing's broken
forge test --match-path "test/VeloPerpsV2.t.sol" -v
# Expect: 12 passed; 0 failed

# Deploy
forge script script/DeployVeloPerpsV2.s.sol \
  --rpc-url $BASE_SEPOLIA_RPC_URL \
  --broadcast \
  --verify \
  --private-key $PRIVATE_KEY

# Note the "VeloPerpsV2:" address printed at the end. Save it.
```

The script registers all 17 pairs in one batch. It does NOT seed the pool because Foundry script mode can't do `address(this).seedPool()` (that's what broke the previous deploy). Seed manually:

```bash
# Send mUSDC from deployer to the new V2 contract
cast send 0x5EFaF3F69b09bC2abF3439bDC0C93bf611026699 \
  "transfer(address,uint256)" \
  <V2_ADDRESS> <amount_with_6_decimals> \
  --rpc-url $BASE_SEPOLIA_RPC_URL \
  --private-key $PRIVATE_KEY
```

Then in Vercel:
1. Settings → Environment Variables
2. Set `VITE_VELO_PERPS_V2_ADDRESS = <V2_ADDRESS>`
3. Deployments → Redeploy

The frontend auto-routes to V2 on the next page load.

---

## What's left before a funding proposal

Below is a prioritised list of what would make this a credible v1 launch.

### Critical (must-have for any pitch)

- [ ] **Deploy V2 properly** (see above) so add margin / reduce / partial close / on-chain TP/SL all work
- [ ] **Run the supabase RLS fix** (lines 49-141 of `SUPABASE_SCHEMA.sql`) on the live database
- [ ] **Transfer V1 + mUSDC + Registry ownership** to the main wallet so the admin panel works without juggling keys
- [ ] **End-to-end smoke test on production:** create a fresh account, claim a handle, deposit, open a trade, close it, share the card, send mUSDC to another @user, all without dev tools open
- [ ] **Mobile UX pass** — verify the manage modal, share card, and send modal all work on iPhone Safari (screenshot evidence shows iOS is the primary use case)

### Quality-of-life (strongly desired)

- [ ] Admin panel **V2 awareness** — show the V2 address, version, pool reserves, and a "Mint to faucet" button so admins can seed without `cast`
- [ ] **Liquidity dashboard** publicly visible — current TVL, biggest trades, leaderboard wins (great for a pitch deck)
- [ ] **Onboarding tutorial** — a 3-step coach mark explaining the dual-wallet model (the #1 thing users get confused by)
- [ ] **Position health indicators** — color-coded liquidation distance in the open positions table
- [ ] **Funding rate display** (even faked for now, marked as "v2.5") — investors expect to see it

### Architecture (multi-week)

- [ ] **Cross margin V3 contract** — shared collateral pool, portfolio equity
- [ ] **OrderBook contract** for real on-chain limit/stop orders
- [ ] **Insurance fund + ADL** — required for any real-money launch
- [ ] **Multisig ownership transfer** — single-key admin doesn't pass any due diligence
- [ ] **Smart contract audit** — Code4rena, Sherlock, or one of the boutique firms

### Polish for the deck

- [ ] One-page architecture diagram showing burner ↔ MetaMask ↔ contracts ↔ keepers ↔ Pyth
- [ ] Demo video (60 seconds) — sign up, claim handle, open trade, share card to Twitter
- [ ] Roadmap slide showing v1 (now), v2 (V2 deployed), v3 (cross margin), mainnet (audited)
- [ ] Pricing model — Velo earns 0.1% open + 0.1% close fees. Project these on assumed volume

---

## Useful cast commands

Quick reference for interacting with deployed contracts:

```bash
# Set in your shell once
export RPC=https://base-sepolia-rpc.publicnode.com
export V1=0x28fE36d4ae72ab0E05fa6edafE1D6e11E9DD6163
export MUSDC=0x5EFaF3F69b09bC2abF3439bDC0C93bf611026699
export REGISTRY=0x7e510d615a8afDfaa324F790F3E54e520756ECe2
export OWNER=0x8f8fF5A29760278C7B54D450dA57A13Cd3FD3A8b

# Check V1 pool balance (in 6-decimal mUSDC; divide by 1e6)
cast call $MUSDC "balanceOf(address)(uint256)" $V1 --rpc-url $RPC

# Check pair registration on V1 (returns 32-byte feed ID or all zeros)
cast call $V1 "pairFeedId(uint16)(bytes32)" 0 --rpc-url $RPC

# Check who owns V1 (should be the deployer wallet)
cast call $V1 "owner()(address)" --rpc-url $RPC

# Check accumulated fees on V1
cast call $V1 "feeBalance()(uint256)" --rpc-url $RPC

# Resolve an @handle to an address
cast call $REGISTRY "resolve(string)(address)" "stan" --rpc-url $RPC

# Look up someone's handle
cast call $REGISTRY "usernameOf(address)(string)" 0x... --rpc-url $RPC

# Check when an address can next change their handle (unix seconds, 0 = never claimed)
cast call $REGISTRY "nextChangeAllowed(address)(uint256)" $OWNER --rpc-url $RPC

# Mint 1000 mUSDC from the faucet to whatever wallet called it (6-hour cooldown)
cast send $MUSDC "mint()" --rpc-url $RPC --private-key $PRIVATE_KEY

# Send mUSDC anywhere
cast send $MUSDC "transfer(address,uint256)" <to> <amount_6dec> \
  --rpc-url $RPC --private-key $PRIVATE_KEY

# Transfer V1 ownership (one-way!)
cast send $V1 "transferOwnership(address)" <newOwner> \
  --rpc-url $RPC --private-key $PRIVATE_KEY
```

---

## Known traps

Things that have burned previous sessions:

1. **Pyth feed IDs are chain-independent.** All 17 are listed in `DeployVeloPerpsV2.s.sol`. Don't try to "look them up per chain" — they're the same hash everywhere.

2. **VeloMockUSDC inherits from LayerZero's OFT.** When running `forge test` you must install LayerZero deps OR use `--match-path "test/VeloPerpsV2.t.sol"` to skip mUSDC compilation. Without LayerZero deps installed, you'll see "Source `lib/devtools/packages/oft-evm/contracts/OFT.sol` not found".

3. **Foundry script mode forbids `this.method()` calls.** Don't put `try this.seedPool() {} catch {}` blocks in scripts — Foundry reverts the entire tx including contract creation. The previous V2 deploy failed because of this.

4. **Solidity 0.8.22 throws an unsigned arithmetic error on `int256` subtraction.** Be careful in PerpsMath when mixing signed/unsigned types.

5. **The burner wallet keys are stored in localStorage.** If a user clears site data, their burner is lost forever — funds in the burner are recoverable via the displayed mnemonic but trades are not.

6. **Supabase RLS is enforced by default on new tables.** If you add a table and forget the SELECT policy, no client can read it. Symptom: app appears to work for the author but is empty for everyone else.

7. **The TP/SL keeper costs the sponsor wallet 0.001 ETH per Pyth update.** Multiply by frequency × pairs to budget gas.

8. **`forge install --no-commit` is no longer a valid flag in newer Foundry.** Use `forge install <repo>` and it will commit if the repo is a git repo, or just clone if not.

9. **Network blocked downloads in dev sandboxes.** `forge install` calling github can fail behind corporate proxies. Foundry has a `--no-git` option in newer versions, OR clone manually into `contracts/lib/`.

10. **Vercel doesn't redeploy on env var change alone.** Setting an env var requires manually triggering a redeploy from the Deployments tab.

---

## Contact / handoff

- **GitHub:** stanisnear/velo-trading-terminal
- **Vercel project name:** (whatever Stan's account uses)
- **Supabase project:** `btgfoekgvyvdflzjfehz.supabase.co`
- **Owner private key:** in Stan's local `.env` (NOT committed)
- **Sponsor private key:** set as Vercel env var `VELO_SPONSOR_PRIVATE_KEY`

If you're an AI agent and need a context document for NotebookLM or similar, **this file is intended for that purpose**. It's authoritative as of the date at the top. Lower-level details live in `README.md` and `MIGRATION_STATUS.md`.
