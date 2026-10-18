-- Keep erroneous display records for audit; never alter balances or trade history.
alter table public.transactions add column if not exists suppressed boolean not null default false;
alter table public.transactions add column if not exists transfer_log_index integer check (transfer_log_index>=0);
alter table public.notifications add column if not exists suppressed boolean not null default false;

update public.transactions t set suppressed=true
where t.type='RECEIVE' and (
  lower(t.counterparty)='0x41fdb544d7247a5ddc6b4c06f29d09f2b20de907'
  or exists(select 1 from public.profiles p where p.id=t.user_id
    and lower(t.counterparty) in (lower(p.wallet_address),lower(p.velo_wallet_address)))
  or exists(select 1 from public.transactions canonical where canonical.user_id=t.user_id
    and canonical.id<>t.id and canonical.type in ('DEPOSIT','WITHDRAW')
    and lower(regexp_replace(canonical.tx_hash,'^faucet:',''))=lower(t.tx_hash))
);
update public.notifications n set suppressed=true where n.type='TRANSFER_RECEIVED'
  and exists(select 1 from public.transactions t where t.user_id=n.user_id and t.suppressed and lower(t.tx_hash)=lower(n.related_id));

with duplicates as (
  select id,row_number() over(partition by user_id,type,lower(regexp_replace(tx_hash,'^faucet:','')),transfer_log_index
    order by (counterparty like '@%') desc nulls last,created_at,id) as ordinal
  from public.transactions where not suppressed and tx_hash is not null
) update public.transactions t set suppressed=true from duplicates d where t.id=d.id and d.ordinal>1;
with duplicates as (
  select id,row_number() over(partition by user_id,type,lower(related_id) order by created_at,id) as ordinal
  from public.notifications where type='TRANSFER_RECEIVED' and related_id is not null and not suppressed
) update public.notifications n set suppressed=true from duplicates d where n.id=d.id and d.ordinal>1;

update public.transactions set type='DEPOSIT',tx_hash='faucet:'||tx_hash,counterparty=null
where type='RECEIVE' and not suppressed and counterparty='0x0000000000000000000000000000000000000000';
update public.notifications set suppressed=true where type='TRANSFER_RECEIVED'
and message like '0x0000000000000000000000000000000000000000%';
update public.transactions t set counterparty=coalesce(nullif(p.handle,''),'@'||p.username)
from public.profiles p where t.type='RECEIVE' and not t.suppressed
and lower(t.counterparty) in (lower(p.wallet_address),lower(p.velo_wallet_address))
and p.username is not null;
update public.notifications n set message=t.counterparty||' sent you '||t.amount::text||' mUSDC on Base Sepolia'
from public.transactions t where n.type='TRANSFER_RECEIVED' and not n.suppressed
and t.user_id=n.user_id and lower(t.tx_hash)=lower(n.related_id)
and t.type='RECEIVE' and not t.suppressed and t.counterparty like '@%';

create or replace function public.velo_record_verified_transfer(target uuid,tx_hash text,event_index integer,amount numeric,sender text)
returns void language plpgsql security definer set search_path='' as $$
declare inserted integer; label text; mint boolean; canonical_hash text;
begin
  if auth.role()<>'service_role' then raise exception 'Forbidden'; end if;
  if amount<=0 or tx_hash !~ '^0x[0-9a-f]{64}$' or sender !~ '^0x[0-9a-f]{40}$' then raise exception 'Invalid transfer'; end if;
  -- Trading settlement and moving funds between one's own wallets are not income.
  if sender='0x41fdb544d7247a5ddc6b4c06f29d09f2b20de907' or exists(
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
