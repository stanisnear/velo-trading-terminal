create or replace function public.velo_record_verified_transfer(target uuid,tx_hash text,event_index integer,amount numeric,sender text)
returns void language plpgsql security definer set search_path='' as $$
declare inserted integer; label text; mint boolean; canonical_hash text;
begin
  if auth.role()<>'service_role' then raise exception 'Forbidden'; end if;
  if amount<=0 or tx_hash !~ '^0x[0-9a-f]{64}$' or sender !~ '^0x[0-9a-f]{40}$' then raise exception 'Invalid transfer'; end if;
  -- Settlement returns collateral; it is not a transfer from another user.
  if sender in ('0x41fdb544d7247a5ddc6b4c06f29d09f2b20de907','0xe9aecfbc5814ce3b2db0107594d80f054e6db52f') or exists(
    select 1 from public.profiles p where p.id=target and sender in (lower(p.wallet_address),lower(p.velo_wallet_address))
  ) then return; end if;
  perform pg_advisory_xact_lock(hashtextextended(target::text||tx_hash,0));
  insert into velo_internal.verified_transfers(tx_hash,event_index,target) values(tx_hash,event_index,target) on conflict do nothing;
  get diagnostics inserted=row_count;
  if inserted=0 then return; end if;
  mint := sender='0x0000000000000000000000000000000000000000';
  canonical_hash := case when mint then 'faucet:'||tx_hash else tx_hash end;
  if exists(select 1 from public.transactions t where t.user_id=$1 and not t.suppressed
    and lower(regexp_replace(t.tx_hash,'^faucet:',''))=$2 and t.type in ('RECEIVE','DEPOSIT','WITHDRAW')
    and (t.transfer_log_index is null or t.transfer_log_index=$3)) then return; end if;
  select coalesce(nullif(p.handle,''),'@'||p.username) into label from public.profiles p
    where sender in (lower(p.wallet_address),lower(p.velo_wallet_address)) and p.username is not null limit 1;
  label := coalesce(label,sender);
  insert into public.transactions(user_id,type,amount,status,on_chain,tx_hash,counterparty,transfer_log_index)
    values(target,case when mint then 'DEPOSIT' else 'RECEIVE' end,amount,'COMPLETED',true,canonical_hash,case when mint then null else label end,event_index);
  if not mint then
    insert into public.notifications(user_id,type,message,related_id)
      values(target,'TRANSFER_RECEIVED',label||' sent you '||amount::text||' mUSDC on Base Sepolia',tx_hash);
  end if;
end; $$;
revoke all on function public.velo_record_verified_transfer(uuid,text,integer,numeric,text) from public,anon,authenticated;
grant execute on function public.velo_record_verified_transfer(uuid,text,integer,numeric,text) to service_role;
