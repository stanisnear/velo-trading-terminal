# Velo contracts

Solidity contracts for Velo, built and tested with [Foundry](https://book.getfoundry.sh). Deployed on **Base Sepolia (chain ID 84532)** as a testnet. They are **not independently audited** and must not hold real funds.

| Contract | Address (Base Sepolia) | Purpose |
| --- | --- | --- |
| `VeloPerpsV4` | `0xE9AEcFbc5814ce3b2dB0107594d80F054e6dB52f` | Active isolated trading engine; segregated escrow and fully reserved gross-profit cap |
| `VeloPerpsV3_1` | `0x41fDb544D7247a5ddc6B4C06F29D09f2b20de907` | Legacy exits, order cancellation and free cross-balance withdrawals only; not the active engine |
| `VeloMockUSDC` | `0x5EFaF3F69b09bC2abF3439bDC0C93bf611026699` | 6-decimal test collateral with a faucet, bridgeable with LayerZero OFT. No real USDC backing |
| `VeloRegistry` | `0x7e510d615a8afDfaa324F790F3E54e520756ECe2` | Username to wallet mapping |
| Pyth | `0xA2aa501b19aff244D90cc15a4Cf739D2725B5729` | Signed price-update verification |

All deployed addresses, including earlier versions, are in [`deployments/base_sepolia.json`](deployments/base_sepolia.json). `src/VeloPerpsV3.sol` is the previous version and is kept for reference.

**Reviewed 21 October 2026.** V4 source is verified on [BaseScan](https://sepolia.basescan.org/address/0xE9AEcFbc5814ce3b2dB0107594d80F054e6dB52f#code) and exact-match verified on [Sourcify](https://repo.sourcify.dev/contracts/full_match/84532/0xE9AEcFbc5814ce3b2dB0107594d80F054e6dB52f/). Verification establishes a compiler/source match, not security. [Architecture](../docs/ARCHITECTURE.md) describes frontend and keeper routing; [operations](../docs/OPERATIONS.md) covers release checks.

Position attachments, PnL images and receipt-detail dialogs are frontend/social features, not a new engine deployment or a full-performance attestation. Their V4 matching rules and live/snapshot behavior are documented in the [sharing guide](../docs/SHARING.md).

## Protocol parameters (V4)

- Isolated margin and full closes only. No cross, partial-close, add-margin or reduce-margin methods.
- BTC/ETH 25x, SOL/BNB 20x, XRP 15x, DOGE/PYTH/HYPE/STETH 10x. Immutable market feed IDs.
- Net collateral at least 1 mUSDC. Opening fee 10 bps on requested notional; fixed position notional is net collateral times leverage. Closing fee 10 bps on fixed notional.
- Per-market borrowing defaults to 1 bps/hour, maintenance to 50 bps, maximum confidence ratio to 100 bps.
- Signed Pyth prices at most 5 seconds old, no future prices. Adverse execution spread includes confidence and position-size impact. User price bounds and deadlines protect manual execution.
- Separate ledgers: `poolAssets`, `reservedProfit`, `collateralEscrow`, `orderEscrow`, `feeBalance`. Token balance must cover their sum except `reservedProfit`, which is a subset of pool assets.
- Each position reserves one notional from the pool. Gross positive PnL is capped at that notional; loss and all settlement costs cannot exceed available equity. Unreserved liquidity is owner-withdrawable.
- Default caps: 25,000 mUSDC notional/position, 250,000/market open interest, 50,000/market/block entry volume. No public LP shares or yield promises.
- Market/limit/stop entries; TP/SL attached atomically at entry or edited later; two-second minimum hold. Protection appears in the app's Open Orders from position state, not as a separate entry-order escrow. Cancelling one leg uses `setTriggers` and preserves the other. Limits fill no worse than their trigger. Frontend order expiry is seven days; contract maximum is thirty days.
- Entries can be paused independently of exits. Owner transfer is two-step; renouncing ownership is disabled. Guardian can pause but not resume.

Legacy V3.1 stays deployed for exits and cancellation. Its accounting is not upgraded in place and positions are not copied to V4. Do not fund legacy cross margin or use its margin-edit methods.

## Build and test

Requires Solidity 0.8.22, Foundry, [OpenZeppelin Contracts](https://github.com/OpenZeppelin/openzeppelin-contracts) v5.0.2 and [forge-std](https://github.com/foundry-rs/forge-std) v1.9.7 installed into `contracts/lib/` (git-ignored).

```sh
git clone --branch v5.0.2 --depth 1 https://github.com/OpenZeppelin/openzeppelin-contracts contracts/lib/openzeppelin-contracts
git clone --branch v1.9.7 --depth 1 https://github.com/foundry-rs/forge-std contracts/lib/forge-std
forge test --root contracts --skip script --skip VeloMockUSDC
node scripts/generate-v4-abi.mjs
```

Dependency commits are pinned in `foundry.lock`. The deployed runtime is 24,193 bytes. The creation-bytecode hash is `0x023dbd355bb23f18a825e77f70181f1a63608a5d1395bda51e4a21acc76b6103`; deployment transaction is recorded in the manifest.

Tests cover accounting conservation, restricted withdrawals, fee/borrow settlement, caps, pauses, stale oracles, deadlines, orders and liquidation. Stateful invariants run 256 sequences of 500 calls. The 21 October disposable-wallet acceptance additionally confirmed HYPE entry with atomic TP/SL, protection editing, cancelling TP while preserving SL, full close and limit cancellation. Receipts and verification limits are in the [release record](../docs/RELEASE-2026-10-21.md). These tests are not an independent audit.

That runs the perpetuals suite. Deploying the token and bridge additionally requires the LayerZero dependencies referenced in `foundry.toml`. Do not run the deployment scripts with a funded signer just to run tests.

## Registry rules

Handles are 3 to 16 lowercase letters, digits or underscores and start with a letter. One name per address, with a 30-day change interval.

## Before mainnet

A mainnet deployment requires a written accounting and risk specification, solvency invariants, independent review, a verified deployment and a migration path for existing positions.

Do not delete historical source, ABI layouts, manifests or migrations as repository cleanup. Legacy decoding and exit tooling depend on them. Never fund or deploy a contract merely to build the frontend.
