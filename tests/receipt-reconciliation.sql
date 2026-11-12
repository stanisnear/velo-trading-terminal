-- Run as service_role / database administrator; fixtures always roll back.
begin;
do $$
declare e text:='0x9999999999999999999999999999999999999999'; h text:='0x'||repeat('ab',32);
 o uuid:=gen_random_uuid(); u uuid; w text; payload jsonb;
begin
 if has_function_privilege('authenticated','public.velo_reconcile(text,jsonb)','EXECUTE')
  or has_function_privilege('anon','public.velo_reconcile(text,jsonb)','EXECUTE') then raise exception 'Public reconciliation access'; end if;
 select id,lower(velo_wallet_address) into u,w from public.profiles where velo_wallet_address is not null limit 1;
 perform public.velo_reconcile('begin',jsonb_build_object('engine',e,'owner',o,'head',57000000));
 perform public.velo_reconcile('ingest',jsonb_build_object('engine',e,'owner',o,'next',57000001,'receipts',jsonb_build_array(jsonb_build_object('hash',h,'block',57000000))));
 perform public.velo_reconcile('claim',jsonb_build_object('engine',e));
 payload:=jsonb_build_object('engine',e,'hash',h,'accounts',jsonb_build_array(jsonb_build_object('trader',w,
  'history',jsonb_build_array(jsonb_build_object('id','aaaaaaaa-bbbb-5ccc-8ddd-eeeeeeeeeeee','action','CLOSE','pair','BTC/USD','side','LONG',
   'entry_price',100,'exit_price',110,'size',100,'pnl',10,'leverage',1,'created_at',now(),'opened_at',now(),
   'velo_trade_id',999999999,'close_tx_hash',h,'log_index',1)),
  'closes','[]'::jsonb,'balance',jsonb_build_object('timestamp',extract(epoch from now())*1000,'value',-1,'blockNumber',57000000,'blockHash',h))));
 begin
  perform public.velo_reconcile('apply',payload);
  raise exception 'Invalid balance was accepted';
 exception when check_violation then null; end;
 if exists(select 1 from public.trade_history where id='aaaaaaaa-bbbb-5ccc-8ddd-eeeeeeeeeeee') then raise exception 'Partial history committed'; end if;
 if exists(select 1 from velo_internal.receipt_jobs where engine=e and hash=h and completed_at is not null) then raise exception 'Failed receipt acknowledged'; end if;
 insert into public.trade_history(id,user_id,pair,side,entry_price,exit_price,size,pnl,action,tx_hash)
  values('bbbbbbbb-bbbb-5ccc-8ddd-eeeeeeeeeeee',u,'BTC/USD','LONG',100,110,100,999,'CLOSE',h);
 perform public.velo_reconcile('apply',jsonb_set(payload,'{accounts,0,balance,value}','110'::jsonb));
 if exists(select 1 from public.trade_history where id='bbbbbbbb-bbbb-5ccc-8ddd-eeeeeeeeeeee') then raise exception 'Duplicate estimate retained'; end if;
 if not exists(select 1 from velo_internal.receipt_jobs where engine=e and hash=h and jsonb_array_length(superseded_history)=1)
  then raise exception 'Superseded estimate not archived'; end if;
 if not exists(select 1 from public.trade_history where id='aaaaaaaa-bbbb-5ccc-8ddd-eeeeeeeeeeee' and pnl=10)
  then raise exception 'Verified result missing'; end if;
 perform public.velo_reconcile('apply',jsonb_build_object('engine',e,'hash',h,'accounts','[]'::jsonb));
 if not exists(select 1 from velo_internal.receipt_jobs where engine=e and hash=h and completed_at is not null) then raise exception 'Successful receipt not acknowledged'; end if;
end $$;
rollback;
