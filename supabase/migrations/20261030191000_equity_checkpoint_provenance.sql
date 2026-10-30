-- A flat-account checkpoint is proven by block state, not a trade receipt.
alter table public.account_equity_snapshots add column block_hash text
  check (block_hash is null or block_hash ~ '^0x[0-9a-f]{64}$');
alter table public.account_equity_snapshots drop constraint account_equity_snapshots_check1;
alter table public.account_equity_snapshots add constraint equity_checkpoint_evidence
  check (source <> 'chain_checkpoint' or (block_number is not null and block_hash is not null));
drop policy equity_observe_own on public.account_equity_snapshots;
create policy equity_observe_own on public.account_equity_snapshots for insert to authenticated
  with check (user_id = (select auth.uid()) and source = 'observed'
    and observed_at <= now() + interval '2 minutes' and block_number is null and block_hash is null and tx_hash is null
    and exists (select 1 from public.profiles p where p.id = (select auth.uid())
      and lower(p.velo_wallet_address) = trader_address));

create or replace function public.get_account_equity_history(p_trader_address text, p_engine_address text)
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
  ), boundary as (
    select observed_at,equity,source,valuation_version from samples order by observed_at limit 1
  ) select * from (select * from chosen union select * from boundary) all_points order by observed_at;
$$;
