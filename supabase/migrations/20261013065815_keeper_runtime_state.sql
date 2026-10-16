-- Runtime state only: no changes to user tables, balances, orders or positions.
create schema if not exists velo_internal;
revoke all on schema velo_internal from public, anon, authenticated;
grant usage on schema velo_internal to service_role;

create table velo_internal.keeper_state (
  scope text primary key,
  cursor_id bigint not null default 1 check (cursor_id > 0),
  owner uuid,
  locked_until timestamptz,
  last_finished_at timestamptz,
  last_result jsonb
);
create table velo_internal.keeper_items (
  scope text not null references velo_internal.keeper_state(scope),
  item_id bigint not null check (item_id > 0),
  checked_at timestamptz not null default now(),
  primary key (scope, item_id)
);
create index keeper_items_due on velo_internal.keeper_items(scope, checked_at);
create table velo_internal.keeper_runs (
  scope text not null references velo_internal.keeper_state(scope),
  run_id text not null,
  finished_at timestamptz not null default now(),
  result jsonb not null,
  primary key (scope, run_id)
);
create index keeper_runs_age on velo_internal.keeper_runs(finished_at);
create table velo_internal.signers (
  wallet text primary key check (wallet ~ '^0x[0-9a-f]{40}$'),
  owner uuid,
  locked_until timestamptz,
  pending_hash text,
  pending_raw text,
  last_hash text,
  last_status text,
  updated_at timestamptz not null default now(),
  check ((pending_hash is null) = (pending_raw is null))
);
create table velo_internal.sponsor_limits (
  address text primary key check (address ~ '^0x[0-9a-f]{40}$'),
  requested_at timestamptz not null
);
alter table velo_internal.keeper_state enable row level security;
alter table velo_internal.keeper_items enable row level security;
alter table velo_internal.keeper_runs enable row level security;
alter table velo_internal.signers enable row level security;
alter table velo_internal.sponsor_limits enable row level security;
revoke all on all tables in schema velo_internal from public, anon, authenticated;
grant select, insert, update, delete on all tables in schema velo_internal to service_role;

