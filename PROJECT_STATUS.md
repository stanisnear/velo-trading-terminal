# Project status — 15 October 2026

**Restricted testnet. Hosting migration operational; security/accounting remediation incomplete.**

- Cloudflare Pages hosts the terminal and landing. The production branch for each is `codex/cloudflare-migration`. Vercel remains paused.
- Supabase `velo-api` v9 serves signature login, sponsorship and verified received-transfer recording. `velo-keepers` v7 handles scheduled trading. A Cloudflare timer runs all three jobs every minute.
- The deployed V3.1 contract has reproduced cross-balance, liquidation-loss and margin/exposure bugs. Client restrictions reduce accidental use; no contract replacement has been deployed.
- New contact writes are private and notification reads are owner-only. Legacy wallet passwords, historical public contact fields, social RPC authorization, avatar policies and protected profile fields still require the blocked database cutover.
- Copy/algo trading and non-crypto instruments are future work. The simulated copy action is disabled.
- Core source checks and focused live tests passed; complete authenticated UI and bridge testing remain outstanding.

Use [FEATURES.md](FEATURES.md) for feature-by-feature status, [the engineering audit](docs/AUDIT-2026-10-15.md) for evidence and blockers, and [CLOUDFLARE.md](CLOUDFLARE.md) to operate/deploy the system. Older migration records are historical evidence, not a current release certification.
