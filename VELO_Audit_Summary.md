# Engineering review summary — 15 October 2026

**Result: not ready for real funds or a claim of complete testnet correctness.**

The review covers source, infrastructure, database permissions, unit tests, local contract reproductions and selected live testnet/backend evidence. It is not an independent smart-contract security audit.

Three contract tests reproduce cross-balance inflation, missing cross-liquidation losses and margin-dependent exposure. The frontend now limits affected actions, but the immutable V3.1 contract remains unchanged. Several legacy account/privacy/social authorization paths also remain open pending a separately approved database cutover.

Signature login, owner-only notification reads, private contact APIs and a receipt-verified incoming-transfer path were deployed and checked within their stated scope. TypeScript checking, 91 Node tests, a production build and seven Foundry tests completed. Three of those seven are intentionally passing defect reproductions.

See [the complete findings and coverage matrix](docs/AUDIT-2026-10-15.md). Do not use old feature descriptions, a green build or a successful cron scan as evidence that every trade, account or social action is correct.
