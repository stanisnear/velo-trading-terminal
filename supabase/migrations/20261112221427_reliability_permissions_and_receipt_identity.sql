-- Remove historical permissive policies; permissive RLS policies combine with OR.
do $$ declare p record; begin
 for p in select policyname from pg_policies where schemaname='public' and tablename='notifications' loop
  execute format('drop policy %I on public.notifications',p.policyname);
 end loop;
end $$;
revoke all on public.notifications from public,anon,authenticated;
grant select,delete on public.notifications to authenticated;
grant update(read) on public.notifications to authenticated;
grant insert(user_id,type,message,related_id) on public.notifications to authenticated;
grant all on public.notifications to service_role;
create policy notifications_owner_read on public.notifications for select to authenticated
 using(user_id=(select auth.uid()));
create policy notifications_owner_update on public.notifications for update to authenticated
 using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy notifications_owner_delete on public.notifications for delete to authenticated
 using(user_id=(select auth.uid()));
-- Local financial confirmations remain available. Other-user social alerts must
-- use create_notification_for_user, which verifies the corresponding event.
create policy notifications_local_confirmation on public.notifications for insert to authenticated
 with check(user_id=(select auth.uid()) and actor_id is null and post_id is null and comment_id is null
  and retracted_at is null and not suppressed and type in
   ('LIQUIDATION','POSITION_CLOSED','POSITION_OPENED','TAKE_PROFIT','STOP_LOSS',
    'TRANSFER_SENT','TRANSFER_RECEIVED','DEPOSIT','WITHDRAW'));

-- Browser estimates cannot claim or modify the server's verified receipt fields.
-- Restrictive policies also apply alongside older owner-write policies.
revoke truncate,references,trigger on public.trade_history from public,anon,authenticated;
create policy receipt_history_client_insert on public.trade_history as restrictive for insert to authenticated
 with check(engine_address is null and chain_log_index is null);
create policy receipt_history_client_update on public.trade_history as restrictive for update to authenticated
 using(engine_address is null and chain_log_index is null)
 with check(engine_address is null and chain_log_index is null);
create policy receipt_history_client_delete on public.trade_history as restrictive for delete to authenticated
 using(engine_address is null and chain_log_index is null);

-- Receipt identity is engine + trade ID, never a shared timestamp or transaction
-- alone: one transaction may open several positions in the same market.
create or replace function public.velo_reconcile(p_action text,p jsonb)
 returns jsonb language plpgsql security invoker set search_path=public,velo_internal,pg_temp as $$
declare
 e text:=lower(p->>'engine'); h text:=lower(p->>'hash'); o uuid:=(p->>'owner')::uuid;
 c velo_internal.receipt_cursors; r jsonb; item jsonb; uid uuid; existing uuid; outcome text; s jsonb; superseded jsonb;
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
  if h is not null then
   insert into velo_internal.receipt_jobs(engine,hash,block_number)
    select e,h,(a->'balance'->>'blockNumber')::bigint from jsonb_array_elements(p->'accounts') a
     where a->'balance'->>'blockNumber' is not null limit 1 on conflict do nothing;
  end if;
  for item in select * from jsonb_array_elements(p->'accounts') loop
   select id into uid from public.profiles where lower(velo_wallet_address)=lower(item->>'trader');
   if uid is null then continue; end if;
   for r in select * from jsonb_array_elements(item->'history') loop
    existing:=null;
    if r->>'action'='OPEN' then
     select id into existing from public.trade_history where user_id=uid and action='OPEN'
      and pair=r->>'pair' and side=r->>'side'
      and (engine_address=e or engine_address is null)
      and (velo_trade_id=(r->>'velo_trade_id')::numeric
        or (velo_trade_id is null and lower(open_tx_hash)=h))
      and (engine_address=e or lower(open_tx_hash)=h)
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
    -- Keep receipt-derived history once. Preserve older client estimates in the
    -- private job journal before removing their duplicate from account totals.
    if r->>'action' in ('CLOSE','LIQUIDATION') and exists(
     select 1 from velo_internal.receipt_jobs where engine=e and hash=h) then
     with removed as(
      delete from public.trade_history old where old.user_id=uid and old.id<>(r->>'id')::uuid
       and old.engine_address is null and old.action in('CLOSE','LIQUIDATION')
       and old.pair=r->>'pair' and old.side=r->>'side'
       and lower(coalesce(old.close_tx_hash,old.tx_hash,substring(old.orderly_order_url from '0x[0-9a-fA-F]{64}')))=h
      returning to_jsonb(old) as record
     ) select jsonb_agg(record) into superseded from removed;
     if superseded is not null then
      update velo_internal.receipt_jobs set superseded_history=superseded_history||superseded where engine=e and hash=h;
     end if;
    end if;
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
