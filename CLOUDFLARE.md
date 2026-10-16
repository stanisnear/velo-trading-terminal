# VELO hosting and update guide

**15 October 2026: the terminal's custom domain is active on Cloudflare Pages.
The minute trading jobs and gas sponsorship are enabled after the owner paused
Vercel.** Open https://app.velotrading.live. See
[migration/STATUS.md](migration/STATUS.md) for transaction evidence and the
remaining browser/account checks.

## Where everything lives

| Component | Service | Name |
| --- | --- | --- |
| Landing page | Cloudflare Pages | velo-landing |
| Terminal and API gateway | Cloudflare Pages | velo-trading-terminal |
| Protected Pyth REST, stream and history | Cloudflare Worker | velo-pyth-proxy |
| API handlers and gas sponsorship | Supabase Edge Functions | velo-api |
| Limit/stop, TP/SL and liquidation handlers | Supabase Edge Functions | velo-keepers |
| Every-minute timer | Cloudflare Worker | velo-keeper-scheduler |
| Database, login, storage and realtime | Existing Supabase project | VELO Main |
| Domain registration and renewal | Namecheap | velotrading.live |
| DNS and HTTPS certificates | Cloudflare | velotrading.live zone |

The same Supabase project and on-chain contracts are retained. User records were
not copied into a replacement database. Cloudflare serves the website and routes
API requests to Supabase. Its private Pyth Worker checks a signed-in user's
session and keeps the provider key out of browser code.

The hosting services remain on free plans with quotas. Domain renewal is still
paid to Namecheap. Pyth's access plan is a separate provider dependency; a free
trial is not a promise of ongoing free access. No paid plan was selected here.

## Publish a frontend update

A **commit** saves your code in GitHub. A **deployment** publishes that saved
version on Cloudflare. You do not commit to Cloudflare.

The terminal's production branch is **codex/cloudflare-migration** in
**stanisnear/velo-trading-terminal**. Automatic production deployments are now
enabled: pushing to that branch starts a build. Pushing to `main` does not update
this production branch until the project is deliberately switched or merged.

Using your local checkout:

```sh
git fetch origin
git switch codex/cloudflare-migration
git pull --ff-only
# Edit the intended files, then review:
git diff
# Stage the files you changed, for example:
git add src/
git commit -m "Describe the app update"
git push origin codex/cloudflare-migration
```

You can also edit a small file directly on GitHub while viewing that branch and
commit it there. Never add .env files, private keys or temporary secret exports.

Open **Cloudflare → Workers & Pages → velo-trading-terminal → Deployments**.
The newest entry should show your commit and **Success**. Open its URL to check
the result. The build command is `npm run build:cloudflare`, output folder `dist`.
A failed build leaves the previous successful version online. Read its build
log; do not repeatedly redeploy an unchanged failing commit.

The landing uses its separate **Velo-Landing** repository and Pages project.
The landing also deploys `codex/cloudflare-migration`. Its `/docs` page and README now describe the current architecture and restricted feature status. This documentation update does not republish the previously cancelled landing-page design upload.

## Backend and Worker updates are separate

A terminal Git push deploys the frontend and Pages gateway. It does not deploy
Supabase functions or either standalone Worker.

For backend changes, use an authenticated Supabase CLI:

```sh
npm ci
npm run build:supabase
node --test migration/gateway.test.mjs migration/backend.test.mjs migration/scheduler.test.mjs migration/keepers.test.mjs migration/auth-pyth.test.mjs migration/pyth-proxy.test.mjs
npx --yes supabase@2.120.0 functions deploy velo-api velo-keepers --project-ref btgfoekgvyvdflzjfehz --use-api --no-verify-jwt
```

These two functions implement mandatory gateway/cron authentication themselves;
`--no-verify-jwt` is deliberate for them. Never copy that option to an unguarded
function. Do not deploy the old `api/cron-*.ts` handlers directly.

For Worker source changes, use an authenticated Wrangler CLI:

```sh
npx --yes wrangler@4.151.0 deploy --config cloudflare/wrangler.pyth.jsonc
npx --yes wrangler@4.151.0 deploy --config cloudflare/wrangler.keepers.jsonc
```

The committed scheduler config represents live execution mode. Use dry-run mode
for diagnostics when transactions must not be submitted; keep source and live
settings aligned before future deployments.
Preserve the Pages `VELO_PYTH` service binding to `velo-pyth-proxy`; that Worker
has no public workers.dev endpoint.

## Variables and secrets

| Setting | Where to change it | Follow-up |
| --- | --- | --- |
| Public `VITE_*` settings | Pages → Settings → Variables and Secrets | Rebuild the frontend |
| Pyth browser-provider key | velo-pyth-proxy → Settings → Variables and Secrets → PYTH_API_KEY | Keep it a secret |
| Pyth keeper-provider key | Supabase → Edge Functions → Secrets → PYTH_API_KEY | Keep the two copies synchronized |
| Wallet and private RPC keys | Supabase → Edge Functions → Secrets | Never use a `VITE_` name |
| Gateway token | Pages → VELO_PROXY_TOKEN | Coordinate backend verifier rotation |
| Timer token | velo-keeper-scheduler → CRON_SECRET | Coordinate backend verifier rotation |

The sponsor key supplied by the owner derives the same address as the already
imported keeper `PRIVATE_KEY`. A deliberate reuse flag and expected-address
check allow that existing secret to serve both paths. They share a durable
signer lock. The raw key is not duplicated into frontend settings or GitHub.

