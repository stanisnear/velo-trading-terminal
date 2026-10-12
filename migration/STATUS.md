# Cloudflare migration

Status on 2026-10-12: **landing deployed; terminal migration incomplete**.

## Deployed

- The separate Velo-Landing repository deploys to Cloudflare Pages project
  `velo-landing` from `codex/cloudflare-migration`.
- Both `velotrading.live` and `www.velotrading.live` have active domain validation.
  The supplied redesign deployed at commit
  `2e7c480703b60055b81410bfb09f63091911862a`; its deployment URL was viewed.
- Supabase Free project VELO Main hosts `velo-api` version 1. Its six handlers
  require a private gateway token. No token has been configured: live probes
  returned 503 for an API route and 404 for a cron route, as intended.
- Existing database objects, user rows and authentication were not changed.

## Outstanding

- No Vercel variable values have been exported or transferred. On 2026-10-12 the
  connector still returned 403 for `stanisnears-projects`. No authenticated
  Vercel CLI is available. Restore team access before exporting variables.
- The terminal frontend is prepared but not deployed to Cloudflare. Its DNS
  still points to Vercel.
- The three keeper handlers have not been ported or activated. A replacement
  Cloudflare scheduler is prepared and tested but has no active cron trigger.
- Actual API behavior, wallet onboarding, auth redirects and keeper runtime
  limits still need validation with the imported settings.

## Configuration and cutover

The 28-name inventory records scopes, not values: 24 Production + Preview and
four Production-only. Reconcile additional names referenced in the source.

Export production and preview to separate fresh files outside the repo. Vercel
can preserve stale values when exporting to an existing file. Recover unreadable
write-only credentials from their original source. Preserve exact values,
newlines and scopes, including unused settings; do not substitute defaults.

Only public VITE_ settings belong in the browser build. Server keys, cron
credentials and CDP settings belong in backend secrets. Supabase reserves
SUPABASE_* names; imported values use VELO_IMPORTED_SUPABASE_* aliases.

The terminal's build command is `npm run build:cloudflare`, output `dist`.
The variable guard must pass before publishing. Runtime bindings are
`VELO_BACKEND_URL` and `VELO_PROXY_TOKEN`. The gateway preserves SPA routes,
six API routes and bot-specific post metadata. Ordinary assets bypass the
gateway. Legacy references to /api/faucet and /api/gas-sponsor have no matching
handlers in the current repository and need review during live-flow testing.

See SUPABASE.md for the API build, exact variable mapping and keeper activation
gates. Never activate duplicate schedulers using the same transaction signer.

## Verification

- 15 API/gateway tests passed, including auth, payload/status preservation,
  oversized requests, social metadata and private cron exclusion.
- The deployed bundle passed Deno 2.2.6 checks without network or wallet
  credentials, loading viem, Node crypto and the HTML renderer.
- Five scheduler tests passed: disabled mode, destination/credential guards,
  ordered calls, isolated failures, redirects and skipped results.
- No wallet transaction was submitted; no keeper schedule was activated.
