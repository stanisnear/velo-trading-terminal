# VELO handover and remaining account checks

The owner confirmed the old Vercel terminal paused on 14 October 2026. The
Cloudflare timer and Supabase transaction handlers are now enabled. Keep Vercel
paused; preserve its settings for optional configuration reconciliation.

Cloudflare reports https://app.velotrading.live active with its certificate.
The CNAME points to velo-trading-terminal.pages.dev. The terminal's production
branch is `codex/cloudflare-migration`; pushes deploy its frontend automatically.

Confirmed Base Sepolia receipts cover gas sponsorship, liquidation, a limit
order and its take-profit close. See STATUS.md and LIVE-VERIFICATION.json. The
one-mock-USDC test left no open order or position. No additional API key is
needed for the implemented trading paths.

## Remaining browser/account checks

This environment's browser returned ERR_BLOCKED_BY_CLIENT for the custom domain;
its HTTP client returned 403. The Pages interface/public chart was checked
before cutover, but the final origin could not be visually checked here.

Using your normal browser and existing VELO account:

1. Open https://app.velotrading.live and sign in.
2. Connect your existing wallet on Base Sepolia and confirm your profile and
   trading balances appear.
3. Confirm authenticated Pyth prices load and your normal profile/storage action
   succeeds. Do not share passwords, session tokens or wallet recovery phrases.

Reown's project ID is installed and wallet metadata uses the app domain. If it
reports an origin restriction, its allowed origins must include that exact
domain. The Pages origin also needs allowance if testing wallet flows there.

These user flows are still unverified; transaction receipts do not stand in for
a full browser test. Optional Google Analytics and unused CDP values remain
unreconciled. Known pre-existing signed-in RPC authorization gaps are documented
in KNOWN-ISSUES.md.

The operating guide is ../CLOUDFLARE.md, including frontend updates, separate
backend/Worker deployments, monitoring, emergency stops and rollback.
