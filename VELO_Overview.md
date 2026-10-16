# VELO overview — 15 October 2026

VELO is a Base Sepolia social trading prototype: a perpetuals terminal connected to posts, profiles, discussion and trader discovery. It currently uses mock USDC, Pyth prices and a custom pool-based execution contract. It is not a regulated broker, a tokenized-share issuer or a mainnet exchange.

The product opportunity is a clear loop from a trader's idea to an inspectable trade and useful discussion. The current database-backed leaderboard does not yet deliver independently reconstructed performance. Trustworthy indexing, risk controls and user retention are prerequisites for that positioning.

Cloudflare Pages hosts the terminal and landing, a private Worker mediates Pyth access, and Supabase provides identity, data, storage and backend functions. A separate Cloudflare scheduler drives minute trading jobs. Hosting is on free tiers with quotas; external data, domain renewal, independent review and mainnet costs remain separate.

The October review found serious accounting and authorization defects. This remains a restricted testnet with specific UI controls disabled. Copy trading, algorithmic trading and equity/commodity simulations are planned, not shipped capabilities.

Current technical facts: [README](README.md), [feature matrix](FEATURES.md), [audit](docs/AUDIT-2026-10-15.md), [operator guide](CLOUDFLARE.md). These replace earlier broad claims of an audited or fully verified product.
