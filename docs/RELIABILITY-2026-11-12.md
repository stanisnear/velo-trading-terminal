# Account and settlement reliability

This release addresses the failure paths behind missing offline settlements and the dashboard's mixed balance/equity history.

| Path | Verification and behavior |
| --- | --- |
| Market entries and attached protection | Existing atomic V4 entry/TP/SL tests pass |
| Background TP/SL, liquidation and conditional entries | Scheduled keepers retain independent contract checks and durable signing journals |
| V4 conditional-order decoding | Shared mapping-getter decoder preserves tuple fields for both order display and keeper execution |
| Lost database write after confirmation | Receipt queue retries; history, social status, notification and acknowledgement commit together |
| Disconnected browser | Submissions are rejected; reconnect and foreground events refresh account data |
| Stale or failed account refresh | Previous values remain visible; writes require a successful recent read |
| Account valuation during execution | Cash, positions and escrow are read at one block |
| Balance history | Separate verified basis; unrealized PnL cannot enter the balance chart |
| Social and account identity | Session restoration, media authorization, notification retraction and position-state regression suites pass |

Read-only archive recovery rebuilt the existing account's balance checkpoints; the HYPE liquidation remains linked to its actual receipt. No trading balances or contract state were changed by this recovery.

Operators should inspect pending receipt age and failed attempts alongside keeper runs. Historical scan progress is resumable; a provider outage leaves pending work visible rather than marking it complete. This is a targeted reliability review with automated regression coverage, not a claim that every possible production failure has been eliminated.
