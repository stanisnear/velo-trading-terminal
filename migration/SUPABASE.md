# Supabase implementation

Existing project: VELO Main (`btgfoekgvyvdflzjfehz`). No new project or paid plan.
Current deployment status and gates are in STATUS.md; owner setup is in
CONNECT-SERVICES.md; the operating guide is ../CLOUDFLARE.md.

## Build and deploy

`npm run build:supabase` produces self-contained ESM bundles for `velo-api` and
`velo-keepers`. esbuild 0.25.12 uses the existing locked viem dependency graph,
avoiding a URL dependency that Supabase's Deno npm resolver rejects.
Generated files and bundles are gitignored. No secret values enter this build.

The API retains the five existing read handlers through the req/res adapter
and uses a new coordinated sponsor handler. Cron ABI layouts are extracted
from the original api/cron files with the TypeScript parser. The new keeper
engine uses those layouts; old fail-open cron handlers are never exposed.

Each deployment includes bundle.js and deno.json, with entrypoint bundle.js.
When updating through the Supabase connector, explicitly pass
`import_map_path: deno.json`; reusing the previous absolute temporary path fails.
JWT verification is false because authentication is implemented in each bridge:
mandatory X-Velo-Proxy-Token for API calls and mandatory Bearer CRON_SECRET for
keepers. Authentication happens before handler execution. Keep those guards.

## Configuration

| Source | Destination |
| --- | --- |
| VITE_* public settings | Cloudflare production build and backend secrets |
| SUPABASE_* | Backend secret with VELO_IMPORTED_ prepended |
| Other server settings, including CDP | Backend secrets, exact original names |
| Generated private gateway token | VELO_PROXY_TOKEN in Pages and Supabase |
| API base | Pages VELO_BACKEND_URL ending /functions/v1/velo-api |
| Existing CRON_SECRET | Backend and scheduler secret, identical values |

Imported SUPABASE aliases take precedence over Supabase's built-in defaults.
The helper explicitly aliases public Supabase URL/anon values into VITE_
settings if absent; it never uses a service-role key in the frontend.
Production and Preview must not be mixed. The helper keeps execution switches
false; backend enablement is a separate final cutover step.

## Keeper behavior

One Cloudflare minute trigger invokes conditional orders, TP/SL and liquidation
sequentially. The separate velo-keepers endpoint accepts POST only, authenticates
before reading work, rejects query-string credentials, bounds input, and checks
stable run IDs and timestamp freshness. Dry runs do not sign transactions.

The engine verifies Base Sepolia chain ID 84532, contract version 2/3, and the
contract's own PYTH address against configuration. Conditional orders require
V3. It checks fresh Hermes prices by feed ID and publish time, reads the exact
on-chain Pyth update fee and simulates execution before sending. Missing
configuration fails closed; there are no hardcoded RPC/contract fallbacks.

Private tables maintain a historical cursor and an active-item index. Each
run covers up to 32 historical IDs, 32 oldest indexed active IDs and eight
newest IDs, removing duplicates. Read failures do not advance past an unread
historical ID. Four transaction attempts and time/network budgets bound work.
Large active sets can take multiple minutes; monitor backlog and runtime.

Job leases and completed run IDs prevent duplicate overlapping runs. All jobs
and sponsorship use the same signer lease. Signed raw bytes/hash are persisted
before broadcast, then a matching receipt is required before clearing state.
Timeouts preserve pending state so later calls recover the same transaction.
Reverted or replaced transactions are not reported as successful fills.
Only service_role can execute the coordination RPC or read private state.

The five-minute per-recipient sponsor cooldown is durable. Funding is checked
under the signer lock after recovery, and success requires a confirmed receipt.

## Database migrations and review

Applied migration filenames match the versions returned by the live Supabase
migration history. The SQL runtime smoke checks use a rollback transaction.
Anonymous mutation restrictions preserve authenticated app calls and public
profile reads. Existing signed-in cross-user write authorization still needs
separate review; do not treat a warning-free transport test as a security audit.

## Validation commands

```sh
node --test migration/gateway.test.mjs migration/backend.test.mjs migration/scheduler.test.mjs migration/keepers.test.mjs
python3 -m unittest discover -s migration -p 'configure_services_test.py'
npx --yes deno@2.2.6 run --no-config --no-npm --no-remote --no-lock --allow-env=VELO_PROXY_TOKEN,GA_PROPERTY_ID,GA_CLIENT_EMAIL,GA_PRIVATE_KEY,VITE_SUPABASE_URL,VITE_SUPABASE_ANON_KEY,CRON_SECRET,VELO_KEEPERS_ENABLED migration/backend.deno.mjs
```

References:
- https://developers.cloudflare.com/workers/configuration/cron-triggers/
- https://developers.cloudflare.com/workers/platform/limits/
- https://supabase.com/docs/guides/functions/limits
- https://supabase.com/docs/guides/functions/dependencies
- https://supabase.com/docs/guides/database/database-linter
