-- Receipt indexing is independent of browser sessions and Pyth availability.
create table velo_internal.receipt_cursors (
 engine text primary key, next_block bigint not null, backfill_block bigint not null,
 backfill_end bigint not null, owner uuid, locked_until timestamptz
);
create table velo_internal.receipt_jobs (
 engine text not null, hash text not null check (hash ~ '^0x[0-9a-f]{64}$'),
 block_number bigint not null, attempts integer not null default 0,
 available_at timestamptz not null default now(), lease_until timestamptz,
 completed_at timestamptz, last_error text,
 primary key(engine,hash)
);
create index receipt_jobs_pending on velo_internal.receipt_jobs(available_at,block_number)
 where completed_at is null;
alter table velo_internal.receipt_cursors enable row level security;
alter table velo_internal.receipt_jobs enable row level security;
revoke all on velo_internal.receipt_cursors,velo_internal.receipt_jobs from public,anon,authenticated;
grant all on velo_internal.receipt_cursors,velo_internal.receipt_jobs to service_role;

-- Balance is a separate measurement; unrealized-equity samples are never copied.
create table public.account_balance_snapshots (
 like public.account_equity_snapshots including defaults including constraints including indexes
);
alter table public.account_balance_snapshots drop constraint account_equity_snapshots_valuation_version_check;
alter table public.account_balance_snapshots alter column valuation_version set default 3;
alter table public.account_balance_snapshots add constraint balance_basis check(valuation_version=3);
alter table public.account_balance_snapshots add foreign key(user_id) references public.profiles(id) on delete cascade;
alter table public.account_balance_snapshots enable row level security;
revoke all on public.account_balance_snapshots from anon,authenticated;
grant select,insert on public.account_balance_snapshots to authenticated;
grant all on public.account_balance_snapshots to service_role;
create policy balance_read_own on public.account_balance_snapshots for select to authenticated
 using(user_id=(select auth.uid()));
create policy balance_observe_own on public.account_balance_snapshots for insert to authenticated
 with check(user_id=(select auth.uid()) and source='observed' and valuation_version=3
  and observed_at between now()-interval '90 days' and now()+interval '2 minutes'
  and block_number is null and block_hash is null and tx_hash is null
  and exists(select 1 from public.profiles p where p.id=(select auth.uid())
   and lower(p.velo_wallet_address)=trader_address));
create function public.get_account_balance_history(p_trader_address text,p_engine_address text)
 returns table(observed_at timestamptz,equity numeric,source text,valuation_version smallint)
 language sql stable security invoker set search_path=public,pg_temp as $$
 with samples as (
  select s.*,case when s.observed_at>=now()-interval '2 days' then s.bucket_at
   when s.observed_at>=now()-interval '30 days' then date_trunc('hour',s.observed_at)
   else date_trunc('day',s.observed_at) end chart_bucket
  from public.account_balance_snapshots s where s.user_id=(select auth.uid()) and s.chain_id=84532
   and s.trader_address=lower(p_trader_address) and s.engine_address=lower(p_engine_address)
 ), chosen as (
  select distinct on(chart_bucket) observed_at,equity,source,valuation_version
   from samples order by chart_bucket,observed_at desc
 ), boundary as(select observed_at,equity,source,valuation_version from samples order by observed_at limit 1)
 select * from(select * from chosen union select * from boundary) points order by observed_at;
$$;
revoke all on function public.get_account_balance_history(text,text) from public,anon;
grant execute on function public.get_account_balance_history(text,text) to authenticated,service_role;

alter table public.trade_history add column if not exists engine_address text;
alter table public.trade_history add column if not exists chain_log_index integer;

-- Only the server can ingest verified receipts. Every derived write and the job
-- acknowledgement share one database transaction.
create function public.velo_reconcile(p_action text,p jsonb)
 returns jsonb language plpgsql security invoker set search_path=public,velo_internal,pg_temp as $$
