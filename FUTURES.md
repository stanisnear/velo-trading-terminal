# Future Velo engine decisions

31 October 2026. This is a discussion document, not a deployment specification or a list of features already live. The product direction remains [VISION.md](VISION.md); [FEATURES.md](FEATURES.md) and [V4 execution](docs/EXECUTION.md) describe the current release.

Velo's core opportunity is a venue where a market view, a position and its result stay connected. The next engine should improve reliable execution and trustworthy records before expanding the feature count.

## First: make the present model measurable

| Priority | Work | Evidence required |
| --- | --- | --- |
| 1 | Independent accounting/security review; fix findings before migration | Reviewed threat model, solvency invariants, oracle/fee/permission tests and signed-off changes |
| 2 | Durable chain indexer with backfill, reorg handling and idempotent event reconciliation | Positions, orders, transfers, equity checkpoints and rankings reconcile by chain/engine/event ID |
| 3 | Contract-enforced session permissions | Expiry, allowed targets/methods, spending limits, revocation, recovery and a tested owner escape path |
| 4 | Keeper and RPC service levels | Measured trigger-to-submission and submission-to-confirmation percentiles; failover, nonce recovery and stale-price alarms |
| 5 | Explicit liquidity/risk policy | Capital, open-interest/skew limits, stress loss, oracle outage rules, bad-debt and withdrawal policy |

These are concrete dependencies for reliable real-money operation. Another contract version alone does not solve missing historical observations, stalled RPCs, indexing gaps or unrestricted browser keys.

## Funding rate versus borrowing fee

V4 charges a time-based borrowing fee. It has **no funding-rate mechanism** and does not transfer periodic payments between long and short holders.

Before adding funding, choose what it should balance: long/short skew, pool utilization, or divergence between the perpetual and an external index. In an oracle/pool model without a traded perpetual price, an order-book premium cannot simply be read from the current fills tape.

A funding specification needs the reference/index source, formula, bounds, update cadence, accrual precision, payer/payee, cumulative funding indexes, settlement checkpoints, position-edit behavior, oracle outage treatment and tests for extreme skew and long inactivity. It also changes liquidation, available collateral, maximum losses and the PnL shown in the interface. User-visible estimates and realized receipts must use the same accounting model.

**Recommended decision:** retain the clearly labelled borrow model while measuring skew and capital usage; specify and simulate funding before changing the contract. Do not relabel borrowing as funding.

## Order book or oracle/pool execution

| Approach | Product benefit | Additional responsibilities |
| --- | --- | --- |
| Improve the current oracle/pool model | Keeps simple entries and avoids a new matching service | Better capital policy, transparent execution spread, stronger keepers, bounded failure behavior and measurable service levels |
| Hybrid: signed intents with independent executors | Can reduce repeated on-chain order overhead and introduce competing execution | Replay/cancellation rules, nonce domains, expiry, partial-fill policy, executor competition, censorship/recovery paths and settlement proofs |
| Central limit order book | Actual executable bids/asks and price-time matching | Market-maker capital, matching/ordering policy, cancellation guarantees, maker/taker fees, self-trade prevention, latency monitoring, fair access and a robust settlement design |

A CLOB is a change to the venue model, not a depth-chart component. Displaying Velo's historical fills as bids/asks would misrepresent available liquidity. Current on-chain limit orders are conditional pool entries, not resting matched quotes.

**Recommended decision:** validate the pool model's execution quality and actual demand before building a matching venue. An order book is justified by liquidity providers and a matching design, not by visual parity with larger exchanges.

## Capital and position operations

The current pool reserves an entire notional for each position's maximum gross profit. That bounds liability but consumes significant capital. Replacing the profit cap or reservation policy requires a solvency model, correlated-asset stress tests, concentration/skew limits and an explicit insolvency waterfall.

Public LP participation would additionally need share accounting, deposits/redemptions, withdrawal queues, fee/loss allocation, valuation and manipulation safeguards. An insurance or backstop fund needs defined funding and payout rules; it cannot be treated as an unexplained balance.

Partial close, reduce-only operations and margin changes need fee/funding checkpoints, reservation release rules, protected-order resizing and invariant tests. Cross margin requires account-level risk and liquidation accounting and is a separate design project. Add these only after specifying how each operation affects both trader equity and pool solvency.

## Growth after the execution foundation

- Evidence-backed profiles and rankings: distinguish closed PnL, open estimates, cash flows and independently reconstructed history.
- Social alerts and better discovery: follow a position's lifecycle without implying investment advice or automatic execution.
- Copy allocation and strategies: capped permissions, per-strategy loss/slippage limits, clear consent, revocation and kill switches before delegation.
- Broader assets: licensed pricing/data, trading calendars, corporate actions where relevant, jurisdiction/product review and a clear liquidity model. The present crypto directory is not a commitment to offer every asset as a perpetual.

## Before approving a replacement engine

Write a versioned specification and migration plan; simulate representative activity; review the implementation independently; verify source and deployed settings; run disposable-wallet acceptance for every operation and failure path; reconcile accounting and history; then stage a limited rollout. Preserve old-engine exits and evidence. No new engine or funding mechanism is authorized or deployed by this document.
