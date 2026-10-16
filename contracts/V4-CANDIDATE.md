# Isolated V4 candidate — specification and activation gates

Status: **undeployed research candidate, 16 October 2026**. The live address remains V3.1. This implementation is not an independent security audit, a complete exchange risk engine, or mainnet-ready code. Cross margin is intentionally absent and deferred.

## Implemented accounting model

All monetary amounts are integer, six-decimal mock USDC. Prices use 18 decimals. The token must report six decimals, and incoming transfers must deliver the exact amount. The pool is **operator-funded test liquidity**. Funding is not an investment, does not mint LP shares, and creates no redemption claim for outside depositors. Only the operator can fund or withdraw pool capital; traders own their isolated collateral and order escrow.

| Account | Meaning | Authorized outflow |
| --- | --- | --- |
| `poolAssets` | Counterparty capital plus realized trader losses minus realized trader profits | Operator can withdraw only `poolAssets - reservedProfit` |
| `positionCollateral` | Collateral attached to open positions | Owner's permitted margin withdrawal or position settlement |
| `orderEscrow` | Pending entry collateral plus its prepaid opening fee | Exact refund on cancellation, or transfer into position collateral and fees when filled |
| `feeBalance` | Realized opening and closing fees | Operator fee withdrawal only |
| `reservedProfit` | Sum of remaining open position notionals | Released proportionately when positions close; not a second asset balance |

Without unsolicited token donations:

`USDC.balanceOf(engine) = poolAssets + positionCollateral + orderEscrow + feeBalance`

`poolAssets >= reservedProfit = sum(open position notional)`

Direct token donations are unaccounted surplus and cannot be swept by the candidate. No function can withdraw trader escrow as pool capital or protocol fees.

## Economics requiring product review

Initial notional = collateral × selected leverage, with a maximum of 25×. Adding or removing collateral does **not** change notional or entry price. Partial closes reduce collateral and notional proportionately, rounding down; the final close releases the exact remainder.

Raw PnL is signed `notional × (exit - entry) / entry`, with the direction reversed for shorts. Settlement loss is bounded by the closing collateral. **Positive PnL is capped at the closing notional** and the corresponding maximum profit is fully reserved at opening. For a 1,000 mUSDC / 10× position, the profit ceiling is 10,000 mUSDC before fees. This is a substantial, explicit economic change; the live contract/UI do not adopt it. Do not activate it without displaying the ceiling and obtaining product acceptance. Unlimited positive PnL cannot be fully guaranteed from a finite isolated pool merely by keeping an accounting variable.

Opening and closing fees are 0.10% of notional. Closing fees cannot exceed available equity. Liquidation is permitted only when raw equity is at or below 1% of notional; its bounty is at most 0.10% of notional and is paid only from remaining equity after the closing fee. The remaining payout goes to the trader. Manual closing emits a manual reason even if the position has become unhealthy. This separates the user's action from keeper liquidation in history.

Pool reserve capacity, 100,000 mUSDC maximum position notional, 500,000 per-market open interest, and 100,000 per-market per-block entry volume constrain openings. These are candidate test parameters, not calibrated production risk limits. No funding rate, borrowing fee, insurance fund, auto-deleveraging or continuous LP-share NAV is implemented.

## Trading and oracle behavior

- Isolated market opening; full/partial owner close; collateral addition and guarded reduction; editable TP/SL; explicit liquidation eligibility.
- Limit and stop entry orders, exact refundable escrow, bounded execution prices, expiry, permissionless execution/cancellation of expired orders. No reduce-only entry order or copy/algo authorization.
- A disabled market or opening pause still allows close, margin withdrawal, order cancellation and keeper exits. A market's oracle ID cannot be replaced after registration.
- Owner actions use two-step ownership transfer. There is no upgrade proxy. Admin-key/multisig procedures remain an activation gate.
- Price updates must match the configured feed, have a positive price, exponent between −18 and 0, timestamp no later than the current block and no older than 30 seconds, and confidence no larger than 1% of price. The exact oracle fee is required. Stale/unavailable prices fail closed.
- Owner open/close/margin-reduction requests carry bounded deadlines; open and close carry a worst acceptable execution price. Pending orders have a maximum seven-day deadline.
- TP/SL and liquidation are permissionless transactions. They still need an off-chain executor, gas and valid data; their existence does not prove reliable scheduling or a guaranteed price.

