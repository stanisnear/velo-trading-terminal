# Finish the VELO handover

The terminal is deployed at https://velo-trading-terminal.pages.dev. Reown,
Pyth and the sponsor wallet are identified and configured. No further API keys
are needed for the currently implemented trading paths.

## Owner action: pause the old Vercel terminal

The Vercel connection can read project details, but its attempt to pause the
terminal returned HTTP 403 for team `stanisnears-projects`. There is no separate
authenticated Vercel CLI in this workspace. Repeating that request will not fix
its permissions.

In Vercel, select **stanisnears-projects → velo-trading-terminal → Settings →
General → Pause Project**. If the button already says **Resume Project**, the
project is already paused; confirm that state. Preserve the project and its
settings; do not delete it. Keep legacy cron jobs disabled and do not resume
Vercel after Cloudflare execution is enabled.

Tell Codex when the terminal is paused. This prevents the old cron/sponsor and
the new backend from using the same wallet nonce at the same time.

## Remaining checks and activation

Cloudflare's minute timer is running in **dry-run mode**. Each tick reads real
orders, positions and fresh prices, and saves results. It does not fill orders,
close TP/SL positions, liquidate or sponsor gas. Supabase's two transaction
switches also remain false.

After the old writers are stopped, confirm the wallet has no pending transaction,
enable the new backend and timer execution, and verify confirmed Base Sepolia
receipts. Actual conditional-order and TP/SL fills need suitable test orders;
empty scans are not evidence of a fill. The existing liquidation candidate can
be simulated without sending a transaction.

The app domain is attached to Pages, with DNS cutover held until this handover.
Use your existing VELO account to verify sign-in, wallet connection, authenticated
Pyth prices and storage. Reown's project ID is installed; its allowed origins
must include the app domain, and the exact Pages origin if testing wallets there.

See [STATUS.md](STATUS.md) for evidence and [../CLOUDFLARE.md](../CLOUDFLARE.md)
for the operating guide. Optional Google Analytics and unused CDP settings remain
unreconciled; preserve their Vercel copies. Pyth provider access is separate from
free hosting, and no paid subscription was activated by this migration.
