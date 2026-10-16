# VELO — social trading testnet

[Terminal](https://app.velotrading.live) · [Website](https://velotrading.live) · [Product documentation](https://velotrading.live/docs)

VELO combines a crypto trading terminal, testnet contracts and social profiles/posts on Base Sepolia, using mock USDC.

**Current production source is on [codex/cloudflare-migration](https://github.com/stanisnear/velo-trading-terminal/tree/codex/cloudflare-migration). This default `main` branch contains older application code. Use the production branch for development and deployment; this README update does not merge that older code into the live app.**

## Current status — 16 October 2026

Both websites run on Cloudflare Pages. A private Cloudflare Worker protects Pyth access. Supabase supplies authentication, Postgres, realtime, storage and API/keeper functions. A Cloudflare minute timer runs conditional-order, TP/SL and liquidation jobs. Vercel is paused. Namecheap remains the domain registrar; Cloudflare provides DNS and HTTPS.

The latest app release fixes receipt-based close classification (including a manual close incorrectly labelled liquidation), failed account refreshes, stalled public fills, chart startup requests, login locking, session expiry and private-key/tooltip controls. It retains the newer native chart and modal design. TypeScript, 91 regression tests and a production build pass. Real wallet/mobile acceptance remains incomplete.

**This is a restricted testnet, not an independently audited or mainnet-ready exchange.** Serious accounting defects were reproduced in the immutable custom contract. New cross-margin activity, collateral adjustments and reduce-only entry orders are restricted in the app; client restrictions do not stop direct contract calls. Legacy account/social authorization hardening is still pending. Use test assets only. Copy trading, algorithmic trading and non-crypto products are planned.

## Documentation

- [Current README and setup](https://github.com/stanisnear/velo-trading-terminal/blob/codex/cloudflare-migration/README.md)
- [Cloudflare publishing and operations guide](https://github.com/stanisnear/velo-trading-terminal/blob/codex/cloudflare-migration/CLOUDFLARE.md)
- [Feature status and restrictions](https://github.com/stanisnear/velo-trading-terminal/blob/codex/cloudflare-migration/FEATURES.md)
- [Engineering audit and incident addendum](https://github.com/stanisnear/velo-trading-terminal/blob/codex/cloudflare-migration/docs/AUDIT-2026-10-15.md)
- [Contracts and replacement requirements](https://github.com/stanisnear/velo-trading-terminal/blob/codex/cloudflare-migration/contracts/README.md)
- [Unapplied account/social cutover](https://github.com/stanisnear/velo-trading-terminal/blob/codex/cloudflare-migration/audit-plans/README.md)

A commit saves code in GitHub. A push to `codex/cloudflare-migration` triggers Cloudflare Pages publication. Backend functions, standalone Workers and SQL need separate deployments. Free hosting has quotas; domains, market-data access and security work have separate costs.

Never commit provider secrets, wallet keys or private environment exports. The current browser trading wallet stores a full EOA key in localStorage without encryption; it is not a scoped smart-account session key. Back it up before clearing browser storage.