See [migration/SUPABASE.md](migration/SUPABASE.md) for token rotation. A public
SHA-256 verifier is not the token; never paste the verifier into a secret field.

## How the trading jobs work

One `* * * * *` Cloudflare trigger calls the three Supabase jobs sequentially.
They check conditional orders, TP/SL, then liquidations. Duplicate deliveries
use durable run IDs; all jobs and sponsorship share the same wallet lock.
Signed transactions are persisted before broadcast and recovered after timeouts.
Only a matching successful receipt counts as an executed fill.

The timer retries a network failure or HTTP 520–524 once after one second,
using the identical run ID. Both attempts share a 120-second job budget, and
the invocation stops sending requests 270 seconds after its scheduled time.
Authorization errors, busy jobs and backend failure results are not retried.
The `attempts` field in each timer result shows whether a retry was needed.

Each job scans at most 32 historical IDs, 32 indexed active IDs and eight newest
IDs, removing duplicates, with at most four transaction attempts per run. Large
backlogs can take multiple ticks. A one-minute schedule does not guarantee
execution within one minute or at an exact price.

**Current mode submits transactions when an order or position is eligible.**
The owner confirmed Vercel paused before activation. Keep the old Vercel project
paused; running both backends could cause wallet nonce conflicts.

To stop all scheduled execution, set the scheduler's `VELO_KEEPERS_ENABLED` to
`false`. To keep observing without submitting, set `VELO_KEEPERS_DRY_RUN` to
`true`. For a backend emergency stop, set Supabase secrets
`VELO_KEEPERS_ENABLED=false` and/or `VELO_SPONSOR_ENABLED=false`; these override
the enabled defaults in the deployed source. Pausing jobs also stops protective
TP/SL/liquidation execution. Resume only after resolving the cause and checking
pending signer state.

For monitoring, open **velo-keeper-scheduler → Observability** and look for
`velo_keeper_tick` with all three results successful. Then check **Supabase →
Edge Functions → velo-keepers → Logs** and the private saved job results. A green
timer is not proof that an individual order filled: verify its transaction hash.

## Rollback and limits

- Frontend: Pages → Deployments → a previous successful production deployment
  → Rollback. Revert the bad Git commit too, so it is not published again.
- Backend: rebuild a known-good commit and redeploy the affected Supabase
  function. A Pages rollback does not roll back SQL, Workers or Supabase.
- For keeper errors, check the fixed error code, RPC/Pyth availability, wallet
  balance and pending transaction. Never clear pending signed state blindly or
  run a second scheduler against the same wallet.
- Pyth requests allow only configured feeds and bounded candle ranges. Limits
  apply per IP, user and stream. Cloudflare rate limiting is approximate per
  location; it is not a global provider-billing cap.
- Check Cloudflare and Supabase usage dashboards as traffic grows. Free hosting
  has quotas; it is not unlimited infrastructure or a trading uptime guarantee.

Optional Google Analytics remains unconfigured. Legacy account/social authorization and contract accounting remain release blockers. See [the current engineering audit](docs/AUDIT-2026-10-15.md).

## October account/security release

Signature login is deployed in `velo-api` v9. Challenges are short-lived and single-use; the app preserves the existing wallet user's identity. Private contact APIs and owner-only notification reads are live. Global legacy password/session retirement and historical public-email removal are **not** applied. The broad pending plan lives outside automatic SQL migrations in `audit-plans/`.

A Git commit does not apply database migrations. Reconcile the live migration ledger before any SQL change; do not run all SQL files blindly against the existing database. Never run the pending account/social plan without the documented staging checks and owner approval.

The terminal build now includes `npm run typecheck`. For local review use `npm run typecheck`, `npm test` and `npm run build`. When rolling back, preserve compatibility with the deployed signature-login backend: do not restore the old password-derived login or weaker data access. A Pages rollback cannot undo account changes or replace an immutable contract.

## Daily five-minute check

1. Open both custom domains and the docs page; confirm the expected deployment commit is successful in Pages.
2. Check scheduler results for all three jobs, recent timestamps, errors and backlog. A successful scan with zero executions can be normal; inspect an individual transaction receipt when investigating a fill.
3. Check Pyth access/expiry, recent feed timestamps, RPC availability and the keeper/sponsor gas balance. Do not fund with real assets.
4. Check Supabase errors and Cloudflare/Supabase quota dashboards. Record incidents and disable affected new actions if correctness is uncertain; understand that stopping keepers stops protective execution too.
5. Before sharing a wider invitation, review the audit's P0 gates. Current UI restrictions are containment, not a contract repair.

## Login, cache and session behavior

Public posts, profiles and fills load independently of wallet login. Public cached results last at most five minutes and refresh from Supabase. Failed fills show Retry; a successful zero-row query shows an empty state. Clearing cookies/cache should not be a normal login step.

Log In connects the owner wallet if needed and requests a one-use signature. Sign Out clears the app session while preserving the local trading-wallet backup and owner connector. After 30 minutes without activity the app signs out, warning during the last minute; eight hours requires a new sign-in regardless of activity. This does not close positions or stop keepers. Browser key storage is still plaintext: the session lock is not a secure key vault.

Wallet settings keep key confirmation/reveal open across price/profile refreshes. Recovery checks the expected address before replacing a stored key; cancel or mismatch leaves the previous key intact. Keep a secure backup and never paste it into support chats.
