# Settlement reconciliation

V4 receipts connect trading history, account performance and shared positions. A settlement is recorded only after a successful receipt contains the matching engine, trader and trade ID. `PositionLiquidated` identifies liquidations; `PositionClosed` supplies their net PnL, exit price and payout. Event identities are deterministic, so retries do not create duplicate history entries.

Keepers persist confirmed settlements and update linked live posts even when the trader is offline. Fixed snapshots retain their captured values. Posts configured to freeze at closure retain those values with a settled status and receipt link.

The app persists opening and closing transaction hashes and trade IDs. Recovery also checks durable opening history after login and scans historical logs in bounded pages through a history RPC. A failed lookup retains progress and cannot invent a liquidation. Historical activity uses block timestamps rather than the time it was recovered.

Regression coverage: `tests/keeper-settlement.test.mjs`, `tests/keepers.test.mjs`, `tests/shared-position.test.mjs` and `tests/trade-receipts.test.mjs`.
