# The next Velo engine

Velo's engine roadmap supports a broader goal: a trading venue that connects positions, research and reputation. V4 provides the current Base Sepolia foundation; the workstreams below describe its next stage of development.

## Execution and records

The receipt reconciler already records confirmed V4 opens and settlements, updates live shares and notifications, and writes account balance checkpoints. Extend that foundation to a complete order and position lifecycle, richer performance analysis, and independently verifiable trader and strategy histories.

Operational work includes execution-latency metrics, redundant RPC routes, keeper health, transaction recovery and settlement reconciliation. Scoped trading permissions will give automated workflows explicit method, spend and expiry boundaries.

## Funding rates

V4's current time-based charge is borrowing. A funding mechanism adds a separate way to balance exposure and connect the traded price with its reference.

The design work covers:

- The reference price, exposure measure and funding interval.
- Which participants pay and receive funding under the selected pool or matched-trade model.
- Bounded rates and cumulative accrual per position.
- Treatment at close, liquidation and price interruptions.
- Clear estimates, accrued amounts and history in the interface.

The result should make holding costs understandable and exposure management more effective.

## Execution model

| Direction | What it enables | Engineering focus |
| --- | --- | --- |
| Oracle-priced pool | Direct execution against pool liquidity | Capital efficiency, skew pricing, exposure limits and liquidity reserves |
| Signed orders / intents | Competitive execution of trader-specified terms | Signature domains, cancellation, fill reconciliation and solver incentives |
| Central limit order book | Executable bid/ask liquidity and price-time matching | Maker liquidity, matching rules, ordering, cancellation and settlement |

Velo currently uses the oracle-priced pool model. Choosing an order book would add a matching and liquidity system alongside the interface. The right choice depends on the trading experience, available liquidity and operating model.

## Liquidity and position management

The next liquidity specification covers per-market open interest, directional skew, withdrawal capacity, stress scenarios and participant economics. A public liquidity vault would add share pricing, deposits, withdrawal queues and explicit PnL allocation.

Position-management workstreams include partial closes, reduce-only orders and margin adjustment. Cross margin requires an account-level risk model linking equity, collateral and liquidation across positions.

These features should be designed together with accounting tests and scenario-based capital analysis.

## Trust and launch

Independent contract review, adversarial accounting tests, controlled admin permissions and monitored execution support the production release process. A staged rollout can start with selected markets and exposure limits, then expand using observed execution and liquidity data.

A replacement engine should preserve access to existing positions while new orders move to the new deployment. Release tooling, the app and the indexer should use explicit contract versions and deployment manifests throughout the transition.

## Product built on the engine

- Trader histories that connect posts to a complete position record.
- Copy allocation with slippage, loss and pause controls.
- Strategy automation with scoped permissions and transparent results.
- Richer analytics, research and trading for tokenized assets, equity exposure and commodities.
- Portable attestations for selected public social interactions and reputation events, with consent and moderation built into the design.

[Product vision](VISION.md) · [Current feature guide](FEATURES.md) · [V4 execution and accounting](docs/EXECUTION.md)
