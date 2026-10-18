begin;
do $test$
declare
  recipient uuid; own_wallet text; h text := '0x'||replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
  n integer; mint_hash text := '0x'||replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
begin
  select id,lower(coalesce(velo_wallet_address,wallet_address)) into recipient,own_wallet from public.profiles
  where coalesce(velo_wallet_address,wallet_address) is not null order by id limit 1;
  if recipient is null then raise exception 'Missing test profile'; end if;
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  perform public.velo_record_verified_transfer(recipient,h,0,100,'0x41fdb544d7247a5ddc6b4c06f29d09f2b20de907');
  perform public.velo_record_verified_transfer(recipient,h,1,100,own_wallet);
  select count(*) into n from public.transactions where user_id=recipient and tx_hash=h;
  if n<>0 then raise exception 'Settlement or own-wallet transfer became a deposit'; end if;
  perform public.velo_record_verified_transfer(recipient,h,2,10,'0x1111111111111111111111111111111111111111');
  perform public.velo_record_verified_transfer(recipient,h,2,10,'0x1111111111111111111111111111111111111111');
  select count(*) into n from public.transactions where user_id=recipient and tx_hash=h and not suppressed;
  if n<>1 then raise exception 'Receipt retry duplicated activity'; end if;
  select count(*) into n from public.notifications where user_id=recipient and related_id=h and not suppressed;
  if n<>1 then raise exception 'Receipt retry duplicated notification'; end if;
  perform public.velo_record_verified_transfer(recipient,h,3,5,'0x1111111111111111111111111111111111111111');
  select count(*) into n from public.transactions where user_id=recipient and tx_hash=h and not suppressed;
  if n<>2 then raise exception 'Distinct receipt logs were lost'; end if;
  perform public.velo_record_verified_transfer(recipient,mint_hash,0,1000,'0x0000000000000000000000000000000000000000');
  perform public.velo_record_verified_transfer(recipient,mint_hash,0,1000,'0x0000000000000000000000000000000000000000');
  select count(*) into n from public.transactions where user_id=recipient and tx_hash='faucet:'||mint_hash and type='DEPOSIT';
  if n<>1 then raise exception 'Faucet recovery must produce one funding event'; end if;
  if exists(select 1 from public.notifications where user_id=recipient and related_id=mint_hash) then raise exception 'Mint became a peer-transfer notification'; end if;
  if exists(select 1 from public.transactions where not suppressed and type='RECEIVE' and counterparty='0x41fdb544d7247a5ddc6b4c06f29d09f2b20de907') then raise exception 'Legacy settlement remains visible'; end if;
end $test$;
rollback;
