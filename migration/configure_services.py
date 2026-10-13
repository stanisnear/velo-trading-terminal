#!/usr/bin/env python3
"""Run on the owner's Mac. Credentials are hidden and sent only to their provider.

Stages production settings; does not change DNS, enable schedules, disable
Vercel, or start trading. Secret values are never printed or put in Git.
"""
import argparse
import base64
import getpass
import json
import os
from pathlib import Path
import re
import secrets
import sys
import urllib.error
import urllib.parse
import urllib.request

TEAM = 'team_RDRP3vadkiN3qE9QSGkyvoFD'
PROJECT = 'prj_VqN7q6hAYUx1JK0B5S73VMSWoPOC'
ACCOUNT = '3478077c95c924efa5a2bf0c373f5dc4'
SUPABASE = 'btgfoekgvyvdflzjfehz'
SB_URL = 'https://' + SUPABASE + '.supabase.co'
CF_BASE = 'https://api.cloudflare.com/client/v4/accounts/' + ACCOUNT
PAGE = CF_BASE + '/pages/projects/velo-trading-terminal'
ALLOWED_HOSTS = {'api.vercel.com', 'api.cloudflare.com', 'api.supabase.com', SUPABASE + '.supabase.co'}

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

def api(url, token, method='GET', body=None):
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != 'https' or parsed.hostname not in ALLOWED_HOSTS or parsed.username or parsed.password:
        raise RuntimeError('Refusing an unexpected API destination')
    request = urllib.request.Request(url, method=method,
        data=None if body is None else json.dumps(body).encode(),
        headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'})
    try:
        with urllib.request.build_opener(NoRedirect).open(request, timeout=110) as response:
            raw = response.read(2_000_001)
            if len(raw) > 2_000_000:
                raise RuntimeError('API response exceeded the size limit')
            value = json.loads(raw) if raw else {}
    except urllib.error.HTTPError as error:
        # Error bodies and URLs can contain values. Never print them.
        raise RuntimeError(f'{parsed.hostname}: HTTP {error.code}; no credential values printed') from None
    except urllib.error.URLError:
        raise RuntimeError(f'{parsed.hostname}: connection failed') from None
    if isinstance(value, dict) and value.get('success') is False:
        raise RuntimeError(f'{parsed.hostname}: operation failed; inspect its dashboard')
    return value

def jwt_role(value):
    try:
        encoded = value.split('.')[1]
        return json.loads(base64.urlsafe_b64decode(encoded + '=' * (-len(encoded) % 4))).get('role')
    except (ValueError, IndexError, KeyError, TypeError):
        return None

def validate(values, required):
    missing = [key for key in required if not isinstance(values.get(key), str) or not values[key]]
    if missing:
        raise RuntimeError('Missing required names: ' + ', '.join(missing))
    for key, value in values.items():
        if not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]*', key) or not isinstance(value, str):
            raise RuntimeError('Invalid environment-variable format')
        if key.startswith('VITE_') and (re.search(r'PRIVATE|SECRET|PASSWORD|SERVICE_ROLE', key) or jwt_role(value) == 'service_role'):
            raise RuntimeError('A server credential cannot be published in ' + key)
    for key in ['SUPABASE_URL', 'VITE_SUPABASE_URL']:
        if key in values and values[key].rstrip('/') != SB_URL:
            raise RuntimeError(key + ' points to a different project; stop and reconcile it')
    if len(values['CRON_SECRET']) < 16 or len(values['CRON_SECRET']) > 512:
        raise RuntimeError('CRON_SECRET must contain 16–512 characters; coordinate a replacement before migration')
    for key in ['PRIVATE_KEY', 'VELO_SPONSOR_PRIVATE_KEY']:
        if not re.fullmatch(r'(?:0x)?[0-9a-fA-F]{64}', values[key]):
            raise RuntimeError(key + ' is not a 32-byte private key')
    for key, value in values.items():
        if key.endswith('_ADDRESS') or key.startswith('VITE_VELO_USDC_'):
            if not re.fullmatch(r'0x[0-9a-fA-F]{40}', value):
                raise RuntimeError(key + ' is not an Ethereum address')
    if len(values) + 8 > 100:
        raise RuntimeError('Too many Supabase secrets; reconcile before importing')

def map_values(values, gateway):
    backend = {('VELO_IMPORTED_' + key if key.startswith('SUPABASE_') else key): value for key, value in values.items()}
    backend.update(VELO_PROXY_TOKEN=gateway, VELO_KEEPERS_ENABLED='false', VELO_SPONSOR_ENABLED='false')
    frontend = {key: {'type': 'plain_text', 'value': value} for key, value in values.items() if key.startswith('VITE_')}
    # Explicit aliases for the same existing Supabase project; never expose the
    # service-role key. Existing VITE_ overrides remain authoritative.
    frontend.setdefault('VITE_SUPABASE_URL', {'type': 'plain_text', 'value': values['SUPABASE_URL']})
    frontend.setdefault('VITE_SUPABASE_ANON_KEY', {'type': 'plain_text', 'value': values['SUPABASE_ANON_KEY']})
    frontend['VELO_PROXY_TOKEN'] = {'type': 'secret_text', 'value': gateway}
    frontend['VELO_BACKEND_URL'] = {'type': 'plain_text', 'value': SB_URL + '/functions/v1/velo-api'}
    return backend, frontend

