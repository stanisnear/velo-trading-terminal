# Developer security reference

This reference accompanies the [architecture](ARCHITECTURE.md) and [operations guide](OPERATIONS.md). It records implementation details relevant to developers, reviewers and operators.

## Deployment and review status

The active V4 deployment is on **Base Sepolia**, using mUSDC test collateral. Contract source is verified on BaseScan and Sourcify. An independent security audit has not been completed; source verification establishes a compiler match. Independent review, capital stress testing and operational validation are part of the mainnet release workstream.

## Trading-wallet key

The app derives a dedicated Ethereum trading key from a wallet signature and keeps it in browser storage. The key can sign transactions from that address; it is not a contract-scoped session permission. Browser scripts, extensions or device compromise can expose browser-held credentials.

Wallet settings provides export controls. Back up the trading key before clearing browser storage. Re-derivation requires the original wallet to reproduce the signature; wallet/provider behavior can affect recovery. Connected-wallet and trading-wallet addresses are separate.

Scoped permissions, spending limits, expiry and a reviewed key-storage design are tracked in the [engine roadmap](../FUTURES.md).

## Execution and accounting

Review price freshness and confidence, bounds, deadlines, order escrow, fee accrual, profit reserves and close/liquidation paths together. RPC submission timeouts are reconciled against the original transaction before a replacement is considered. The [execution reference](EXECUTION.md) describes the current accounting.

Earlier deployments retain their own state and exit tooling. Their addresses, compatibility behavior and historical findings belong in the contract and operations references; new entries use V4.

## Application and service boundaries

Provider credentials and privileged keys belong in server-side secret storage. Frontend `VITE_*` values are public. Supabase policies and API authorization protect private account information and owner-scoped writes. Contact emails are private account data.

Trade receipts establish individual transaction context. Leaderboard summaries and social identity records use application data; the planned event indexer extends reconciliation across full account histories. Amount-display preferences do not change the visibility of blockchain records.

See [Operations](OPERATIONS.md) for deployment controls and incident recovery. For a security concern, contact [info@velotrading.live](mailto:info@velotrading.live).
