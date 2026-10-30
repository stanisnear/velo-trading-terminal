# Velo operations

Reviewed 27 October 2026. Testnet only. Never use an operator key to run an unreviewed script, publish a secret, delete user data to fix a display bug, or change a contract address as a frontend-only rollback.

## Deployment inventory

| Surface | Service / source | Production destination |
| --- | --- | --- |
| Terminal | Pages `velo-trading-terminal` / `stanisnear/velo-trading-terminal` | `app.velotrading.live` |
| Website/docs/blog | Pages `velo-landing` / `stanisnear/Velo-Landing` | `velotrading.live`, `www.velotrading.live` |
| Public API gateway | `cloudflare/worker.js`, packaged with terminal build | `/api/*`, allow-listed routes only |
| Prices | Worker `velo-pyth-proxy` | Private `VELO_PYTH` service binding |
| Scheduling | Worker `velo-keeper-scheduler` | One-minute cron, exactly one scheduler |
| Backend | Supabase project `btgfoekgvyvdflzjfehz` | `velo-api`, `velo-keepers` Edge Functions |
| Domain | Namecheap registrar, Cloudflare DNS/HTTPS | Do not restart the old Vercel deployment/schedulers |

Both Pages projects use **`codex/cloudflare-migration`** as their configured production branch. A push to `main` is not a production deployment. Verify the branch setting before changing the release process.

## Sharing and presentation releases

Use [SHARING.md](SHARING.md) for product semantics and component ownership. A docs or caption-only release does not require new trades, SQL changes, signer access or contract deployment. For app sharing changes, verify preserved drafts; compact versus image format; amount masking in export and details; independent light/dark appearance; live settlement versus frozen capture; unavailable-receipt states; and focus restoration. Exercise publishing/Storage with disposable fixtures only when that path changes.

Public facts must agree across the terminal README/vision, sharing guide, landing features, public docs and both launch-article paths. Keep dated transaction evidence intact instead of replacing it with current UI test counts. Check desktop/tablet caption bounds separately from laptop geometry; a caption fix should not alter the device's hinge, scale or scroll path.

## Configuration and secrets

| Location | Configuration |
| --- | --- |
| Public frontend | `VITE_*` RPC/bridge/Reown addresses and contract settings. `VITE_VELO_PERPS_V4_ACTIVE=true`, V4 address `0xE9AEcFbc5814ce3b2dB0107594d80F054e6dB52f`. Builder Code defaults to `bc_s0k82w2v` |
| Pages runtime | `VELO_BACKEND_URL`, `VELO_PROXY_TOKEN`, private `VELO_PYTH` binding, server-only `CMC_API_KEY` |
| Pyth Worker | Server-only `PYTH_API_KEY`, reviewed auth/rate-limit bindings |
| Supabase functions / scheduler | Service credentials, gateway/cron authorization, oracle access and signer configuration as required by the function source. These are separate from Pages settings |
| Local development | Ignored `.env.local` for necessary configuration; optional `.env.cmc.local` for local reference-data middleware. Never commit these files |

`supabase/functions/_shared/public-config.js` contains public defaults, not credentials. Hosted settings can override those defaults. Confirm active engine, oracle and market settings across **frontend and keepers**, not just one build. Retain old address variables for explicit legacy exit tooling; an old variable's presence does not make it the active engine.

Do not put signer, provider or service-role secrets in `VITE_*`, screenshots, logs or funding attachments. The public anon key is not a service-role key. Operator/keeper signing keys are server-side; the user's browser trading key is a separate full-key security risk described in [Architecture](ARCHITECTURE.md).

## Local checks

Use the Node version required by the locked dependencies (the UI test suite uses jsdom 27; Node 22.12+ is a suitable supported runtime).

```sh
npm ci
npm run dev -- --host 127.0.0.1 --port 4173
npm run typecheck
npm test
npm run build:cloudflare
```

The Cloudflare build checks required process environment variables; provide the public build settings from `scripts/check-cloudflare-env.mjs` without printing their values. Vite supplies public defaults to source code but is not a full local Cloudflare/Supabase emulator. Configure a reviewed development gateway for authenticated API/price testing rather than putting private service credentials into frontend code. `npm run build:supabase` creates ignored bundles for separate backend deployment; it sends no transactions and applies no migrations.

## Release checklist