def from_vercel(token):
    base = 'https://api.vercel.com'
    metadata = api(f'{base}/v10/projects/{PROJECT}/env?teamId={TEAM}&decrypt=false', token)
    entries = [item for item in metadata.get('envs', []) if 'production' in item.get('target', []) and not item.get('gitBranch')]
    values = {}
    for item in entries:
        # Secret/Sensitive variables are write-only. Do not try to extract them
        # through builds, logs, debug routes, or alternative identities.
        if item.get('type') in ('secret', 'sensitive'):
            continue
        key, identity = item.get('key'), item.get('id')
        if not key or not identity:
            continue
        try:
            detail = api(f'{base}/v1/projects/{PROJECT}/env/{urllib.parse.quote(identity)}?teamId={TEAM}', token)
            if detail.get('type') not in ('secret', 'sensitive') and isinstance(detail.get('value'), str):
                values[key] = detail['value']
        except RuntimeError:
            pass
    return values, sorted({item['key'] for item in entries}), entries

def backup(values, metadata, gateway):
    directory = Path.home() / '.velo-migration'
    directory.mkdir(mode=0o700, exist_ok=True)
    path = directory / ('production-' + secrets.token_hex(6) + '.json')
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    # Restrict metadata to names and scopes: it may otherwise contain values.
    scopes = [{k: entry.get(k) for k in ('key','target','gitBranch','type')} for entry in metadata]
    with os.fdopen(fd, 'w') as file:
        json.dump({'values': values, 'gateway_token': gateway, 'scopes': scopes}, file, indent=2)
    print('Private local backup saved:', path)
    print('Keep this backup private. Do not attach it to a chat or commit it.')

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--values-file', type=Path, help='Optional local JSON map of exact Production names to values')
    parser.add_argument('--enable-backend', action='store_true', help='Final cutover only: enable keeper and sponsor handlers after old Vercel jobs are disabled')
    args = parser.parse_args()
    secret_url = f'https://api.supabase.com/v1/projects/{SUPABASE}/secrets'
    if args.enable_backend:
        print('Final cutover: use only after Vercel jobs/sponsorship are disabled and dry runs pass.')
        token = getpass.getpass('Supabase personal access token (hidden): ')
        api(secret_url, token, 'POST', [{'name': 'VELO_KEEPERS_ENABLED', 'value': 'true'}, {'name': 'VELO_SPONSOR_ENABLED', 'value': 'true'}])
        print('Backend enabled. Cloudflare schedules and DNS are unchanged.')
        return
    inventory = json.loads((Path(__file__).with_name('vercel-variable-inventory.json')).read_text())
    required = inventory['productionAndPreview'] + inventory['productionOnly']
    values, extra, metadata = {}, [], []
    if args.values_file:
        values = json.loads(args.values_file.read_text())
        if not isinstance(values, dict):
            raise RuntimeError('Values file must be a JSON object')
    else:
        print('Only Production is imported. Preview stays disabled and retains its separate Vercel configuration.')
        token = getpass.getpass('Vercel token scoped to stanisnears-projects (hidden; Enter for manual values): ')
        if token:
            values, extra, metadata = from_vercel(token)
            print('Readable production settings obtained:', len(values))
    for key in sorted(set(required + extra)):
        if not values.get(key):
            values[key] = getpass.getpass(key + ' (exact original value, hidden): ')
    validate(values, required)
    cf = getpass.getpass('Cloudflare API token: Pages Edit + Workers Scripts Edit (hidden): ')
    sb = getpass.getpass('Supabase token: Edge Function Secrets read-write (hidden): ')
    project = api(PAGE, cf)['result']
    if project.get('canonical_deployment'):
        raise RuntimeError('A terminal deployment already exists. Stop and coordinate updates rather than restaging live secrets.')
    api(secret_url, sb)  # Confirm access before writing anything.
    gateway = secrets.token_hex(32)
    backend, frontend = map_values(values, gateway)
    backup(values, metadata, gateway)
    api(secret_url, sb, 'POST', [{'name': k, 'value': v} for k,v in backend.items()])
    api(PAGE, cf, 'PATCH', {'deployment_configs': {'production': {'env_vars': frontend}}})
    api(CF_BASE + '/workers/scripts/velo-keeper-scheduler/secrets', cf, 'PUT',
        {'name': 'CRON_SECRET', 'type': 'secret_text', 'text': values['CRON_SECRET']})
    print('Production settings transferred. Both backend execution switches remain OFF.')
    print('No DNS, Vercel cron, Cloudflare schedule, or deployment was changed.')
    print('Tell Codex: configuration finished. No values or tokens need to be shared.')

if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, ValueError, OSError) as error:
        # JSON errors are safe generic errors; never display input strings.
        if isinstance(error, RuntimeError):
            print('Stopped:', str(error), file=sys.stderr)
        else:
            print('Stopped: could not read or parse the configuration. Values were not printed.', file=sys.stderr)
        sys.exit(1)
    except (KeyboardInterrupt, EOFError):
        print('\nCancelled. Secret values were not printed.', file=sys.stderr)
        sys.exit(1)
