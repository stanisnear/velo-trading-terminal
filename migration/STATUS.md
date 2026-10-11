# Cloudflare migration

Status: variable inventory and Cloudflare frontend gateway prepared; nothing
deployed or transferred yet. The Supabase backend port remains to be implemented
and verified before this branch can serve the complete terminal.

The target is Cloudflare Pages for `velotrading.live` and
`app.velotrading.live`. Supabase remains the data/auth backend. The terminal's
Vercel API handlers and scheduled jobs must also be moved before domain cutover.
Cloudflare Workers Free has a 10 ms CPU limit and 50 external subrequests per
invocation, so moving the existing contract scans unchanged into a Worker is
not a verified deployment strategy. Supabase Edge Functions are the planned
backend target, subject to runtime and live workload validation.

## Environment transfer

`vercel-variable-inventory.json` records 28 names from the supplied screenshots:
24 are assigned to Production and Preview; four are assigned to Production
only. The inventory contains no values. The source also references additional
optional/fallback settings; reconcile those against the live Vercel inventory.

Export production and preview independently to new files outside the repository.
Vercel can preserve old local values when pulling into an existing file, so a
fresh export matters. An export can contain placeholders for write-only secrets;
an apparently successful CLI command does not establish that all credentials
were exported. Recover missing values from their original source.

Build settings prefixed `VITE_` are public in browser JavaScript. Store private
keys, Supabase service-role credentials, cron credentials, and CDP credentials
only in backend secret storage. Preserve exact values, including embedded
newlines, and verify presence without printing their values. Preserve imported
settings even if current source does not reference them.

## Terminal behavior to preserve

- Static Vite build and SPA deep links.
- `/api/sponsor-eth`, `/api/user-stats`, `/api/ga-stats`,
  `/api/protocol-stats`, `/api/og`, `/api/post-og`.
- Bot-specific metadata at `/social/post/:id`.
- Minute schedules for conditional orders, take-profit/stop-loss, and
  liquidations, with authenticated invocation and no duplicate active scheduler
  during cutover. Validate runtime, concurrency, and signer nonce handling.
- Existing Supabase auth redirects, wallet domain restrictions, RPC credentials,
  contract addresses, and response/security headers.

## Cutover gates

1. Connect Vercel and Supabase; create the Cloudflare Free account.
2. Reconcile complete variable names, values, scopes, and any unreadable secrets.
3. Port and validate API handlers and jobs against runtime limits.
4. Deploy both projects on temporary URLs and verify core user flows.
5. Add custom domains, preserve unrelated DNS records, and activate only one
   set of trading-job schedules.

The Cloudflare Pages build command is `npm run build:cloudflare`, output `dist`,
framework preset Vite. Its public build-variable guard prevents silently omitting
the `VITE_` settings visible in the source inventory. Build variables are separate
from the backend's secret credentials.

The gateway expects runtime bindings `VELO_BACKEND_URL` (an HTTPS base URL) and
`VELO_PROXY_TOKEN` (a new shared secret). It forwards the six existing public API
routes to `<base>/api/<route>` and authenticates to the backend with
`X-Velo-Proxy-Token`. The future backend must validate that token before executing
a handler. Cron routes are invoked directly at the backend by its authenticated
scheduler. Only API and social-post requests invoke the Cloudflare Function;
ordinary static assets stay on Pages. Missing backend bindings return 503.

The repository also contains legacy Orderly frontend references to `/api/faucet`
and `/api/gas-sponsor`, but corresponding handlers do not exist in the current
GitHub tree. Confirm whether those old flows are still needed during live-flow
testing; this gateway does not invent replacements for them.

On 2026-10-11 the Vercel connector listed the project IDs but returned HTTP 403
for project details, variables, and domains under `stanisnears-projects`. No
variable values have been exported. There is no authenticated Vercel CLI in the
working environment. Account access and secret values are still required. This
branch is preparation, not a live or fully ported deployment.
