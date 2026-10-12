# Supabase API and keeper migration

Project: VELO Main (`btgfoekgvyvdflzjfehz`). Function `velo-api` is deployed,
but closed until its gateway secret is set. It adapts six existing API handlers
and creates no database objects or schedules.

## Reproduce the API build

```sh
npm ci
npm run build:supabase
node --test migration/gateway.test.mjs migration/backend.test.mjs migration/scheduler.test.mjs
npx --yes deno@2.2.6 run --no-config --no-npm --no-remote --no-lock --allow-env=VELO_PROXY_TOKEN,GA_PROPERTY_ID,GA_CLIENT_EMAIL,GA_PRIVATE_KEY,VITE_SUPABASE_URL,VITE_SUPABASE_ANON_KEY migration/backend.deno.mjs
```

The build transforms process.env.NAME into runtime lookups and removes
TypeScript syntax. Original api/ handlers remain the source of truth. Generated
JavaScript and bundle.js are ignored by Git; no variable values are read by the
build. Keep the committed npm lockfile.

The existing viem 2.51.0 graph includes an ox URL dependency rejected by Deno's
npm resolver. esbuild 0.25.12 bundles the locked graph without changing the
contract-library version. Only explicit node: built-in imports remain.

Deploy `supabase/functions/velo-api/bundle.js` and its adjacent deno.json as
`velo-api`, entrypoint bundle.js. supabase/config.toml uses this entrypoint.
The connector uses verify_jwt: false because bridge.js validates a mandatory
gateway token before loading any handler. Never remove this guard.

## Transfer configuration

First restore Vercel access to the stanisnears-projects team. Export Production
and Preview separately and reconcile every required value. Never commit, paste
or log credentials. Preview credentials must not overwrite production settings.

| Source | Destination |
| --- | --- |
| VITE_* settings | Cloudflare build variables; backend settings where referenced |
| SUPABASE_URL | Supabase secret VELO_IMPORTED_SUPABASE_URL |
| SUPABASE_ANON_KEY | Supabase secret VELO_IMPORTED_SUPABASE_ANON_KEY |
| SUPABASE_SERVICE_ROLE_KEY | Supabase secret VELO_IMPORTED_SUPABASE_SERVICE_ROLE_KEY |
| Other SUPABASE_* settings | Supabase secret with VELO_IMPORTED_ prepended |
| Other server settings | Supabase secrets with original names and exact values |
| New random gateway token | VELO_PROXY_TOKEN in Cloudflare runtime and Supabase |
| API base URL | Cloudflare VELO_BACKEND_URL = https://btgfoekgvyvdflzjfehz.supabase.co/functions/v1/velo-api |

Supabase reserves SUPABASE_* and supplies built-in values. env.js prefers the
imported aliases, preserving existing exported values. Retain unused CDP/wallet
settings too. Never put server keys in VITE_ variables. Generate the gateway
credential from at least 32 random bytes encoded as hex/base64.

Redeploy after setting secrets to reload top-level configuration. Verify URL
and key/project consistency before privileged API checks. The Supabase connector
has no secret-write operation; complete that step with its supported dashboard
or CLI secret-management flow.

## Replacing the Vercel cron jobs

The repository's vercel.json runs these every minute:

| Existing route | Purpose |
| --- | --- |
| /api/cron-conditional-orders | Limit and stop orders |
| /api/cron-tp-sl | Take-profit and stop-loss closes |
| /api/cron-liquidate | Liquidations |

`cloudflare/keeper-scheduler.js` is the replacement timer, **prepared but not
deployed or active**. wrangler.keepers.jsonc deliberately has an empty crons
array and VELO_KEEPERS_ENABLED false. Once the following gates pass, one
`* * * * *` trigger can call the three authenticated Supabase keeper routes.
Cloudflare supplies the timer; Supabase performs the transaction work.

The scheduler serializes calls within each tick, supplies stable run IDs,
rejects redirects and skipped/unconfigured jobs, and attempts the remaining
jobs if one fails. Public HTTP cannot trigger it. This does not prevent
overlapping ticks; durable backend coordination is required.

### Activation gates

1. Port all three handlers to a separate velo-keepers function with mandatory
   header authentication. The old handlers permit missing CRON_SECRET; the new
   port must fail closed and must not accept query-string credentials.
2. Bound historical scans and maintain durable progress or an active-position
   index. Validate the actual workload within Supabase Free's 150-second wall
   time and 2-second CPU budget. Copying unbounded scans is insufficient.
3. Add durable duplicate-run protection and a signer lock shared with the
   sponsorship API. Multiple jobs and the sponsor can use the same wallet.
4. Verify receipt status, nonce handling, Pyth fees and all three paths on Base
   Sepolia. Preserve actual imported contracts and RPC settings, including the
   distinct PYTH_CONTRACT_ADDRESS and VITE_PYTH_CONTRACT_ADDRESS variables.
5. Disable Vercel's schedules; configure VELO_KEEPER_BASE_URL, CRON_SECRET and the
   enable flag; activate the Cloudflare minute trigger. Verify successful runs
   before changing the terminal's DNS.

Current checks cover transport, authentication and Deno compatibility. Live API
checks verify fail-closed behavior only. No wallet transaction or trading flow
was exercised. Existing sponsor rate limiting, stats pagination and link-preview
fetch behavior still need review during production validation.

References:
- https://developers.cloudflare.com/workers/configuration/cron-triggers/
- https://developers.cloudflare.com/workers/platform/limits/
- https://supabase.com/docs/guides/functions/limits
- https://supabase.com/docs/guides/functions/dependencies