1. Read README/VISION and the affected sources. Keep the working tree scoped; preserve contracts, migration history and unrelated changes.
2. For a contract change, run the Foundry suite and regenerate the ABI with `node scripts/generate-v4-abi.mjs`. Check the [manifest](../contracts/deployments/base_sepolia.json), live chain ID/version, oracle/feed IDs, risk caps, owner/guardian and pool reserves. A deployment needs its own source verification and acceptance plan.
3. Run TypeScript, relevant Node tests and the production build. For UI changes, inspect both themes and mobile/desktop, including focus, scroll and reduced motion.
4. Push the intended commit to the configured Pages branch. Confirm the **Cloudflare Pages check for that commit**, then verify the custom domain is serving its actual asset hashes. A saved Git commit alone is not publication.
5. Deploy affected standalone Workers or Supabase functions separately using the current authenticated tooling; consult CLI help before using version-sensitive flags. Avoid deploying unchanged backend code just to publish documentation.
6. Apply reviewed SQL changes separately with backups and explicit migration-history review. A frontend deployment does not apply SQL.
7. Verify a disposable Base Sepolia identity through the changed flow, confirm receipts and leave no test position/order open. No mainnet wallet or real collateral belongs in this test.
8. Record commit, deployment result, test evidence, outstanding limitations and documentation changes. Source verification and tests are not an independent audit.

The explicit opt-in acceptance script is:

```sh
node scripts/testnet-acceptance.mjs --live-testnet --faucet-transfer --trade --v4 --pair=HYPE-USD --with-triggers
```

This signs and sends **testnet** transactions using an ignored disposable fixture in `audit/`, may consume oracle/provider quota, and establishes a test identity. It is not part of `npm test`. Reuse a fixture only within its test workflow; do not attach its key/session to a funding application. Faucet cooldowns may mean an existing fixture does not mint again.

## Recovery and monitoring

- If a transaction is unresolved, use its original hash, receipt and signed-byte recovery path. Do not clear transaction journals or send a replacement action automatically. Network recovery is not proof of execution.
- If login stalls, cancel or switch wallet in the dialog. Approve/reject any still-open provider prompt before retrying. Refreshing or clearing all browser storage is not the primary fix and can destroy trading-wallet recovery material.
- Check scheduler runs, signer state, gas, fresh oracle access and RPC health. `velo_internal.keeper_runs` records scans/executions/errors; a scan that executed nothing may be valid. Never start another scheduler on the same signer as a workaround.
- Verify incoming transfers from successful token events and distinguish collateral settlement from external funding. Retain records for reconciliation rather than deleting duplicates blindly.
- For a bad frontend release, use Pages rollback and revert the source commit. Rollback does not revert SQL, functions, contract state or wallets. Keep V4 routing in a compatible build; never roll back to a legacy-only writer.
- For security/solvency concerns, investigate and use the reviewed entry-pause controls. Pausing new entries must not disable exits/cancellations. Escalate to the owner/guardian; do not improvise liquidity withdrawals.

## Database status and remaining work

A read-only hosted check on 21 October confirmed the deployed follow-counter triggers, private-contact RLS, notification-read restriction, notification-event validation and revocation of the unrestricted legacy transfer-recording RPC from ordinary authenticated callers. These completed changes should not be described as future work.

Remaining issues are **not closed by this documentation release**:

- Historical nonempty contact fields still exist on public profiles. Migrate/redact them with a reviewed backup, ownership checks and a retention plan, without exporting their values into reports.
- Multiple historical policies and legacy auth paths require a complete authorization review; the presence of RLS is not proof that every policy is correct. Recheck anonymous reads, cross-user writes, notification creation and account deletion.
- The hosted migration versions differ from several local filenames. Hosted history also contains `preserve_confirmed_signer_checkpoint`, which has no dedicated local migration file. Do not rename already-applied migrations or replay the folder blindly. Reconcile against a backed-up schema and create a reproducible baseline before spinning up a second environment.
- `supabase/migrations/` contains incremental changes to the existing project, not the complete original schema. No `supabase/schema/` baseline is currently committed.
- Independently indexed history/rankings, scoped browser-wallet permissions, key separation/multisig controls, moderation and exhaustive bridge/mobile/wallet lifecycle acceptance remain release gates.

This runbook describes how the current system is operated and what still needs review. It does not certify database security, perpetual solvency under a new model, or mainnet readiness.
