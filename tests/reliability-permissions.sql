-- Integration coverage under actual API roles; every fixture is rolled back.
begin;
do $$
declare a uuid; b uuid; own_alert uuid:=gen_random_uuid(); other_alert uuid:=gen_random_uuid();
 verified uuid:=gen_random_uuid(); n integer;
begin
 select id into a from public.profiles order by id limit 1;
 select id into b from public.profiles where id<>a order by id limit 1;
 if a is null or b is null then raise exception 'Two test profiles required'; end if;
 insert into public.notifications(id,user_id,type,message) values
  (own_alert,a,'DEPOSIT','Private confirmation'),(other_alert,b,'FOLLOW','Private recipient');
 insert into public.trade_history(id,user_id,pair,side,entry_price,size,pnl,action,engine_address,chain_log_index)
  values(verified,a,'BTC/USD','LONG',100,100,10,'CLOSE','0x'||repeat('99',20),1);
 if has_table_privilege('authenticated','public.notifications','TRUNCATE')
  or has_table_privilege('anon','public.trade_history','TRUNCATE') then raise exception 'Unexpected truncate permission'; end if;
 perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
 set local role authenticated;
 if exists(select 1 from public.notifications where id=other_alert) then raise exception 'Another recipient leaked'; end if;
 if not exists(select 1 from public.notifications where id=own_alert) then raise exception 'Own alert hidden'; end if;
 update public.notifications set read=true where id=own_alert;
 if not exists(select 1 from public.notifications where id=own_alert and read) then raise exception 'Mark read failed'; end if;
 begin
  insert into public.notifications(user_id,type,message) values(b,'TRANSFER_RECEIVED','Forged');
  raise exception 'Other-user insert permitted';
 exception when insufficient_privilege then null; end;
 begin
  insert into public.notifications(user_id,type,message) values(a,'LIKE','Forged social event');
  raise exception 'Social validation bypassed';
 exception when insufficient_privilege then null; end;
 begin
  update public.notifications set message='Rewritten event' where id=own_alert;
  raise exception 'Event content modification permitted';
 exception when insufficient_privilege then null; end;
 insert into public.notifications(user_id,type,message,related_id) values(a,'DEPOSIT','Confirmed locally','test');
 update public.trade_history set pnl=999 where id=verified;
 get diagnostics n=row_count;
 if n<>0 then raise exception 'Verified PnL modified by browser'; end if;
 delete from public.trade_history where id=verified;
 get diagnostics n=row_count;
 if n<>0 then raise exception 'Verified receipt deleted by browser'; end if;
 begin
  insert into public.trade_history(user_id,pair,side,entry_price,size,action,engine_address,chain_log_index)
   values(a,'BTC/USD','LONG',100,100,'OPEN','0x'||repeat('99',20),2);
  raise exception 'Verified receipt identity forged';
 exception when insufficient_privilege then null; end;
 insert into public.trade_history(user_id,pair,side,entry_price,size,action)
  values(a,'BTC/USD','LONG',100,100,'OPEN');
 reset role;
 set local role anon;
 begin
  perform 1 from public.notifications;
  raise exception 'Anonymous notification read permitted';
 exception when insufficient_privilege then null; end;
 begin
  insert into public.notifications(user_id,type,message) values(a,'DEPOSIT','Anonymous');
  raise exception 'Anonymous notification insert permitted';
 exception when insufficient_privilege then null; end;
 reset role;
 if not exists(select 1 from public.trade_history where id=verified and pnl=10) then raise exception 'Verified record changed'; end if;
end $$;
rollback;
select 'PASS: notification privacy, validated writes, read state and immutable verified receipts; fixtures rolled back' as result;
