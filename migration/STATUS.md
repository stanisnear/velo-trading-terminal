# Migration status — 14 October 2026

**Terminal deployed on Cloudflare Pages; automatic frontend updates enabled.
The minute scheduler is verified in dry-run mode. Actual trading execution,
gas sponsorship and the final app-domain switch await the Vercel handover.**

## Deployed and connected

- Terminal: https://velo-trading-terminal.pages.dev, from GitHub branch
  `codex/cloudflare-migration`. Build `npm run build:cloudflare`, output `dist`.
  Initial successful deployment `d892e4ce-4904-4faa-9e79-7c39d5f587b3` used commit
  `9d1e318423e610f7f3705df12f257ddafe90bec6`. Subsequent production-branch pushes
  deploy automatically; Preview builds remain disabled.
- Pages has 21 production variables: 19 public VITE_ settings, the backend URL
  and encrypted gateway token. All 16 required public variables in the original
  inventory are present. No wallet/provider private key is in the browser bundle.
- `VELO_PYTH` binds Pages to private Worker `velo-pyth-proxy`. Its provider key
  is encrypted, its workers.dev/preview URLs are disabled, and auth/IP/user/stream
  limits protect its narrow feed/history routes. The public Supabase anon key
  is a normal public setting, not a service-role credential.
- Supabase `velo-api` and `velo-keepers` are ACTIVE, version 6. Six recovered
  contract secrets plus the owner's Pyth secret are installed. The sponsor key
  was confirmed to match the imported keeper key; reuse is explicit and requires
  the expected public address.
- Cloudflare `velo-keeper-scheduler` has `* * * * *`, enabled=true, dry-run=true,
  a separate secret token, and no public endpoint. The backend's execution and
  sponsor switches remain false.
- `app.velotrading.live` is attached to Pages. Domain validation is pending
  because DNS deliberately still targets Vercel. The root/www landing and email
  DNS were not changed. The cancelled newer landing upload was not published.
- Temporary `velo-migration-check` remains retired, returning only HTTP 404.

## Verification

- 47 Node regression checks pass, including authentication, credential rotation,
  private-key confinement, redirects, response bounds, browser SSE parsing,
  scheduler sequencing, contract math and signer coordination.
- Both exact backend bundles pass Deno 2.2.6 import/authentication/disabled tests
  with no network access or wallet credentials.
- The real Cloudflare Git build succeeds. Browser verification shows the trading
  interface and public TradingView/Pyth chart. Public stats return HTTP 200;
  crawler social metadata returns HTML; cron routes are not publicly exposed.
- The private Pyth route returns 401 for both missing and invalid sessions.
  A live runtime issue with redirect handling was found and corrected: Worker
  requests use manual mode and reject redirects without forwarding credentials.
- The supplied Pyth key retrieves signed Hermes updates and the replacement
  authenticated OHLC endpoint returns valid candle arrays. Backend liquidations
  consume fresh Pyth data successfully.
- Manual dry runs pass for conditional orders, TP/SL and liquidation. The actual
  Cloudflare timer then completed consecutive minute ticks from about 07:26 UTC,
  with all three jobs HTTP 200 / ok=true. Both Cloudflare logs and Supabase saved
  run IDs verify these are scheduled executions, rather than only manual calls.
- Historical indexing is complete: next order 21, next trade 104. Recent scans
  cover eight orders (none active) and ten positions (two active), with no queued
  active backlog. One position is currently liquidation-eligible.
- A read-only Base Sepolia simulation of liquidation for position 65 succeeded
  with the exact Pyth fee of 10 wei. An initial provider request failed transiently;
  a fresh retry succeeded. This is simulation evidence, not a transaction receipt.
- No migration transaction has been submitted. Dry runs never sign; the database
  signer table was empty at verification. No real conditional/TP/SL fill or gas
  sponsorship is claimed.

## Blocker and next action

Vercel project reads work. Pausing project `prj_VqN7q6hAYUx1JK0B5S73VMSWoPOC`
in team `team_RDRP3vadkiN3qE9QSGkyvoFD` returns HTTP 403: this connection lacks
access to the `stanisnears-projects` scope. No independently authenticated CLI is
available. The old project has not been paused by this migration.

The owner should use Vercel **velo-trading-terminal → Settings → General → Pause
Project**, or confirm that it already shows **Resume Project**. Preserve its
settings and do not delete it. See CONNECT-SERVICES.md.

After old writers stop: verify no pending wallet transaction; enable backend
execution and sponsorship; change the timer out of dry-run mode; verify actual
Base Sepolia receipts and suitable conditional/TP/SL test orders; switch the app
CNAME to Pages and verify HTTPS and authenticated user flows. Reown metadata
already targets the final app domain; validate its allowed origins as well.

## Limits

Real account sign-in, wallet authorization, authenticated browser Pyth delivery,
user-owned storage changes and actual trading execution still need full end-to-end
verification. Optional GA and unused CDP settings remain unreconciled. Existing
signed-in social/activity RPC authorization has concrete pre-existing gaps,
recorded in KNOWN-ISSUES.md. This is not a complete security audit.

Free hosting has usage limits. Pyth's access plan and Namecheap domain renewal
are separate costs. No paid subscription or model service was activated.
