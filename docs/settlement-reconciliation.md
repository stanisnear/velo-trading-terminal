# Settlement reconciliation

V4 receipts connect trading history, account performance and shared positions. A settlement is recorded only after a successful receipt contains the matching engine, trader and trade ID. `PositionLiquidated` identifies liquidations; `PositionClosed` supplies their net PnL, exit price and payout. Event identities are deterministic, so retries do not create duplicate history entries.

Keepers persist confirmed settlements and update linked live posts even when the trader is offline. Fixed snapshots retain their captured values. Posts configured to freeze at closure retain those values with a settled status and receipt link.

The app persists opening and closing transaction hashes and trade IDs. Recovery also checks durable opening history after login and scans historical logs in bounded pages through a history RPC. A failed lookup retains progress and cannot invent a liquidation. Historical activity uses block timestamps rather than the time it was recovered.

## Durable recovery

The scheduled V4 liquidation job also indexes engine events and collateral transfers through a separate archive RPC. It does not need an oracle update to reconcile an already confirmed receipt. Forward and historical cursors persist in Postgres; queue insertion and cursor advancement are atomic. Work is bounded per invocation, with leases and delayed retries for failures.

A receipt transaction commits trade history, live-post outcomes, settlement notifications, its balance checkpoint and the queue acknowledgement together. Replayed logs keep the same event IDs. Conditional entries filled while a browser is closed create their opening history through the same path. A failed archive read or database transaction leaves the receipt eligible for retry.

`velo_internal.receipt_jobs` exposes pending work, attempts and the last fixed error code to service operators. `receipt_cursors` records scan coverage. These tables and the ingestion RPC are inaccessible to browser roles.

## Balance and performance

Live total equity includes open PnL. The balance chart instead adds cash, net position collateral and refundable order escrow at one blockchain block. Opening fees reduce balance when charged; realized settlements and cash movements change it when confirmed. Uncharged borrowing and estimated exit fees remain in the live settlement estimate, not book balance.

`account_balance_snapshots` uses a separate basis and cache from the former equity observations. Old unrealized observations are not converted or copied. Historical balance checkpoints are recomputed from archive state, with their block numbers and hashes retained. Performance remains cumulative realized settlement PnL, excluding transfers.

Regression coverage includes receipt retries, offline liquidation and conditional fills, invalid ownership, database rollback, browser-role permissions, account switching, stale reads and duplicate submissions. Run `npm test` and `tests/receipt-reconciliation.sql` (the SQL fixture rolls back).