-- Invoker rights: only service_role can execute or access the private tables.
-- No SECURITY DEFINER and no new browser-accessible data.
create function public.velo_runtime(p_action text, p jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  s velo_internal.keeper_state%rowtype;
  w velo_internal.signers%rowtype;
  result jsonb;
  item jsonb;
  scope_key text := p->>'scope';
  wallet_key text := lower(p->>'wallet');
  owner_id uuid := nullif(p->>'owner','')::uuid;
  affected integer;
begin
  if p_action in ('claim_job','save_scan','finish_job') then
    if scope_key is null or length(scope_key) > 160 or owner_id is null then
      raise exception 'invalid job parameters';
    end if;
    if p_action = 'claim_job' then
      if length(p->>'runId') > 120 or p->>'runId' is null then raise exception 'invalid run id'; end if;
      insert into velo_internal.keeper_state(scope) values(scope_key) on conflict do nothing;
    end if;
    select * into s from velo_internal.keeper_state where scope = scope_key for update;
    if not found then raise exception 'unknown job'; end if;
    if p_action = 'claim_job' then
      select r.result into result from velo_internal.keeper_runs r
        where r.scope = scope_key and r.run_id = p->>'runId';
      if found then return jsonb_build_object('duplicate',true,'result',result); end if;
      if s.locked_until > clock_timestamp() then return jsonb_build_object('busy',true); end if;
      update velo_internal.keeper_state set owner=owner_id,
        locked_until=clock_timestamp()+interval '180 seconds' where scope=scope_key;
      select coalesce(jsonb_agg(t.item_id), '[]'::jsonb) into result from (
        select item_id from velo_internal.keeper_items where scope=scope_key
        order by checked_at, item_id limit 32
      ) t;
      delete from velo_internal.keeper_runs where (scope,run_id) in (
        select scope,run_id from velo_internal.keeper_runs
        where finished_at < now()-interval '7 days' order by finished_at limit 100
      );
      return jsonb_build_object('cursor',s.cursor_id,'active',result,
        'activeCount',(select count(*) from velo_internal.keeper_items where scope=scope_key));
    end if;
    if s.owner is distinct from owner_id or s.locked_until <= clock_timestamp() then
      raise exception 'job lease lost';
    end if;
    if p_action = 'save_scan' then
      if jsonb_typeof(p->'items') <> 'array' or jsonb_array_length(p->'items') > 96 then
        raise exception 'invalid scan';
      end if;
      for item in select value from jsonb_array_elements(p->'items') loop
        if (item->>'id')::bigint < 1 then raise exception 'invalid item id'; end if;
        if (item->>'active')::boolean then
          insert into velo_internal.keeper_items(scope,item_id,checked_at)
            values(scope_key,(item->>'id')::bigint,clock_timestamp())
            on conflict(scope,item_id) do update set checked_at=excluded.checked_at;
        else
          delete from velo_internal.keeper_items where scope=scope_key and item_id=(item->>'id')::bigint;
        end if;
      end loop;
      if (p->>'cursor')::bigint < s.cursor_id then raise exception 'cursor cannot go backwards'; end if;
      update velo_internal.keeper_state set cursor_id=(p->>'cursor')::bigint where scope=scope_key;
      return jsonb_build_object('saved',true);
    end if;
    if p_action = 'finish_job' then
      if pg_column_size(p->'result') > 16384 then raise exception 'result too large'; end if;
      insert into velo_internal.keeper_runs(scope,run_id,result)
        values(scope_key,p->>'runId',p->'result') on conflict do nothing;
      update velo_internal.keeper_state set owner=null,locked_until=null,
        last_finished_at=clock_timestamp(),last_result=p->'result' where scope=scope_key;
      return jsonb_build_object('finished',true);
    end if;
  elsif p_action in ('claim_signer','record_tx','clear_tx','release_signer') then
    if wallet_key is null or wallet_key !~ '^0x[0-9a-f]{40}$' or owner_id is null then
      raise exception 'invalid signer parameters';
    end if;
    if p_action='claim_signer' then
      insert into velo_internal.signers(wallet) values(wallet_key) on conflict do nothing;
    end if;
    select * into w from velo_internal.signers where wallet=wallet_key for update;
    if not found then raise exception 'unknown signer'; end if;
    if p_action='claim_signer' then
      if w.locked_until > clock_timestamp() then return jsonb_build_object('busy',true); end if;
      update velo_internal.signers set owner=owner_id,locked_until=clock_timestamp()+interval '180 seconds',
        updated_at=clock_timestamp() where wallet=wallet_key;
      return jsonb_build_object('pendingHash',w.pending_hash,'pendingRaw',w.pending_raw);
    end if;
    if w.owner is distinct from owner_id or w.locked_until <= clock_timestamp() then
      raise exception 'signer lease lost';
    end if;
    if p_action='record_tx' then
      if w.pending_hash is not null then raise exception 'unresolved transaction'; end if;
      if p->>'hash' is null or p->>'hash' !~ '^0x[0-9a-f]{64}$' or
        p->>'raw' is null or p->>'raw' !~ '^0x[0-9a-f]+$' or length(p->>'raw') > 131072 then
        raise exception 'invalid transaction';
      end if;
      update velo_internal.signers set pending_hash=p->>'hash',pending_raw=p->>'raw',
        updated_at=clock_timestamp() where wallet=wallet_key;
    elsif p_action='clear_tx' then
      if w.pending_hash is distinct from p->>'hash' or p->>'status' is null or p->>'status' not in ('success','reverted') then
        raise exception 'invalid receipt';
      end if;
      update velo_internal.signers set last_hash=pending_hash,last_status=p->>'status',
        pending_hash=null,pending_raw=null,updated_at=clock_timestamp() where wallet=wallet_key;
    else
      -- A pending signed transaction stays durable after lease release or timeout.
      update velo_internal.signers set owner=null,locked_until=null,
        updated_at=clock_timestamp() where wallet=wallet_key;
    end if;
    return jsonb_build_object('saved',true);
  elsif p_action='sponsor_rate' then
    insert into velo_internal.sponsor_limits(address,requested_at)
      values(lower(p->>'address'),clock_timestamp())
      on conflict(address) do update set requested_at=excluded.requested_at
      where velo_internal.sponsor_limits.requested_at < clock_timestamp()-interval '5 minutes';
    get diagnostics affected = row_count;
    return jsonb_build_object('allowed',affected=1);
  end if;
  raise exception 'unknown runtime operation';
end;
$$;
revoke all on function public.velo_runtime(text,jsonb) from public, anon, authenticated;
grant execute on function public.velo_runtime(text,jsonb) to service_role;
