# VELO hosting and update guide

**Status, 13 October 2026: migration staged, not cut over.** The landing page is
on Cloudflare. The backend is deployed and twenty Cloudflare settings are
staged. The terminal still points to Vercel: Reown, Pyth access, gas sponsorship
and final end-to-end checks remain outstanding. See [migration/CONNECT-SERVICES.md](migration/CONNECT-SERVICES.md)
for the one-time setup and [migration/STATUS.md](migration/STATUS.md) for evidence.

## Where everything lives

| Component | Service | Name |
| --- | --- | --- |
| Landing page | Cloudflare Pages | velo-landing |
| Trading frontend and API gateway | Cloudflare Pages | velo-trading-terminal |
| API handlers and gas sponsorship | Supabase Edge Functions | velo-api |
| Limit/stop, TP/SL, liquidation handlers | Supabase Edge Functions | velo-keepers |
| Minute timer | Cloudflare Worker | velo-keeper-scheduler |
| Database, login, storage, realtime | Existing Supabase project | VELO Main |
| Domain registration/renewal | Namecheap | velotrading.live |
| DNS and certificates | Cloudflare | velotrading.live zone |

Keeping the same app domain avoids changing your public URLs. Supabase remains
the same project; user records are not copied to a new database. Cloudflare
hosts the web interface; its gateway calls the private Supabase API with a
secret token. The backend stores only its SHA-256 verifier. Browser bundles
contain public VITE_ settings only.

These services are configured for free plans, with usage quotas. Free hosting
is not unlimited capacity or a guarantee of uninterrupted trading. Domain
renewal at Namecheap is separate from hosting.

Pyth now requires an API key for the price updates used by this app. Its
documented free trial is not ongoing free access. No Pyth subscription was
started. This dependency must be resolved separately from free Cloudflare
hosting before trading can be enabled.

## Updating the frontend after cutover

A **commit** saves code in GitHub. A **deployment** builds and publishes that
code on Cloudflare. You do not commit code to Cloudflare.

The configured production branch is `codex/cloudflare-migration`, in each
repository separately. Terminal automatic deployments are currently paused
until configuration is complete. Once enabled, pushing to that branch triggers
a build; pushing to `main` does not update this production branch.

```sh
git switch codex/cloudflare-migration
git pull --ff-only
# Edit the app files.
git add src/
git commit -m "Describe the app update"
git push origin codex/cloudflare-migration
```

Review the changed files before committing. Include other intended files when
needed; never add .env files or private backups. In Cloudflare, open **Workers &
Pages → velo-trading-terminal → Deployments**. Confirm the commit and a
successful production deployment. Build command: `npm run build:cloudflare`;
output folder: `dist`.

For the landing, use its separate `Velo-Landing` repository and Pages project.
Its existing production branch already deploys automatically.

## Backend updates are separate

A frontend Git push does not deploy Supabase functions or the timer. Rebuild
and deploy the backend when changing its source:

```sh
npm ci
npm run build:supabase
node --test migration/gateway.test.mjs migration/backend.test.mjs migration/scheduler.test.mjs migration/keepers.test.mjs migration/auth-pyth.test.mjs
npx --yes supabase@2.120.0 functions deploy velo-api velo-keepers --project-ref btgfoekgvyvdflzjfehz --use-api --no-verify-jwt
```

Use an authenticated Supabase CLI. `--no-verify-jwt` is deliberate here: these
two entrypoints implement mandatory gateway-token or cron-secret authentication.
Do not apply that flag to an unguarded function. Never deploy old api/cron files
directly; they lack the migration's coordination layer.

The timer source/config lives under `cloudflare/`. Use its deployed Settings
and Cron Triggers for current state. The checked-in config intentionally has
no schedule while staged; update it at cutover before using it for later
deployments. Database changes use the committed Supabase migrations; do not
rerun the older root-level SQL setup files, which contain superseded permissions.

## Cron operation and monitoring

After activation, one `* * * * *` Cloudflare trigger calls all three jobs in
sequence. Each job has a durable run ID. Active positions/orders and scan
progress are tracked privately in Supabase. A shared signer lock also covers
sponsorship; signed transactions are saved before broadcast and recovered after
timeouts. Only successful receipts count as fills.

The free-tier implementation processes at most 32 historical IDs, 32 indexed
active IDs and eight newest IDs per job per tick (duplicates removed), with at
most four transaction attempts. This is bounded work, not a promise that every
order fills within one minute. Initial history must finish indexing, and active
backlog/runtime must be checked against actual load before cutover.

In Cloudflare, open **velo-keeper-scheduler → Cron Triggers / Observability**.
Look for recent successful executions. In Supabase, open **Edge Functions →
velo-keepers → Logs** for job names, counts and errors. Private database runtime
tables retain recent results and pending transaction state. A green timer alone
does not prove a particular order filled; verify its confirmed transaction hash.

## Settings, failures and rollback

- Public frontend settings: Pages project → Settings → Variables and Secrets.
  Rebuild after changes to VITE_ values.
- Backend secrets: Supabase → Edge Functions → Secrets. Preserve exact values
  and imported SUPABASE_ aliases; redeploy to refresh any module-level settings.
- Timer secret: Worker → Settings → Variables and Secrets → CRON_SECRET.
  It matches the backend's SHA-256 verifier (or an explicit Supabase override).
  See migration/SUPABASE.md for coordinated rotation. Do not put the token in
  GitHub source or a URL. Gateway authentication uses the same arrangement
  with a separate token.
- Frontend rollback: Pages → Deployments → a previous successful production
  deployment → rollback. Then revert the bad Git commit so it is not redeployed.
- Backend rollback: rebuild a known-good Git commit and redeploy the affected
  function. A Pages rollback does not roll back Supabase code or SQL.
- If cron jobs fail, inspect the fixed error codes, RPC/Pyth availability,
  signer balance and pending transaction. Do not blindly clear pending state
  or enable a second scheduler. Pausing jobs also pauses protective execution.

## Still to validate

Remaining variables and Preview reconciliation; actual login/onboarding and
wallet flow; sponsor identity; authenticated Pyth browser/keeper updates; all
three live keeper paths; API quotas and execution budgets; optional analytics/CDP
configuration; and the final domain/HTTPS check. Existing signed-in cross-user
RPC behavior needs a broader authorization review. This migration is not a
claim of a complete security audit or flawless operation.