declare
 e text:=lower(p->>'engine'); h text:=lower(p->>'hash'); o uuid:=(p->>'owner')::uuid;
 c velo_internal.receipt_cursors; r jsonb; item jsonb; uid uuid; existing uuid; outcome text; s jsonb;
begin
 if p_action='profiles' then
  select coalesce(jsonb_agg(lower(velo_wallet_address)),'[]') into r from public.profiles
   where lower(velo_wallet_address) in(select jsonb_array_elements_text(p->'traders'));
  return r;
 elsif p_action='begin' then
  insert into velo_internal.receipt_cursors(engine,next_block,backfill_block,backfill_end)
   values(e,greatest(48312993,(p->>'head')::bigint-49999),48312993,greatest(48312993,(p->>'head')::bigint-49999))
   on conflict do nothing;
  select * into c from velo_internal.receipt_cursors where engine=e for update;
  if c.locked_until>now() then return jsonb_build_object('busy',true); end if;
  update velo_internal.receipt_cursors set owner=o,locked_until=now()+interval '150 seconds' where engine=e;
  return jsonb_build_object('next',c.next_block,'backfill',c.backfill_block,'backfillEnd',c.backfill_end);
 elsif p_action='ingest' then
  perform 1 from velo_internal.receipt_cursors where engine=e and owner=o and locked_until>now() for update;
  if not found then raise exception 'Reconciliation lease lost'; end if;
  insert into velo_internal.receipt_jobs(engine,hash,block_number)
   select e,lower(x->>'hash'),(x->>'block')::bigint from jsonb_array_elements(p->'receipts') x
   on conflict do nothing;
  update velo_internal.receipt_cursors set
   next_block=greatest(next_block,coalesce((p->>'next')::bigint,next_block)),
   backfill_block=greatest(backfill_block,coalesce((p->>'backfill')::bigint,backfill_block))
   where engine=e;
  return '{"saved":true}';
 elsif p_action='claim' then
  with picked as(select engine,hash from velo_internal.receipt_jobs
   where engine=e and completed_at is null and available_at<=now() and coalesce(lease_until,'-infinity')<=now()
   order by block_number desc limit 8 for update skip locked),
  leased as(update velo_internal.receipt_jobs j set lease_until=now()+interval '150 seconds',attempts=attempts+1
   from picked where j.engine=picked.engine and j.hash=picked.hash returning j.hash,j.block_number)
  select coalesce(jsonb_agg(to_jsonb(leased)),'[]') into r from leased;
  return r;
 elsif p_action='retry' then
  update velo_internal.receipt_jobs set lease_until=null,available_at=now()+make_interval(secs=>least(3600,15*attempts)),
   last_error=left(p->>'error',80) where engine=e and hash=h and completed_at is null;
  return '{"saved":true}';
 elsif p_action='release' then
  update velo_internal.receipt_cursors set owner=null,locked_until=null where engine=e and owner=o;
  return '{"saved":true}';
 elsif p_action='apply' then
  for item in select * from jsonb_array_elements(p->'accounts') loop
   select id into uid from public.profiles where lower(velo_wallet_address)=lower(item->>'trader');
   if uid is null then continue; end if;
   for r in select * from jsonb_array_elements(item->'history') loop
    existing:=null;
    if r->>'action'='OPEN' then
     select id into existing from public.trade_history where user_id=uid and action='OPEN'
      and pair=r->>'pair' and side=r->>'side' and
       (velo_trade_id=(r->>'velo_trade_id')::numeric or lower(open_tx_hash)=h or
        (abs(extract(epoch from(opened_at-(r->>'opened_at')::timestamptz)))<1))
      order by created_at limit 1;
    end if;
    insert into public.trade_history(id,user_id,pair,side,entry_price,exit_price,size,pnl,action,leverage,margin_mode,
      on_chain,venue,created_at,opened_at,velo_trade_id,open_tx_hash,close_tx_hash,tx_hash,orderly_order_url,engine_address,chain_log_index)
    values(coalesce(existing,(r->>'id')::uuid),uid,r->>'pair',r->>'side',(r->>'entry_price')::numeric,(r->>'exit_price')::numeric,
      (r->>'size')::numeric,(r->>'pnl')::numeric,r->>'action',(r->>'leverage')::numeric,'ISOLATED',true,'velo',
      (r->>'created_at')::timestamptz,(r->>'opened_at')::timestamptz,(r->>'velo_trade_id')::numeric,
      r->>'open_tx_hash',r->>'close_tx_hash',h,'https://sepolia.basescan.org/tx/'||h,e,(r->>'log_index')::integer)
    on conflict(id) do update set action=excluded.action,pnl=excluded.pnl,exit_price=excluded.exit_price,
      velo_trade_id=excluded.velo_trade_id,open_tx_hash=coalesce(excluded.open_tx_hash,trade_history.open_tx_hash),
      close_tx_hash=excluded.close_tx_hash,tx_hash=excluded.tx_hash,engine_address=e,chain_log_index=excluded.chain_log_index;
   end loop;
   for r in select * from jsonb_array_elements(item->'closes') loop
    outcome:=case when r->>'action'='LIQUIDATION' then 'LIQUIDATED' else 'CLOSED' end;
    for existing,s in select id,trade_snapshot from public.posts where author_id=uid
     and trade_snapshot->>'tradeId'=r->>'tradeId' and lower(trade_snapshot->>'contract')=e
     and lower(trade_snapshot->>'trader')=lower(item->>'trader') and trade_snapshot->>'updateMode'='live'
    loop
     s:=s||jsonb_build_object('status',outcome,'txHash',h,'closeTxHash',h,'closedAt',r->'closedAt','updatedAt',r->'closedAt');
     if s->>'onClose'='freeze' then s:=s||'{"closedSnapshot":true,"updateMode":"snapshot"}';
     else s:=s||jsonb_build_object('pnl',r->'pnl','pnlPct',r->'pnlPct','collateral',r->'collateral',
      'markPrice',r->'exitPrice','closePrice',r->'exitPrice'); end if;
     update public.posts set trade_snapshot=s where id=existing;
    end loop;
    insert into public.notifications(id,user_id,type,message,related_id,created_at,read)
     values((r->>'notificationId')::uuid,uid,
      case when outcome='LIQUIDATED' then 'LIQUIDATION' else 'POSITION_CLOSED' end,
      r->>'message','velo_'||(r->>'tradeId'),to_timestamp((r->>'closedAt')::numeric/1000),false)
     on conflict(id) do nothing;
   end loop;
   if item->'balance' is not null then
    r:=item->'balance';
    insert into public.account_balance_snapshots(user_id,chain_id,engine_address,trader_address,bucket_at,observed_at,equity,
     source,valuation_version,block_number,block_hash,tx_hash)
    values(uid,84532,e,lower(item->>'trader'),to_timestamp(floor((r->>'timestamp')::numeric/300000)*300),
     to_timestamp((r->>'timestamp')::numeric/1000),(r->>'value')::numeric,'chain_checkpoint',3,
     (r->>'blockNumber')::bigint,r->>'blockHash',h)
    on conflict(user_id,chain_id,engine_address,trader_address,bucket_at) do update
     set observed_at=excluded.observed_at,equity=excluded.equity,source=excluded.source,
      block_number=excluded.block_number,block_hash=excluded.block_hash,tx_hash=excluded.tx_hash
     where account_balance_snapshots.observed_at<=excluded.observed_at;
   end if;
  end loop;
  update velo_internal.receipt_jobs set completed_at=now(),lease_until=null,last_error=null where engine=e and hash=h;
  return '{"saved":true}';
 end if;
 raise exception 'Unknown reconciliation action';
end $$;
revoke all on function public.velo_reconcile(text,jsonb) from public,anon,authenticated;
grant execute on function public.velo_reconcile(text,jsonb) to service_role;
