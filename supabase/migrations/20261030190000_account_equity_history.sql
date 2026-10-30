-- Private account observations; never an input to balances, execution or rankings.
create table public.account_equity_snapshots (
  user_id uuid not null references public.profiles(id) on delete cascade,
  chain_id integer not null check (chain_id = 84532),
  engine_address text not null check (engine_address ~ '^0x[0-9a-f]{40}$'),
  trader_address text not null check (trader_address ~ '^0x[0-9a-f]{40}$'),
  bucket_at timestamptz not null,
  observed_at timestamptz not null,
  equity numeric not null check (equity >= 0 and equity < 1000000000000000),
  source text not null check (source in ('observed', 'chain_checkpoint')),
  valuation_version smallint not null default 2 check (valuation_version in (1,2)),
  block_number bigint,
  tx_hash text check (tx_hash is null or tx_hash ~ '^0x[0-9a-f]{64}$'),
  primary key (user_id, chain_id, engine_address, trader_address, bucket_at),
  check (bucket_at = to_timestamp(floor(extract(epoch from observed_at)/300)*300)),
  check (source <> 'chain_checkpoint' or (block_number is not null and tx_hash is not null))
);
alter table public.account_equity_snapshots enable row level security;
revoke all on public.account_equity_snapshots from anon, authenticated;
grant select, insert on public.account_equity_snapshots to authenticated;
grant all on public.account_equity_snapshots to service_role;
create policy equity_read_own on public.account_equity_snapshots for select to authenticated
  using (user_id = (select auth.uid()));
create policy equity_observe_own on public.account_equity_snapshots for insert to authenticated
  with check (user_id = (select auth.uid()) and source = 'observed'
    and observed_at <= now() + interval '2 minutes' and block_number is null and tx_hash is null
    and exists (select 1 from public.profiles p where p.id = (select auth.uid())
      and lower(p.velo_wallet_address) = trader_address));

-- Preserve the full account span while returning bounded chart resolution.
-- Each bucket uses an actual observation, never an invented/interpolated value.
create function public.get_account_equity_history(p_trader_address text, p_engine_address text)
returns table(observed_at timestamptz, equity numeric, source text, valuation_version smallint)
language sql stable security invoker set search_path = public, pg_temp as $$
  with samples as (
    select s.*, case
      when s.observed_at >= now()-interval '2 days' then s.bucket_at
      when s.observed_at >= now()-interval '30 days' then date_trunc('hour',s.observed_at at time zone 'UTC') at time zone 'UTC'
      else date_trunc('day',s.observed_at at time zone 'UTC') at time zone 'UTC' end as chart_bucket
    from public.account_equity_snapshots s
    where s.user_id = (select auth.uid()) and s.chain_id = 84532
      and s.trader_address = lower(p_trader_address) and s.engine_address = lower(p_engine_address)
  ), chosen as (
    select distinct on (chart_bucket) observed_at,equity,source,valuation_version
    from samples order by chart_bucket,observed_at desc
  ) select * from chosen order by observed_at;
$$;
revoke all on function public.get_account_equity_history(text,text) from public, anon;
grant execute on function public.get_account_equity_history(text,text) to authenticated, service_role;
