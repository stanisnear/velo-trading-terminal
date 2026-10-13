# Finish the VELO connection

The code and empty hosting resources are ready. Production variables have **not**
been transferred, the terminal is **not** live on Cloudflare, and no new cron is
active. Do not change app.velotrading.live yet.

## Why the connected Vercel app still cannot export

The connector recognizes `stanisnear` and the expected default team, but its team
list is empty. Requests for project variables return HTTP 403 for
`stanisnears-projects`. ChatGPT's “full access” setting does not grant a missing
Vercel team authorization. There is also no authenticated Vercel CLI in the
assistant's session.

You can reconnect Vercel with access to that specific team. If that does not
resolve the scope, use the local helper below. Vercel Secret/Sensitive variables
are write-only, even with the correct permissions. Recover those exact values
from the original local configuration or provider; do not expose them via debug
routes or build logs. A wallet private key cannot be regenerated as the same key.

## One-time local setup

The helper runs on your Mac. It sends each token only to its own provider,
never prints variable values, and keeps credentials out of Git and this chat.

1. Create temporary tokens in your provider dashboards:

   - Vercel → account settings → Tokens: scope to **stanisnears-projects**.
     This is optional if you will enter the existing variables yourself.
   - Cloudflare → profile → API Tokens → Create custom token:
     **Account / Cloudflare Pages / Edit** and **Account / Workers Scripts / Edit**,
     restricted to your Cloudflare account.
   - Supabase → account → Access Tokens: restrict to **VELO Main** and grant
     **Edge Function Secrets / Read-write**. This is a management token, not the
     app's anon or service-role key.

2. In Terminal, use a new folder:

   ```sh
   git clone --branch codex/cloudflare-migration https://github.com/stanisnear/velo-trading-terminal.git VELO-Cloudflare
   cd VELO-Cloudflare
   python3 migration/configure_services.py
   ```

3. Paste tokens into the hidden prompts. The helper reads available Production
   settings and asks for missing/write-only values by name. Enter the exact
   original value. It does not echo input. If Vercel access still fails, restart
   and press Enter at the Vercel token prompt to enter values manually.

   For multiline values or an existing full configuration, a local JSON object
   mapping names to strings is also supported:

   ```sh
   python3 migration/configure_services.py --values-file /absolute/path/to/production-values.json
   ```

   JSON escapes such as `\n` become real newlines. Do not use placeholder values.
   Keep the file outside the repository. The helper writes a private local
   backup under `~/.velo-migration/`; do not upload or commit that backup.

4. Tell Codex **“configuration finished”**, or share the redacted error text.
   Do not share tokens or the private backup. You can revoke the temporary
   management tokens after the final cutover is complete.

This stage imports Production only. Preview remains disabled; its separate
settings are still on Vercel. Never delete the Vercel projects until every
environment and integration has been reconciled and backed up.

## What happens after configuration

Codex will build the terminal on its Pages URL, verify API calls and auth
redirects, run all three keepers in **dry-run** mode, check scan coverage and
runtime, and verify the actual RPC, contract, Pyth address and signer funding.
Dry runs do not sign or submit transactions.

Then the old Vercel schedules and old sponsorship endpoint must be disabled.
The same wallet must never have an uncoordinated old and new writer. Only after
that, this explicit final command enables the new backend handlers:

```sh
python3 migration/configure_services.py --enable-backend
```

It asks only for the Supabase management token. It does not enable the timer or
change DNS. Codex will activate the Cloudflare minute trigger, verify real
Base Sepolia fills and receipts, and switch app.velotrading.live only after the
checks pass. A wallet-signed test order may require you to approve it in the app.

## References

- https://vercel.com/docs/environment-variables
- https://vercel.com/docs/environment-variables/sensitive-environment-variables
- https://developers.cloudflare.com/fundamentals/api/get-started/create-token/
- https://supabase.com/docs/guides/platform/personal-access-tokens
