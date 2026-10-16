# Crypto availability and RPC recovery

## Verified availability

The configured Pyth Terminal trial grants 13 crypto feeds. The live authenticated
batch returned all thirteen fresh quotes and signed update data in 566 ms on
16 October 2026. `shared/markets.mjs` drives the app and private Worker allowlists.

BTC, ETH, SOL and DOGE retain original registry slots 0, 1, 2 and 5. PYTH, BNB,
XRP, HYPE, WBTC, JITOSOL, STETH, USDC and USDT are **price-only**. Other markets
are excluded from new orders and display subscriptions. Historical position IDs
have not been changed. No contract registration or owner pause was executed.
Legacy on-chain markets remain callable directly; a missing feed entitlement
can prevent an old position's close or keeper execution. Owner intervention is
still needed for contract-level changes. Do not reuse any existing registry slot.

The gateway isolates an explicit provider denial for one exact requested feed,
preserves signed payloads for the remainder, and reports unavailable IDs in a
response header. Generic authentication failures are never treated as partial
success. The provider key remains server-only. No paid plan was changed.

## Transaction recovery

The shared Base Sepolia transport prefers the official public RPC, with the
previous public RPC retained as fallback. A secondary outage during a null
receipt lookup must not demote the healthy primary. Custom dedicated endpoints
remain configurable. Provider limits and public RPC outages are still possible.

Browser-signed transactions are journalled before broadcast. Recovery may resend
only the identical signed bytes, never create a new order. A legacy hash-only
record requires explicit acknowledgement and independent node/nonce checks to
reset local tracking. That reset is not a cancellation.

Faucet retry now uses the current on-chain mint flow. Sends wait for matching
successful receipts, retain unresolved hashes for confirmation checks, and do
not label an unconfirmed broadcast as delivered. Recipient activity recovery
uses bounded, receipt-verified Transfer logs and only advances its cursor after
successful recording. Manual sign-out also disconnects the owner wallet.

## Live testnet evidence

Disposable test wallet: `0xBa1e62cbF94823e85175CAFded72e3c5e742EfFF`.
No user positions or real funds were used. Keys/session tokens are excluded from Git.

| Check | Latest elapsed time | Evidence |
| --- | --- | --- |
| Signature challenge / verification | 542 / 743 ms | Live API and Supabase test session |
| All 13 price feeds | 566 ms | Fresh, complete authenticated batch |
| Transfer 1 mUSDC | 6.2 s | `0xc9f1af032e38d06044c7b401e61d4c36e58147b7fd7f1f56c506541c2c31c99d` |
| Open isolated SOL | 5.6 s | Trade 111, `0x0d825a9719bdea5690be0091edb5e7e8f142f3811a6f66300b01ac77f6dcb2d8` |
| Close SOL | 5.3 s | `0xe48930702b57545e48274f8e6fcfe2e3993fe3d2c8b3808894225185faa50639`, reason CLOSE |
| Place / cancel distant limit | 5.1 / 4.9 s | Confirmed by acceptance harness |
| Logout test session | 607 ms | Supabase sign-out |

An earlier fresh-wallet run confirmed sponsor funding and a faucet mint:
`0x6ae3f2703a6eaedda9efeb0dce7933efe87234fc2231223bad86f3c456f900a2`.
The latest run reused that balance and did not attempt to bypass the faucet cooldown.
These are observed timings, not latency guarantees or full mobile wallet acceptance.
Backend authorization hardening, contract accounting remediation and the separate
V4 candidate remain unfinished. This release is still testnet-only.