**Oracle execution is still a blocker.** A caller can select among valid updates in the 30-second window. Freshness/confidence checks alone do not remove latency arbitrage or MEV. A request/execute design using prices after the request, appropriate unique-update semantics, replay bounds, price-impact/spread policy and adversarial tests must be completed before enabling new trading on this candidate. Do not loosen the price checks to recover from an expired Pyth subscription.

## Tests and reproducibility

`VeloIsolatedV4Candidate.t.sol` passes 21 tests, including two fuzz tests with 256 cases each. These cover flat closes, immutable exposure after margin changes, partial closes, profit caps, reserve withdrawals, liquidation accounting, manual close classification, pending escrow, once-only order execution, order slippage/expiry/refunds, paused exits, TP/SL, oracle guards, permissions and exposure limits.

`VeloIsolatedV4Invariant.t.sol` passes 128 stateful runs of depth 64 (8,192 generated handler calls). It checks token/accounting equality, reserve coverage, aggregate collateral, aggregate notional/open interest, and pending escrow after sequences of openings, closes, margin additions, orders, execution/cancellation, funding and withdrawals. Expected rejected actions are caught by the handler; the call count is not a claim that every proposed trade executed. This does not constitute a proof over all inputs or external-token behavior.

Run `bash scripts/test-v4-candidate.sh` with Foundry 1.7.1 and Git available. It creates a temporary isolated project, pins Solidity 0.8.22, OpenZeppelin v5.0.2 at `dbb6104ce834628e473d2173bbc9d47f81a9eec3`, and forge-std v1.9.7 at `77041d2ce690e692d6e03cc812b57d1ddaa4d505`. It avoids the legacy repository's inconsistent dependency lock/remapping paths and missing LayerZero build dependencies. It does not deploy, read private keys, call a chain RPC, or consume Pyth API quota. These old pinned libraries are for a reproducible candidate test; dependency/security review remains required before a release.

## Migration sequence — no production address switch yet

1. Finish the oracle execution design and review the capped-profit/operator-pool product model. Add adversarial/reentrancy, rounding, market exhaustion, timestamp/MEV, bad-token and mixed liquidation/trigger sequence tests. Obtain independent review before real-value use.
2. Add a versioned frontend adapter and receipt decoder for the new structs and events, plus previews of exact notional, fees, maximum profit and withdrawal capacity. The current V3.1 ABI is incompatible.
3. Update keepers and the durable signer workflow for the new order and trigger methods. Index events with `(chain_id, contract_address, tx_hash, log_index)`, checkpoint block hashes, handle reorgs, and deduplicate history/notifications. Do not use a browser as the authority for fills or pool balances.
4. Deploy and verify a fresh **testnet** instance initially paused. Register only reviewed feeds, seed only mock liquidity, verify authority/addresses/ABI bytecode, and exercise two independent test wallets. Preserve the old contract balance; do not sweep it into the new pool.
5. Keep a separate legacy adapter and keeper for V3.1 closes, cancellations, and cross-balance withdrawals. Query and display positions per contract address. Disable only legacy **new** risk. Never reinterpret an old trade ID against the new contract or silently move collateral.
6. Run authenticated desktop/mobile acceptance: login/recovery/logout, open/close/partial close, order and TP/SL lifecycle, healthy/liquidatable cases, pending/replaced transactions, RPC/DB/Pyth outages, scheduler missed runs, and pool funding/withdrawal. Reconcile all receipts with indexed records. Only then enable new testnet trading on V4.

Upgrading the contract cannot repair Supabase permissions, wallet key storage, social UX or browser authentication by itself. Those retain their separate acceptance gates in the app audit.

References: [Pyth EVM parsing](https://api-reference.pyth.network/price-feeds/evm/parsePriceFeedUpdates), [Pyth unique update semantics](https://api-reference.pyth.network/price-feeds/evm/parsePriceFeedUpdatesUnique), [Pyth integration practices](https://docs.pyth.network/price-feeds/core/best-practices).
